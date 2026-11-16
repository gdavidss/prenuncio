"""U-Net that reads 25 km tiles at 100 m and predicts where the next PRODES year's clearing falls.
Runs on the training machine (one GPU).

  python train.py one <last_target_year> <test_year> [steps]
      trains on target years 2011..last, writes pred_<test>.npy
  python train.py roll <first_year> <last_year> [steps_first] [steps_each]
      one honest forecast per year: train on targets before first_year, predict it, then for each
      later year fine-tune with one more year of outcomes and predict the next. Writes roll_<year>.npy
      for every year, each made by a network that never saw that year or any later one.

Output maps are float16 [rows/5, cols/5]: the expected cleared fraction of each 500 m cell, on the
grid the tree model uses, so both are scored by the same code.
Inputs: clearing history and land classes (prep.py), Hansen 30 m loss bits (hansen.py 100) and GLAD
Sentinel-2 alert bits (glad.py 100) when those files exist. Everything the network sees for target
year T was known by 31 Jul T-1.
"""
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

DATA = Path(__file__).resolve().parent.parent / "data"
dev = "cuda"
TILE, BATCH, FIRST = 256, 24, 2011
PB = int(os.environ.get("UNET_PB", 16))  # tiles per forecast batch
WIDTH = int(os.environ.get("UNET_WIDTH", 32))
gpu = lambda n: torch.from_numpy(np.load(DATA / f"{n}.npy")).to(dev)
# the whole basin fits on the GPU as small integers, so tiles are cut there with no data loader
cy, lc, res, ten = gpu("cy"), gpu("lc"), gpu("res"), gpu("ten")
d26 = gpu("d26")
cy = torch.where((d26 == 1) & (cy == 0) & (lc == 0), torch.full_like(cy, 26), cy)  # 2026 from INPE's priority scenes
del d26
R, C = cy.shape
HB = gpu("hb") if (DATA / "hb.npy").exists() else None
GB4 = (DATA / "gb4.npy").exists() and "UNET_GB4" in os.environ  # GLAD bits with a last-month flag
GB = gpu("gb4") if GB4 else gpu("gb") if (DATA / "gb.npy").exists() else None
TTA = "UNET_TTA" in os.environ  # average each forecast with its mirror image
# float16 overflowed in fine-tuning once the weights before each batch norm had grown (they are scale-free, so
# nothing holds them down); bfloat16 has the exponent range of full precision and cannot
HALF = torch.bfloat16 if "UNET_BF16" in os.environ else torch.float16
OUT100 = "UNET_OUT100" in os.environ  # also write each forecast at the network's own 100 m, as uint16
# AlphaEarth satellite embeddings on the 500 m grid (aef.py), kept in RAM as int8 and cut per batch on the CPU.
# UNET_AEF is the folder holding emb_<year>.npy. Planes: the last full calendar year before the forecast date
# (64), its change from the year before (64), and one flag for "embeddings exist for this date".
EMB = {}
if "UNET_AEF" in os.environ:
    for f in sorted(Path(os.environ["UNET_AEF"]).glob("emb_*.npy")):
        a = np.load(f, mmap_mode="r")
        EMB[int(f.stem[4:])] = np.stack([np.nan_to_num(np.clip(np.asarray(a[k], np.float32) * 127, -127, 127)).astype(np.int8) for k in range(64)])
        print("embeddings", f.stem, flush=True)
# DETER alert bits (deter100.py): clearing, degradation and fire scar in the 12 months before each 31 July. Kept in RAM.
DB = np.load(DATA / "db.npy") if (DATA / "db.npy").exists() and "UNET_DETER" in os.environ else None
CTX = "UNET_CTX" in os.environ  # three wide-context planes: clearing density over 3 km and 10 km
# JRC TMF first-disturbance bits (tmf.py 100): logging, fire damage and small openings. Kept in RAM, cut per batch.
TB = np.load(DATA / "tb.npy") if "UNET_TMF" in os.environ else None
ram_cut = lambda a, yy, xx: torch.from_numpy(a[yy.cpu().numpy(), xx.cpu().numpy()]).to(dev)  # tiles of an array held in RAM
# input planes by group, in the order channels() and batch() lay them out
GROUPS = [("base", 12)] + ([("hb", 4)] if HB is not None else []) + ([("gb", 5 + GB4)] if GB is not None else []) + \
         ([("db", 4)] if DB is not None else []) + ([("tb", 5)] if TB is not None else []) + ([("ctx", 3)] if CTX else []) + ([("emb", 129)] if EMB else [])
