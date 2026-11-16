// Drives the site in headless Chrome with real mouse events: selects a sector, replays a year, switches to
// months, to another hazard, to cells and to the priority list, and checks the headline each time. It recounts
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
  const until = async (expr, what) => { for (let i = 0; i < 450; i++) { if (await js(expr)) return; await sleep(200); } throw new Error("timed out waiting for " + what + "; headline is: " + await js(`document.getElementById("say")?.textContent`)); };
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
  await send("Page.navigate", { url: SITE + "#l=en" });
  // the default screen: the whole Amazon, the yearly clearing forecast, sectors by municipality
  await until(head("/^About [\\d,]+\\skm² of clearing expected by July 2027$/") + ` && !!document.querySelector("#legend .ramp") && !!document.querySelector("#signs svg")`, "the forecast headline, the map legend and the signals");
  assert.equal(await js(`document.getElementById("scope").hidden`), true, "the whole Amazon needs no label");
  assert.equal(await js(`!!document.getElementById("sure")`), false, "accuracy lives in About, not in the bulletin");
  assert.match(await text("#sub"), /^Likely between [\d,]+ and [\d,]+\.$/);
  assert.equal(+await level(), amazonLevel("clear"), "the clearing level for the Amazon is the one the data counts to");
  await redFollows(amazonLevel("clear"));
  assert.equal(await js(`document.querySelectorAll("#hazard button").length`), 1 + hazardLayers.length, "one control per hazard that has a forecast");
  assert.equal(await js(`document.querySelectorAll("#chart .bar").length`), 20, "nineteen years and the forecast");
  assert.equal(await text("#chart .unit"), "km² cleared per year, August to July", "the y axis says what it counts");
  assert.equal(await js(`!!document.getElementById("geo-input") || !!document.getElementById("draw-btn") || !!document.querySelector("footer")`), false, "no search, no draw, no footer");
  const words = await js(`document.body.innerText.split(/\\s+/).filter(w => /[A-Za-zÀ-ú]/.test(w)).length`);
  assert.ok(words <= 85, `the default screen stays scannable: ${words} words`);
  await until(`/v=/.test(location.hash) && !!document.querySelector(".leaflet-overlay-pane canvas")`, "the sectors on the map");
  await sleep(600);

  // a real click inside Altamira selects it
  await click(...await at(-6.5, -54.2));
  await until(`document.getElementById("scope").textContent.includes("Altamira")`, "the sector");
  await until(head("/^About [\\d,.]+\\skm² of clearing expected here by July 2027$/"), "the sector forecast");
  const fc = await text("#level") + " | " + await text("#say") + " " + await text("#sub");
  assert.match(await text("#sub"), /^\d+(st|nd|rd|th) of \d+ municipalities\. [\d.]+% of the Amazon total\.$/);
  assert.match(await hash(), /r=1500602/, "the sector is in the link");
  assert.equal(await js(`document.querySelectorAll(".leaflet-sel-pane path").length`), 2, "the sector is outlined");
  await redFollows(+await level());

  // years: clicking a bar replays that year, for the same sector. A past forecast has no level and no red.
  await clickOn('#chart .bar[data-i="15"] .hot');
  await until(head("/^In 2023, [\\d,.]+\\skm² were cleared here$/"), "the 2023 replay");
  const past = await text("#say") + " " + await text("#sub");
  assert.equal(await level(), "r");
  await redFollows(0);
  assert.match(await hash(), /y=2023/);

  // months: alerts month by month, and the window ahead chosen on the timeline itself
  await clickOn('#scale button[data-k="months"]');
  // months: what was cleared month by month, then the model's forecast for the months ahead (when monthly.json is there)
  await until(head("/km² (cleared here in the last three months|expected to be cleared here in the next 3 months)$/"), "the monthly view");
  const months = await text("#level") + " | " + await text("#say") + " " + await text("#sub");
  assert.equal(await js(`document.querySelectorAll("#chart .bar").length`), 36, "24 months back and 12 ahead");
  assert.equal(await text("#chart .unit"), "km² cleared per month");
  assert.doesNotMatch(await text("#chart"), /PRODES/, "no jargon on the monthly timeline");
  assert.doesNotMatch(await js(`document.getElementById("col").innerText`), /alerts?\b/i, "the quantity is km² cleared, never alerts");
  assert.equal(await js(`document.querySelectorAll("#chart .ghost, #chart .tick").length`), 0, "nothing from a year before on the timeline");
  assert.equal(await js(`document.querySelectorAll("#chart .bar .fc").length`), monthly ? 12 : 0, "the months ahead are the model's forecast");
  assert.match(await text("#hint"), /DETER/, "says once where monthly figures come from");
  assert.match(await hash(), /k=clear3/);
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

  // cells, with the sector still selected, and back to the clearing replay
  await clickOn('#modes button[data-k="cells"]');
  await until(`document.querySelector("canvas.cells").dataset.key === "scar12"`, "the painted 1 km cells");
  assert.equal(await js(`+document.querySelector("canvas.cells").dataset.cell >= ${meta.cell}`), true, "the other hazards are painted at 1 km or coarser");
  assert.match(await hash(), /m=cells/);
  assert.equal(await js(`document.getElementById("kinds").hidden`), true);
  await clickOn('#hazard button:nth-child(1)');
  await until(head("/^In 2023, /") + ` && /^Chance given to each cell for 2023under 0\\.1%0\\.1 to 1%1 to 5%5 to 20%over 20%clearing mapped$/.test(document.getElementById("legend").textContent)`, "the replay in cells, with the steps of chance in the legend");
  assert.ok((await text("#scope")).includes("Altamira"));
  // every forest cell is painted by its chance, for the window on screen and never as one huge canvas
  await until(`document.querySelector("canvas.cells").dataset.key === "2023" && !document.getElementById("share").hidden`, "the cells of 2023");
  const painted = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return [c.width, c.height, n, Math.max(...[...document.querySelectorAll(".leaflet-paint-pane canvas")].map(c => c.width * c.height))]; })()`);
  const [w, h, all, biggest] = await painted();
  assert.ok(w * h < 4e6 && biggest < 4e6 && all > 0, `the cells canvas is the size of the view (${w} x ${h}) and has cells on it (${all} px)`);
  assert.match(await text("#share"), /^[\d,]+ cells had clearing mapped$/, "the line above the legend counts cells");
  assert.doesNotMatch(await js(`document.getElementById("stage").innerText + document.getElementById("say").textContent`), /flagged|top 5%|5% of forest/i, "no flag and no 5% cut in the cells view");
  // the legend steps are the filter: choosing one leaves the cells at that chance or more
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
  assert.equal(await text("#say"), `In 2023, ${Math.round(meta.years[2023].actual_km2).toLocaleString("en-US")}\u00a0km² were cleared`, "a year whose chances were not checked says what was cleared");
  assert.equal(await text("#sub"), "", "and the benchmark's 5% yardstick stays in About");

  // fire for the whole Amazon, by month: the level the data counts to, the red that goes with it, and no forecast amount
  // (a link opened in the same tab changes only the fragment, and the app reloads itself on that. Do not send
  // Page.reload after it: a busy page may not have taken the new fragment yet, and the old link gets reloaded.)
  await send("Page.navigate", { url: SITE + "#l=en&k=scar12&t=months" });
  await until(head("/burned in the last three months/") + ` && document.getElementById("lead").dataset.l === "${amazonLevel("scar")}" && /^Where fire tends to occur/.test(document.getElementById("legend").textContent)`, "the fire level");
  await redFollows(amazonLevel("scar"));
  const fire = await text("#level") + " | " + await text("#say") + " " + await text("#sub");
  if (monthly) {  // the headline is what burned: the last three months against the same months a year before
    const h = monthly.hazards.scar.history, [ly, lm] = monthly.last_month.split("-").map(Number);
    const sum = from => [0, 1, 2].reduce((x, k) => { const d = new Date(ly, lm - 1 - from - k, 1); return x + (h[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] ?? 0); }, 0);
    assert.equal(await text("#say"), `${km(sum(0))}\u00a0km² burned in the last three months, ${km(sum(12))} a year before`);
  }
  const noFireForecast = async where => {
    assert.equal(await js(`document.querySelectorAll("#chart .fc, #chart .rng, #chart .win, #chart .winrule, #chart .now, #chart .fcl, #chart .band").length`), 0, "no forecast bars, range or window for fire, " + where);
    assert.doesNotMatch(await js(`document.getElementById("app").innerText`), /expected|forecast|about \d|missed|uncertain|next \d+ months|likely/i, "no forecast amount of fire anywhere, " + where);
  };
  assert.equal(await js(`document.querySelectorAll("#chart .bar").length`), 24, "24 months of fire scars, none ahead");
  assert.equal(await text("#chart .unit"), "km² burned per month");
  await noFireForecast("by month");
  await clickOn('#shape button[data-k="line"]');
  await until(`!!document.querySelector("#chart .line .obs")`, "fire as a line");
  await noFireForecast("as a line");
  await clickOn('#shape button[data-k="bars"]');
  await clickOn('#scale button[data-k="years"]');
  await until(head("/burned in the last twelve months/"), "fire by year for the Amazon");
  const burned = regions.amazon.L.scar12;
  assert.equal(await text("#say"), `${km(burned.at(-1))}\u00a0km² burned in the last twelve months, ${km(burned.at(-2))} in the twelve before`);
  assert.equal(await js(`document.querySelectorAll("#chart .bar").length`), regions.layers.scar12.windows.length, "one bar per twelve months of history, none for the months ahead");
  await noFireForecast("by year");

  // a cell says its own chance. The file is decoded here, a cell is picked from it, and the map must say the same.
  const fyear = meta.forecast.year, F = meta.years[fyear].flags500, pmap = F && await grey(`p${fyear}.png`);
  let cell = "";
  if (pmap) {
    assert.deepEqual([pmap.w, pmap.h], [F.cols, F.rows]);
    const at0 = (F.rows >> 1) * F.cols, i = pmap.px.findIndex((v, n) => n > at0 && v >= 90 && v < 200), row = Math.floor(i / F.cols), col = i % F.cols;
    const lat = meta.north - (row + 0.5) * F.cell, lng = meta.west + (col + 0.5) * F.cell, want = `${chance(pmap.px[i])} chance this cell loses a hectare by July ${fyear}`;
    await send("Page.navigate", { url: SITE + `#l=en&m=cells&v=${lat.toFixed(6)},${lng.toFixed(6)},11` });
    await until(`document.querySelector("canvas.cells")?.dataset.key === "${fyear}" && document.querySelector("canvas.cells").dataset.f === "1"`, "the chances of " + fyear + " at 500 m");
    assert.match(await text("#legend"), new RegExp(`^Chance each cell loses a hectare by July ${fyear}under 0\\.1%0\\.1 to 1%1 to 5%5 to 20%over 20%$`), "the legend states the event and the steps");
    assert.match(await text("#share"), /^[\d,]+ of [\d.]+ million forest cells expected to lose a hectare$/);
    const [mx, my] = await js(`(() => { const r = document.getElementById("map").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + 1, y: my + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the cell's tooltip");
    cell = await text(".leaflet-tooltip.cell");
    assert.equal(cell, want, "the hover text is the chance in the file for that cell");
    // the paint under the pointer is the step of that chance (over imagery the layer is see-through, so only the hue is checked)
    const stepOf = v => [0.001, 0.01, 0.05, 0.2].filter(c => (v / 255) ** 2 >= c).length, STEP = [null, [74, 140, 62], [178, 198, 62], [247, 158, 30], [228, 0, 43]];
    const rgb = await js(`(() => { const c = document.querySelector("canvas.cells"), r = c.getBoundingClientRect(); return [...c.getContext("2d").getImageData(Math.round(${mx} - r.x), Math.round(${my} - r.y), 1, 1).data]; })()`);
    assert.deepEqual(rgb, [...STEP[stepOf(pmap.px[i])], 255], "the cell is painted in the colour of its step: green, then warm, then red");
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
    const mixOf = await js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = { all: 0, red: 0, warm: 0 }; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { n.all++; if (d[i] === 228 && d[i + 1] === 0) n.red++; else if (d[i] > 200) n.warm++; } return n; })()`);
    assert.ok(mixOf.red > 0 && mixOf.red / mixOf.all < 0.02 && mixOf.warm / mixOf.all < 0.25, `red is on the map and rare among the painted pixels: ${JSON.stringify(mixOf)}`);
    const [fx, fy_] = await at(lat, lng);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fx + 1, y: fy_ + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fx, y: fy_ });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the block's tooltip");
    assert.match(await text(".leaflet-tooltip.cell"), new RegExp(`^Up to [\\d.]+% chance a cell here loses a hectare by July ${fyear}$`));
  }

  // the mode is a switch of its own, and the list of sector kinds shows only in Sectors
  await send("Page.navigate", { url: SITE + "#l=en&g=1" });
  await until(`document.querySelectorAll("#list-rows li").length > 10 && !document.getElementById("list").hidden`, "the sector ranking");
  assert.equal(await js(`document.getElementById("modes").className + "/" + document.getElementById("kinds").className + "/" + document.getElementById("modes").contains(document.getElementById("kinds"))`), "seg/pick/false");
  assert.equal(await js(`[...document.querySelectorAll("#modes button")].map(b => b.textContent).join()`), "Sectors,Cells,Priorities", "three modes in the switch, and nothing else in it");
  assert.equal(await js(`[...document.querySelectorAll("#kinds button")].map(b => b.textContent).join()`), "States,Municipalities,Indigenous lands,Conservation units");
  assert.notEqual(await style("#modes", "borderTopWidth"), "0px", "the switch is boxed, the kinds are plain words");
  assert.equal(await style("#kinds", "borderTopWidth"), "0px");
  assert.equal(await text("#list-rows li .nm"), `${byRisk[0].n}, ${byRisk[0].s}`, "the ranking starts with the municipality with the largest forecast");
  // the timeline as a line, by a small glyph and back
  await clickOn("#rank-btn");
  await until(`document.getElementById("list").hidden && !!document.querySelector("#chart .bar .plain")`, "the timeline back in place of the list");
  await clickOn('#shape button[data-k="line"]');
  await until(`!!document.querySelector("#chart .line .obs") && !document.querySelector("#chart .bar .plain") && /c=line/.test(location.hash)`, "the timeline as a line");
  assert.equal(await js(`!!document.querySelector("#chart .line .fcl")`), true, "the forecast is the dashed part of the line");
  assert.equal(await text("#shape"), "", "the toggle is two glyphs, no words");
  await clickOn('#shape button[data-k="bars"]');
  await until(`!!document.querySelector("#chart .bar .plain") && !/c=line/.test(location.hash)`, "bars again");
  // priorities: the ranked blocks, the line that says how the ranking did, the download, and a row that leads to the map
  const prio = await fetch(`${SITE}data/priority.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (prio) {
    await clickOn('#modes button[data-k="prio"]');
    await until(`document.querySelectorAll("#list-rows li").length === ${prio.blocks.length} && document.getElementById("kinds").hidden`, "the priority list");
    const y0 = Object.keys(prio.replay)[0], r0 = prio.replay[y0];
    assert.ok((await text("#list-say")).startsWith(`Of the ${prio.top} blocks of ${prio.block_km} km ranked highest, ${Math.round(100 * r0.lost_10ha)}% lost at least 10 hectares in ${y0}, against ${(100 * r0.base_10ha).toFixed(1)}% of all forest blocks.`), "the line above the list says how the ranking did");
    assert.equal((await fetch(await js(`document.querySelector("#list-say a").href`), { method: "HEAD" })).ok, true, "the CSV is there to download");
    assert.equal(await text("#list-rows li .nm"), `${prio.blocks[0].municipality}, ${prio.blocks[0].state}`);
    assert.equal(await js(`[...document.querySelectorAll("#list-rows li:first-child button > *")].map(e => e.textContent.trim()).join("|")`), `1|${prio.blocks[0].municipality}, ${prio.blocks[0].state}|${Math.round(prio.blocks[0].expected_cells)}|${Math.round(100 * prio.blocks[0].max_chance)}%`, "a row is its rank, the place, the cells expected and the highest chance");
    assert.equal(await js(`document.querySelectorAll("#list-rows .land").length`), prio.blocks.filter(b => b.land).length, "a glyph marks the blocks in Indigenous lands and conservation units");
    assert.equal(await text("#list-key"), "Indigenous landconservation unitcellsmax chance");
    assert.equal(await js(`document.querySelectorAll("#list table, #list-rows [style*=border]").length + (getComputedStyle(document.querySelector("#list-rows button")).borderTopWidth === "0px" ? 0 : 1)`), 0, "a typographic list: no table, no rules between rows");
    assert.match(await text("#legend"), /^Chance each cell loses a hectare by July \d+under 0\.1%/, "the blocks sit on the chances of the cells");
    await clickOn('#list-rows li:nth-child(3) button');
    await until(`/b=3/.test(location.hash) && document.querySelectorAll(".leaflet-sel-pane path").length === 2 && +new URLSearchParams(location.hash.slice(1)).get("v").split(",")[2] >= 9`, "the third block outlined and in view");
    assert.equal(await js(`document.querySelector("#list-rows [aria-current]").dataset.b`), "3");
    const [la, lo] = (await js(`new URLSearchParams(location.hash.slice(1)).get("v")`)).split(",").map(Number);
    assert.ok(Math.abs(la - prio.blocks[2].lat) < 0.05 && Math.abs(lo - prio.blocks[2].lon) < 0.05, "the map is on the block");
    assert.doesNotMatch(await js(`document.body.innerText`), /flagged/i, "the word is gone from the interface");
  }

  // a quiet sector: no alerts rising, forecast rank in the lower half. No red anywhere in the column.
  await send("Page.navigate", { url: SITE + `#l=en&r=${quiet.id}` });
  await until(`document.getElementById("scope").textContent.includes(${JSON.stringify(quiet.n)}) && document.getElementById("lead").dataset.l === "0"`, "the quiet sector " + quiet.n);
  await redFollows(0);
  assert.equal(await js(`document.querySelectorAll("#signs .up, #chart .worse").length`), 0, "nothing in the signals or the timeline is red");
  const calm = await text("#level") + " | " + await text("#say");

  // Portuguese, and the About text
  await clickOn("#lang-btn");
  await until(`document.documentElement.lang === "pt" && /km²/.test(document.getElementById("say").textContent)`, "Portuguese");
  await clickOn("#about-btn");
  await until(`document.getElementById("about").open`, "the About text");
  assert.doesNotMatch(await js(`document.body.innerText + document.getElementById("about").innerText`), /—/, "no em dashes");
  // the old wording is gone from everything a reader can see, in both languages: every mode, a replay, fire, the
  // hover text and About. About keeps one sentence on the benchmark's 5% yardstick.
  const pastY = Math.max(...Object.keys(meta.years).map(Number).filter(y => meta.years[y].actual_km2 != null));
  for (const l of ["en", "pt"]) {
    for (const [q, ready] of [["", `!!document.querySelector("#legend .ramp")`], ["&m=cells&y=" + pastY, `document.querySelector("canvas.cells")?.dataset.key === "${pastY}"`], ["&m=cells&y=2020", `document.querySelector("canvas.cells")?.dataset.key === "2020"`],
      ["&m=prio", `document.querySelectorAll("#list-rows li").length > 10 && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}"`], ["&k=scar12&m=cells", `document.querySelector("canvas.cells")?.dataset.key === "scar12"`], ["&g=1&k=clear3", `document.querySelectorAll("#list-rows li").length > 10`]]) {
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
    const count = sel => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
    const state = Object.keys(acts.states).sort((a, b) => acts.states[b].reduce((x, r) => x + r.observed, 0) - acts.states[a].reduce((x, r) => x + r.observed, 0))[0];  // the state with the most clearing
    for (const l of ["en", "pt"]) {
      const en = l === "en", since = monthOf(sem[0].start, l), share = acts.summary.fall_accounted_share;
      await send("Page.navigate", { url: SITE + `#l=${l}` });
      await until(`document.documentElement.lang === "${l}" && !/t=actions/.test(location.hash) && !!document.querySelector('#scale button[data-k="actions"]') && !!document.querySelector("#chart .bar .plain")`, `${l}: the actions tab beside years and months`);
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
      await send("Page.navigate", { url: SITE + `#l=${l}&t=actions&s=uf&r=${state}` });
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
      assert.deepEqual(await js(`[...document.querySelectorAll("#about a")].map(a => a.getAttribute("href")).filter(h => h.includes("/docs/"))`), ["POLICY", "INPUTS"].map(d => `https://github.com/gdavidss/prenuncio/blob/HEAD/docs/${d}.md`), "and points to the method and the inputs in the repository");
      assert.doesNotMatch(about, /—|Amazônia Legal/);
      await js(`document.getElementById("about").close()`);
    }
    // a municipality has no figure of its own: the Amazon's is shown, and named
    await send("Page.navigate", { url: SITE + "#l=en&t=actions&r=1500602" });
    await until(`document.querySelector("#scope span")?.textContent === "Amazon" && !!document.querySelector("#chart svg.acts")`, "the actions view with a municipality selected");
    assert.equal(await text("#scope span"), "Amazon");
    assert.equal(await text("#say"), `Enforcement accounts for ${two(acts.summary.avoided, "en")} km² of clearing avoided since ${monthOf(sem[0].start, "en")}`);
    assert.match(await text("#hint"), /Only states have a figure of their own\.$/);
    assert.equal(await count("#chart .bar .rng"), sem.length);
    // the view belongs to clearing: another hazard has no such tab, and a link that asks for it gets the years
    await send("Page.navigate", { url: SITE + "#l=en&k=scar12&t=actions" });
    await until(head("/burned in the last twelve months/") + ` && !/t=actions/.test(location.hash)`, "fire, which has no actions view");
    assert.equal(await js(`[...document.querySelectorAll("#scale button")].map(b => b.textContent).join()`), "Years,Months");
  }

  // ---------- the API panel: the instructions for agents as the file has them, and one line above them
  const llms = await fetch(`${SITE}api/v1/llms.txt`).then(r => (r.ok ? r.text() : null)).catch(() => null);
  assert.ok(llms, "api/v1/llms.txt is served");
  for (const l of ["en", "pt"]) {
    await send("Page.navigate", { url: SITE + `#l=${l}&k=clear3` });
    await until(`document.documentElement.lang === "${l}" && document.documentElement.dataset.hazard === "clear" && document.documentElement.dataset.scale === "months" && !!document.querySelector("#chart .bar")`, `${l}: the page before the API panel`);
    assert.equal(await js(`[...document.querySelectorAll("#top nav button")].map(b => b.textContent).join()`), l === "en" ? "About,API,PT" : "Sobre,API,EN", `${l}: API sits next to About in the header`);
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

  assert.deepEqual(errors, [], "no script errors");
  console.log(`ok, ${words} words on the default screen\n${fc}\n${past}\n${months}\n${fire}\n${cell}\n${calm}\n${actions}`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}
