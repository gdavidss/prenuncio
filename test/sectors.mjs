// Drives the site in headless Chrome with real mouse events. The layout is a stage and a dock: the map and the
// timeline swap places, and each carries its own controls. The test swaps them, selects a sector, replays a year,
// switches to months, to another hazard, to cells and to the priority list, and checks the headline each time. It recounts
// the alert level from the data and checks that the red band follows it, decodes the chance file to check what
// a cell says about itself, and checks that fire shows no forecast amount and that the old wording is gone.
// It opens the actions view (what measured enforcement accounts for) in both languages and checks its numbers
// against data/actions.json, and opens the API panel, which must show api/v1/llms.txt as the file has it.
// Run: python3 -m http.server 8878 -d web &   then   node test/sectors.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

const SITE = process.env.PRENUNCIO_SITE || "http://localhost:8878/";
const [meta, regions, mun] = await Promise.all(["meta", "regions", "sectors_mun"].map(f => fetch(`${SITE}data/${f}.json`).then(r => r.json())));
const prob = await fetch(`${SITE}data/prob.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);  // how the chances were checked
const monthly = await fetch(`${SITE}data/monthly.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);  // the monthly forecast, once it is exported
// the level, recounted here from docs/BRAND.md rather than taken from the site
const three = a => [a.at(-1) + a.at(-2) + a.at(-3), a.at(-13) + a.at(-14) + a.at(-15)];
const rising = ([now, prev]) => (now < 1 ? 0 : now / Math.max(prev, 1) >= 2 ? 2 : now / Math.max(prev, 1) >= 1.1 ? 1 : 0);
const amazonLevel = series => Math.min(3, rising(three(regions.months[series])) + (regions.months.oni.v.at(-1) >= 1.5 ? 1 : 0));
const fy = regions.eyears.indexOf(meta.forecast.year), byRisk = [...mun.items].sort((a, b) => b.e[fy] - a.e[fy]);
const quiet = byRisk.slice(Math.ceil(byRisk.length / 2)).filter(it => it.f > 500 && it.m.slice(0, -1).every(s => rising(three(s)) === 0)).sort((a, b) => b.f - a.f)[0];
const hazardLayers = ["scar12", "degr12", "mine12"].filter(k => meta.layers[k]);
const RED = "rgb(228, 0, 43)", GREEN = "rgb(11, 107, 58)";
// the clearing ramp (docs/BRAND.md): four reds above the forest green, lightness rising with the chance
const RAMP = [[106, 15, 36], [174, 12, 44], [228, 0, 43], [255, 90, 64]];
const lightness = ([r, g, b]) => { const l = c => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 116 * Math.cbrt(0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b)) - 16; };
assert.ok(RAMP.every((c, i) => !i || lightness(c) > lightness(RAMP[i - 1]) + 8), "the ramp gets lighter with the chance");
assert.ok(RAMP.every(([r, g, b]) => r > 2 * g && r > 2 * b), "and every step is a red");
const km = x => x.toLocaleString("en-US", { maximumFractionDigits: x < 9.95 ? 1 : 0, minimumFractionDigits: x < 9.95 ? 1 : 0 });
const three3 = x => { const p = 10 ** (Math.floor(Math.log10(x)) - 2); return (Math.round(x / p) * p).toLocaleString("en-US"); };  // three figures
// one of the site's 8-bit grey PNGs, decoded here without the browser, to check what the map says about a cell
async function grey(name) {
  const res = await fetch(`${SITE}data/${name}`);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer()), idat = [];
  let w = 0, h = 0;
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString("latin1", o + 4, o + 8);
    if (type === "IHDR") { w = buf.readUInt32BE(o + 8); h = buf.readUInt32BE(o + 12); assert.deepEqual([buf[o + 16], buf[o + 17], buf[o + 20]], [8, 0, 0], "8-bit grey, not interlaced"); }
    if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(w * h);
  for (let y = 0, p = 0; y < h; y++) {
    const ft = raw[p++], row = y * w;
    for (let x = 0; x < w; x++, p++) {
      const a = x ? px[row + x - 1] : 0, b = y ? px[row - w + x] : 0, c = x && y ? px[row - w + x - 1] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      px[row + x] = raw[p] + (ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : ft === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0);
    }
  }
  return { w, h, px };
}
const chance = v => { const c = (v / 255) ** 2; return c < 0.001 ? "Under 0.1%" : (100 * c).toLocaleString("en-US", { maximumFractionDigits: c < 0.01 ? 1 : 0, minimumFractionDigits: c < 0.01 ? 1 : 0 }) + "%"; };

