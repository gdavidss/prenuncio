// Drives the site in headless Chrome with real mouse events: selects a sector, replays a year, switches to
// months, to another hazard, to cells, and checks the headline each time. It also recounts the alert level
// from the data and checks that red follows it: an alarm is red, a quiet sector has none.
// Run: python3 -m http.server 8878 -d web &   then   node test/sectors.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const SITE = process.env.PRENUNCIO_SITE || "http://localhost:8878/";
const [meta, regions, mun] = await Promise.all(["meta", "regions", "sectors_mun"].map(f => fetch(`${SITE}data/${f}.json`).then(r => r.json())));
const monthly = await fetch(`${SITE}data/monthly.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);  // the monthly forecast, once it is exported
// the level, recounted here from docs/BRAND.md rather than taken from the site
const three = a => [a.at(-1) + a.at(-2) + a.at(-3), a.at(-13) + a.at(-14) + a.at(-15)];
const rising = ([now, prev]) => (now < 1 ? 0 : now / Math.max(prev, 1) >= 2 ? 2 : now / Math.max(prev, 1) >= 1.1 ? 1 : 0);
const amazonLevel = series => Math.min(3, rising(three(regions.months[series])) + (regions.months.oni.v.at(-1) >= 1.5 ? 1 : 0));
const fy = regions.eyears.indexOf(meta.forecast.year), byRisk = [...mun.items].sort((a, b) => b.e[fy] - a.e[fy]);
const quiet = byRisk.slice(Math.ceil(byRisk.length / 2)).filter(it => it.f > 500 && it.m.slice(0, -1).every(s => rising(three(s)) === 0)).sort((a, b) => b.f - a.f)[0];
const hazardLayers = ["scar12", "degr12", "mine12"].filter(k => meta.layers[k]);
const RED = "rgb(228, 0, 43)", INK = "rgb(17, 17, 17)";
// the accuracy quoted for the painted cells: the 500 m flags when the export has them
const cap5 = y => Math.round(100 * (meta.years[y].flags500?.capture5 ?? meta.years[y].capture["5"]));

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
  // red on screen must be what the level says: none, the word and the mark, a band, the whole block
  const redFollows = async l => {
    assert.equal(await style(".brand svg", "fill"), l ? RED : INK, "the mark is red only above quiet");
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
  await until(head("/^In 2023, [\\d,.]+\\skm² were cleared here, \\d+% inside flagged cells$/"), "the 2023 replay");
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

  // the other hazards, each with its own hue, none of them red
  for (const layer of hazardLayers) {
    await clickOn(`#hazard button:nth-child(${2 + hazardLayers.indexOf(layer)})`);
    await until(`new RegExp("k=${layer}").test(location.hash)`, layer);
    assert.notEqual(await style("#chart .winrule", "stroke"), RED, "a hazard's own colour is never the alarm red");
  }
  await clickOn('#hazard button:nth-child(2)');
  await clickOn('#scale button[data-k="years"]');
  await until(head("/^(Ranks \\d+(st|nd|rd|th) of \\d+ municipalities for fire risk by |About [\\d,.]+\\skm² expected to burn here in the next 12 months$)/"), "fire by year");

  // cells, with the sector still selected, and back to the clearing replay
  await clickOn('#modes button[data-k="cells"]');
  await until(`document.querySelector("canvas.cells").dataset.key === "scar12"`, "the painted 1 km cells");
  assert.equal(await js(`+document.querySelector("canvas.cells").dataset.cell >= ${meta.cell}`), true, "the other hazards are painted at 1 km or coarser");
  assert.match(await hash(), /m=cells/);
  assert.equal(await js(`document.getElementById("kinds").hidden`), true);
  await clickOn('#hazard button:nth-child(1)');
  await until(head("/^In 2023, /") + ` && document.getElementById("legend").textContent === "Clearing riskflaggedflagged and clearedcleared, missed"`, "the replay in cells");
  assert.ok((await text("#scope")).includes("Altamira"));
  // the cells are drawn for the window on screen and never as one huge canvas
  await until(`document.querySelector("canvas.cells").dataset.key === "2023"`, "the cells of 2023");
  const [w, h, painted, biggest] = await js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return [c.width, c.height, n, Math.max(...[...document.querySelectorAll(".leaflet-paint-pane canvas")].map(c => c.width * c.height))]; })()`);
  assert.ok(w * h < 4e6 && biggest < 4e6 && painted > 0, `the cells canvas is the size of the view (${w} x ${h}) and has cells on it (${painted} px)`);
  assert.match(await text("#share"), /^[\d.]+% of forest cells flagged, [\d,]+ km²$/, "the share that is flagged stands outside the legend box");
  assert.equal(await js(`document.getElementById("legend").contains(document.getElementById("share"))`), false);

  // sectors of another kind drop the selection
  await clickOn('#modes button[data-k="sectors"]');
  await clickOn('#kinds button[data-k="ti"]');
  await until(`document.getElementById("scope").hidden && /s=ti/.test(location.hash) && !/r=/.test(location.hash)`, "the Indigenous lands overview");
  assert.equal(await text("#say"), `In 2023, ${cap5(2023)}% of clearing fell inside the flagged 5% of forest`, "the replay quotes the accuracy of the cells it paints");

  // fire for the whole Amazon, by month: the level the data counts to, and the red that goes with it
  // (a link opened in the same tab changes only the fragment, and the app reloads itself on that. Do not send
  // Page.reload after it: a busy page may not have taken the new fragment yet, and the old link gets reloaded.)
  await send("Page.navigate", { url: SITE + "#l=en&k=scar12&t=months" });
  await until(head("/burn/") + ` && document.getElementById("lead").dataset.l === "${amazonLevel("scar")}"`, "the fire level");
  await redFollows(amazonLevel("scar"));
  const fire = await text("#level") + " | " + await text("#say");

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
  assert.deepEqual(errors, [], "no script errors");
  console.log(`ok, ${words} words on the default screen\n${fc}\n${past}\n${months}\n${fire}\n${calm}`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}