CIN = sum(n for _, n in GROUPS)
FARW = float(os.environ.get("UNET_FARW", 0))  # extra loss weight on forest with no clearing of the last three years within 1.5 km


def aef_planes(y0, x0, tt, size):
    """Embedding planes for tiles whose top-left 100 m cell is (y0, x0), [B, 129, size, size] on the GPU.
    The 500 m cells are repeated five times each way, then cut to the tile."""
    n = -(-size // 5) + 1
    out = np.zeros((len(y0), 129, n, n), np.float32)
    for b, (y, x, t) in enumerate(zip(y0.tolist(), x0.tolist(), tt.tolist())):
        e = 2000 + t - 1  # the forecast is dated 31 July of 2000 + t
        if e not in EMB:
            continue
        r, c = y // 5, x // 5
        if r >= 0 and c >= 0 and r + n <= R // 5 and c + n <= C // 5:
            cut = lambda a: a[:, r:r + n, c:c + n]
        else:  # a tile hanging over the edge of the raster repeats the edge cells
            rr, cc = np.clip(np.arange(r, r + n), 0, R // 5 - 1), np.clip(np.arange(c, c + n), 0, C // 5 - 1)
            cut = lambda a: a[:, rr][:, :, cc]
        now = cut(EMB[e]).astype(np.float32) / 127
        out[b, :64], out[b, 128] = now, 1
        if e - 1 in EMB:
            out[b, 64:128] = now - cut(EMB[e - 1]).astype(np.float32) / 127
    up = Fn.interpolate(torch.from_numpy(out).to(dev), scale_factor=5, mode="nearest")
    oy, ox = (y0 % 5).tolist(), (x0 % 5).tolist()
    return torch.stack([up[b, :, oy[b]:oy[b] + size, ox[b]:ox[b] + size] for b in range(len(oy))])


def channels(c, l, tn, tt, hb, gb, db=None, tb=None):
    """Input planes for forecast year index tt (year - 2000 of the last mapped PRODES year).
    c, l, tn: uint8 crops [B, H, W]; tt: [B, 1, 1]; hb, gb: Hansen and GLAD bit crops or None."""
    cleared = (c > 0) & (c <= tt)
    forest = (l == 0) & ~cleared
    age = tt.to(torch.int16) - c.to(torch.int16)
    planes = [forest, cleared & (age == 0), cleared & (age == 1), cleared & (age == 2),
              cleared & (age >= 3) & (age <= 4), cleared & (age >= 5),
              l == 1, l == 2, l == 3, tn == 1, tn == 2, tn == 3]
    if hb is not None:
        # Hansen's calendar year Y is published in spring Y+1, so on 31 July of year tt the newest is tt-1,
        # which is bit tt-2. Planes: lost in that year, the year before, the one before that, any of the 8 earlier.
        s = tt.to(torch.int32) - 2
        planes += [(hb >> (s - k)) & 1 == 1 for k in range(3)] + [((hb >> (s - 10).clamp(min=0)) & 255) != 0]
    if gb is not None:
        # GLAD alerts exist for 31 July 2020 onward (three bits each); before that the planes are empty and
        # the last plane says so
        gi = tt.to(torch.int32) - 20
        have = gi >= 0
        v = (gb >> ((4 if GB4 else 3) * gi.clamp(min=0))) & (15 if GB4 else 7)
        planes += [have & ((v & 3) >= 1), have & ((v & 3) >= 2), have & ((v & 3) == 3), have & (v & 4 == 4), have.expand_as(forest)]
        if GB4:
            planes.append(have & (v & 8 == 8))
    if db is not None:  # DETER alerts of the 12 months before 31 July, from 2017: clearing, degradation, fire scar
        di = tt.to(torch.int32) - 17
        have = di >= 0
        v = (db >> (3 * di.clamp(min=0))) & 7
        planes += [have & (v & 1 == 1), have & (v & 2 == 2), have & (v & 4 == 4), have.expand_as(forest)]
    if tb is not None:  # dated like Hansen: first disturbed in the newest year, the two before, the 8 before those, earlier
        s = tt.to(torch.int32) - 2
        old = (s - 10).clamp(min=0)
        planes += [(tb >> (s - k)) & 1 == 1 for k in range(3)] + [((tb >> old) & 255) != 0, ((tb & ((1 << old) - 1)) != 0) | ((tb >> 25) & 1 == 1)]
    x = torch.stack(planes, 1).float()
    if CTX:  # what a 3x3 kernel cannot see: how much clearing, recent and total, lies within 3 and 10 km
        recent, total = x[:, 1:4].sum(1, keepdim=True), x[:, 1:6].sum(1, keepdim=True)
        pool = lambda a, k: Fn.avg_pool2d(a, k, 1, k // 2, count_include_pad=False)
        x = torch.cat([x, pool(recent, 31), pool(recent, 101), pool(total, 101)], 1)
    return x, forest


def block(i, o):
    return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                         nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))


class UNet(nn.Module):
    def __init__(self, cin=CIN, b=WIDTH):
        super().__init__()
        w = (b, 2 * b, 4 * b, 8 * b, 16 * b)
        self.down = nn.ModuleList([block(i, o) for i, o in zip((cin,) + w[:-1], w)])
        self.up = nn.ModuleList([nn.ConvTranspose2d(i, o, 2, stride=2) for i, o in zip(w[:0:-1], w[-2::-1])])
        self.dec = nn.ModuleList([block(2 * o, o) for o in w[-2::-1]])
        self.head = nn.Conv2d(w[0], 1, 1)

    def forward(self, x):
        skips = []
        for i, d in enumerate(self.down):
            x = d(x if i == 0 else Fn.max_pool2d(x, 2))
            skips.append(x)
        for u, d, s in zip(self.up, self.dec, skips[-2::-1]):
            x = d(torch.cat([u(x), s], 1))
        return self.head(x)[:, 0]


def sampler():
    """Tile corners, drawn wherever there is forest."""
    g = 128
    f = (lc == 0)[: R // g * g, : C // g * g].reshape(R // g, g, C // g, g).float().mean((1, 3))
    anyf = torch.nonzero(f > 0.02)

    def draw(n):
        b = anyf[torch.randint(len(anyf), (n,), device=dev)]
        yx = b * g + torch.randint(-g // 2, g // 2, b.shape, device=dev)
        return yx[:, 0].clamp(0, R - TILE), yx[:, 1].clamp(0, C - TILE)
    return draw


def batch(draw, last_target, recent=0.0):
    """Tiles with a random forecast year each. recent: share of the batch taken from the newest three years."""
    y0, x0 = draw(BATCH)
    tt = torch.randint(FIRST - 2001, last_target - 2000, (BATCH,), device=dev)  # last mapped year, minus 2000
    new = torch.randint(max(FIRST - 2001, last_target - 2003), last_target - 2000, (BATCH,), device=dev)
    tt = torch.where(torch.rand(BATCH, device=dev) < recent, new, tt)
    ar = torch.arange(TILE, device=dev)
    yy, xx = (y0[:, None] + ar)[:, :, None], (x0[:, None] + ar)[:, None, :]
    k, flip = int(torch.randint(4, (1,))), bool(torch.randint(2, (1,)))  # one rotation and flip per batch
    aug = lambda a: torch.rot90(a.flip(-1) if flip else a, k, (-2, -1))
    c, l, r, tn = (aug(a[yy, xx]) for a in (cy, lc, res, ten))
    hb = aug(HB[yy, xx]) if HB is not None else None
    gb = aug(GB[yy, xx]) if GB is not None else None
    db = aug(ram_cut(DB, yy, xx)) if DB is not None else None
    emb = aug(aef_planes(y0, x0, tt, TILE)) if EMB else None
    tb = aug(ram_cut(TB, yy, xx)) if TB is not None else None
    tt = tt.to(torch.uint8)[:, None, None]
    x, forest = channels(c, l, tn, tt, hb, gb, db, tb)
    if EMB:
        x = torch.cat([x, emb], 1)
    return x, ((c == tt + 1) & (r == 0)).float(), forest


@torch.no_grad()
def predict(net, year, out):
    """Slide over the basin, keep the centre of each tile, average the probability of the 25 cells in
    each 500 m block."""
    net.eval()
    torch.cuda.empty_cache()  # training leaves the allocator fragmented; a forecast once died of it
    tt = torch.tensor(year - 2001, dtype=torch.uint8, device=dev).view(1, 1, 1)
    core, m = 400, 40
    pred = torch.zeros(R // 5, C // 5, device=dev)
    fine = np.zeros((R, C), np.uint16) if OUT100 else None
    ar = torch.arange(-m, core + m, device=dev)
    for y in range(0, R, core):
        xs = list(range(0, C, core))
        for i in range(0, len(xs), PB):
            x0 = torch.tensor(xs[i:i + PB], device=dev)
            yy, xx = (y + ar)[None, :, None], (x0[:, None] + ar)[:, None, :]
            inside = (yy >= 0) & (yy < R) & (xx >= 0) & (xx < C)
            yy, xx = yy.clamp(0, R - 1), xx.clamp(0, C - 1)
            l = torch.where(inside, lc[yy, xx], torch.full_like(lc[:1, :1], 3))  # beyond the raster counts as outside
            x, forest = channels(cy[yy, xx] * inside, l, ten[yy, xx] * inside, tt,
                                 HB[yy, xx] * inside if HB is not None else None, GB[yy, xx] * inside if GB is not None else None,
                                 ram_cut(DB, yy, xx) * inside if DB is not None else None,
                                 ram_cut(TB, yy, xx) * inside if TB is not None else None)
            if EMB:
                x = torch.cat([x, aef_planes(torch.full_like(x0, y - m), x0 - m, tt.flatten().expand(len(x0)), core + 2 * m)], 1)
            def run(half):
                with torch.autocast("cuda", dtype=HALF, enabled=half):
                    q = torch.sigmoid(net(x.contiguous(memory_format=torch.channels_last)).float())
                    if TTA:
                        q = (q + torch.sigmoid(net(x.flip(-1).contiguous(memory_format=torch.channels_last)).float()).flip(-1)) / 2
                return q
            p = run(True)
            if not bool(torch.isfinite(p).all()):  # half precision overflowed on these tiles (it killed a run once): redo them in full
                p = run(False)
            p = p * forest
            if OUT100:
                q = (p[:, m:m + core, m:m + core].clamp(0, 1) * 65535).round().to(torch.int32).cpu().numpy().astype(np.uint16)
                for j, xj in enumerate(xs[i:i + PB]):
                    h, w = min(core, R - y), min(core, C - xj)
                    fine[y:y + h, xj:xj + w] = q[j, :h, :w]
            p = p[:, m:m + core, m:m + core].reshape(-1, core // 5, 5, core // 5, 5).mean((2, 4))
            for j, xj in enumerate(xs[i:i + PB]):
                h, w = min(core // 5, R // 5 - y // 5), min(core // 5, C // 5 - xj // 5)
                pred[y // 5:y // 5 + h, xj // 5:xj // 5 + w] = p[j, :h, :w]
    assert bool(torch.isfinite(pred).all()), "the network produced non-finite values"
    np.save(out, pred.cpu().numpy().astype(np.float16))
    if OUT100:
        np.save(str(out).replace(".npy", "_100.npy"), fine)
    torch.save(net.state_dict(), str(out).replace(".npy", ".pt"))  # so a later year can restart from here
    print("wrote", out, "expected km2 about", round(float(pred.sum()) * 0.25), flush=True)
    net.train()


def train(net, draw, last, steps, lr, recent=0.0):
    opt = torch.optim.AdamW(net.parameters(), lr / 3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, lr, total_steps=steps, pct_start=0.05)
    scaler = torch.amp.GradScaler()
    t0, run = time.time(), 0.0
    net.train()
    good = {k: v.clone() for k, v in net.named_buffers()}  # last batch-norm statistics known to be finite
    for step in range(1, steps + 1):
        x, y, forest = batch(draw, last, recent)
        with torch.autocast("cuda", dtype=HALF):
            logit = net(x.contiguous(memory_format=torch.channels_last))
        w = forest
        if FARW:  # clearing beside recent clearing is close to solved; spend more of the loss where there is none nearby
            near = Fn.max_pool2d(x[:, 1:4].sum(1, keepdim=True).clamp(max=1), 31, 1, 15)[:, 0]
            w = forest * (1 + FARW * (1 - near))
        loss = (Fn.binary_cross_entropy_with_logits(logit.float(), y, reduction="none") * w).sum() / w.sum().clamp(min=1)
        opt.zero_grad(set_to_none=True)
        sched.step()
        if not torch.isfinite(loss):  # a half-precision overflow once turned a whole run to NaN: drop the batch instead
            print("  skipped a non-finite batch at step", step, flush=True)
            with torch.no_grad():  # the forward pass already wrote the overflow into the batch-norm running statistics
                for k, v in net.named_buffers():
                    v.copy_(good[k])
            continue
        if step % 20 == 0:
            good = {k: v.clone() for k, v in net.named_buffers()}
        scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
        scaler.step(opt); scaler.update()
        run = 0.98 * run + 0.02 * loss.item() if step > 1 else loss.item()
        if step % 500 == 0:
            print(f"  targets to {last}: step {step}/{steps} loss {run:.5f} {step / (time.time() - t0):.1f} it/s", flush=True)


def main():
    mode, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    net = UNet().to(dev).to(memory_format=torch.channels_last)
    draw = sampler()
    tag = os.environ.get("UNET_TAG", "")
    if "UNET_INIT" in os.environ:  # restart from a checkpoint written by predict()
        sd, key = torch.load(os.environ["UNET_INIT"]), "down.0.0.weight"
        if sd[key].shape[1] != CIN:
            # the checkpoint was trained without some of today's planes (UNET_INIT_GROUPS names the ones it had,
            # in order): the new planes start with zero weights and are learned in the fine-tuning
            wide, pos, at = torch.zeros(sd[key].shape[0], CIN, 3, 3, dtype=sd[key].dtype, device=sd[key].device), {}, 0
            for name, n in GROUPS:
                pos[name], at = (at, n), at + n
            at = 0
            for name in os.environ["UNET_INIT_GROUPS"].split(","):
                a, n = pos[name]
                wide[:, a:a + n], at = sd[key][:, at:at + n], at + n
            assert at == sd[key].shape[1], (at, sd[key].shape)
            sd[key] = wide
        net.load_state_dict(sd)
    if mode == "ft":  # ft <last_target_year> <forecast_year> <steps>: one more fine-tune (or none) and a forecast
        if int(sys.argv[4]):
            train(net, draw, a, int(sys.argv[4]), 3e-4, recent=0.5)
        predict(net, b, DATA / f"roll{tag}_{b}.npy")
        return
    if mode == "cont":  # cont <first> <last> <steps>: pick a rolling run up again from UNET_INIT, the checkpoint of year first-1
        for y in range(a, b + 1):
            train(net, draw, y - 1, int(sys.argv[4]), 3e-4, recent=0.5)
            predict(net, y, DATA / f"roll{tag}_{y}.npy")
        return
    if mode == "one":
        train(net, draw, a, int(sys.argv[4]) if len(sys.argv) > 4 else 12000, 1e-3)
        predict(net, b, DATA / f"pred{tag}_{b}.npy")
    else:
        s0, s1 = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (15000, 2500)
        train(net, draw, a - 1, s0, 1e-3, recent=0.3 if EMB else 0.0)  # embeddings only exist for recent years: show those more
        predict(net, a, DATA / f"roll{tag}_{a}.npy")
        for y in range(a + 1, b + 1):
            train(net, draw, y - 1, s1, 3e-4, recent=0.5)  # one more year of outcomes, half the batch from the newest three
            predict(net, y, DATA / f"roll{tag}_{y}.npy")
        torch.save(net.state_dict(), DATA / f"unet_roll{tag}_{b}.pt")


if __name__ == "__main__":
    main()