const dir = mkdtempSync(tmpdir() + "/pn");
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--disable-gpu", "--remote-debugging-port=9333", `--user-data-dir=${dir}`, "--window-size=1440,900", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    await sleep(200);
    page = await fetch("http://127.0.0.1:9333/json").then(r => r.json()).then(l => l.find(t => t.type === "page")).catch(() => null);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0;
  const waiting = new Map(), errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise(r => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  // (while the page is reloading there is no context to evaluate in: that reads as undefined, and until() asks again)
  const js = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true }))?.result?.value;
  const until = async (expr, what) => { for (let i = 0; i < 450; i++) { if (await js(expr)) return; await sleep(200); } throw new Error("timed out waiting for " + what + "; headline is: " + await js(`document.getElementById("say")?.textContent`) + "; link is: " + await js(`location.hash`)); };
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await sleep(150);
  };
  const clickOn = async sel => { const [x, y] = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); await click(x, y); };
  const text = sel => js(`document.querySelector(${JSON.stringify(sel)}).textContent`);
  const style = (sel, prop) => js(`getComputedStyle(document.querySelector(${JSON.stringify(sel)}))[${JSON.stringify(prop)}]`);
  const head = re => `${re}.test(document.getElementById("say").textContent)`;
  const level = () => js(`document.getElementById("lead").dataset.l`);
  const hash = () => js(`location.hash`);
  const count = sel => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  // the stage and the dock: which box is large, and bringing one forward
  const area = id => js(`(() => { const r = document.getElementById("${id}").getBoundingClientRect(); return r.width * r.height; })()`);
  const settled = k => `document.documentElement.dataset.front === "${k}" && !("swap" in document.documentElement.dataset) && document.getElementById("${k}box").dataset.as === "stage"`;
  const toFront = async (k, by = k === "chart" ? "#say" : "#map-front") => { if (await js(settled(k))) return; await clickOn(by); await until(settled(k), `the ${k} on the stage`); await sleep(250); };
  // where a place is on screen, from the view in the link (Web Mercator, as Leaflet does it)
  const at = async (lat, lng) => {
    const [clat, clng, z] = (await js(`new URLSearchParams(location.hash.slice(1)).get("v")`)).split(",").map(Number);
    const px = (la, lo) => { const s = 256 * 2 ** z, r = la * Math.PI / 180; return [(lo + 180) / 360 * s, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * s]; };
    const [x, y] = px(lat, lng), [cx, cy] = px(clat, clng), r = await js(`(() => { const r = document.getElementById("map").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    return [r[0] + x - cx, r[1] + y - cy];
  };
  // the red band must be what the level says: none, a band, the whole block. The mark is forest green at every level.
  const redFollows = async l => {
    assert.deepEqual([await style(".brand .f", "fill"), await style(".brand .c", "fill")], [GREEN, RED], "the mark is green forest with a red corner");
    assert.equal(await style("#level", "backgroundColor") === RED, l >= 2, "the band is red from warning up");
    assert.equal(await style("#lead", "backgroundColor") === RED, l === 3, "the whole bulletin is red only in alarm");
  };

  await send("Runtime.enable");
  const DESK = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };  // the screen the layout is checked on; a phone's comes at the end
  await send("Emulation.setDeviceMetricsOverride", DESK);

  // ---------- the story. A first visit to the bare address is told what this is, one line at a time, while the
  // interface is put together around the map. The map never moves; each piece comes in where it stays; when the
  // caption goes, what is on the page is the tool. Every number in a line is recomputed here from the data files.
  // Then: it is remembered, a link with a fragment never shows it, ?story=0 and ?story=1 decide by themselves,
  // Skip lands on the same page as the end, the list can be closed on the way, and Story plays it again.
  const story = await fetch(`${SITE}data/story.json`).then(r => r.json());
  const n0 = x => Math.round(x).toLocaleString("en-US");
  const line = () => text("#story-line"), note = () => text("#story-note");
  const onStory = `"story" in document.documentElement.dataset`, key = async k => { for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k === " " ? "Space" : k, windowsVirtualKeyCode: { Enter: 13, " ": 32, ArrowRight: 39, ArrowLeft: 37, Escape: 27 }[k], ...(type === "keyDown" && (k === "Enter" || k === " ") ? { text: k === "Enter" ? "\r" : " " } : {}) }); };  // (a key that types sends its character, as a keyboard does: that is what presses a focused button)
  const darkPx = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i + 3] > 200 && d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 60; return n; })()`);
  const redPx = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i + 3] > 0 && d[i] > 2 * d[i + 1]; return n; })()`);
  // a piece of the interface is on the page when it can be seen; where it is; and where the Amazon is drawn
  const seen = id => js(`(() => { const e = document.getElementById("${id}"), s = e && getComputedStyle(e); return !!e && !e.hidden && !!e.offsetParent && s.visibility === "visible" && +s.opacity > 0.9; })()`);
  const place = id => js(`(() => { const r = document.getElementById("${id}").getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })()`);
  const amazon = () => js(`(() => { const r = document.querySelector("canvas.base")?.getBoundingClientRect(); return r ? [r.left, r.top, r.width, r.height].map(Math.round) : null; })()`);
  const PIECES = ["mappanel", "list", "chartbox"], onPage = async () => { const out = []; for (const id of PIECES) if (await seen(id)) out.push(id); return out.join(); };
  let t1 = Date.now();
  await send("Page.navigate", { url: SITE });
  await until(`!document.getElementById("story")?.hidden && document.getElementById("story-line")?.textContent === "This is the Amazon."`, "the first line of the story");
  const firstLine = Date.now() - t1;
  assert.ok(firstLine < 2500, `the first line is there at once, before any layer: ${firstLine} ms`);
  await until(`document.documentElement.dataset.step === "forestA" && document.querySelectorAll("#story-marks li").length === 6 && !!document.querySelector("canvas.base")`, "the story's first step, with the forest drawn");
  const storyWords = await js(`document.body.innerText.split(/\\s+/).filter(w => /[A-Za-zÀ-ú0-9]/.test(w)).length`);
  assert.ok(storyWords <= 10, `the first screen is almost empty: ${storyWords} words (${JSON.stringify(await js(`document.body.innerText`))})`);
  assert.equal(await onPage(), "", "no piece of the tool is on the first screen");
  assert.equal(await js(`!!document.querySelector(".leaflet-control-zoom")?.offsetParent && getComputedStyle(document.querySelector(".leaflet-control-zoom")).visibility === "visible"`), false);
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "PT,Skip", "the header keeps the language and a way out");
  assert.equal(await js(`location.hash + location.search`), "", "the story plays at the bare address");
  assert.equal(await js(`document.getElementById("story-back").disabled`), true);
  assert.equal(await redPx(), 0, "the forest is green: no chance is painted yet");
  // the map is the page, and the Amazon is where it will be when the story is over
  const vw0 = await js(`innerWidth`), vh0 = await js(`innerHeight`);
  assert.deepEqual(await place("mapbox"), [0, 0, vw0, vh0], "the map is the whole page");
  let where = await amazon();
  const large = where;
  assert.ok(where && where[2] > 0.55 * vw0 && where[0] > 0.25 * vw0 && where[0] + where[2] <= vw0 && where[3] > 0.7 * vh0, "the Amazon is large on the first screen, beside the caption: " + where);
  assert.ok((await place("story"))[0] + (await place("story"))[2] <= where[0] + 2, "and the caption stands clear of it");
  // Next goes through every step: by the button, by Space, by Enter, by the right arrow, by a click on the map
  const hist = story.history, sum = hist.km2.reduce((a, b) => a + b, 0), fy0 = meta.forecast.year, share5 = x => (Math.abs(x * 5 - Math.round(x * 5)) < 0.02 ? [Math.round(x * 5), 5] : [Math.round(x * 10), 10]);
  const WANT = {
    forestA: "This is the Amazon.",
    forestB: `${n0(story.forest.cells / 1e6)} million squares of forest, ${story.forest.cell_m} metres each.`,
    lossA: "Every year a part falls.",
    lossB: `Since ${hist.years[0]}, ${n0(sum / 1000)} thousand km².${sum > 130279 ? " More than England." : ""}`,
    omenA: "Where does it fall next year?",
    omenB: `Every square has a chance. These ${story.priority.blocks} places come first.`,
    proof: `In ${story.check.year}, of every ${share5(story.check.priority_blocks_that_lost_10ha)[1]} places it pointed to, ${share5(story.check.priority_blocks_that_lost_10ha)[0]} were cleared.`,
    modelA: `An open model. ${["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][story.model.inputs.length]} public sources.`,
    modelB: "The board is open. Anyone can try to beat it.",
    ahead: "What lies ahead.",
  };
  const IDS = Object.keys(WANT), BEAT = { forestA: 0, forestB: 0, lossA: 1, lossB: 1, omenA: 2, omenB: 2, proof: 3, modelA: 4, modelB: 4, ahead: 5 }, said = [];
  const HAS = { omenA: "mappanel", omenB: "mappanel,list", proof: "mappanel,list", modelA: "mappanel,list", modelB: "mappanel,list", ahead: "mappanel,list,chartbox" }, stays = {};
  const forward = [() => clickOn("#story-next"), () => key(" "), () => key("Enter"), () => key("ArrowRight"), () => click(vw0 * 0.5, vh0 * 0.55)];
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    if (i) { await forward[i % forward.length](); await until(`document.documentElement.dataset.step === "${id}"`, `step ${i + 1}, ${id}, reached by way ${i % forward.length}`); }
    assert.equal((await line()).replaceAll(" ", " "), WANT[id], `the line of ${id}`);
    said.push(await line(), await note());
    assert.equal(await js(`[...document.querySelectorAll("#story-marks li")].findIndex(e => e.classList.contains("now"))`), BEAT[id], `the mark of the beat at ${id}`);
    // the map does not move, except once: the Amazon glides to make room when the priority list comes in
    if (id === "omenB") {
      await until(`(() => { const r = document.querySelector("canvas.base").getBoundingClientRect(), l = document.getElementById("list"); return !l.hidden && r.right <= l.getBoundingClientRect().left && !document.querySelector(".leaflet-zoom-anim"); })()`, "the Amazon gliding aside for the list");
      await sleep(900);
      where = await amazon();
      assert.ok(where[2] < 0.75 * large[2] && where[0] > large[0] - 40 && where[0] + where[2] <= (await place("list"))[0], "it has made room for the list, and is still whole: " + where);
      assert.deepEqual(await amazon(), where, "and has come to rest");
    }
    assert.deepEqual(await amazon(), where, "the Amazon has not moved at " + id);
    assert.deepEqual(await place("mapbox"), [0, 0, vw0, vh0]);
    await until(`(${JSON.stringify(PIECES)}).filter(id => { const e = document.getElementById(id), s = getComputedStyle(e); return !e.hidden && e.offsetParent && s.visibility === "visible" && +s.opacity > 0.9; }).join() === "${HAS[id] || ""}"`, `the pieces on the page at ${id}: ${HAS[id] || "none"}`);
    for (const p of (HAS[id] || "").split(",").filter(Boolean)) { const r = (await place(p)).slice(0, 3); stays[p] ||= r; assert.deepEqual(r, stays[p], `${p} keeps its place at ${id}`); }
    if (id === "lossA") assert.equal(await count("#story-extra .years rect"), hist.years.length, "the years of clearing as small bars");
    if (id === "lossB") {
      assert.equal(await redPx(), 0, "still no chance on the map");
      assert.doesNotMatch(await line(), new RegExp(`In ${hist.years.at(-1)}|In 20\\d\\d it was`), "the cumulative figure, not a year's");
      // the language turns in the middle of the story
      await clickOn("#lang-btn");
      await until(`document.documentElement.lang === "pt" && /^Desde ${hist.years[0]}, /.test(document.getElementById("story-line").textContent)`, "the story in Portuguese");
      assert.equal((await line()).replaceAll(" ", " "), `Desde ${hist.years[0]}, ${Math.round(sum / 1000).toLocaleString("pt-BR")} mil km².${sum > 130279 ? " Mais que a Inglaterra." : ""}`);
      assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "EN,Pular");
      assert.equal(await text("#story-next"), "Seguir");
      await clickOn("#lang-btn");
      await until(`document.documentElement.lang === "en" && /^Since ${hist.years[0]}, /.test(document.getElementById("story-line").textContent)`, "English again");
    }
    if (id === "omenA") {  // the omen: the chances of the forecast year arrive in red, and their key takes its place
      await until(`document.querySelector("canvas.cells")?.dataset.key === "${fy0}"`, "the chances arriving");
      for (let k = 0; k < 60 && await redPx() < 8000; k++) await sleep(200);
      assert.ok(await redPx() >= 8000, "the red has spread over the forest");
      assert.equal(await text("#legend .what"), `Chance each cell loses a hectare by July ${fy0}`, "with its key");
    }
    if (id === "omenB") {  // the priorities come with it: the blocks on the map, the list in its place, the first place open
      await until(`document.querySelector("#list-rows .why")?.previousElementSibling.dataset.b === "1" && !!document.querySelector(".here")`, "the list, with its first place open and marked on the map");
      assert.ok(await count("#list-rows .why p") >= 2, "the list says why");
      const l = await place("list");
      assert.ok(l[0] + l[2] >= vw0 - 1 && l[0] > 0.6 * vw0, "the list is on the right of the page: " + l);
      assert.equal(await js(`document.documentElement.dataset.has`), "legend list");
    }
    if (id === "proof") {
      await until(`document.querySelector("canvas.cells")?.dataset.key === "${story.check.year}"`, "the chances given for " + story.check.year);
      assert.equal(await note(), `A place is a block of ${story.priority.block_km} km. Cleared means 10 hectares or more. Across the forest at large, ${Math.round(100 * story.check.all_blocks_that_lost_10ha)} in 100.`);
      for (let k = 0; k < 40 && await darkPx() < 300; k++) await sleep(200);
      assert.ok(await darkPx() >= 300, "the clearing that was mapped, dark, on the chances as they were given");
    }
    if (id === "modelA") {  // About comes in: in the header, and open beside the map on the model
      await until(`document.getElementById("about").open && !!document.querySelector("#about-model") && !!document.querySelector("#model-fig svg, #model-fig canvas")`, "the model, beside the map");
      assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "About,API,PT,Skip", "About and the API are in the header from here on");
      assert.ok((await place("about"))[0] > 0.5 * vw0, "the panel is beside the map, on the right");
      assert.match(await js(`document.getElementById("about-body").textContent`), new RegExp(`${story.model.name}\\s+is one model`), "one model, by its name");
    }
    if (id === "modelB") {  // the open board: a bare table, a model a row, and the way in as a button
      await until(`document.getElementById("about").open && Math.abs(document.getElementById("about-board").getBoundingClientRect().top - document.getElementById("about").getBoundingClientRect().top) < 90`, "the board, in the panel");
      const rows = story.leaderboard.rows;
      const p1 = x => (100 * x).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
      assert.deepEqual(await js(`[...document.querySelectorAll("#about .board tbody tr")].map(tr => [tr.cells[0].textContent, tr.querySelector("a").textContent, tr.querySelector("a").getAttribute("href"), tr.cells[2].textContent, tr.cells[3].textContent])`), rows.map(r => [String(r.rank), r.model, r.url, p1(r.cap5), p1(r.unseen_2026)]), "a model a row: its rank, its name as a link, its score and the year kept apart, to one decimal");
      assert.equal(new Set(rows.map(r => p1(r.cap5))).size, rows.length, "so that no two rows read the same");
      assert.deepEqual(await js(`[document.querySelector("#about .go .btn").textContent, document.querySelector("#about .go .btn").getAttribute("href"), document.querySelector("#about .go a:not(.btn)").getAttribute("href"), getComputedStyle(document.querySelector("#about .go .btn")).backgroundColor]`), ["Submit a model", story.links.benchmark, story.links.repository, GREEN], "the way in is a button, and the repository a link beside it");
    }
    if (id === "ahead") {
      await until(`!document.getElementById("about").open && document.querySelectorAll("#chart .bar").length === 36`, "the months ahead, in the dock");
      const d = await place("chartbox");
      assert.ok(d[0] < 0.05 * vw0 && d[1] + d[3] > 0.95 * vh0 && d[0] + d[2] < 0.4 * vw0 && d[1] > 0.5 * vh0, "the timeline is in its dock, in the lower left corner: " + d);
      assert.deepEqual([await js(`document.documentElement.dataset.scale`), await count("#chart .bar .fc"), await count("#chart .line"), await text("#story-next")], ["months", 12, 0, "Done"], "month by month, as a histogram, with the forecast; and one way on, which ends it");
    }
  }
  assert.doesNotMatch(said.join(" "), /flagged|\bflag\b|—|Legal Amazon|black box|[Tt]wo models|put to the test|Where to start|Enforcement|month by month/i, "the story's own words");
  assert.ok(said.every((x, i) => i % 2 || (x.length > 8 && x.length <= 70)), "every line is short: " + Math.max(...said.filter((x, i) => !(i % 2)).map(x => x.length)));
  // Back goes back, by the key and by the button, and forward again
  await key("ArrowLeft");
  await until(`document.documentElement.dataset.step === "modelB" && document.getElementById("about").open`, "back one step");
  await clickOn("#story-back");
  await until(`document.documentElement.dataset.step === "modelA"`, "back another");
  assert.deepEqual(await amazon(), where);
  await key("ArrowRight"); await until(`document.documentElement.dataset.step === "modelB"`, "forward");
  await key("ArrowRight"); await until(`document.documentElement.dataset.step === "ahead" && !document.getElementById("about").open && document.querySelectorAll("#chart .bar").length === 36`, "to the last step");
  await sleep(700);
  // the end: the caption goes, and what is on the page is the tool. Nothing moves and nothing new comes in.
  const before = { has: await onPage(), amazon: await amazon(), zoom: await js(`!!document.querySelector(".leaflet-control-zoom").offsetParent`), names: await count(".state-name") };
  for (const p of PIECES) before[p] = await place(p);
  await clickOn("#story-next");
  await until(`!(${onStory}) && document.getElementById("story").hidden && /m=prio&b=1/.test(location.hash)`, "the story over, the tool on the page");
  await sleep(700);
  const after = { has: await onPage(), amazon: await amazon(), zoom: await js(`!!document.querySelector(".leaflet-control-zoom").offsetParent`), names: await count(".state-name") };
  for (const p of PIECES) after[p] = await place(p);
  assert.deepEqual(after, before, "the page after the story is the page of its last step");
  assert.equal(await js(`localStorage.story + "/" + document.documentElement.dataset.storyVersion`), "2/2", "finishing is remembered, with the story's version");
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "Story,About,API,PT");
  assert.equal(await js(`document.querySelector("#list-rows [aria-current]").dataset.b + "/" + !!document.querySelector("#list-rows .why") + "/" + document.getElementById("mapbox").dataset.as`), "1/true/stage");
  const endHash = (await hash()).replace(/&l=\w+/, "");
  // after that the bare address goes straight to the tool
  await send("Page.navigate", { url: SITE });
  await until(head("/^About [\\d,]+\\skm² of clearing expected by July 2027$/") + ` && document.querySelector("canvas.cells")?.dataset.key === "${fy0}" && /m=cells/.test(location.hash)`, "the tool, on a second visit");
  assert.equal(await js(`${onStory} || !document.getElementById("story").hidden`), false, "a second visit is not told the story again");
  // a link with a fragment never shows it, even to someone who has never seen it; nor does ?story=0
  await js(`localStorage.removeItem("story")`);
  for (const [url, ready] of [["#l=en&m=sectors", `!!document.querySelector("#legend .ramp")`], ["#about", `document.getElementById("about").open`], ["#api", `document.getElementById("api").open`], ["?story=0", `/v=/.test(location.hash)`]]) {
    await send("Page.navigate", { url: SITE + url });
    await until(`${ready} && /km²/.test(document.getElementById("say").textContent)`, "the tool at " + url);
    assert.equal(await js(`${onStory} || !document.getElementById("story").hidden`), false, `no story at ${url}`);
    for (const id of ["about", "api"]) await js(`document.getElementById("${id}").open && document.getElementById("${id}").close()`);
  }
  assert.equal(await js(`localStorage.getItem("story")`), null, "and none of that counts as having seen it");
  // ?story=1 plays it whatever is remembered. Skip lands on the very page the story ends on.
  await js(`localStorage.setItem("story", "2")`);
  await send("Page.navigate", { url: SITE + "?story=1" });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA" && !!document.querySelector("canvas.base")`, "the story, forced");
  await key("ArrowRight");
  await until(`document.documentElement.dataset.step === "forestB"`, "a step in");
  await clickOn("#skip-btn");
  await until(`!(${onStory}) && /m=prio&b=1/.test(location.hash) && document.querySelector("canvas.cells")?.dataset.key === "${fy0}" && !!document.querySelector("#list-rows .why") && document.querySelectorAll("#chart .bar").length === 36`, "skipped, onto the tool");
  await sleep(1600);  // (the Amazon glides aside for the list, as it does in the story)
  const skipped = { has: await onPage(), amazon: await amazon(), zoom: await js(`!!document.querySelector(".leaflet-control-zoom").offsetParent`), names: await count(".state-name") };
  for (const p of PIECES) skipped[p] = await place(p);
  assert.deepEqual(skipped, before, "skipping lands on the page the story ends on");
  assert.equal((await hash()).replace(/&l=\w+/, ""), endHash, "the same state, to the link");
  assert.equal(await js(`location.search + "/" + localStorage.story + "/" + document.getElementById("story").hidden`), "/2/true", "the address is clean and skipping is remembered");
  assert.ok(await redPx() > 5000, "with the chances on the map");
  // the reader may close the list on the way: it stays closed, and the story ends on the cells
  await send("Page.navigate", { url: SITE + "?story=1" });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA"`, "the story again");
  for (const id of IDS.slice(1, IDS.indexOf("omenB") + 1)) { await js(`document.getElementById("story-next").click()`); await until(`document.documentElement.dataset.step === "${id}"`, id); }
  await until(`!!document.getElementById("list").offsetParent && !!document.getElementById("list-close").offsetParent`, "the list, with its way out");
  await clickOn("#list-close");
  await until(`document.getElementById("list").hidden && ${onStory} && document.documentElement.dataset.step === "omenB"`, "the list closed by the reader, the story still on");
  await until(`document.querySelector("canvas.base").getBoundingClientRect().width > ${0.9 * 1} * ${0} + ${Math.round(0.55 * 1440)}`, "and the Amazon large again");
  for (const id of IDS.slice(IDS.indexOf("omenB") + 1)) { await js(`document.getElementById("story-next").click()`); await until(`document.documentElement.dataset.step === "${id}" && document.getElementById("list").hidden`, id + ", the list still closed"); }
  await js(`document.getElementById("story-next").click()`);
  await until(`!(${onStory}) && /m=cells/.test(location.hash) && document.getElementById("list").hidden`, "the story over, on the cells");
  // an older version of the story does not count: a rewritten one is shown once more
  await js(`localStorage.setItem("story", "1")`);
  await send("Page.navigate", { url: SITE });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA"`, "a new version of the story is shown again");
  await key("Escape");
  await until(`!(${onStory})`, "Escape skips");
  assert.equal(await js(`localStorage.story`), "2");
  // the header's Story plays it again
  await clickOn("#story-btn");
  await until(`${onStory} && document.documentElement.dataset.step === "forestA" && location.search === "?story=1"`, "the story, played again from the header");
  await clickOn("#skip-btn");
  await until(`!(${onStory}) && location.search === ""`, "and left");

  await send("Page.navigate", { url: SITE + "#l=en" });
  // the default screen: the whole Amazon, every cell by its chance on the stage, and the bulletin docked with the months ahead
  await until(head("/^About [\\d,]+\\skm² of clearing expected by July 2027$/") + ` && !!document.querySelector("#legend .steps") && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}" && /v=/.test(location.hash)`, "the forecast headline, the chances on the map and their key");
  assert.equal(await js(`document.getElementById("scope").hidden`), true, "the whole Amazon needs no label");
  assert.equal(await js(`!!document.getElementById("sure")`), false, "accuracy lives in About, not in the bulletin");
  assert.match(await text("#sub"), /^Likely between [\d,]+ and [\d,]+\.$/);
  assert.equal(+await level(), amazonLevel("clear"), "the clearing level for the Amazon is the one the data counts to");
  await redFollows(amazonLevel("clear"));
  assert.equal(await count("#hazard button"), 1 + hazardLayers.length, "one control per hazard that has a forecast");
  assert.equal(await js(`!!document.getElementById("geo-input") || !!document.getElementById("draw-btn") || !!document.querySelector("footer")`), false, "no search, no draw, no footer");
  const words = await js(`document.body.innerText.split(/\\s+/).filter(w => /[A-Za-zÀ-ú]/.test(w)).length`);
  assert.ok(words <= 85, `the default screen stays scannable: ${words} words`);
  assert.equal(await js(`[...document.querySelectorAll("#top nav button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "Story,About,API,PT", "the header: the story, About, the API and the language");
  // the default timeline for clearing: months as bars, with the forecast, and the map stays on the year's chances
  assert.deepEqual([await js(`document.querySelector('#scale button[aria-pressed="true"]').dataset.k`), await js(`document.documentElement.dataset.scale`), await count("#chart .bar"), await count("#chart .bar .fc"), await count("#chart .line")], ["months", "months", 36, monthly ? 12 : 0, 0], "months, as bars, 24 back and 12 ahead");
  assert.match(await hash(), /t=months&m=cells/, "the link says the scale and the mode");
  assert.doesNotMatch(await hash(), /k=|f=/, "and the map is the year's, on the stage");
  // the page: the map is all of it, and the timeline is docked in the lower left corner
  const vw = await js(`innerWidth`), vh = await js(`innerHeight`), rect = id => js(`(() => { const r = document.getElementById("${id}").getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()`);
  assert.deepEqual([await js(`document.getElementById("mapbox").dataset.as`), await js(`document.getElementById("chartbox").dataset.as`)], ["stage", "dock"]);
  const stage0 = await rect("mapbox"), dock0 = await rect("chartbox");
  assert.deepEqual(stage0, [0, 0, vw, vh], "the map is the page, edge to edge");
  assert.ok(dock0[0] < 0.05 * vw && dock0[3] > 0.95 * vh && dock0[2] < 0.4 * vw && dock0[1] > 0.5 * vh, "the timeline is docked in the lower left corner: " + dock0);
  // nothing has a frame: no border, no outline, no rule around the map, the panels, the dock or the switch
  assert.deepEqual(await js(`["mapbox", "chartbox", "mappanel", "top", "modes", "level", "story-back"].filter(id => { const e = document.getElementById(id); return [getComputedStyle(e), getComputedStyle(e, "::after")].some(s => ["Top", "Right", "Bottom", "Left"].some(k => parseFloat(s["border" + k + "Width"]) > 0) || (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0)); })`), [], "no box of rules around anything");
  assert.deepEqual(await js(`[...document.querySelectorAll(".leaflet-control-zoom, .leaflet-control-zoom a")].map(e => getComputedStyle(e).borderTopWidth)`), ["0px", "0px", "0px"]);
  // controls sit on what they control: the map's in its panel, the timeline's on the timeline, and the three columns of type share one edge
  assert.equal(await js(`["modes", "kinds", "rank-btn", "legend", "share"].every(id => document.getElementById("mappanel").contains(document.getElementById(id))) && document.getElementById("list").contains(document.getElementById("list-close")) && !!document.querySelector("#mapbox .leaflet-control-zoom")`), true, "mode, kinds, key and count are in the map's panel, the list has its way out, the zoom is on the map");
  assert.equal(await js(`["hazard", "scale", "shape", "ahead", "step", "signs"].every(id => document.getElementById("chartbox").contains(document.getElementById(id)))`), true, "hazard, scale, bars or line, window and year are on the timeline");
  const edges = await js(`[".brand", "#legend .what", "#say", "#hazard"].map(q => Math.round(document.querySelector(q).getBoundingClientRect().left))`);
  assert.ok(Math.max(...edges) - Math.min(...edges) <= 2, "the mark, the key, the hazards and the headline share the page's left edge: " + edges);
  assert.equal(await js(`!!document.getElementById("cue") || /trained model|Modelo treinado/.test(document.body.innerText)`), false, "no line about the model by the key");
  // docked, the timeline is compact: the hazards, the level, the headline and the histogram
  assert.equal(await js(`["scale", "shape", "sub", "hint", "signs"].some(id => document.getElementById(id).offsetParent) || !!document.querySelector("#chart .unit, #chart .grid text")`), false, "no tabs, no axis and no signals in the dock");
  assert.equal(await js(`["hazard", "level", "say", "chart"].every(id => document.getElementById(id).offsetParent)`), true);
  // the key to the chances: forest green, then four reds that get lighter as the chance rises
  const keyRgb = await js(`[...document.querySelectorAll("#legend .steps button")].map(b => getComputedStyle(b).backgroundColor.match(/\\d+/g).map(Number))`);
  assert.deepEqual(keyRgb, [[11, 107, 58], ...RAMP], "the steps of the key are the forest and the ramp");
  assert.deepEqual([await text("#legend .what"), await text("#legend .ticks")], [`Chance each cell loses a hectare by July ${meta.forecast.year}`, "0.1%1%5%20%"], "the key states the event, and the chance where two steps meet");
  assert.equal(await js(`[...document.querySelectorAll("#legend .steps button")].map(b => b.getAttribute("aria-label")).join()`), "under 0.1%,0.1 to 1%,1 to 5%,5 to 20%,over 20%", "each step says its own range");
  assert.match(await text("#share"), /^[\d,]+ of [\d.]+ million forest cells expected to lose a hectare$/);
  await sleep(400);

  // the swap: the timeline comes to the stage, larger and richer, and the map shrinks into the lower right corner, still painted
  const paintedPx = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return n; })()`);
  assert.ok(await area("mapbox") > 4 * await area("chartbox"), "the map is the large one");
  assert.ok(await paintedPx() > 1000, "and it is painted");
  let t0 = Date.now();
  await clickOn("#chart-front");
  await until(settled("chart"), "the timeline on the stage");
  assert.ok(Date.now() - t0 < 2500, "the swap is over in a moment");
  await sleep(300);
  assert.ok(await area("chartbox") > 4 * await area("mapbox"), "now the timeline is the large one");
  const dock1 = await rect("mapbox");
  assert.ok(dock1[2] > 0.95 * vw && dock1[3] > 0.95 * vh && dock1[0] > 0.6 * vw && dock1[1] > 0.5 * vh, "the map is docked in the lower right corner: " + dock1);
  assert.ok(await paintedPx() > 200, "the docked map is still painted");
  assert.equal(await js(`document.querySelector("canvas.cells").dataset.key`), String(meta.forecast.year));
  assert.equal(await js(`["scale", "shape", "sub", "hint", "signs"].every(id => document.getElementById(id).offsetParent) && !!document.querySelector("#chart .unit") && document.querySelectorAll("#chart .grid text").length > 0 && document.querySelectorAll("#chart .bar .rng").length > 0`), true, "on the stage the timeline has its tabs, its axis, its ranges and the signals");
  assert.equal(await js(`["mappanel", "list"].some(id => document.getElementById(id).offsetParent) || !!document.querySelector(".leaflet-control-zoom")?.offsetParent`), false, "the docked map has no controls");
  assert.match(await hash(), /f=chart/, "the link says the timeline is on the stage");
  assert.equal(await text("#chart .unit"), "km² cleared per month");
  assert.deepEqual(await js(`[...document.querySelectorAll("#chart tspan.h")].map(e => e.textContent + (e.classList.contains("on") ? "*" : ""))`), [`to July ${meta.forecast.year}*`, "3 months", "6 months"], "the window ahead is chosen on the chart: the year, or 3 or 6 months");
  t0 = Date.now();
  await clickOn("#map-front");
  await until(settled("map"), "the map back on the stage");
  assert.ok(Date.now() - t0 < 2500);
  await sleep(300);
  assert.ok(await area("mapbox") > 4 * await area("chartbox"), "the map is large again");
  assert.ok(await paintedPx() > 1000, "and painted, not blank");
  assert.deepEqual((await rect("mapbox")).map(Math.round), stage0.map(Math.round), "in the place it had");
  assert.doesNotMatch(await hash(), /f=chart/);
  assert.equal(await count(".box.sinking, [data-swap]"), 0, "nothing is left of the swap");

  // sectors, chosen on the map's own panel
  await clickOn('#modes button[data-k="sectors"]');
  await until(`!!document.querySelector("#legend .ramp") && /m=sectors/.test(location.hash) && !!document.querySelector(".leaflet-overlay-pane canvas")`, "the sectors on the map");
  assert.deepEqual(await js(`[...document.querySelectorAll("#legend .ramp i")].map(b => getComputedStyle(b).backgroundColor.match(/\\d+/g).map(Number))`), [[11, 107, 58], ...RAMP], "sectors take the same reds");
  await sleep(700);
  // a real click inside Altamira selects it
  await click(...await at(-6.5, -54.2));
  await until(`document.getElementById("scope").textContent.includes("Altamira")`, "the sector");
  await until(head("/^About [\\d,.]+\\skm² of clearing expected here by July 2027$/"), "the sector forecast");
  const fc = await text("#level") + " | " + await text("#say") + " " + await text("#sub");
  assert.match(await text("#sub"), /^\d+(st|nd|rd|th) of \d+ municipalities\. [\d.]+% of the Amazon total\.$/);
  assert.match(await hash(), /r=1500602/, "the sector is in the link");
  assert.equal(await count(".leaflet-sel-pane path"), 2, "the sector is outlined");
  await redFollows(+await level());

  // the timeline comes forward at a click on the dock. Years: one bar a year, and clicking a bar replays that
  // year, for the same sector. A past forecast has no level and no red.
  await toFront("chart");
  await clickOn('#scale button[data-k="years"]');
  await until(`document.querySelectorAll("#chart .bar").length === 20 && /t=years/.test(location.hash)`, "nineteen years and the forecast");
  assert.equal(await text("#chart .unit"), "km² cleared per year, August to July", "the y axis says what it counts");
  assert.match(await text("#hint"), /^Pick a year from \d+ on to replay it\.$/);
  await clickOn('#chart .bar[data-i="15"] .hot');
  await until(head("/^In 2023, [\\d,.]+\\skm² were cleared here$/"), "the 2023 replay");
  const past = await text("#say") + " " + await text("#sub");
  assert.equal(await level(), "r");
  await redFollows(0);
  assert.match(await hash(), /y=2023/);

  // months: what was cleared month by month, then the model's forecast for the months ahead. The headline stays
  // on the year being forecast until a shorter window is chosen on the timeline itself.
  await clickOn('#scale button[data-k="months"]');
  await until(head("/^About [\\d,.]+\\skm² of clearing expected here by July 2027$/") + ` && document.querySelectorAll("#chart .bar").length === 36`, "the monthly view");
  assert.match(await hash(), /y=2027&t=months/, "months look ahead from now, so the replay is left");
  assert.doesNotMatch(await hash(), /k=/);
  assert.equal(await text("#chart .unit"), "km² cleared per month");
  assert.doesNotMatch(await text("#chart"), /PRODES/, "no jargon on the monthly timeline");
  assert.doesNotMatch(await js(`document.getElementById("chartbox").innerText`), /alerts?\b/i, "the quantity is km² cleared, never alerts");
  assert.equal(await count("#chart .ghost, #chart .tick"), 0, "nothing from a year before on the timeline");
  assert.equal(await count("#chart .bar .fc"), monthly ? 12 : 0, "the months ahead are the model's forecast");
  assert.match(await text("#hint"), /DETER/, "says once where monthly figures come from");
  await clickOn('#chart tspan[data-h="3"]');
  await until(head("/km² (cleared here in the last three months|expected to be cleared here in the next 3 months)$/") + ` && /k=clear3/.test(location.hash)`, "the three month window");
  const months = await text("#level") + " | " + await text("#say") + " " + await text("#sub");
  await clickOn('#chart tspan[data-h="6"]');
  await until(`/k=clear6/.test(location.hash) && /next 6 months/.test(document.getElementById("legend").textContent)`, "the six month window");

  // red is clearing. The other hazards each have their own hue, none of them red or forest green
  assert.equal(await style('#hazard button[aria-pressed="true"] .glyph', "fill"), RED, "clearing is red");
  for (const layer of hazardLayers) {
    await clickOn(`#hazard button:nth-child(${2 + hazardLayers.indexOf(layer)})`);
    await until(`new RegExp("k=${layer}").test(location.hash)`, layer);
    assert.ok(![RED, GREEN].includes(await style('#hazard button[aria-pressed="true"] .glyph', "fill")), "a hazard's own colour is neither clearing's red nor the forest's green");
  }
  // fire: what burned, and never how much will burn
  await clickOn('#hazard button:nth-child(2)');
  await clickOn('#scale button[data-k="years"]');
  await until(head("/^[\\d,.]+\\skm² burned here in the last twelve months, [\\d,.]+ in the twelve before$/"), "fire by year, as observed");
  assert.match(await text("#sub"), /^\d+(st|nd|rd|th) of \d+ municipalities on the map of where fire tends to occur\.$/);

  // back to the map: cells, with the sector still selected. Then the clearing replay again, stepped to on the dock.
  await toFront("map");
  await clickOn('#modes button[data-k="cells"]');
  await until(`document.querySelector("canvas.cells").dataset.key === "scar12"`, "the painted 1 km cells");
  assert.equal(await js(`+document.querySelector("canvas.cells").dataset.cell >= ${meta.cell}`), true, "the other hazards are painted at 1 km or coarser");
  assert.match(await hash(), /m=cells/);
  assert.equal(await js(`document.getElementById("kinds").hidden`), true);
  await clickOn('#hazard button:nth-child(1)');
  await until(head("/^About [\\d,.]+\\skm² of clearing expected here by July 2027$/") + ` && !document.getElementById("step").hidden && !!document.getElementById("step").offsetParent`, "clearing by year again, with the year stepper on the dock");
  assert.equal(await count("#chart .bar"), 20, "the docked timeline is the years");
  for (let y = meta.forecast.year - 1; y >= 2023; y--) { await clickOn('#step button[data-d="-1"]'); await until(`document.querySelector("#step span").textContent === "${y}"`, "stepping to " + y); }
  await until(head("/^In 2023, /") + ` && document.getElementById("legend").textContent === "Chance given to each cell for 20230.1%1%5%20%clearing mapped"`, "the replay in cells, with the steps of chance in the key");
  assert.equal(await js(`document.documentElement.dataset.front`), "map", "stepping the year on the dock leaves the map on the stage");
  assert.ok((await text("#scope")).includes("Altamira"));
  // every forest cell is painted by its chance, for the window on screen and never as one huge canvas
  await until(`document.querySelector("canvas.cells").dataset.key === "2023" && !document.getElementById("share").hidden`, "the cells of 2023");
  const painted = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return [c.width, c.height, n, Math.max(...[...document.querySelectorAll(".leaflet-paint-pane canvas")].map(c => c.width * c.height))]; })()`);
  const [w, h, all, biggest] = await painted();
  assert.ok(w * h < 4e6 && biggest < 4e6 && all > 0, `the cells canvas is the size of the view (${w} x ${h}) and has cells on it (${all} px)`);
  assert.match(await text("#share"), /^[\d,]+ cells had clearing mapped$/, "the line under the key counts cells");
  assert.doesNotMatch(await js(`document.getElementById("mapbox").innerText + document.getElementById("say").textContent`), /flagged|top 5%|5% of forest/i, "no flag and no 5% cut in the cells view");
  // the steps of the key are the filter: choosing one leaves the cells at that chance or more
  await clickOn('#legend button[data-min="3"]');
  await until(`document.querySelector("canvas.cells").dataset.min === "3" && /p=3/.test(location.hash)`, "the minimum chance");
  assert.ok((await painted())[2] < all, "fewer cells are painted above the minimum");
  assert.match(await text("#share"), /^[\d,]+ cells at 5% or more, with \d+% of the cells where clearing was mapped$/);
  assert.equal(await js(`[...document.querySelectorAll("#legend [data-min]")].map(b => b.getAttribute("aria-pressed")).join()`), "false,false,false,true,true");
  await clickOn('#legend button[data-min="3"]');
  await until(`document.querySelector("canvas.cells").dataset.min === "0" && !/p=/.test(location.hash)`, "the filter cleared");
  assert.equal(await js(`document.getElementById("legend").contains(document.getElementById("share"))`), false);

  // sectors of another kind drop the selection
  await clickOn('#modes button[data-k="sectors"]');
  await clickOn('#kinds button[data-k="ti"]');
  await until(`document.getElementById("scope").hidden && /s=ti/.test(location.hash) && !/r=/.test(location.hash)`, "the Indigenous lands overview");
  assert.equal(await text("#say"), `In 2023, ${Math.round(meta.years[2023].actual_km2).toLocaleString("en-US")} km² were cleared`, "a year whose chances were not checked says what was cleared");
  assert.equal(await text("#sub"), "", "and the benchmark's 5% yardstick stays in About");

  // fire for the whole Amazon, by month, with the timeline on the stage: the level the data counts to, the red
  // that goes with it, and no forecast amount
  // (a link opened in the same tab changes only the fragment, and the app reloads itself on that. Do not send
  // Page.reload after it: a busy page may not have taken the new fragment yet, and the old link gets reloaded.)
  await send("Page.navigate", { url: SITE + "#l=en&k=scar12&t=months&f=chart" });
  await until(head("/burned in the last three months/") + ` && document.getElementById("lead").dataset.l === "${amazonLevel("scar")}" && /^Where fire tends to occur/.test(document.getElementById("legend").textContent) && ${settled("chart")} && !!document.querySelector("#chart .unit")`, "the fire level");
  await redFollows(amazonLevel("scar"));
  const fire = await text("#level") + " | " + await text("#say") + " " + await text("#sub");
  if (monthly) {  // the headline is what burned: the last three months against the same months a year before
    const h = monthly.hazards.scar.history, [ly, lm] = monthly.last_month.split("-").map(Number);
    const sum = from => [0, 1, 2].reduce((x, k) => { const d = new Date(ly, lm - 1 - from - k, 1); return x + (h[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] ?? 0); }, 0);
    assert.equal(await text("#say"), `${km(sum(0))} km² burned in the last three months, ${km(sum(12))} a year before`);
  }
  const noFireForecast = async where => {
    assert.equal(await count("#chart .fc, #chart .rng, #chart .win, #chart .winrule, #chart .now, #chart .fcl, #chart .band"), 0, "no forecast bars, range or window for fire, " + where);
    assert.doesNotMatch(await js(`document.getElementById("app").innerText`), /expected|forecast|about \d|missed|uncertain|next \d+ months|likely/i, "no forecast amount of fire anywhere, " + where);
  };
  assert.equal(await count("#chart .bar"), 24, "24 months of fire scars, none ahead");
  assert.equal(await text("#chart .unit"), "km² burned per month");
  await noFireForecast("by month");
  await clickOn('#shape button[data-k="line"]');
  await until(`!!document.querySelector("#chart .line .obs")`, "fire as a line");
  await noFireForecast("as a line");
  await clickOn('#shape button[data-k="bars"]');
  await clickOn('#scale button[data-k="years"]');
  await until(head("/burned in the last twelve months/"), "fire by year for the Amazon");
  const burned = regions.amazon.L.scar12;
  assert.equal(await text("#say"), `${km(burned.at(-1))} km² burned in the last twelve months, ${km(burned.at(-2))} in the twelve before`);
  assert.equal(await count("#chart .bar"), regions.layers.scar12.windows.length, "one bar per twelve months of history, none for the months ahead");
  await noFireForecast("by year");
  await toFront("map");
  await noFireForecast("docked");

  // a cell says its own chance. The file is decoded here, a cell is picked from it, and the map must say the same.
  const fyear = meta.forecast.year, F = meta.years[fyear].flags500, pmap = F && await grey(`p${fyear}.png`);
  let cell = "";
  if (pmap) {
    assert.deepEqual([pmap.w, pmap.h], [F.cols, F.rows]);
    const at0 = (F.rows >> 1) * F.cols, i = pmap.px.findIndex((v, n) => n > at0 && v >= 90 && v < 200), row = Math.floor(i / F.cols), col = i % F.cols;
    const lat = meta.north - (row + 0.5) * F.cell, lng = meta.west + (col + 0.5) * F.cell, want = `${chance(pmap.px[i])} chance this cell loses a hectare by July ${fyear}`;
    await send("Page.navigate", { url: SITE + `#l=en&m=cells&v=${lat.toFixed(6)},${lng.toFixed(6)},11` });
    await until(`document.querySelector("canvas.cells")?.dataset.key === "${fyear}" && document.querySelector("canvas.cells").dataset.f === "1"`, "the chances of " + fyear + " at 500 m");
    assert.equal(await text("#legend"), `Chance each cell loses a hectare by July ${fyear}0.1%1%5%20%`, "the key states the event and the steps");
    assert.match(await text("#share"), /^[\d,]+ of [\d.]+ million forest cells expected to lose a hectare$/);
    const [mx, my] = await js(`(() => { const r = document.getElementById("map").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + 1, y: my + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the cell's tooltip");
    cell = await text(".leaflet-tooltip.cell");
    assert.equal(cell, want, "the hover text is the chance in the file for that cell");
    // the paint under the pointer is the step of that chance (over imagery the layer is see-through, so only the hue is checked)
    const stepOf = v => [0.001, 0.01, 0.05, 0.2].filter(c => (v / 255) ** 2 >= c).length, STEP = [null, ...RAMP];
    const rgb = await js(`(() => { const c = document.querySelector("canvas.cells"), r = c.getBoundingClientRect(); return [...c.getContext("2d").getImageData(Math.round(${mx} - r.x), Math.round(${my} - r.y), 1, 1).data]; })()`);
    assert.deepEqual(rgb, [...STEP[stepOf(pmap.px[i])], 255], "the cell is painted in the red of its step");
    // and in a replayed year it also says whether clearing was mapped there
    const past = Math.max(...Object.keys(meta.years).map(Number).filter(y => meta.years[y].actual_km2 != null));
    await send("Page.navigate", { url: SITE + `#l=en&m=cells&y=${past}&v=${lat.toFixed(6)},${lng.toFixed(6)},11` });
    await until(`document.querySelector("canvas.cells")?.dataset.key === "${past}"`, "the chances of " + past);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + 1, y: my + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the cell's tooltip in the replay");
    assert.match(await text(".leaflet-tooltip.cell"), new RegExp(`^In ${past} this cell was given (under 0\\.1%|[\\d.]+%)\\. (Clearing|No clearing) was mapped in it\\.$`));
    cell += " / " + await text(".leaflet-tooltip.cell");
    // the replay line: cells expected to lose a hectare against cells that did
    const Y = prob?.years?.[past];
    if (Y) assert.equal(await text("#say"), `In ${past}, ${three3(Y.expected_cells)} cells were expected to lose a hectare and ${three3(Y.actual_cells)} did`);
    // from far, the whole Amazon is painted, mostly green, and the pointer speaks for the block under it
    await send("Page.navigate", { url: SITE + "#l=en&m=cells" });
    await until(`document.querySelector("canvas.cells")?.dataset.key === "${fyear}" && +document.querySelector("canvas.cells").dataset.f > 1 && /v=/.test(location.hash)`, "the chances of " + fyear + " for the whole Amazon");
    // every painted pixel is one of the four reds, the dark ones common and the two brightest rare
    const mixOf = await js(`(() => { const R = ${JSON.stringify(RAMP)}, c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = { all: 0, steps: [0, 0, 0, 0], other: 0 }; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { n.all++; const k = R.findIndex(s => s[0] === d[i] && s[1] === d[i + 1] && s[2] === d[i + 2]); k < 0 ? n.other++ : n.steps[k]++; } return n; })()`);
    assert.ok(mixOf.other === 0 && mixOf.steps.every(x => x > 0), `the chances are painted in the four reds and nothing else: ${JSON.stringify(mixOf)}`);
    assert.ok(mixOf.steps[0] > mixOf.steps[1] && mixOf.steps[1] > mixOf.steps[2] && mixOf.steps[2] > mixOf.steps[3] && (mixOf.steps[2] + mixOf.steps[3]) / mixOf.all < 0.1, `the dark red is common and the bright reds are rare: ${JSON.stringify(mixOf)}`);
    // The Amazon is fitted to its own outline: clear of the map's panel and of the timeline's dock, and reaching
    // into the room between the two, so the left of the stage is not an empty strip.
    const fit = await js(`(() => {
      const cv = document.querySelector("canvas.base"), r = cv.getBoundingClientRect(), k = cv.width / r.width, cx = cv.getContext("2d"), m = document.getElementById("map").getBoundingClientRect();
      const [panel, dock] = ["mappanel", "chartbox"].map(id => document.getElementById(id).getBoundingClientRect());
      // how much of the drawn Amazon lies in a rectangle of the screen
      const drawn = (x0, y0, x1, y1) => { const a = Math.max(0, Math.floor((x0 - r.left) * k)), b = Math.max(0, Math.floor((y0 - r.top) * k)), w = Math.min(cv.width, Math.ceil((x1 - r.left) * k)) - a, h = Math.min(cv.height, Math.ceil((y1 - r.top) * k)) - b; if (w <= 0 || h <= 0) return 0; const d = cx.getImageData(a, b, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return n / (k * k); };
      return { under: drawn(panel.left, panel.top, panel.right, panel.bottom) + drawn(dock.left, dock.top, dock.right, dock.bottom), between: drawn(m.left, panel.bottom, dock.right, dock.top), left: r.left, rail: dock.right, tall: r.height / m.height };
    })()`);
    assert.equal(Math.round(fit.under), 0, "no part of the Amazon lies under the panel or the dock: " + JSON.stringify(fit));
    assert.ok(fit.between > 400 && fit.left < fit.rail - 30, "the Amazon's west reaches into the room between the panel and the dock: " + JSON.stringify(fit));
    assert.ok(fit.tall > 0.85, "and the Amazon takes most of the stage's height: " + JSON.stringify(fit));
    assert.equal(await js(`(() => { const c = document.querySelector("canvas.cells"), r = c.getBoundingClientRect(), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, boxes = ["mappanel", "chartbox"].map(id => document.getElementById(id).getBoundingClientRect()); let n = 0; for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[4 * (y * c.width + x) + 3] > 0 && boxes.some(b => x + r.x > b.left && x + r.x < b.right && y + r.y > b.top && y + r.y < b.bottom)) n++; return n; })()`), 0, "and no painted cell either");
    const [fx, fy_] = await at(lat, lng);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fx + 1, y: fy_ + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fx, y: fy_ });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the block's tooltip");
    assert.match(await text(".leaflet-tooltip.cell"), new RegExp(`^Up to [\\d.]+% chance a cell here loses a hectare by July ${fyear}$`));
  }

  // the mode is a switch of its own, and the list of sector kinds shows only in Sectors. The ranking stands on the map's frame.
  await send("Page.navigate", { url: SITE + "#l=en&g=1" });
  await until(`document.querySelectorAll("#list-rows li").length > 10 && !document.getElementById("list").hidden`, "the sector ranking");
  assert.equal(await js(`document.getElementById("modes").className + "/" + document.getElementById("kinds").className + "/" + document.getElementById("modes").contains(document.getElementById("kinds"))`), "seg/pick/false");
  assert.equal(await js(`[...document.querySelectorAll("#modes button")].map(b => b.textContent).join()`), "Sectors,Cells,Priorities", "three modes in the switch, and nothing else in it");
  assert.equal(await js(`[...document.querySelectorAll("#kinds button")].map(b => b.textContent).join()`), "States,Municipalities,Indigenous lands,Conservation units");
  assert.deepEqual([await style('#modes button[aria-pressed="true"]', "backgroundColor"), await style('#modes button[aria-pressed="false"]', "backgroundColor"), await style("#modes", "borderTopWidth"), await style("#kinds", "borderTopWidth")], [GREEN, "rgba(0, 0, 0, 0)", "0px", "0px"], "the mode that is on is set on forest green; nothing is boxed");
  assert.equal(await text("#list-rows li .nm"), `${byRisk[0].n}, ${byRisk[0].s}`, "the ranking starts with the municipality with the largest forecast");
  assert.equal(await js(`document.getElementById("list").getBoundingClientRect().right >= innerWidth - 1 && document.getElementById("list").getBoundingClientRect().left > innerWidth * 0.6 && !!document.getElementById("list-close").offsetParent`), true, "the list is on the right of the page, with its way out");
  assert.match(await hash(), /t=years&m=sectors&g=1/, "a link from before the months became the default keeps its years and its sectors");
  assert.equal(await count("#chart .bar"), 20);
  await clickOn("#list-close");
  await until(`document.getElementById("list").hidden && !/g=1/.test(location.hash) && /m=sectors/.test(location.hash)`, "the ranking closed by its X");
  // the timeline as a line, by a small glyph and back
  await toFront("chart");
  await clickOn('#shape button[data-k="line"]');
  await until(`!!document.querySelector("#chart .line .obs") && !document.querySelector("#chart .bar .plain") && /c=line/.test(location.hash)`, "the timeline as a line");
  assert.equal(await js(`!!document.querySelector("#chart .line .fcl")`), true, "the forecast is the dashed part of the line");
  assert.equal(await text("#shape"), "", "the toggle is two glyphs, no words");
  await clickOn('#shape button[data-k="bars"]');
  await until(`!!document.querySelector("#chart .bar .plain") && !/c=line/.test(location.hash)`, "bars again");
  // Escape sends the timeline back to its dock
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await until(settled("map"), "the map back on the stage, by Escape");
  await sleep(250);
  // priorities: the ranked blocks, the line that says how the ranking did, the download, and a row that leads to the map
  const prio = await fetch(`${SITE}data/priority.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (prio) {
    await clickOn('#modes button[data-k="prio"]');
    await until(`document.querySelectorAll("#list-rows li").length === ${prio.blocks.length} && document.getElementById("kinds").hidden`, "the priority list");
    const y0 = Object.keys(prio.replay)[0], r0 = prio.replay[y0];
    assert.ok((await text("#list-say")).startsWith(`Of the ${prio.top} blocks of ${prio.block_km} km ranked highest, ${Math.round(100 * r0.lost_10ha)}% lost at least 10 hectares in ${y0}, against ${(100 * r0.base_10ha).toFixed(1)}% of all forest blocks.`), "the line above the list says how the ranking did");
    assert.equal((await fetch(await js(`document.querySelector("#list-say a").href`), { method: "HEAD" })).ok, true, "the CSV is there to download");
    assert.equal(await text("#list-rows li .nm"), `${prio.blocks[0].municipality}, ${prio.blocks[0].state}`);
    const around = b => b.why.cleared_3y_around_km2.toLocaleString("en-US", { maximumFractionDigits: b.why.cleared_3y_around_km2 < 9.95 ? 1 : 0, minimumFractionDigits: b.why.cleared_3y_around_km2 < 9.95 ? 1 : 0 });
    assert.equal(await js(`[...document.querySelectorAll("#list-rows li:first-child button > *")].map(e => e.textContent.trim()).join("|")`), `1|${prio.blocks[0].municipality}, ${prio.blocks[0].state}|${Math.round(prio.blocks[0].expected_cells)}|${around(prio.blocks[0])}`, "a row is its rank, the place, the cells expected and the km² cleared around it");
    // the second figure tells rows apart, which the highest chance did not (it is the same for almost every block)
    const col = await js(`[...document.querySelectorAll("#list-rows li button .v:last-child")].slice(0, 40).map(e => e.textContent)`);
    assert.deepEqual(col, prio.blocks.slice(0, 40).map(around));
    assert.ok(new Set(col).size > 25, "the column carries information: " + new Set(col).size + " different values in 40 rows");
    assert.equal(await js(`[...document.querySelectorAll("#list-key .v, #list-rows li:nth-child(-n+30) .v, #list-rows li:nth-child(-n+30) .land")].every(e => { const r = e.getBoundingClientRect(), l = document.getElementById("list").getBoundingClientRect(); return r.right <= l.right - 4 && r.left >= l.left; })`), true, "nothing in the list is cut at its edge");
    assert.equal(await count("#list-rows .land"), prio.blocks.filter(b => b.land).length, "a glyph marks the blocks in Indigenous lands and conservation units");
    assert.equal(await text("#list-key"), "Indigenous landconservation unitcellskm² around");
    assert.equal(await js(`document.querySelectorAll("#list table, #list-rows [style*=border]").length + (getComputedStyle(document.querySelector("#list-rows button")).borderTopWidth === "0px" ? 0 : 1)`), 0, "a typographic list: no table, no rules between rows");
    assert.match(await text("#legend"), /^Chance each cell loses a hectare by July \d+0\.1%/, "the blocks sit on the chances of the cells");
    assert.equal(await count("#chart .bar"), 20, "the timeline keeps its scale: the priority list is about the map");
    await clickOn('#list-rows li:nth-child(3) button');
    await until(`/b=3/.test(location.hash) && document.querySelectorAll(".leaflet-sel-pane path").length === 2 && +new URLSearchParams(location.hash.slice(1)).get("v").split(",")[2] >= 9`, "the third block outlined and in view");
    assert.equal(await js(`document.querySelector("#list-rows [aria-current]").dataset.b`), "3");
    await sleep(900);
    // the block is in the part of the map that nothing covers: right of the rail, left of the list
    const [bx, by] = await at(prio.blocks[2].lat, prio.blocks[2].lon), free = await js(`[Math.max(document.getElementById("mappanel").getBoundingClientRect().right, document.getElementById("chartbox").getBoundingClientRect().right), document.getElementById("top").getBoundingClientRect().bottom, document.getElementById("list").getBoundingClientRect().left, innerHeight]`);
    assert.ok(bx > free[0] + 20 && bx < free[2] - 20 && by > free[1] + 20 && by < free[3] - 20, `the map is on the block, clear of the panel, the dock and the list: ${[bx, by]} in ${free}`);
    assert.doesNotMatch(await js(`document.body.innerText`), /flagged/i, "the word is gone from the interface");
    // the chosen block says why it ranks high: sentences built from its `why`, strongest first, then one fixed small line
    const typ = prio.why.typical_forest_block, n1 = x => x.toLocaleString("en-US", { maximumFractionDigits: x < 9.95 ? 1 : 0, minimumFractionDigits: x < 9.95 ? 1 : 0 });
    const why = b => {
      const w = b.why, out = [], add = (k, min, say) => { if (w[k] >= min) out.push([w[k] / Math.max(typ[k], 1e-9), say]); };
      if (w.times_typical_clearing >= 2) add("cleared_3y_around_km2", 1, `${n1(w.cleared_3y_around_km2)} km² cleared around it in three years, ${w.times_typical_clearing.toLocaleString("en-US", { maximumFractionDigits: w.times_typical_clearing < 10 ? 1 : 0, minimumFractionDigits: w.times_typical_clearing < 10 ? 1 : 0 })} times the forest's average.`);
      add("clearing_alerts_12m_km2", 0.5, `${n1(w.clearing_alerts_12m_km2)} km² of clearing alerts in the last 12 months.`);
      add("degradation_12m_km2", 0.5, `${n1(w.degradation_12m_km2)} km² degraded or logged in the last 12 months.`);
      add("fire_scar_12m_km2", 0.25, `${n1(w.fire_scar_12m_km2)} km² burned in the last 12 months.`);
      add("mining_12m_km2", 0.05, `${n1(w.mining_12m_km2)} km² of mining in the last 12 months.`);
      add("permit_ha", Math.max(1, typ.permit_ha), `A valid clearing permit for ${Math.round(w.permit_ha).toLocaleString("en-US")} ha.`);
      add("ibama_notices_12m", 1, `${w.ibama_notices_12m} IBAMA ${w.ibama_notices_12m === 1 ? "notice" : "notices"} in the last year.`);
      const say = out.sort((x, y) => y[0] - x[0]).slice(0, b.land ? 2 : 3).map(x => x[1]);
      if (b.land) say.push(b.land === "ti" ? "Inside Indigenous land." : "Inside a conservation unit.");
      if (say.length < 3 && w.forest_share >= 0.995) say.push("The whole block is still forest.");
      return say;
    };
    const closing = (([y, m, d]) => `What the model saw here on ${d} ${new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long" })} ${y}, not the cause.`)(meta.years[prio.year].origin.split("-").map(Number));
    const said = () => js(`[...document.querySelectorAll("#list-rows .why p")].map(e => e.textContent)`);
    assert.deepEqual(await said(), [...why(prio.blocks[2]), closing], "the third block's reasons, and the line that says what they are");
    assert.equal(await js(`document.querySelector("#list-rows .why").previousElementSibling.dataset.b`), "3", "the reasons open under the row that was chosen");
    for (const b of [prio.blocks[0], prio.blocks.find(x => x.land === "ti"), prio.blocks.find(x => x.why.permit_ha >= 30), prio.blocks.find(x => x.why.mining_12m_km2 >= 0.05)].filter(Boolean)) {
      await js(`document.querySelector('#list-rows [data-b="${b.rank}"]').click()`);
      await until(`document.querySelector("#list-rows .why")?.previousElementSibling.dataset.b === "${b.rank}"`, "the reasons of block " + b.rank);
      const got = await said(), want = why(b);
      assert.deepEqual(got, [...want, closing], `block ${b.rank}: ${JSON.stringify(b.why)}`);
      assert.ok(want.length >= 1 && want.length <= 3 && await count("#list-rows .why") === 1, "two or three sentences, for one block at a time");
    }
    assert.match((await said())[0], /^[\d.,]+ km² /, "a sentence starts with its number");
    // and in Portuguese
    await clickOn("#lang-btn");
    await until(`document.documentElement.lang === "pt" && /não a causa\.$/.test(document.querySelector("#list-rows .why .seen")?.textContent || "")`, "the reasons in Portuguese");
    assert.match((await said()).join(" "), /nos últimos 12 meses|ao redor em três anos|do IBAMA no último ano|Dentro de|ainda é floresta|Licença de desmate/);
    assert.equal((await said()).at(-1), (([y, m, d]) => `É o que o modelo viu aqui em ${d} de ${new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })} de ${y}, não a causa.`)(meta.years[prio.year].origin.split("-").map(Number)));
    // the list has a way out, and it leaves the map on its cells
    await clickOn("#list-close");
    await until(`document.getElementById("list").hidden && /m=cells/.test(location.hash) && !/b=/.test(location.hash) && !document.querySelector(".here")`, "the priority list closed by its X, the map back on its cells");
  }

  // a quiet sector: no alerts rising, forecast rank in the lower half. No red anywhere in the bulletin.
  await send("Page.navigate", { url: SITE + `#l=en&r=${quiet.id}` });
  await until(`document.getElementById("scope").textContent.includes(${JSON.stringify(quiet.n)}) && document.getElementById("lead").dataset.l === "0"`, "the quiet sector " + quiet.n);
  await redFollows(0);
  assert.equal(await count("#signs .up, #chart .worse"), 0, "nothing in the signals or the timeline is red");
  const calm = await text("#level") + " | " + await text("#say");

  // Portuguese, and the About text
  await clickOn("#lang-btn");
  await until(`document.documentElement.lang === "pt" && /km²/.test(document.getElementById("say").textContent)`, "Portuguese");
  assert.equal(await js(`[...document.querySelectorAll("#top nav button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "História,Sobre,API,EN");
  await clickOn("#about-btn");
  await until(`document.getElementById("about").open`, "the About text");
  assert.doesNotMatch(await js(`document.body.innerText + document.getElementById("about").innerText`), /—/, "no em dashes");
  // the old wording is gone from everything a reader can see, in both languages: every mode, a replay, fire, the
  // hover text and About. About keeps one sentence on the benchmark's 5% yardstick.
  const pastY = Math.max(...Object.keys(meta.years).map(Number).filter(y => meta.years[y].actual_km2 != null));
  for (const l of ["en", "pt"]) {
    for (const [q, ready] of [["", `!!document.querySelector("#legend .steps") && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}"`], ["&m=sectors", `!!document.querySelector("#legend .ramp")`], ["&m=cells&y=" + pastY, `document.querySelector("canvas.cells")?.dataset.key === "${pastY}"`], ["&m=cells&y=2020", `document.querySelector("canvas.cells")?.dataset.key === "2020"`],
      ["&m=prio", `document.querySelectorAll("#list-rows li").length > 10 && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}"`], ["&k=scar12&m=cells", `document.querySelector("canvas.cells")?.dataset.key === "scar12"`], ["&g=1&k=clear3", `document.querySelectorAll("#list-rows li").length > 10`], ["&f=chart&t=years", `document.querySelectorAll("#chart .bar").length === 20 && !!document.querySelector("#signs svg")`]]) {
      await send("Page.navigate", { url: SITE + `#l=${l}${q}&about` });
      await until(`document.documentElement.lang === "${l}" && document.getElementById("about").open && ${ready}`, `${l} ${q}`);
      const [mx, my] = await js(`(() => { const r = document.getElementById("map").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await js(`document.getElementById("about").close()`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + 1, y: my + 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
      await sleep(250);
      const seen = await js(`document.body.innerText + " " + document.getElementById("about").textContent + " " + [...document.querySelectorAll("[title], [aria-label]")].map(e => (e.title || "") + " " + (e.getAttribute("aria-label") || "")).join(" ")`);
      assert.doesNotMatch(seen, /flagged|\bflag\b|marcad/i, `no "flagged" or "marcado" in ${l} at ${q || "the default screen"}`);
      assert.doesNotMatch(seen, /—/, "no em dashes");
      assert.doesNotMatch(seen, /Amazônia Legal|Legal Amazon/, "the Amazon by its name");
      assert.equal((await js(`document.getElementById("about").textContent`)).match(/\b5% (of forest|de floresta)/g).length, 2, "About: the yardstick once, and the 5% of the other hazards' maps once");
      assert.doesNotMatch(await js(`document.getElementById("app").innerText`), /5% (of forest|de floresta)|top 5%/i, "and no 5% cut on the screen itself");
      assert.match(await js(`document.getElementById("about").textContent`), l === "en" ? /depends on a drought that has not happened yet/ : /depende de uma seca que ainda não aconteceu/, "About says why fire has no amount");
    }
  }
  // ---------- actions: the third scale of the clearing timeline. What measured enforcement accounts for, every
  // number from data/actions.json, and the limits of the claim on the screen itself.
  const acts = await fetch(`${SITE}data/actions.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  let actions = "";
  if (acts) {
    const LOC = { en: "en-US", pt: "pt-BR" }, n = (x, l) => x.toLocaleString(LOC[l], { maximumFractionDigits: 0 });
    const two = (x, l) => { const p = 10 ** (Math.floor(Math.log10(x)) - 1); return n(Math.round(x / p) * p, l); };  // two figures, as the site rounds an estimate
    const monthOf = (ym, l, add = 0) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1 + add, 1).toLocaleDateString(LOC[l], { month: "long", year: "numeric" }); };
    const part = (x, l) => { const i = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4].findIndex(f => Math.abs(x - f) < 0.03); return i < 0 ? n(100 * x, l) + "%" : { en: ["a quarter", "a third", "half", "two thirds", "three quarters"], pt: ["um quarto", "um terço", "metade", "dois terços", "três quartos"] }[l][i]; };
    const sem = acts.semesters, A = acts.actions, last = [A.start.length - 2, A.start.length - 1], [r0, r1] = acts.reference.split(" to "), ref = A.start.flatMap((s, i) => (s >= r0 && s <= r1 ? [i] : []));
    const tot = (v, ix) => ix.reduce((x, i) => x + v[i], 0), rate = ix => ix.reduce((x, i) => x + A.notices_per_100km2[i] * A.clearing_km2[i], 0) / tot(A.clearing_km2, ix);
    assert.equal(acts.summary.avoided, sem.reduce((x, r) => x + r.held - r.observed, 0), "the file's total is the sum of its semesters");
    assert.equal(ref.length, 2, "the reference year is two semesters of the actions series");
    const state = Object.keys(acts.states).sort((a, b) => acts.states[b].reduce((x, r) => x + r.observed, 0) - acts.states[a].reduce((x, r) => x + r.observed, 0))[0];  // the state with the most clearing
    for (const l of ["en", "pt"]) {
      const en = l === "en", since = monthOf(sem[0].start, l), share = acts.summary.fall_accounted_share;
      await send("Page.navigate", { url: SITE + `#l=${l}&f=chart` });
      await until(`document.documentElement.lang === "${l}" && !/t=actions/.test(location.hash) && !!document.querySelector('#scale button[data-k="actions"]') && !!document.querySelector("#chart .bar .plain") && !!document.querySelector("#chart .unit")`, `${l}: the actions tab beside years and months`);
      assert.equal(await js(`[...document.querySelectorAll("#scale button")].map(b => b.textContent).join()`), en ? "Years,Months,Actions" : "Anos,Meses,Ações");
      await clickOn('#scale button[data-k="actions"]');
      await until(`/t=actions/.test(location.hash) && !!document.querySelector("#chart svg.acts")`, `${l}: the actions view`);
      // the headline and its second line: the avoided clearing, and how much of the fall that is
      assert.equal(await text("#say"), en ? `Enforcement accounts for ${two(acts.summary.avoided, l)} km² of clearing avoided since ${since}` : `A fiscalização responde por ${two(acts.summary.avoided, l)} km² de desmate evitado desde ${since}`, `${l}: the headline is the file's avoided clearing`);
      assert.equal(await text("#sub"), en ? `About ${part(share, l)} of the fall since then. The rest fell everywhere at once.` : `Cerca de ${part(share, l)} da queda desde então. O resto caiu em toda parte ao mesmo tempo.`);
      assert.equal(await text("#level"), en ? `EnforcementIBAMA notices and embargoes, ${n(acts.municipalities, l)} municipalities` : `Fiscalizaçãoautos e embargos do IBAMA, ${n(acts.municipalities, l)} municípios`, `${l}: the band says what is measured, and where`);
      // good news is never red: no level, and the gap is the forest's green
      assert.equal(await level(), "r");
      await redFollows(0);
      assert.deepEqual([await style("#chart .s1", "fill"), await style("#chart .acts .held", "stroke")], [GREEN, GREEN], "avoided clearing is forest green");
      // the chart: per semester what was measured and what the model implies with enforcement held, with its interval, and the reference year as a rule
      assert.equal(await text("#chart .unit"), en ? "km² cleared per six months" : "km² desmatados por semestre");
      assert.deepEqual([await count("#chart .observed"), await count("#chart .held"), await count("#chart .bar .rng"), await count("#chart .refrule")], [sem.length, sem.length, sem.length, 1], `${l}: observed and held marks for every semester, an interval on each, one reference rule`);
      assert.equal(await count('#chart .bar rect[fill="url(#spared)"]'), sem.filter(r => r.held > r.observed).length, "the gap is drawn where the model implies more clearing");
      assert.equal(await text("#chart .key"), en ? "measuredmore, with enforcement as in 2021 to 2022" : "medidoa mais, com a fiscalização de 2021 a 2022", "the two marks are named on the chart");
      assert.equal(await text("#chart .note.ref"), en ? `average of ${monthOf(r0, l)} to ${monthOf(r1, l)}` : `média de ${monthOf(r0, l)} a ${monthOf(r1, l)}`);
      // the bars sit where the file says: the tallest observed bar against the shortest, in pixels
      const hs = await js(`[...document.querySelectorAll("#chart .observed")].map(e => +e.getAttribute("height"))`), obs = sem.map(r => r.observed);
      assert.ok(Math.abs(Math.max(...hs) / Math.min(...hs) - Math.max(...obs) / Math.min(...obs)) < 0.01, "bar heights are in proportion to the file");
      // the limits of the claim, without a click
      const hint = await text("#hint");
      assert.match(hint, en ? /^A floor and an association, not proof of cause/ : /^É um piso e uma associação, não prova de causa/, `${l}: the honesty line`);
      assert.ok(hint.includes(en ? `The rest, ${part(1 - share, l)} of the fall, is not attributed to anything.` : `O restante, ${part(1 - share, l)} da queda, não é atribuído a nada.`), `${l}: the part of the fall that is not attributed`);
      assert.equal(await js(`getComputedStyle(document.getElementById("hint")).display !== "none" && document.getElementById("hint").getBoundingClientRect().height > 10`), true, "and it is on the screen");
      // the actions themselves, in the signals' place: the last year against the reference year
      assert.equal(await js(`[...document.querySelectorAll("#signs.acts > div")].map(d => d.dataset.k + "=" + d.querySelector("b").textContent + "|" + d.querySelector("b + span").textContent).join(";")`),
        [`notices=${n(rate(last), l)}|${en ? "against" : "contra"} ${n(rate(ref), l)}`, ...["remote", "field", "collective"].map(k => `${k}=${n(tot(A[k + "_km2"], last), l)} km²|${en ? "against" : "contra"} ${n(tot(A[k + "_km2"], ref), l)}`)].join(";"), `${l}: four actions, each with its last year and the reference year`);
      assert.equal(await count("#signs.acts svg path.end"), 4, "the same small traces as the signals");
      assert.equal(await text("#signs > p"), en ? `IBAMA actions, year to ${monthOf(A.start.at(-1), l, 5)} against year to ${monthOf(r1, l)}` : `Ações do IBAMA, ano até ${monthOf(A.start.at(-1), l, 5)} contra o ano até ${monthOf(r1, l)}`);
      assert.equal(await count("#signs .up, #chart .fc, #chart .h1"), 0, "nothing red in the view");
      const seen = await js(`document.getElementById("app").innerText`);
      assert.doesNotMatch(seen, /—|Amazônia Legal|Legal Amazon/, "no em dashes, and the Amazon by its name");
      if (en) actions = await text("#level") + " | " + await text("#say") + " " + await text("#sub") + "\n" + hint;
      // as a line, the same marks
      await clickOn('#shape button[data-k="line"]');
      await until(`!!document.querySelector("#chart .acts .line .obs") && !document.querySelector("#chart .acts rect.observed")`, `${l}: the actions view as a line`);
      assert.deepEqual([await count("#chart .observed"), await count("#chart .held"), await count("#chart .bar .rng"), await style("#chart .acts .fcl", "stroke")], [sem.length, sem.length, sem.length, GREEN]);
      await clickOn('#shape button[data-k="bars"]');
      await until(`!!document.querySelector("#chart .acts rect.observed")`, "bars again");
      // a state has its own two series and no interval
      const rows = acts.states[state], gap = rows.reduce((x, r) => x + r.held - r.observed, 0);
      await send("Page.navigate", { url: SITE + `#l=${l}&t=actions&s=uf&r=${state}&f=chart` });
      await until(`document.documentElement.lang === "${l}" && !document.getElementById("scope").hidden && /${en ? "here" : "aqui"}/.test(document.getElementById("say").textContent) && !!document.querySelector("#chart svg.acts")`, `${l}: the actions of ${state}`);
      assert.equal(await text("#say"), en ? `Enforcement accounts for ${two(gap, l)} km² of clearing avoided here since ${since}` : `A fiscalização responde por ${two(gap, l)} km² de desmate evitado aqui desde ${since}`, `${l}: the state's own gap`);
      assert.match(await text("#sub"), en ? /^\d+% on top of what was cleared here\. No range for a single state\.$/ : /^\d+% a mais do que foi desmatado aqui\. Sem faixa para um estado sozinho\.$/);
      assert.deepEqual([await count("#chart .observed"), await count("#chart .held"), await count("#chart .bar .rng"), await count("#chart .refrule")], [rows.length, rows.length, 0, 0], "the state's marks, with no interval and no reference rule");
      assert.match(await text("#hint"), en ? /A floor and an association.*is not attributed to anything\.$/ : /É um piso e uma associação.*a parte da queda que não é atribuída a nada chega a .+\.$/);
      // About says how it is computed and where the method is
      await clickOn("#about-btn");
      await until(`document.getElementById("about").open`, "About");
      const about = await js(`document.getElementById("about").textContent`);
      assert.match(about, en ? /is a floor and an association/ : /é um piso e uma associação/);
      assert.ok(about.includes(n(acts.summary.avoided, l) + " km²") && about.includes(n(acts.municipalities, l)), "About quotes the file");
      assert.deepEqual(await js(`[...document.querySelectorAll("#about a")].map(a => a.getAttribute("href")).filter(h => h.includes("/docs/"))`), [story.links.policy, story.links.inputs, story.links.results], "and points to the method, the inputs and the notes in the repository");
      assert.doesNotMatch(about, /—|Amazônia Legal/);
      await js(`document.getElementById("about").close()`);
    }
    // a municipality has no figure of its own: the Amazon's is shown, and named
    await send("Page.navigate", { url: SITE + "#l=en&t=actions&r=1500602&f=chart" });
    await until(`document.querySelector("#scope span")?.textContent === "Amazon" && !!document.querySelector("#chart svg.acts")`, "the actions view with a municipality selected");
    assert.equal(await text("#scope span"), "Amazon");
    assert.equal(await text("#say"), `Enforcement accounts for ${two(acts.summary.avoided, "en")} km² of clearing avoided since ${monthOf(sem[0].start, "en")}`);
    assert.match(await text("#hint"), /Only states have a figure of their own\.$/);
    assert.equal(await count("#chart .bar .rng"), sem.length);
    // the view belongs to clearing: another hazard has no such tab, and a link that asks for it gets the years
    await send("Page.navigate", { url: SITE + "#l=en&k=scar12&t=actions&f=chart" });
    await until(head("/burned in the last twelve months/") + ` && !/t=actions/.test(location.hash)`, "fire, which has no actions view");
    assert.equal(await js(`[...document.querySelectorAll("#scale button")].map(b => b.textContent).join()`), "Years,Months");
  }

  // ---------- the API panel: the instructions for agents as the file has them, and one line above them
  const llms = await fetch(`${SITE}api/v1/llms.txt`).then(r => (r.ok ? r.text() : null)).catch(() => null);
  assert.ok(llms, "api/v1/llms.txt is served");
  for (const l of ["en", "pt"]) {
    await send("Page.navigate", { url: SITE + `#l=${l}&k=clear3` });
    await until(`document.documentElement.lang === "${l}" && document.documentElement.dataset.hazard === "clear" && document.documentElement.dataset.scale === "months" && !!document.querySelector("#chart .bar")`, `${l}: the page before the API panel`);
    assert.equal(await js(`[...document.querySelectorAll("#top nav button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), l === "en" ? "Story,About,API,PT" : "História,Sobre,API,EN", `${l}: API sits next to About in the header`);
    assert.equal(await js(`document.getElementById("api").open || !!document.getElementById("api-text").textContent`), false, "closed, and nothing fetched, until asked");
    await clickOn("#api-btn");
    await until(`document.getElementById("api").open && /How to connect/.test(document.getElementById("api-text").textContent)`, `${l}: the API panel`);
    const shown = await text("#api-text");
    assert.ok(shown.includes("How to connect") && shown.includes("municipality/"), "the instructions say how to connect and list the endpoints");
    assert.equal(shown, llms, "the file, character for character");
    assert.equal(await js(`document.getElementById("api-text").children.length`), 0, "plain text, not rendered");
    assert.equal(await style("#api-text", "whiteSpace"), "pre-wrap");
    assert.match(await style("#api-text", "fontFamily"), /monospace/);
    assert.equal(await js(`document.getElementById("api").innerText.replace(document.getElementById("api-text").innerText, "").trim().split(/\\s+/).join(" ")`), l === "en" ? "CLOSE https://prenuncio.com/api/v1 COPY" : "FECHAR https://prenuncio.com/api/v1 COPIAR", `${l}: one line above the block, and no other copy`);
    assert.equal((await fetch(await js(`document.getElementById("api-base").href`))).ok, true, "the base address links to index.json, and it is there");
    assert.match(await js(`document.getElementById("api-base").href`), /\/api\/v1\/index\.json$/);
    assert.equal(await js(`document.documentElement.scrollWidth <= innerWidth && document.getElementById("api-text").scrollWidth <= document.getElementById("api-text").clientWidth`), true, "nothing scrolls sideways");
    await clickOn("#api-close");
    await until(`!document.getElementById("api").open`, "the panel closed");
  }
  await send("Page.navigate", { url: SITE + "#l=en&api" });
  await until(`document.getElementById("api")?.open && /municipality\\//.test(document.getElementById("api-text").textContent)`, "the API panel from a link");
  assert.equal(await js(`document.querySelector('link[rel="alternate"][type="text/plain"]').getAttribute("href")`), "/llms.txt", "the page points agents to the instructions");
  assert.equal(await fetch(`${SITE}llms.txt`).then(r => r.text()), llms, "and /llms.txt is the same text");

  // ---------- About: a panel beside the map. The thesis first, then the model (one model, by its name), the open
  // board as a bare table with the way in as a button, how it is checked, how to take part, and its limits.
  // Every number is the data's.
  for (const l of ["en", "pt"]) {
    const en = l === "en", LOC = { en: "en-US", pt: "pt-BR" }[l], n = (x, d = 0) => x.toLocaleString(LOC, { maximumFractionDigits: d, minimumFractionDigits: d }), pc = x => n(100 * x), b = story.benchmark, rows = story.leaderboard.rows, name = rows.find(r => r.kind === "model").model;
    const A = sel => js(`[...document.querySelectorAll(${JSON.stringify("#about-body " + sel)})].map(e => e.textContent.trim())`);
    await send("Page.navigate", { url: SITE + `#l=${l}&about` });
    await until(`document.documentElement.lang === "${l}" && document.getElementById("about").open && !!document.querySelector("#about .thesis") && !!document.querySelector("#about .board")`, `${l}: About`);
    assert.equal(await js(`document.querySelector("#about-body h2").nextElementSibling.className`), "thesis", `${l}: About opens with the thesis`);
    assert.deepEqual(await A(".thesis p"), en
      ? ["Every forest cell of the Amazon has a chance of being cleared next year.", "That chance can be estimated from what satellites and public records already show, checked against what happened, and improved in the open.", "The point is to tell IBAMA, and anyone making policy, where to act first."]
      : ["Cada célula de floresta da Amazônia tem uma chance de ser desmatada no ano que vem.", "Essa chance pode ser estimada com o que os satélites e os registros públicos já mostram, conferida com o que aconteceu e melhorada em aberto.", "O objetivo é dizer ao IBAMA, e a quem faz política pública, por onde agir primeiro."]);
    assert.deepEqual(await A("h3"), en ? ["The model", "The open board", "How it is checked", "How to take part", "What it cannot do", "Reading the screen", "Data"] : ["O modelo", "O placar aberto", "Como é conferido", "Como participar", "O que ele não faz", "Como ler a tela", "Dados"], `${l}: the model, the board, the check, how to take part, then the limits`);
    const body = await js(`document.getElementById("about-body").textContent.replace(/\\s+/g, " ")`), has = (x, what) => assert.ok(body.includes(x), `${l}: About says ${what}: ${x}`);
    // it is a panel beside the map, not a window over the page: the map is still there, and the panel has its way out
    const pr = await js(`(() => { const r = document.getElementById("about").getBoundingClientRect(); return [r.left / innerWidth, r.right / innerWidth, getComputedStyle(document.getElementById("about")).borderTopWidth, document.getElementById("about").matches(":modal")]; })()`);
    assert.ok(pr[0] > 0.5 && pr[1] > 0.99 && pr[2] === "0px" && pr[3] === false, `${l}: About is a panel on the right of the map, with no frame: ${pr}`);
    assert.equal(await js(`!!document.getElementById("about-close").offsetParent && document.getElementById("about-close").getAttribute("aria-label")`), en ? "Close" : "Fechar");
    // one model, by its name; an ensemble inside, said once; never two
    has(en ? `${name} is ${story.model.what}.` : `${name} é um modelo só, um conjunto de árvores de decisão e uma rede convolucional.`, "it is one model, an ensemble inside");
    assert.match(story.model.what, /^one model/, "the data says one model");
    assert.doesNotMatch(body, /two models|dois modelos|Two models|Dois modelos/, `${l}: never two models`);
    has(en ? "Nine public sources go in" : "Entram nove fontes públicas", "how many sources");
    has(en ? `Trained on what happened from ${story.model.trained_on.first_outcome_year} to ${story.model.trained_on.last_outcome_year}. The model that forecasts a year has never seen that year or any later one.` : `Treinado com o que aconteceu de ${story.model.trained_on.first_outcome_year} a ${story.model.trained_on.last_outcome_year}. O modelo que prevê um ano nunca viu esse ano nem nenhum depois dele.`, "the rule");
    // its figure: the sources as a stack of planes, each named, the model under them, the chance at the foot
    await until(`!!document.querySelector("#model-fig canvas") && document.querySelectorAll("#model-fig li").length === ${story.model.inputs.length + 2} && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}"`, `${l}: the figure of the model, and the chances it ends on`);
    await sleep(600);
    assert.deepEqual(await js(`[...document.querySelectorAll("#model-fig li:not(.m):not(.o)")].map(e => e.querySelector("span").textContent + (e.querySelector("small") ? " (" + e.querySelector("small").textContent + ")" : ""))`), story.model.inputs.map(x => x[l]), `${l}: a plane a source, each by its name`);
    assert.deepEqual(await js(`[document.querySelector("#model-fig li.m").textContent, document.querySelector("#model-fig li.o").textContent]`), [name, en ? "the chance, for every cell" : "a chance, para cada célula"]);
    const figBox = await js(`(() => { const f = document.getElementById("model-fig").getBoundingClientRect(), a = document.getElementById("about").getBoundingClientRect(), c = document.querySelector("#model-fig canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, tops = [...document.querySelectorAll("#model-fig li:not(.m):not(.o)")].map(e => e.getBoundingClientRect().top); let ink = 0, red = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 40) { ink++; if (d[i] > 150 && d[i + 1] < 90) red++; } return { fits: [...document.querySelectorAll("#model-fig li")].every(e => { const r = e.getBoundingClientRect(); return r.left >= a.left && r.right <= a.right; }), down: tops.every((y, i) => !i || y > tops[i - 1] + 20), ink, red, h: f.height }; })()`);
    assert.ok(figBox.fits && figBox.down && figBox.ink > 5000 && figBox.red > 200 && figBox.h > 400, `${l}: the names fit the panel and go down the stack, the planes are drawn and the last one is red: ${JSON.stringify(figBox)}`);
    // the open board: a bare table, a model a row with its link, then the way in as a button
    assert.deepEqual(await js(`[...document.querySelectorAll("#about .board tbody tr")].map(tr => [tr.cells[0].textContent, tr.querySelector("a").getAttribute("href"), tr.cells[2].textContent, tr.cells[3].textContent])`), rows.map(r => [String(r.rank), r.url, n(100 * r.cap5, 1) + "%", n(100 * r.unseen_2026, 1) + "%"]), `${l}: the board is the file's, a model a row, to one decimal in the language's own figures`);
    assert.equal(await js(`document.querySelector("#about .board tbody tr a").textContent`), name);
    assert.deepEqual(await js(`[...document.querySelectorAll("#about .board tbody tr.ref")].map(tr => tr.cells[4].textContent)`), rows.filter(r => r.kind === "reference").map(() => (en ? "no model" : "sem modelo")), `${l}: the row that is not a model says so`);
    assert.deepEqual(await js(`[...document.querySelectorAll("#about .board th")].map(e => e.textContent)`), en ? ["", "model", "score", String(story.model.trained_on.last_outcome_year), "by", "date"] : ["", "modelo", "nota", String(story.model.trained_on.last_outcome_year), "de", "data"]);
    assert.deepEqual(await js(`(() => { const t = document.querySelector("#about .board"), s = [t, ...t.querySelectorAll("tr, td, th")].map(e => getComputedStyle(e)); return [s.every(x => parseFloat(x.borderTopWidth) === 0 && parseFloat(x.borderBottomWidth) === 0 && parseFloat(x.borderLeftWidth) === 0), new Set(s.slice(1).map(x => x.backgroundColor)).size]; })()`), [true, 1], `${l}: a bare table: no rules, no stripes`);
    assert.deepEqual(await js(`[document.querySelector("#about .go .btn").textContent, document.querySelector("#about .go .btn").getAttribute("href"), document.querySelector("#about .go a:not(.btn)").getAttribute("href")]`), [en ? "Submit a model" : "Enviar um modelo", story.links.benchmark, story.links.repository], `${l}: the way in is a button, the repository a link`);
    // how it is checked
    has(en ? `For ${story.check.year} it expected ${n(story.check.expected_cells)} cells to lose a hectare. ${n(story.check.actual_cells)} did.` : `Para ${story.check.year}, esperava ${n(story.check.expected_cells)} células perdendo um hectare. Foram ${n(story.check.actual_cells)}.`, "the chances, checked");
    const y0 = Object.keys(story.priority.replay)[0];
    has(en ? `In ${y0}, ${pc(story.priority.replay[y0].lost_10ha)}% of the ${story.priority.blocks} blocks ranked highest lost 10 hectares or more. Of all forest blocks, ${n(100 * story.priority.replay[y0].base_10ha, 1)}%.` : `Em ${y0}, ${pc(story.priority.replay[y0].lost_10ha)}% dos ${story.priority.blocks} blocos no topo perderam 10 hectares ou mais. De todos os blocos de floresta, ${n(100 * story.priority.replay[y0].base_10ha, 1)}%.`, "how the priority list did");
    // short lines: the detail is in the repository
    const check = await js(`(() => { const out = []; for (let e = document.getElementById("about-check").nextElementSibling; e && e.tagName !== "H3"; e = e.nextElementSibling) out.push(...[...e.querySelectorAll("li")].map(li => li.textContent.trim().length)); return out; })()`);
    assert.ok(check.length <= 6 && Math.max(...check) < 260 && check.reduce((a, c) => a + c, 0) < 900, `${l}: how it is checked is a few short lines: ${check}`);
    // how to take part
    has(en ? `what the ${n(b.models_tried)} versions tried did` : `o que fizeram as ${n(b.models_tried)} versões tentadas`, "the versions tried");
    has(en ? `${n(b.inputs_tested)} were tested.` : `${n(b.inputs_tested)} foram testadas.`, "the inputs tested");
    has(en ? "Agents are welcome" : "Agentes são bem-vindos", "agents are welcome");
    assert.deepEqual([...new Set(await js(`[...document.querySelectorAll("#about a")].map(a => a.getAttribute("href"))`))].sort(), [...new Set([...["policy", "repository", "leaderboard", "results", "inputs", "benchmark", "api"].map(k => story.links[k]), ...rows.map(r => r.url)])].sort(), `${l}: the links are the repository's documents and the models, from the data`);
    assert.equal(await count("#about [class*=card], #about [class*=grid]"), 0, "no cards");
    assert.doesNotMatch(body, /—|flagged|marcad|Amazônia Legal|Legal Amazon/);
    // its way out closes it, and so does Escape
    await clickOn("#about-close");
    await until(`!document.getElementById("about").open`, "About closed by its X");
    await clickOn("#about-btn");
    await until(`document.getElementById("about").open`, "About again");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await until(`!document.getElementById("about").open`, "About closed by Escape");
  }

  // ---------- a phone, 390 by 844, in Portuguese. The map is the screen; the story's caption is at the bottom, at
  // the thumb; the bulletin is a sheet that is pulled up and pushed back; the list is a sheet with its way out;
  // the header is the mark and one menu.
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: SITE + "?story=1#l=pt" });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA" && document.documentElement.lang === "pt" && innerWidth === 390 && !!document.querySelector("canvas.base")`, "the story on a phone");
  const tall = `(e => e.getBoundingClientRect().height)`, fits = async what => assert.equal(await js(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#story, #story-line, #mappanel, #list, #chartbox, #top")].filter(e => e.offsetParent).every(e => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5; })`), true, "nothing is wider than the screen at " + what);
  assert.deepEqual(await place("mapbox"), [0, 0, 390, 844], "the map is the screen");
  const cap = await js(`(() => { const s = document.getElementById("story").getBoundingClientRect(), b = document.getElementById("story-next").getBoundingClientRect(), k = document.getElementById("skip-btn").getBoundingClientRect(); return [s.top / innerHeight, s.bottom / innerHeight, b.width, b.height, b.bottom / innerHeight, k.height, k.top]; })()`);
  assert.ok(cap[0] > 0.82 && cap[1] > 0.99 && cap[2] >= 120 && cap[3] >= 44 && cap[4] > 0.9 && cap[5] >= 44 && cap[6] < 10, "the caption is at the bottom and no taller than its one line needs, the way on is large at the thumb, and Skip is in the header: " + cap);
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "EN,Pular");
  const whereP = await amazon(), ptSaid = [];
  assert.ok(whereP[0] >= 0 && whereP[0] + whereP[2] <= 390 && whereP[1] + whereP[3] < cap[0] * 844, "the Amazon is whole on the screen, above the caption: " + whereP);
  for (let i = 0; i < IDS.length; i++) {
    if (i) { await clickOn("#story-next"); await until(`document.documentElement.dataset.step === "${IDS[i]}"`, "phone, step " + IDS[i]); }
    ptSaid.push(await line(), await note());
    await fits(IDS[i]);
    assert.deepEqual(await amazon(), whereP, "the Amazon has not moved at " + IDS[i]);
    assert.equal(await js(`(() => { const s = document.getElementById("story").getBoundingClientRect(), n = document.getElementById("story-next").getBoundingClientRect(), t = document.getElementById("story-text").getBoundingClientRect(); return t.bottom <= n.top + 1 && Math.round(s.bottom) === innerHeight && Math.round(n.bottom) >= innerHeight - 16 && t.top >= s.top; })()`), true, "the caption holds its line above the way on, which stays at the foot of the screen, at " + IDS[i]);
    if (IDS[i] === "omenB") {  // the list: a sheet over the lower part, above the caption, with its way out
      await until(`!!document.querySelector("#list-rows .why") && !!document.getElementById("list").offsetParent`, "the list's sheet");
      await sleep(450);
      const ls = await js(`(() => { const l = document.getElementById("list").getBoundingClientRect(), s = document.getElementById("story").getBoundingClientRect(), x = document.getElementById("list-close").getBoundingClientRect(), w = document.querySelector("#list-rows .why").getBoundingClientRect(); return [l.top / innerHeight, Math.round(l.bottom - s.top), l.width, x.width, x.height, w.top < s.top]; })()`);
      assert.ok(ls[0] > 0.4 && Math.abs(ls[1]) <= 1 && ls[2] === 390 && ls[3] >= 44 && ls[4] >= 44 && ls[5], "the list is a sheet standing on the caption, with an X of 44 px and its first place's reason showing: " + ls);
    }
    if (IDS[i] === "modelA" || IDS[i] === "modelB") { await until(`document.getElementById("about").open`, "About, on a phone"); await sleep(500); }
    if (IDS[i] === "modelB") assert.equal(await js(`(() => { const r = document.getElementById("about").getBoundingClientRect(), t = document.querySelector("#about .board").getBoundingClientRect(); return r.width === innerWidth && t.right <= innerWidth && document.getElementById("about").scrollWidth <= innerWidth; })()`), true, "the board fits the screen");
    if (IDS[i] === "modelA" || IDS[i] === "modelB") {  // the panel stands between the header and the caption: the line, the way on and Skip stay in reach
      const ab = await js(`(() => { const a = document.getElementById("about").getBoundingClientRect(), s = document.getElementById("story").getBoundingClientRect(), n = document.getElementById("story-next").getBoundingClientRect(), k = document.getElementById("skip-btn").getBoundingClientRect(), x = document.getElementById("about-close").getBoundingClientRect(), on = (r, id) => !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("#" + id); return [Math.round(a.bottom - s.top), a.top >= k.bottom - 1, on(n, "story-next"), on(k, "skip-btn"), on(x, "about-close"), x.width >= 44 && x.height >= 44]; })()`);
      assert.deepEqual(ab, [0, true, true, true, true, true], "About on a phone, in the story: on the caption, under the header, with Next, Skip and its X in reach: " + ab);
    }
    if (IDS[i] === "ahead") {  // the bulletin: a sheet showing its top, with the list a bar on it
      await until(`document.querySelectorAll("#chart .bar").length === 36 && document.getElementById("list").dataset.at === "bar"`, "the bulletin's sheet, under the list's bar");
      await sleep(450);
      const st = await js(`(() => { const c = document.getElementById("chartbox").getBoundingClientRect(), l = document.getElementById("list").getBoundingClientRect(), s = document.getElementById("story").getBoundingClientRect(); return [Math.round(c.bottom - s.top), Math.round(l.bottom - c.top), c.height, l.height, c.width]; })()`);
      assert.ok(Math.abs(st[0]) <= 1 && Math.abs(st[1]) <= 1 && st[2] > 150 && st[2] < 260 && st[3] >= 44 && st[3] < 70 && st[4] === 390, "the caption, on it the bulletin's top, on that the list's bar: " + st);
    }
  }
  assert.equal(ptSaid[0], "Isto é a Amazônia.");
  assert.doesNotMatch(ptSaid.join(" "), /marcad|—|Amazônia Legal|caixa-preta|[Dd]ois modelos|posto à prova|Por onde começar|Fiscalização|[Mm]ês a mês/, "the story's words in Portuguese");
  assert.ok(ptSaid.every((x, i) => i % 2 || (x.length > 8 && x.length <= 70)), "every line is short in Portuguese too: " + Math.max(...ptSaid.filter((x, i) => !(i % 2)).map(x => x.length)));
  assert.equal(await text("#story-next"), "Pronto");
  await clickOn("#story-next");
  await until(`!(${onStory}) && /m=prio&b=1/.test(location.hash)`, "the tool on a phone, after the story");
  await sleep(600);
  assert.deepEqual(await amazon(), whereP, "and the Amazon is where it was");
  // the tool. The header is the mark and one menu.
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.id).join()`), "menu-btn", "the header: the mark and one menu");
  await clickOn("#menu-btn");
  await until(`"menu" in document.documentElement.dataset && !!document.getElementById("about-btn").offsetParent`, "the menu");
  assert.deepEqual(await js(`[...document.querySelectorAll("#nav button")].map(b => [b.textContent, b.getBoundingClientRect().height >= 44, b.getBoundingClientRect().right <= innerWidth])`), [["História", true, true], ["Sobre", true, true], ["API", true, true], ["EN", true, true]], "the menu holds the story, About, the API and the language");
  await clickOn("#lang-btn");
  await until(`document.documentElement.lang === "en" && !("menu" in document.documentElement.dataset)`, "English, and the menu closed");
  // the two sheets: the list a bar standing on the bulletin's top; nothing wider than the screen; what is tapped is 44 px
  await fits("the tool");
  const sheets = () => js(`["list", "chartbox"].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; })`);
  let [ls, cs] = await sheets();
  assert.ok(cs[1] === 844 && cs[1] - cs[0] > 150 && cs[1] - cs[0] < 260 && ls[1] === cs[0] && ls[1] - ls[0] < 70, "the bulletin shows its top at the bottom of the screen, and the list is a bar on it: " + JSON.stringify([ls, cs]));
  assert.equal(await js(`[...document.querySelectorAll("#modes button, #hazard button, #menu-btn, #list-close, #list-grab, #sheet-grab")].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 40 || e.id === "sheet-grab")`), true, "what is tapped is tall enough");
  // the list's bar: a tap opens it over the lower half, a pull up makes it whole, a pull down a bar again, the X closes it onto the cells
  const pull = async (sel, dy) => { const [x, y] = await js(`(() => { const r = document.querySelector("${sel}").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); for (let k = 1; k <= 6; k++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y + dy * k / 6, button: "left" }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y + dy, button: "left", clickCount: 1 }); await sleep(500); };
  await clickOn("#list-grab");
  await until(`document.getElementById("list").dataset.at === "half"`, "the list opened by a tap on its bar");
  await sleep(450);
  [ls] = await sheets();
  assert.ok(ls[0] > 0.4 * 844 && ls[0] < 0.7 * 844 && ls[1] === 844, "over the lower half: " + ls);
  await pull("#list-grab", -300);
  await until(`document.getElementById("list").dataset.at === "full"`, "the list pulled up");
  await sleep(450);
  [ls] = await sheets();
  assert.ok(ls[0] < 60 && ls[1] === 844, "whole, under the header: " + ls);
  await pull("#list-grab", 300);
  await until(`document.getElementById("list").dataset.at === "half"`, "pushed back to the half");
  await pull("#list-grab", 300);
  await until(`document.getElementById("list").dataset.at === "bar"`, "and to a bar");
  await clickOn("#list-close");
  await until(`document.getElementById("list").hidden && /m=cells/.test(location.hash)`, "the list closed by its X, the map on its cells");
  // the bulletin: its top is tapped or pulled up to the header, where it is whole, and pushed back
  assert.ok(await paintedPx() > 1000, "the map is painted under it all");
  await pull("#sheet-grab", -400);
  await until(settled("chart"), "the bulletin pulled up");
  await sleep(450);
  [, cs] = await sheets();
  assert.ok(cs[0] <= 50 && cs[1] === 844, "whole, under the header: " + cs);
  assert.equal(await js(`["scale", "ahead", "signs", "chart-front"].every(id => document.getElementById(id).offsetParent) && document.getElementById("chart-front").getBoundingClientRect().height >= 44 && document.documentElement.scrollWidth <= innerWidth`), true, "with its tabs, its window buttons, the signals and its way out");
  assert.deepEqual(await place("mapbox"), [0, 0, 390, 844], "the map is still the screen, under the sheet");
  await pull("#sheet-grab", 400);
  await until(settled("map"), "pushed back");
  await clickOn("#say");
  await until(settled("chart"), "up again by a tap on its top");
  await clickOn("#chart-front");
  await until(settled("map"), "and down by its X");
  await sleep(450);
  [, cs] = await sheets();
  assert.ok(cs[1] === 844 && cs[1] - cs[0] < 260, "showing its top again: " + cs);
  // priorities on a phone: the mode opens the list's sheet, and a row brings its place into view above it
  await clickOn('#modes button[data-k="prio"]');
  await until(`!!document.getElementById("list").offsetParent && document.getElementById("list").dataset.at === "half" && document.querySelectorAll("#list-rows li").length > 100`, "the list's sheet, from the mode");
  await sleep(500);
  await clickOn('#list-rows li:nth-child(2) button');
  await until(`/b=2/.test(location.hash) && !!document.querySelector("#list-rows .why")`, "a place chosen on a phone");
  await send("Emulation.setDeviceMetricsOverride", DESK);

  assert.deepEqual(errors, [], "no script errors");
  console.log(`ok, ${words} words on the default screen, ${storyWords} on the story's first, first line after ${firstLine} ms\n${fc}\n${past}\n${months}\n${fire}\n${cell}\n${calm}\n${actions}`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}
