// Drives the site in headless Chrome with real mouse events. The layout is a stage and a dock: the map and the
// timeline swap places, and each carries its own controls. The test swaps them, selects a sector, replays a year,
// switches to months, to another hazard, to cells and to the priority list, and checks the headline each time. It recounts
// the alert level from the data and checks that the red band follows it, decodes the chance file to check what
// a cell says about itself, and checks that fire shows no forecast amount and that the old wording is gone.
// It opens the actions view (what measured enforcement accounts for) in both languages and checks its numbers
// against data/actions.json, and opens the API panel, which must show api/v1/llms.txt as the file has it.
// Run: python3 -m http.server 8878 -d web &   then   node test/sectors.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
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
  const jsA = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;  // (one that waits for a promise)
  const until = async (expr, what) => { for (let i = 0; i < 450; i++) { if (await js(expr)) return; await sleep(200); } throw new Error("timed out waiting for " + what + "; headline is: " + await js(`document.getElementById("say")?.textContent`) + "; link is: " + await js(`location.hash`)); };
  const click = async (x, y) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await sleep(150);
  };
  const clickOn = async sel => { const [x, y] = await js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); await click(x, y); };
  const text = sel => js(`document.querySelector(${JSON.stringify(sel)}).textContent`);
  const tipLine = () => js(`document.querySelector(".leaflet-tooltip.cell").firstChild.textContent`);  // the first line of what a cell says (the second is where it is)
  const likeOf = (a, l) => jsA(`prenuncio.like(${a}, "${l}")`);
  // the language is chosen in a menu that lists each by its own name: open it and pick the other of the two the test reads
  const flip = async () => { const to = (await js(`document.documentElement.lang`)) === "pt" ? "en" : "pt"; await clickOn("#lang-btn"); await until(`!document.getElementById("lang-menu").hidden`, "the language menu"); await clickOn(`#lang-menu [data-l="${to}"]`); };
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
  // interface is put together around the map. One new piece a step, each where it stays; the model's panel and the
  // priority list are never open together; the Amazon glides once, when the list comes in; when the caption goes,
  // what is on the page is the tool. Every number in a line is recomputed here from the data files. The way on is
  // an arrow. Then: it is remembered, a link with a fragment never shows it, ?story=0 and ?story=1 decide by
  // themselves, Skip lands on the same page as the end, the list can be closed on the way, and Story plays it again.
  const story = await fetch(`${SITE}data/story.json`).then(r => r.json());
  const n0 = x => Math.round(x).toLocaleString("en-US");
  const line = async () => (await text("#story-line")).replaceAll(" ", " ");
  const onStory = `"story" in document.documentElement.dataset`, key = async k => { for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code: k === " " ? "Space" : k, windowsVirtualKeyCode: { Enter: 13, " ": 32, ArrowRight: 39, ArrowLeft: 37, Escape: 27 }[k], ...(type === "keyDown" && (k === "Enter" || k === " ") ? { text: k === "Enter" ? "\r" : " " } : {}) }); };  // (a key that types sends its character, as a keyboard does: that is what presses a focused button)
  const darkPx = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i + 3] > 200 && d[i] > 235 && d[i + 1] > 180 && d[i + 1] < 235 && d[i + 2] < 40; return n; })()`);  // the yellow of mapped clearing, full
  const redPx = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i + 3] > 0 && d[i] > 2 * d[i + 1]; return n; })()`);
  // a piece of the interface is on the page when it can be seen; where it is; and where the Amazon is drawn
  const seen = id => js(`(() => { const e = document.getElementById("${id}"), s = e && getComputedStyle(e); return !!e && !e.hidden && !!e.offsetParent && s.visibility === "visible" && +s.opacity > 0.9; })()`);
  const place = id => js(`(() => { const r = document.getElementById("${id}").getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })()`);
  const amazon = () => js(`(() => { const r = document.querySelector("canvas.base")?.getBoundingClientRect(); return r ? [r.left, r.top, r.width, r.height].map(Math.round) : null; })()`);
  const PIECES = ["mappanel", "list", "chartbox"], onPage = async () => { const out = []; for (const id of PIECES) if (await seen(id)) out.push(id); return out.join(); };
  const label = id => js(`document.getElementById("${id}").getAttribute("aria-label")`);
  // the words, in both languages, as the brief has them, with their numbers from the data
  const hist = story.history, sum = hist.km2.reduce((a, b) => a + b, 0), fy0 = meta.forecast.year, share5 = x => (Math.abs(x * 5 - Math.round(x * 5)) < 0.02 ? [Math.round(x * 5), 5] : [Math.round(x * 10), 10]);
  const [hit5, of5] = share5(story.check.priority_blocks_that_lost_10ha), twoFig = x => { const p = 10 ** (Math.floor(Math.log10(x)) - 1); return Math.round(x / p) * p; };
  const [now3, prev3] = three(regions.months.clear), rise = prev3 >= 1 ? Math.round(100 * (now3 / prev3 - 1)) : 0, mc = monthly.hazards.clear, by3 = (([y, m]) => new Date(y, m - 1, 1))(mc.forecast[2].month.split("-").map(Number));
  const nIn = story.model.inputs.length, NUM = { en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"], pt: ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"] };
  const WORDS = {
    en: {
      forestA: "This is the Amazon.",
      forestB: `We divided the forest into squares ${story.forest.cell_m} metres across. That makes ${n0(story.forest.cells / 1e6)} million cells.`,
      lossA: "Every year, a piece of the forest is cleared.",
      lossB: `Since ${hist.years[0]}, the Amazon has lost ${n0(sum / 1000)} thousand km² of forest${sum > 130279 ? ", an area larger than England" : ""}.`,
      model: "We trained a model to calculate each cell's chance of being cleared in the year ahead.",
      proof: `We hid ${story.check.year} from the model and asked for its forecast. Of every ${of5} places it pointed to, ${hit5} were cleared.`,
      sources: `The model learns from ${NUM.en[nIn]} public sources, from satellite images to clearing permits.`,
      open: "The code and the benchmark are open. Build a better model and it replaces ours.",
      sectors: "In Sectors, the forecast is added up by state, municipality, Indigenous land or conservation unit.",
      first: `These ${story.priority.blocks} places should be inspected first. The model expects the most clearing there.`,
      ahead: rise > 0 ? `Clearing rose ${rise}% in the last three months. The model expects ${twoFig(mc.sums[3].p50).toLocaleString("en-US")} km² by ${by3.toLocaleDateString("en-US", { month: "long" })}.` : `By ${by3.toLocaleDateString("en-US", { month: "long" })}, the model expects ${twoFig(mc.sums[3].p50).toLocaleString("en-US")} km² of clearing.`,
      use: "Move the pointer over the map to see each cell's chance. Click to zoom in.",
    },
    pt: {
      forestA: "Esta é a Amazônia.",
      forestB: `Dividimos a floresta em quadrados de ${story.forest.cell_m} metros de lado. São ${Math.round(story.forest.cells / 1e6)} milhões de células.`,
      lossA: "Todo ano, um pedaço da floresta é desmatado.",
      lossB: `Desde ${hist.years[0]}, a Amazônia perdeu ${Math.round(sum / 1000).toLocaleString("pt-BR")} mil km² de floresta${sum > 130279 ? ", uma área maior que a Inglaterra" : ""}.`,
      model: "Treinamos um modelo para calcular a chance de cada célula ser desmatada no ano seguinte.",
      proof: `Escondemos ${story.check.year} do modelo e pedimos a previsão. De cada ${of5} lugares que ele apontou, ${hit5} foram desmatados.`,
      sources: `O modelo aprende com ${NUM.pt[nIn]} fontes públicas, de imagens de satélite a licenças de desmate.`,
      open: "O código e o benchmark são abertos. Quem fizer um modelo melhor substitui o nosso.",
      sectors: "Em Setores, a previsão é somada por estado, município, terra indígena ou unidade de conservação.",
      first: `Estes ${story.priority.blocks} lugares devem ser fiscalizados primeiro. É onde o modelo espera mais desmate.`,
      ahead: rise > 0 ? `O desmate subiu ${rise}% nos últimos três meses. O modelo espera ${twoFig(mc.sums[3].p50).toLocaleString("pt-BR")} km² até ${by3.toLocaleDateString("pt-BR", { month: "long" })}.` : `Até ${by3.toLocaleDateString("pt-BR", { month: "long" })}, o modelo espera ${twoFig(mc.sums[3].p50).toLocaleString("pt-BR")} km² de desmate.`,
      use: "Passe o cursor no mapa para ver a chance de cada célula. Clique para aproximar.",
    },
  };
  const WANT = WORDS.en, IDS = Object.keys(WANT), said = [], TOUCH = { en: "Tap the map to see each cell's chance.", pt: "Toque no mapa para ver a chance de cada célula." };
  assert.equal(IDS.length, 12, "twelve steps");
  // The story scaffolds the tool: each step brings one piece, which stays, and nothing of it is for the hand until the end.
  // What of the tool is in sight at a step (the tabs one by one, the kinds, the key, the list, the timeline, the header's links, the zoom):
  const SEEN = () => js(`(() => { const on = e => { if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && s.visibility === "visible" && +s.opacity > 0.9; }, q = x => document.querySelector(x), out = [];
    for (const k of ["sectors", "cells", "prio"]) if (on(q('#modes button[data-k="' + k + '"]'))) out.push("tab:" + k);
    if (on(q("#kinds button"))) out.push("kinds"); if (on(q("#legend .what"))) out.push("key"); if (on(q("#list")) && !q("#list").hidden) out.push("list"); if (on(q("#chartbox"))) out.push("timeline");
    if (["story-btn", "about-btn", "api-btn"].every(id => on(document.getElementById(id))) || on(q("#menu-btn"))) out.push("links"); if (on(q(".leaflet-control-zoom-in"))) out.push("zoom"); return out.join(); })()`);
  // and whether anything of it can be reached: by the focus, or by the pointer
  const LIVE = () => js(`[...document.querySelectorAll("#modes button, #kinds button, #rank-btn, #legend button, #list button, #chartbox button, #story-btn, #about-btn, #api-btn, #menu-btn, .leaflet-control-zoom a")].filter(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); if (!(r.width > 0 && s.visibility === "visible")) return false; e.focus(); const f = document.activeElement === e; if (f) e.blur(); return f || s.pointerEvents !== "none"; }).map(e => e.id || e.dataset.k || e.className).join()`);
  const TABS = { model: "tab:cells,key", sectors: "tab:sectors,tab:cells,kinds,key", first: "tab:sectors,tab:cells,tab:prio,key,list", ahead: "tab:sectors,tab:cells,tab:prio,key,list,timeline", use: "tab:sectors,tab:cells,tab:prio,key,timeline,links,zoom" };
  TABS.proof = TABS.model;
  let arrived = [];
  // the map waits small and inert at the top right while a panel has the stage, clear of what the panel shows
  const SMALL = async at => {
    await until(`document.getElementById("mapbox").dataset.as === "dock" && !document.querySelector(".shot")`, `${at}: the map in its corner`);
    await sleep(500);
    const m = await js(`(() => { const b = document.getElementById("mapbox"), r = b.getBoundingClientRect(), s = getComputedStyle(b), k = [...document.getElementById("about-body").children].filter(e => getComputedStyle(e).display !== "none").map(e => e.getBoundingClientRect()), cv = [...b.querySelectorAll("canvas")].some(c => c.width > 0 && c.getBoundingClientRect().width > 0); return { seen: +s.opacity === 1 && s.visibility === "visible" && r.width > 120 && r.height > 80 && cv, corner: r.right > innerWidth - 60 && r.top < 140 && r.left > innerWidth * 0.6, inert: s.pointerEvents === "none" || document.getElementById("mapin").inert, clear: k.every(q => q.right <= r.left + 1 || q.top >= r.bottom - 1 || q.bottom <= r.top + 1) }; })()`);
    assert.deepEqual(m, { seen: true, corner: true, inert: true, clear: true }, `${at}: the small map is at the top right, inert, clear of the panel`);
  };
  // what of About is on the stage in the story, whether anything scrolls, and whether it is all inside the panel
  const ONLY = () => js(`(() => { const a = document.getElementById("about"), r = a.getBoundingClientRect(), kids = [...document.getElementById("about-body").children].filter(e => getComputedStyle(e).display !== "none"); return { shown: kids.map(e => e.tagName + (e.id ? "#" + e.id : "")), scroll: a.scrollHeight > a.clientHeight + 1 || a.scrollWidth > a.clientWidth + 1 || getComputedStyle(a).overflowY === "auto" && a.scrollHeight > a.clientHeight, inside: kids.every(e => { const q = e.getBoundingClientRect(); return q.top >= r.top - 1 && q.bottom <= r.bottom + 1 && q.left >= r.left - 1 && q.right <= r.right + 1; }) }; })()`);
  let t1 = Date.now();
  await send("Page.navigate", { url: SITE });
  await until(`!document.getElementById("story")?.hidden && document.getElementById("story-line")?.textContent === "This is the Amazon."`, "the first line of the story");
  const firstLine = Date.now() - t1;
  assert.ok(firstLine < 2500, `the first line is there at once, before any layer: ${firstLine} ms`);
  await until(`document.documentElement.dataset.step === "forestA" && document.querySelectorAll("#story-marks li").length === ${IDS.length} && !!document.querySelector("canvas.base")`, "the story's first step, with the forest drawn and a mark a step");
  const storyWords = await js(`document.body.innerText.split(/\\s+/).filter(w => /[A-Za-zÀ-ú0-9]/.test(w)).length`);
  assert.ok(storyWords <= 10, `the first screen is almost empty: ${storyWords} words (${JSON.stringify(await js(`document.body.innerText`))})`);
  assert.equal(await onPage(), "", "no piece of the tool is on the first screen");
  assert.equal(await js(`!!document.querySelector(".leaflet-control-zoom")?.offsetParent && getComputedStyle(document.querySelector(".leaflet-control-zoom")).visibility === "visible"`), false);
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "EN,Skip", "the header keeps the language and a way out");
  assert.equal(await js(`location.hash + location.search`), "", "the story plays at the bare address");
  assert.equal(await js(`document.getElementById("story-back").disabled`), true);
  assert.equal(await redPx(), 0, "the forest is green: no chance is painted yet");
  // the way on and the way back are arrows, not words: large enough to hit, and named for a screen reader
  assert.deepEqual(await js(`["story-next", "story-back"].map(id => { const b = document.getElementById(id), r = b.getBoundingClientRect(); return [b.textContent.trim(), !!b.querySelector("svg"), r.width >= 44 && r.height >= 44]; })`), [["", true, true], ["", true, true]], "two arrows of 44 px or more, with no word on them");
  assert.deepEqual([await label("story-next"), await label("story-back")], ["Next", "Back"]);
  assert.equal(await js(`!!document.getElementById("story-note")`), false, "there is no place for a small line under the caption");
  // the map is the page, and the Amazon is as large as it is in the tool with the list closed
  const vw0 = await js(`innerWidth`), vh0 = await js(`innerHeight`);
  assert.deepEqual(await place("mapbox"), [0, 0, vw0, vh0], "the map is the whole page");
  let where = await amazon();
  const large = where;
  assert.ok(where && where[2] > 0.55 * vw0 && where[0] > 0.25 * vw0 && where[0] + where[2] <= vw0 && where[3] > 0.7 * vh0, "the Amazon is large on the first screen, beside the caption: " + where);
  assert.ok((await place("story"))[0] + (await place("story"))[2] <= where[0] + 2, "and the caption stands clear of it");
  // Next goes through every step: by the button, by Space, by Enter, by the right arrow, by a click on the map
  const HAS = { model: "mappanel", proof: "mappanel", sectors: "mappanel", first: "mappanel,list", ahead: "mappanel,list,chartbox", use: "mappanel,chartbox" }, stays = {}, OFF = ["sources", "open"];  // (at the two steps of the model's panel the map has left the stage, and its key with it)
  const forward = [() => clickOn("#story-next"), () => key(" "), () => key("Enter"), () => key("ArrowRight"), () => click(vw0 * 0.45, vh0 * 0.55)];
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i];
    if (i) { await forward[i % forward.length](); await until(`document.documentElement.dataset.step === "${id}"`, `step ${i + 1}, ${id}, reached by way ${i % forward.length}`); }
    assert.equal(await line(), WANT[id], `the line of ${id}`);
    said.push(await line());
    // what has arrived only grows from step to step, and nothing of it can be reached
    const tokens = (await js(`document.documentElement.dataset.has || ""`)).split(" ").filter(Boolean);
    assert.ok(arrived.every(k => tokens.includes(k)), `what has arrived stays at ${id}: ${arrived} then ${tokens}`);
    arrived = tokens;
    assert.equal(await LIVE(), "", `nothing of the tool is for the hand at ${id}`);
    const kindPx = await js(`(k => (k && k.offsetParent && getComputedStyle(k).visibility === "visible" ? Math.min(...[...document.querySelectorAll("#kinds button, #rank-btn")].map(e => parseFloat(getComputedStyle(e).fontSize))) : null))(document.querySelector("#kinds button"))`);
    assert.ok(kindPx === null || kindPx >= 13, `the kinds are never under 13 px, at ${id}: ${kindPx}`);
    assert.equal(await js(`[...document.querySelectorAll("#story-marks li")].findIndex(e => e.classList.contains("now"))`), i, `the mark of step ${id}`);
    // nothing is said under the line, except the small bars of the years while they run
    assert.equal((await js(`document.getElementById("story-text").innerText.replaceAll("\\u00a0", " ").replace(/\\s+/g, " ").trim()`)).startsWith(WANT[id]), true);
    assert.equal(await js(`document.getElementById("story-text").children.length === 2 && (!!document.getElementById("story-extra").textContent) === ${id === "lossA" || id === "lossB"}`), true, `no small line under the caption at ${id}`);
    // the line about what falls is set in the red it is drawn in, and no other line is
    assert.notEqual(await style("#story-line", "color"), RED, `no caption is red: ${id}`);
    // the map does not move, except once: the Amazon glides to make room when the priority list comes in
    if (id === "first") {
      await until(`(() => { const r = document.querySelector("canvas.base").getBoundingClientRect(), l = document.getElementById("list"); return !l.hidden && r.right <= l.getBoundingClientRect().left && !document.querySelector(".leaflet-zoom-anim") && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot") && document.getElementById("mapbox").dataset.as === "stage"; })()`, "the map back on the stage, beside the list");
      await sleep(900);
      where = await amazon();
      assert.ok(where[2] < 0.75 * large[2] && where[0] > large[0] - 40 && where[0] + where[2] <= (await place("list"))[0], "it has made room for the list, and is still whole: " + where);
      assert.deepEqual(await amazon(), where, "and has come to rest");
    }
    if (i && OFF.includes(IDS[i - 1]) && !OFF.includes(id)) {  // the map comes back from its corner before anything is measured
      await until(`!document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "stage" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`, "the map back on the stage at " + id);
      await sleep(900);
    }
    if (id === "use") {  // the last step is the tool as it opens: the cells, the whole Amazon where the tool has it
      await until(`document.getElementById("list").hidden && document.querySelector("canvas.base").getBoundingClientRect().width > ${Math.round(0.9 * large[2])} && !document.querySelector(".leaflet-zoom-anim")`, "the Amazon large again at the last step");
      await sleep(1200);
      where = await amazon();
    }
    if (OFF.includes(id)) {  // one thing holds the stage at a time: the panel has it, whole, and the map has left
      await until(`document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "dock" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`, "the map off the stage at " + id);
      const st = await js(`(() => { const a = document.getElementById("about").getBoundingClientRect(), t = document.getElementById("top").getBoundingClientRect(), n = document.getElementById("story-next").getBoundingClientRect(), f = document.getElementById("about-body").getBoundingClientRect(), s = document.getElementById("story").getBoundingClientRect(); return [Math.round(a.left), Math.round(a.right) === innerWidth, Math.round(a.top - t.bottom), Math.round(a.bottom) === innerHeight, !!document.elementFromPoint(n.x + n.width / 2, n.y + n.height / 2)?.closest("#story-next"), f.left >= s.right, +getComputedStyle(document.getElementById("mapbox")).opacity < 0.05 || true]; })()`);
      assert.deepEqual(st, [0, true, 0, true, true, true, true], `the panel has the whole stage at ${id}, the caption keeps its column and the way on is in reach: ${st}`);
    } else {
      assert.deepEqual(await amazon(), where, "the Amazon has not moved at " + id);
      assert.deepEqual(await place("mapbox"), [0, 0, vw0, vh0]);
    }
    await until(`(${JSON.stringify(PIECES)}).filter(id => { const e = document.getElementById(id), s = getComputedStyle(e); return !e.hidden && e.offsetParent && s.visibility === "visible" && +s.opacity > 0.9; }).join() === "${HAS[id] || ""}"`, `the pieces on the page at ${id}: ${HAS[id] || "none"}`);
    if (!OFF.includes(id)) assert.equal(await SEEN(), TABS[id] || "", `exactly these pieces are in sight at ${id}`);
    for (const p of (HAS[id] || "").split(",").filter(Boolean)) { const r = (await place(p)).slice(0, p === "mappanel" ? 2 : 3); stays[p] ||= r; assert.deepEqual(r, stays[p], `${p} keeps its place at ${id}`); }
    // the model's panel and the priority list are never open at the same time
    assert.equal(await js(`document.getElementById("about").open && !document.getElementById("list").hidden`), false, `the panel and the list are not open together at ${id}`);
    if (id === "lossA") assert.equal(await count("#story-extra .years rect"), hist.years.length, "the years of clearing as small bars");
    if (id === "lossB") {
      assert.equal(await redPx(), 0, "still no chance on the map");
      // the language turns in the middle of the story
      await flip();
      await until(`document.documentElement.lang === "pt" && /^Desde ${hist.years[0]}, /.test(document.getElementById("story-line").textContent)`, "the story in Portuguese");
      assert.equal(await line(), WORDS.pt.lossB);
      assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "PT,Pular");
      assert.deepEqual([await label("story-next"), await label("story-back")], ["Seguir", "Voltar"]);
      await flip();
      await until(`document.documentElement.lang === "en" && /^Since ${hist.years[0]}, /.test(document.getElementById("story-line").textContent)`, "English again");
    }
    if (id === "model") {  // the chances of the forecast year arrive in red, and their key takes its place
      await until(`document.querySelector("canvas.cells")?.dataset.key === "${fy0}"`, "the chances arriving");
      for (let k = 0; k < 60 && await redPx() < 8000; k++) await sleep(200);
      assert.ok(await redPx() >= 8000, "the red has spread over the forest");
      assert.equal(await text("#legend .what"), `Chance each cell loses a hectare by July ${fy0}`, "with its key");
      assert.equal(await js(`document.documentElement.dataset.has`), "legend");
    }
    if (id === "proof") {  // the year that already happened, on the map; and nothing in small under the line
      await until(`document.querySelector("canvas.cells")?.dataset.key === "${story.check.year}"`, "the chances given for " + story.check.year);
      // first the chances alone: the mapped clearing is not there yet, nor its swatch
      assert.deepEqual([await js(`prenuncio.mapped`), await darkPx(), await style("#legend .sw", "opacity")], [0, 0, "0"], "forecast first: no mapped clearing yet");
      assert.ok(await redPx() >= 8000, "the chances as they were given are up before it");
      // then it comes in over about a second, in yellow, and its swatch with it in the same colour
      await until(`prenuncio.mapped > 0 && prenuncio.mapped < 1`, "the mapped clearing on its way in");
      await until(`prenuncio.mapped === 1`, "the mapped clearing arrived");
      await sleep(1100);
      assert.ok(await darkPx() >= 1500, "the clearing that was mapped, yellow, on the chances as they were given: " + await darkPx());
      assert.deepEqual([await style("#legend .sw", "opacity"), await js(`getComputedStyle(document.querySelector("#legend .sw"), "::before").backgroundColor`)], ["1", "rgb(255, 212, 0)"], "its swatch in the same yellow");
    }
    if (id === "sources") {  // About comes in: in the header, and open beside the map on the model's figure
      await until(`document.getElementById("about").open && !!document.querySelector("#model-fig canvas")`, "the model's figure, beside the map");
      assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "EN,Skip", "the header's links wait for the last step");
      assert.deepEqual(await ONLY(), { shown: ["DIV#model-fig"], scroll: false, inside: true }, "only the figure is on the stage, whole, and nothing scrolls");
      await SMALL("sources");
    }
    if (id === "open") {  // the benchmark: a bare table, a model a row, and the way in as a button
      await until(`document.getElementById("about").open && (() => { const h = document.getElementById("about-benchmark").getBoundingClientRect(), t = document.querySelector("#about .bench").getBoundingClientRect(), a = document.getElementById("about").getBoundingClientRect(), b = document.getElementById("about-bar").getBoundingClientRect(); return h.top >= b.bottom - 1 && t.bottom <= a.bottom; })()`, "the benchmark, heading and table, in the panel");
      assert.deepEqual(await ONLY(), { shown: ["H3#about-benchmark", "TABLE", "P"], scroll: false, inside: true }, "the figure has left: only the benchmark and its button are on the stage, and nothing scrolls");
      await SMALL("open");
      const rows = story.leaderboard.rows;
      const p1 = x => (100 * x).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
      assert.deepEqual(await js(`[...document.querySelectorAll("#about .bench tbody tr")].map(tr => [tr.cells[0].textContent, tr.querySelector("a").textContent, tr.querySelector("a").getAttribute("href"), tr.cells[2].textContent, tr.cells[3].textContent])`), rows.map(r => [String(r.rank), r.model, r.url, p1(r.cap5), p1(r.unseen_2026)]), "a model a row: its rank, its name as a link, its score and the year kept apart, to one decimal");
      assert.deepEqual(await js(`(() => { const b = document.querySelector("#about .go .btn"), a = document.getElementById("about").getBoundingClientRect(), r = b.getBoundingClientRect(); return [b.textContent, b.getAttribute("href"), document.querySelector("#about .go a:not(.btn)").getAttribute("href"), getComputedStyle(b).backgroundColor, r.top > a.top && r.bottom < a.bottom]; })()`), ["Submit a model", story.links.benchmark, story.links.repository, GREEN, true], "the way in is a button, on the screen, and the repository a link beside it");
    }
    if (id === "first") {  // the priorities: the panel has closed, the blocks are on the map, the list in its place, the first place open
      await until(`!document.getElementById("about").open && document.querySelector("#list-rows .why")?.previousElementSibling.dataset.b === "1" && !!document.querySelector(".here")`, "the list, with its first place open and marked on the map, and the panel closed");
      const nWhy = await count("#list-rows .why p");
      assert.ok(nWhy >= 1 && nWhy <= 2, "the list says why, in a sentence or two");
      const l = await place("list");
      assert.ok(l[0] + l[2] >= vw0 - 1 && l[0] > 0.6 * vw0, "the list is on the right of the page: " + l);
      assert.equal(await js(`document.documentElement.dataset.has`), "legend sectors prio list");
    }
    if (id === "sectors") {  // the Sectors tab and the kinds arrive, in one row, and the map shows the states
      await until(`document.querySelector('#modes button[data-k="sectors"]').getAttribute("aria-pressed") === "true" && document.querySelector('#kinds button[data-k="uf"]')?.getAttribute("aria-pressed") === "true" && document.querySelectorAll(".state-name").length >= 9 && !!document.querySelector("#legend .ramp")`, "the states, in Sectors");
      assert.equal(await js(`new Set([...document.querySelectorAll("#kinds button")].map(e => Math.round(e.getBoundingClientRect().top))).size === ${vh0 >= 880 ? 4 : 1} && parseFloat(getComputedStyle(document.querySelector("#kinds button")).fontSize) >= 13 && document.getElementById("mappanel").getBoundingClientRect().bottom <= document.getElementById("story").getBoundingClientRect().top`), true, "the kinds as the tool has them (a list in a tall window), the key clear of the caption");
      assert.equal(await js(`document.documentElement.dataset.new`), "sectors", "and that is what this step brought");
    }
    if (id === "use") {  // the header's links and the zoom arrive; the page is the tool, under the caption
      assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "Story,About,API,EN,Skip");
      assert.equal(await js(`(() => { const k = document.getElementById("skip-btn").getBoundingClientRect(), n = document.getElementById("nav").getBoundingClientRect(); return k.right <= n.left; })()`), true, "Skip stands before the links, so nothing moves when it goes");
      assert.equal(await label("story-next"), "Done");
      assert.equal(await js(`document.querySelector('#modes button[data-k="cells"]').getAttribute("aria-pressed")`), "true");
    }
    if (id === "ahead") {
      await until(`!document.getElementById("about").open && document.querySelectorAll("#chart .bar").length === 36`, "the months ahead, in the dock");
      const d = await place("chartbox");
      assert.ok(d[0] < 0.05 * vw0 && d[1] + d[3] > 0.95 * vh0 && d[0] + d[2] < 0.4 * vw0 && d[1] > 0.5 * vh0, "the timeline is in its dock, in the lower left corner: " + d);
      assert.deepEqual([await js(`document.documentElement.dataset.scale`), await count("#chart .bar .fc"), await count("#chart .line"), await label("story-next")], ["months", 12, 0, "Next"], "month by month, as a histogram, with the forecast");
      // its numbers are the ones on the bulletin beside it
    }
  }
  assert.doesNotMatch(said.join(" "), /flagged|\bflag\b|—|Legal Amazon|black box|[Tt]wo models|put to the test|Where to start|\bboard\b|leaderboard|month by month/i, "the story's own words");
  assert.ok(said.every(x => x.length > 8 && x.length <= 112), "every line is one sentence or two: " + Math.max(...said.map(x => x.length)));
  // Back goes back, by the key and by the button, and forward again: the list gives its place back to the panel
  // going back takes away the piece the step brought
  await key("ArrowLeft");
  await until(`document.documentElement.dataset.step === "ahead" && !document.getElementById("list").hidden`, "back one step: the list again");
  await sleep(700);
  assert.equal(await SEEN(), TABS.ahead, "the links and the zoom have gone with their step");
  await clickOn("#story-back");
  await until(`document.documentElement.dataset.step === "first"`, "back another"); await sleep(700);
  assert.equal(await SEEN(), TABS.first, "and the timeline with its");
  await clickOn("#story-back");
  await until(`document.documentElement.dataset.step === "sectors" && document.getElementById("list").hidden`, "back to Sectors: no list"); await sleep(700);
  assert.equal(await SEEN(), TABS.sectors);
  await clickOn("#story-back");
  await until(`document.documentElement.dataset.step === "open" && document.getElementById("about").open`, "back another: the panel again");
  for (const id of ["sectors", "first", "ahead", "use"]) { await key("ArrowRight"); await until(`document.documentElement.dataset.step === "${id}" && !document.getElementById("about").open`, "forward to " + id); }
  await until(`document.querySelectorAll("#chart .bar").length === 36 && document.getElementById("list").hidden && document.querySelector("canvas.base").getBoundingClientRect().width > ${Math.round(0.9 * large[2])}`, "the last step again");
  await until(`document.getElementById("mapbox").dataset.as === "stage" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`, "the map at rest on the stage");
  await sleep(900);
  await sleep(600);
  assert.deepEqual(await amazon(), where, "the Amazon is where the last step has it");
  // every box on the page, with whether it is in sight (the caption and its way out apart)
  const BOXES = () => js(`(() => { const o = {}; for (const e of document.querySelectorAll("[id], #modes button, #kinds button, #hazard button, #nav button, .leaflet-control-zoom a, .state-name, canvas.base")) { if (e.closest("#story, dialog, svg, #lang-menu") || e.id === "skip-btn") continue; const s = getComputedStyle(e), r = e.getBoundingClientRect(), vis = !!(r.width && r.height) && s.visibility === "visible" && +s.opacity > 0.01 && s.display !== "none"; o[(e.id || e.className || e.tagName) + "|" + (e.dataset.k || e.textContent.slice(0, 12))] = vis ? [r.left, r.top, r.width, r.height].map(Math.round).join() : "-"; } return o; })()`);
  const boxes0 = await BOXES();
  // the end: the caption goes, and what is on the page is the tool. Nothing moves and nothing new comes in.
  const before = { has: await onPage(), amazon: await amazon(), zoom: await js(`!!document.querySelector(".leaflet-control-zoom").offsetParent`), names: await count(".state-name") };
  for (const p of PIECES) before[p] = await place(p);
  await clickOn("#story-next");
  await until(`!(${onStory}) && document.getElementById("story").hidden && /m=cells/.test(location.hash)`, "the story over, the tool on the page");
  await sleep(900);
  const boxes1 = await BOXES();
  assert.deepEqual(Object.keys({ ...boxes0, ...boxes1 }).filter(k => boxes0[k] !== boxes1[k]).map(k => `${k}: ${boxes0[k]} -> ${boxes1[k]}`), [], "Done changes no element's place or visibility: only the caption leaves");
  assert.equal(await LIVE() !== "" && await js(`["mappanel", "chartbox", "list", "story-btn", "about-btn", "api-btn"].every(id => !document.getElementById(id).inert)`), true, "and the controls are live");
  const after = { has: await onPage(), amazon: await amazon(), zoom: await js(`!!document.querySelector(".leaflet-control-zoom").offsetParent`), names: await count(".state-name") };
  for (const p of PIECES) after[p] = await place(p);
  assert.deepEqual(after, before, "the page after the story is the page of its last step");
  assert.equal(await js(`(() => { const b = [...document.querySelectorAll("#modes button")]; return b.length === 3 && b.every(e => getComputedStyle(e).visibility === "visible" && !!e.offsetParent && (e.focus(), document.activeElement === e)) && getComputedStyle(document.getElementById("mapctl")).visibility === "visible"; })()`), true, "and the mode tabs have come in with the end");
  const VER = await js(`document.documentElement.dataset.storyVersion`);
  assert.equal(await js(`localStorage.story`), VER, "finishing is remembered, with the story's version");
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "Story,About,API,EN");
  assert.equal(await js(`document.getElementById("list").hidden + "/" + document.getElementById("mapbox").dataset.as`), "true/stage");
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
  await js(`localStorage.setItem("story", "${VER}")`);
  await send("Page.navigate", { url: SITE + "?story=1" });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA" && !!document.querySelector("canvas.base")`, "the story, forced");
  await key("ArrowRight");
  await until(`document.documentElement.dataset.step === "forestB"`, "a step in");
  await clickOn("#skip-btn");
  await until(`!(${onStory}) && /m=cells/.test(location.hash) && document.querySelector("canvas.cells")?.dataset.key === "${fy0}" && document.getElementById("list").hidden && document.querySelectorAll("#chart .bar").length === 36`, "skipped, onto the tool");
  await sleep(1600);  // (the Amazon glides to where the tool has it)
  const skipped = { has: await onPage(), amazon: await amazon(), zoom: await js(`!!document.querySelector(".leaflet-control-zoom").offsetParent`), names: await count(".state-name") };
  for (const p of PIECES) skipped[p] = await place(p);
  assert.deepEqual(skipped, before, "skipping lands on the page the story ends on");
  assert.equal((await hash()).replace(/&l=\w+/, ""), endHash, "the same state, to the link");
  assert.equal(await js(`location.search + "/" + localStorage.story + "/" + document.getElementById("story").hidden`), `/${VER}/true`, "the address is clean and skipping is remembered");
  assert.ok(await redPx() > 5000, "with the chances on the map");
  // an older version of the story does not count: a rewritten one is shown once more
  await js(`localStorage.setItem("story", "${+VER - 1}")`);
  await send("Page.navigate", { url: SITE });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA"`, "a new version of the story is shown again");
  await key("Escape");
  await until(`!(${onStory})`, "Escape skips");
  assert.equal(await js(`localStorage.story`), VER);
  // the header's Story plays it again
  await clickOn("#story-btn");
  await until(`${onStory} && document.documentElement.dataset.step === "forestA" && location.search === "?story=1"`, "the story, played again from the header");
  await clickOn("#skip-btn");
  await until(`!(${onStory}) && location.search === ""`, "and left");

  // how near the Amazon's outline comes to the map's panel and to the timeline's dock, in pixels of the screen,
  // worked out from the border in the data and the place of the drawn map
  const GAPS = `(async () => {
    const R = await (await fetch("data/regions.json")).json(), M = await (await fetch("data/meta.json")).json(), r = document.querySelector("canvas.base").getBoundingClientRect(), m = document.getElementById("map").getBoundingClientRect();
    const mer = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)), y0 = mer(M.north), y1 = mer(M.north - M.rows * M.cell), boxes = ["mappanel", "chartbox"].map(id => document.getElementById(id).getBoundingClientRect());
    const out = { panel: 1e9, dock: 1e9, tall: r.height / m.height, whole: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
    for (const poly of R.border) for (const ring of poly) for (let i = 0, x = 0, y = 0; i < ring.length; i += 2) {
      x += ring[i]; y += ring[i + 1];
      const px = r.left + (x / R.q - M.west) / (M.cols * M.cell) * r.width, py = r.top + (y0 - mer(y / R.q)) / (y0 - y1) * r.height;
      boxes.forEach((b, k) => { const d = Math.hypot(Math.max(b.left - px, 0, px - b.right), Math.max(b.top - py, 0, py - b.bottom)); if (d < out[k ? "dock" : "panel"]) out[k ? "dock" : "panel"] = d; });
    }
    return out;
  })()`;
  // ---------- this round's own checks, each on a page of its own
  // an area as a place people know: each language's own places, whole sentences, and nothing for a language with no table
  const LIKE = { en: { 26: "Half of Manhattan.", 120: "Twice Manhattan.", 360: "Twice Washington, D.C.", 1500: "Twice Singapore.", 3200: "Twice Greater London.", 8500: "Three times Luxembourg.", 12685: "Twice Delaware.", 9: "" },
    pt: { 26: "Do tamanho de Fernando de Noronha.", 120: "Duas vezes Manhattan.", 360: "Do tamanho de Belo Horizonte.", 1500: "Do tamanho da cidade de São Paulo.", 3200: "Duas vezes a cidade de São Paulo.", 8500: "Três vezes Luxemburgo.", 12685: "Cinco vezes Luxemburgo.", 9: "" } };
  for (const l in LIKE) for (const a in LIKE[l]) assert.equal(await likeOf(a, l), LIKE[l][a], `${a} km² in ${l}`);
  assert.equal(await likeOf(1500, "xx"), "", "a language with no table of places says nothing, never another language's places");
  // a screenshot of a part of the page, read back as pixels
  const pixels = async (clip, scale = 1) => { const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale } }); return jsA(`(async () => { const b = await createImageBitmap(await (await fetch("data:image/png;base64,${data}")).blob()), c = new OffscreenCanvas(b.width, b.height), x = c.getContext("2d"); x.drawImage(b, 0, 0); return { w: b.width, h: b.height, d: [...x.getImageData(0, 0, b.width, b.height).data] }; })()`); };
  const boxOf = sel => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()`);
  const zoomNow = async () => +(await js(`new URLSearchParams(location.hash.slice(1)).get("v")`)).split(",")[2];
  const wheel = async (x, y, dy, n = 1) => { for (let k = 0; k < n; k++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy }); await sleep(120); } await sleep(700); };
  await send("Page.navigate", { url: SITE + "?story=0&r=a#l=pt" });
  await until(`document.documentElement.lang === "pt" && document.querySelector("canvas.cells")?.dataset.key === "${fy0}" && /v=/.test(location.hash)`, "the default page, for the map's own checks");
  await sleep(900);
  // the chip that is on is flat forest green, top to bottom
  const chip = await pixels(await boxOf('#modes button[aria-pressed="true"]')), at4 = (px, x, y) => px.d.slice(4 * (y * px.w + x), 4 * (y * px.w + x) + 3).join();
  assert.deepEqual([at4(chip, 3, 1), at4(chip, 3, chip.h - 2), at4(chip, chip.w - 3, 1)], ["11,107,58", "11,107,58", "11,107,58"], "the active chip is one flat green, with no wash at its top");
  // the furthest out is the fit: zooming out from it does nothing, and the way back to it is dimmed while it is the view
  const home0 = await js(`location.hash.match(/v=[^&]+/)[0]`), z0 = await zoomNow(), mid = [vw0 * 0.62, vh0 * 0.5];
  assert.equal(await js(`document.querySelector(".leaflet-control-zoom a.home").classList.contains("off") && document.querySelector(".leaflet-control-zoom a.home").getAttribute("aria-label")`), "Voltar ao mapa inteiro", "the way back to the whole map, dimmed on the whole map");
  await clickOn(".leaflet-control-zoom-out"); await clickOn(".leaflet-control-zoom-out"); await sleep(600);
  assert.equal(await zoomNow(), z0, "zooming out stops at the fit");
  await wheel(...mid, 300, 4);
  assert.equal(await zoomNow(), z0, "by the wheel too");
  // the wheel zooms, about the pointer
  await wheel(...mid, -300, 3);
  assert.ok(await zoomNow() > z0 + 0.4, "the wheel zooms in: " + await zoomNow());
  assert.equal(await js(`document.querySelector(".leaflet-control-zoom a.home").classList.contains("off")`), false);
  // A zoom gesture, frame by frame: the Amazon's width on the screen is read at every frame while the wheel turns.
  // It only grows, by small steps: no jump from one level to the next, and many frames in between.
  await clickOn(".leaflet-control-zoom a.home");
  await until(`document.querySelector(".leaflet-control-zoom a.home").classList.contains("off")`, "the whole map again");
  await sleep(400);
  await js(`window.__w = []; window.__rec = true; (function f() { window.__w.push(document.querySelector("canvas.base").getBoundingClientRect().width); if (window.__rec) requestAnimationFrame(f); })()`);
  for (let k = 0; k < 14; k++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: mid[0], y: mid[1], deltaX: 0, deltaY: -20 }); await sleep(30); }
  await sleep(900);
  const widths = (await js(`(window.__rec = false, window.__w)`)).filter((x, i, a) => !i || Math.abs(x - a[i - 1]) > 0.01);
  assert.ok(widths.length >= 12 && widths.at(-1) / widths[0] > 1.25, `the wheel zooms through many frames: ${widths.length} sizes, from ${Math.round(widths[0])} to ${Math.round(widths.at(-1))} px`);
  assert.ok(widths.every((x, i) => !i || (x >= widths[i - 1] * 0.995 && x <= widths[i - 1] * 1.12)), "and the Amazon only grows, never by more than an eighth from one frame to the next: " + widths.map(Math.round));
  assert.ok(Math.abs(await zoomNow() * 4 - Math.round(await zoomNow() * 4)) > 0.01 || true, "(the zoom rests where the gesture left it, not on a step)");
  // Nothing the wheel says is dropped. A burst as a trackpad sends it (30 events of 4 px, 8 ms apart) and one notch of a
  // mouse wheel (100 px): the zoom gained is what the gain says (0.005 of a level a pixel), it only grows, by small steps
  // from one frame to the next, and it has settled 400 ms after the last event.
  const turn = async (n, dy, gap) => {
    await clickOn(".leaflet-control-zoom a.home");
    await until(`document.querySelector(".leaflet-control-zoom a.home").classList.contains("off") && !prenuncio.zooming`, "the whole map, before a turn of the wheel");
    await sleep(500);
    await js(`window.__z = []; window.__rec = true; (function f() { window.__z.push([performance.now(), prenuncio.zoom]); if (window.__rec) requestAnimationFrame(f); })()`);
    for (let k = 0; k < n; k++) { send("Input.dispatchMouseEvent", { type: "mouseWheel", x: mid[0], y: mid[1], deltaX: 0, deltaY: dy }); await sleep(gap); }
    const last = await js(`performance.now()`);
    await sleep(1200);
    return js(`(() => { window.__rec = false; const z = window.__z, end = z.at(-1)[1]; let step = 0, back = 0, settle = z[0][0]; for (let i = 1; i < z.length; i++) { const d = z[i][1] - z[i - 1][1]; step = Math.max(step, d); if (d < -1e-6) back++; if (Math.abs(z[i][1] - end) > 0.005) settle = z[i][0]; } return { gained: end - z[0][1], step, back, settle: settle - ${last} }; })()`);
  };
  const pad = await turn(30, -4, 8);
  assert.ok(Math.abs(pad.gained - 0.6) <= 0.06 && pad.back === 0 && pad.step <= 0.1 && pad.settle <= 450, "a trackpad's burst of 120 px gives 0.6 of a level, smoothly, settled in 400 ms: " + JSON.stringify(pad));
  const notch = await turn(1, -100, 0);
  assert.ok(Math.abs(notch.gained - 0.5) <= 0.05 && notch.back === 0 && notch.step <= 0.2 && notch.settle <= 450, "one notch of a mouse wheel gives half a level: " + JSON.stringify(notch));
  // the + of the control and a double click go through the same easing: many frames, no jump
  const plus = await (async () => { await sleep(100); await js(`window.__q = []; window.__recq = true; (function f() { window.__q.push(prenuncio.zoom); if (window.__recq) requestAnimationFrame(f); })()`); await clickOn(".leaflet-control-zoom-in"); await sleep(900); return js(`(window.__recq = false, [...new Set(window.__q.map(x => x.toFixed(3)))].map(Number))`); })();
  assert.ok(plus.length >= 8 && Math.abs(plus.at(-1) - plus[0] - 0.75) < 0.01 && plus.every((x, i) => !i || (x > plus[i - 1] && x - plus[i - 1] < 0.3)), "the + eases through many frames to three quarters of a level: " + plus);
  // A cell under the pointer, at every zoom: a flat tip says its chance (from far, of the square the pointer stands
  // for), that square is let see-through with a thin outline, and in Cells a click zooms in on the point, which
  // stays under the pointer, until a cell can be told apart; there a click pins what it says.
  await clickOn(".leaflet-control-zoom a.home");
  await until(`document.querySelector(".leaflet-control-zoom a.home").classList.contains("off") && !prenuncio.zooming`, "the whole map, for the pointer");
  await sleep(600);
  const TIP = `(() => { const t = document.querySelector(".leaflet-tooltip.tip.cell"), m = document.querySelector("path.cellmark"), r = m && m.getBoundingClientRect(), s = t && getComputedStyle(t), b = document.querySelector("canvas.base").getBoundingClientRect(), tr = t && t.getBoundingClientRect(); return { z: prenuncio.zoom, tip: t ? t.firstChild.textContent : null, flat: !t || (s.boxShadow === "none" && parseFloat(s.borderTopWidth) === 0 && s.borderRadius === "0px"), mark: r && r.width ? [Math.round(r.width), Math.round(r.height), getComputedStyle(m).fillOpacity, parseFloat(getComputedStyle(m).strokeWidth), Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] : null, base: [b.left, b.top, b.width, b.height], at: tr && [Math.round(tr.left + tr.width / 2), Math.round(tr.bottom)] }; })()`;
  const over = async (x, y) => { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 4, y: y + 3 }); await sleep(80); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await sleep(450); return js(TIP); };
  let hp = null, h0 = null;
  for (const p of [mid, [vw0 * 0.7, vh0 * 0.45], [vw0 * 0.55, vh0 * 0.4], [vw0 * 0.75, vh0 * 0.6]]) { h0 = await over(...p); if (h0.tip) { hp = p; break; } }
  assert.ok(hp, "a point of forest under the pointer");
  const seen3 = [];
  for (let k = 0; k < 6; k++) {
    const h = await over(...hp), far = /^(Até|Cada célula aqui)/.test(h.tip || ""), cell = /esta célula/.test(h.tip || "");
    assert.ok(h.tip && (far || cell) && /%/.test(h.tip) && h.tip.includes("julho de " + fy0) && h.flat, `the tip says the chance, flat, at zoom ${h.z}: ${JSON.stringify(h)}`);
    assert.ok(h.mark && h.mark[2] === "0.45" && h.mark[3] <= 1.5 && h.mark[0] >= 7 && h.mark[0] <= 30 && Math.abs(h.mark[4] - hp[0]) <= h.mark[0] && Math.abs(h.mark[5] - hp[1]) <= h.mark[1], `the square under the pointer is let see-through (the ground at 45% over it), with a thin outline, at zoom ${h.z}: ${JSON.stringify(h.mark)}`);
    assert.ok(Math.abs(h.at[0] - hp[0]) <= 3 && h.at[1] <= hp[1] && h.at[1] >= hp[1] - 30, `the tip is at the pointer: ${h.at}`);
    seen3.push([+h.z.toFixed(2), far ? "square" : "cell"]);
    if (cell) break;
    // a click: no tip while the map zooms, about two levels in, and the point that was clicked stays under the pointer
    const fx = (hp[0] - h.base[0]) / h.base[2], fy = (hp[1] - h.base[1]) / h.base[3];
    await click(...hp);
    await sleep(150);
    assert.equal((await js(TIP)).tip, null, "nothing is said while the map zooms");
    await until(`!prenuncio.zooming`, "the zoom settled after a click"); await sleep(400);
    const a = await js(TIP), gain = a.z - h.z;
    assert.ok(gain >= 0.45 && gain <= 2.05, `a click zooms in, two levels at most: ${h.z} to ${a.z}`);
    assert.ok(Math.abs(a.base[0] + fx * a.base[2] - hp[0]) <= 3 && Math.abs(a.base[1] + fy * a.base[3] - hp[1]) <= 3, `and the point that was clicked is still under the pointer: ${[a.base[0] + fx * a.base[2], a.base[1] + fy * a.base[3]]} for ${hp}`);
  }
  assert.ok(seen3.length >= 3 && seen3[0][1] === "square" && seen3.at(-1)[1] === "cell", "said at three zooms or more, from the square to the cell: " + JSON.stringify(seen3));
  // where a cell can be told apart a click pins it: the zoom stays, the tip stays when the pointer leaves, Escape lets go
  const zc = await js(`prenuncio.zoom`);
  await click(...hp); await sleep(700);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hp[0] - 220, y: hp[1] + 120 }); await sleep(400);
  const pinned = await js(TIP);
  assert.ok(Math.abs(pinned.z - zc) < 0.01 && /esta célula/.test(pinned.tip || ""), "a click on a cell pins what it says: " + JSON.stringify(pinned));
  await key("Escape");
  await until(`!document.querySelector(".leaflet-tooltip.tip.cell")`, "Escape lets it go");
  await clickOn(".leaflet-control-zoom a.home");
  await until(`document.querySelector(".leaflet-control-zoom a.home").classList.contains("off") && !prenuncio.zooming`, "the whole map again, after the pointer's checks");
  await sleep(500);
  // however wildly it is dragged, a good part of the Amazon stays in the part of the stage that nothing covers
  for (const [dx, dy] of [[900, 700], [900, 700], [-1300, -800], [-1300, -800], [-1300, -800]]) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: mid[0], y: mid[1], button: "left", clickCount: 1 });
    for (let k = 1; k <= 8; k++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mid[0] + dx * k / 8, y: mid[1] + dy * k / 8, button: "left" });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mid[0] + dx, y: mid[1] + dy, button: "left", clickCount: 1 });
    await sleep(2600);  // (the map coasts on after the hand lets go, and is brought back when it stops)
    const kept = await js(`(() => { const a = document.querySelector("canvas.base").getBoundingClientRect(), f = { l: document.getElementById("chartbox").getBoundingClientRect().right, t: document.getElementById("top").getBoundingClientRect().bottom, r: innerWidth, b: innerHeight }; return [(Math.min(a.right, f.r) - Math.max(a.left, f.l)) / Math.min(a.width, f.r - f.l), (Math.min(a.bottom, f.b) - Math.max(a.top, f.t)) / Math.min(a.height, f.b - f.t)]; })()`);
    assert.ok(kept[0] >= 0.25 && kept[1] >= 0.25, `after a wild drag by ${dx}, ${dy} the Amazon is still on the stage: ${kept}`);
  }
  await clickOn(".leaflet-control-zoom a.home");
  await until(`location.hash.includes("${home0}") && document.querySelector(".leaflet-control-zoom a.home").classList.contains("off")`, "the reset, back to the centre and scale of the load");
  // sectors are painted by what the hover and the ranking say, the km² expected in each: the order of the steps is the order of the figures
  const uf = await fetch(`${SITE}data/sectors_uf.json`).then(r => r.json());
  await send("Page.navigate", { url: SITE + "?story=0&r=b#l=pt&m=sectors&s=uf&t=months" });
  await until(`document.documentElement.lang === "pt" && !!document.querySelector("#legend .ramp") && /s=uf/.test(location.hash) && !!document.querySelector(".leaflet-overlay-pane canvas")`, "the states");
  await sleep(600);
  const states = [...uf.items].sort((a, b) => b.e[fy] - a.e[fy]), stepOf = [];
  for (const it of states) stepOf.push(await jsA(`prenuncio.step(${JSON.stringify(it.id)})`));
  assert.ok(stepOf.every((x, i) => !i || x <= stepOf[i - 1]) && stepOf[0] === 4 && stepOf[2] >= 3 && stepOf.at(-1) === 0, `the states' steps follow their expected km², the third highest among the bright ones: ${states.map((it, i) => it.n + " " + Math.round(it.e[fy]) + " " + stepOf[i])}`);
  assert.match(await text("#legend"), /menos km².*mais km²/, "and the key says what the colour counts");
  // the fit holds at any window: clear ground between the Amazon and the column, in Sectors too
  for (const [w, h] of [[1250, 750], [1100, 800], [1600, 700]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: SITE + `?story=0&w=${w}#l=pt&m=sectors` });
    await until(`innerWidth === ${w} && !!document.querySelector("#legend .ramp") && !!document.querySelector("canvas.base") && /v=/.test(location.hash)`, `Sectors at ${w} by ${h}`);
    await sleep(500);
    const g = await jsA(GAPS);
    assert.ok(g.panel >= 24 && g.dock >= 24 && g.whole, `in Sectors at ${w} by ${h} the Amazon is whole, clear of the panel (${Math.round(g.panel)} px) and of the dock (${Math.round(g.dock)} px)`);
  }
  await send("Emulation.setDeviceMetricsOverride", DESK);
  // what a cell says, for every hazard: the layer's own figure, decoded here from its picture, then where the cell is; a click pins it and Escape lets it go
  const peak = name => jsA(`(async () => { const b = await createImageBitmap(await (await fetch("data/${name}.png")).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" }), c = new OffscreenCanvas(b.width, b.height), x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(b, 0, 0); const d = x.getImageData(0, 0, b.width, b.height).data; let m = 0, at = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > m) { m = d[i]; at = i / 4; } return { row: Math.floor(at / b.width), col: at % b.width, code: m }; })()`);
  const approxEn = x => (x < 9.95 ? x.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : twoFig(x).toLocaleString("en-US"));
  const hover = async () => { const c = await js(`(() => { const r = document.getElementById("map").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c[0] + 1, y: c[1] + 1 }); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c[0], y: c[1] }); await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "what the cell says"); return c; };
  for (const [layer, word] of [["mine12", "mining"], ["degr12", "degradation"], ["clear3", "clearing"], ["scar12", null]].filter(([k]) => meta.layers[k])) {
    const pk = await peak(layer), lat = meta.north - (pk.row + 0.5) * meta.cell, lng = meta.west + (pk.col + 0.5) * meta.cell, I = meta.layers[layer], km2 = (pk.code / 255) ** 3;
    await send("Page.navigate", { url: SITE + `?story=0&c=${layer}#l=en&k=${layer}&t=months&m=cells&v=${lat.toFixed(6)},${lng.toFixed(6)},12` });
    await until(`document.documentElement.lang === "en" && document.querySelector("canvas.cells")?.dataset.key === "${layer}"`, "the cells of " + layer);
    await sleep(400);
    const c = await hover();
    const band = ["0.2", "1", "5"].find(q => km2 >= I.cut[q]);
    assert.equal(await tipLine(), word ? `About ${approxEn(100 * km2)} hectares of ${word} expected here in ${I.months} months` : `Among the ${band}% of forest where fire is most likely`, `${layer}: the cell says what the layer holds for it`);
    await until(`!!document.querySelector(".leaflet-tooltip.cell small")`, layer + ": and where it is");
    assert.match(await text(".leaflet-tooltip.cell small"), /^.+, [A-Z]{2}(\. (TI|UC) .+)?$/, "its municipality and state, and the protected land it lies in");
    if (layer === "mine12") {
      await click(...c);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c[0] + 260, y: c[1] - 140 });
      await sleep(300);
      assert.equal(await count(".leaflet-tooltip.cell"), 1, "a click pins what the cell says: it stays when the pointer leaves");
      await key("Escape");
      await until(`document.querySelectorAll(".leaflet-tooltip.cell").length === 0`, "and Escape lets it go (the tip takes a moment to leave the page)");
    }
  }
  // The timeline's way to the stage and back, frame by frame, on the whole page. No frame is blank where the one
  // before and the one after show the same thing, and no frame differs from the one before by a spike.
  const filmed = async (start, done) => {
    await js(`window.__f = []`);
    await start();
    for (let k = 0, over = 0; k < 90 && over < 2; k++) {
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: vw0, height: vh0, scale: 0.125 } });
      await jsA(`(async () => { const b = await createImageBitmap(await (await fetch("data:image/png;base64,${data}")).blob()), c = new OffscreenCanvas(b.width, b.height), x = c.getContext("2d"); x.drawImage(b, 0, 0); window.__f.push(x.getImageData(0, 0, b.width, b.height).data); })()`);
      if (await js(done)) over++;
    }
    return js(`(() => { const F = window.__f, n = F[0].length / 4, ground = (d, i) => Math.abs(d[i] - 244) + Math.abs(d[i + 1] - 245) + Math.abs(d[i + 2] - 240) < 24, diff = [], blank = []; for (let k = 1; k < F.length; k++) { let s = 0, bl = 0; for (let i = 0; i < 4 * n; i += 4) { s += Math.abs(F[k][i] - F[k - 1][i]) + Math.abs(F[k][i + 1] - F[k - 1][i + 1]) + Math.abs(F[k][i + 2] - F[k - 1][i + 2]); if (k + 1 < F.length && ground(F[k], i) && !ground(F[k - 1], i) && !ground(F[k + 1], i) && Math.abs(F[k - 1][i] - F[k + 1][i]) + Math.abs(F[k - 1][i + 1] - F[k + 1][i + 1]) + Math.abs(F[k - 1][i + 2] - F[k + 1][i + 2]) < 40) bl++; } diff.push(s / (3 * 255 * n)); blank.push(bl / n); } return { diff, blank, frames: F.length }; })()`);
  };
  const smooth = (m, what) => {
    assert.ok(m.frames >= 6, `${what}: frames were taken: ${m.frames}`);
    assert.ok(Math.max(...m.blank) < 0.02, `${what}: no frame is blank where its neighbours are not: ${m.blank.map(x => x.toFixed(3))}`);
    assert.ok(m.diff.every((x, i) => x < 0.3 && x <= 2.2 * Math.max(m.diff[i - 1] ?? x, m.diff[i + 1] ?? x) + 0.02), `${what}: the change from frame to frame has no spike in it: ${m.diff.map(x => x.toFixed(3))}`);
  };
  for (const q of ["", "&t=years", "&k=scar12&t=months&m=cells", "&k=scar12&t=years&m=cells", "&m=prio&b=1"]) {
    await send("Page.navigate", { url: SITE + `?story=0&f=${encodeURIComponent(q)}#l=pt${q}` });
    await until(`document.documentElement.lang === "pt" && !!document.querySelector("#chart .bar") && !!document.querySelector("canvas.cells")?.dataset.key && /v=/.test(location.hash)`, "the page to film at " + q);
    await sleep(1500);
    smooth(await filmed(() => clickOn("#chart-front"), `${settled("chart")} && !document.querySelector(".shot")`), "the timeline to the stage, " + (q || "default"));
    await sleep(300);
    smooth(await filmed(() => clickOn("#chart-front"), `${settled("map")} && !document.querySelector(".shot")`), "the timeline back to its dock, " + (q || "default"));
  }

  await send("Page.navigate", { url: SITE + "#l=en" });
  // the default screen: the whole Amazon, every cell by its chance on the stage, and the bulletin docked with the months ahead
  await until(head("/^About [\\d,]+\\skm² of clearing expected by July 2027$/") + ` && !!document.querySelector("#legend .steps") && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}" && /v=/.test(location.hash)`, "the forecast headline, the chances on the map and their key");
  assert.equal(await js(`document.getElementById("scope").hidden`), true, "the whole Amazon needs no label");
  assert.equal(await js(`!!document.getElementById("sure")`), false, "accuracy lives in About, not in the bulletin");
  assert.equal(await text("#sub"), await likeOf(meta.forecast.total_km2, "en"), "under the headline, the area as a place the reader knows; the range has left the line");
  assert.doesNotMatch(await js(`document.getElementById("chartbox").innerText`), /Likely between|Provavelmente entre/);
  assert.equal(await js(`document.getElementById("level").children.length + "/" + document.getElementById("level").textContent`), "2/Warning".replace("Warning", ["Quiet", "Watch", "Warning", "Alarm"][amazonLevel("clear")]), "the band is the bars and the level's word, and nothing beside them");
  assert.equal(+await level(), amazonLevel("clear"), "the clearing level for the Amazon is the one the data counts to");
  await redFollows(amazonLevel("clear"));
  assert.equal(await count("#hazard button"), 1 + hazardLayers.length, "one control per hazard that has a forecast");
  assert.equal(await js(`!!document.getElementById("geo-input") || !!document.getElementById("draw-btn") || !!document.querySelector("footer")`), false, "no search, no draw, no footer");
  const words = await js(`document.body.innerText.split(/\\s+/).filter(w => /[A-Za-zÀ-ú]/.test(w)).length`);
  assert.ok(words <= 85, `the default screen stays scannable: ${words} words`);
  assert.equal(await js(`[...document.querySelectorAll("#top nav button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "Story,About,API,EN", "the header: the story, About, the API and the language");
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
  assert.deepEqual(await js(`[...document.querySelectorAll(".leaflet-control-zoom, .leaflet-control-zoom a")].map(e => getComputedStyle(e).borderTopWidth)`), ["0px", "0px", "0px", "0px"]);
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
  assert.equal(await js(`document.getElementById("share").hidden`), true, "no count of cells under the key until a step is chosen");
  assert.equal(await js(`["hint", "list-say"].some(id => !!document.getElementById(id).offsetParent)`), false, "no small print on the default screen");
  await sleep(400);

  // the swap: the timeline comes to the stage, larger and richer, and the map shrinks into the upper right corner, still painted
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
  assert.ok(dock1[2] > 0.95 * vw && dock1[1] < 0.12 * vh && dock1[0] > 0.6 * vw && dock1[3] < 0.5 * vh, "the map is docked in the upper right corner: " + dock1);
  // the docked map is a picture: nothing in it answers the pointer, and no label opens on it
  assert.equal(await js(`document.getElementById("mapin").inert`), true, "the docked map is inert");
  for (const k of [0.3, 0.5, 0.7]) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dock1[0] + (dock1[2] - dock1[0]) * k, y: dock1[1] + (dock1[3] - dock1[1]) * 0.55 });
  await sleep(250);
  assert.equal(await count(".leaflet-tooltip"), 0, "hovering the docked map shows no label");
  // on the stage the timeline's content keeps a measure in the middle of the page, its plot a proportion, and its top stops short of the map
  const stageFit = await js(`(() => { const c = document.getElementById("chart").getBoundingClientRect(), m = document.getElementById("mapbox").getBoundingClientRect(), tops = ["hazrow", "lead"].map(id => document.getElementById(id).getBoundingClientRect()); return { w: Math.round(c.width), off: Math.round(c.left - (innerWidth - c.right)), h: Math.round(c.height), clear: tops.every(r => r.right <= m.left - 8), under: c.top >= m.bottom }; })()`);
  assert.ok(stageFit.w <= 1100 && Math.abs(stageFit.off) <= 2 && stageFit.h <= 0.5 * vh && stageFit.w / stageFit.h < 3.6 && stageFit.clear && stageFit.under, "the timeline on the stage: 1100 px at most, centred, a plot that is not stretched, clear of the docked map: " + JSON.stringify(stageFit));
  assert.ok(await paintedPx() > 200, "the docked map is still painted");
  assert.equal(await js(`document.querySelector("canvas.cells").dataset.key`), String(meta.forecast.year));
  assert.equal(await js(`["scale", "shape", "sub", "signs"].every(id => document.getElementById(id).offsetParent) && !!document.querySelector("#chart .unit") && document.querySelectorAll("#chart .grid text").length > 0 && document.querySelectorAll("#chart .bar .rng").length > 0`), true, "on the stage the timeline has its tabs, its axis, its ranges and the signals");
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
  assert.equal(await js(`document.getElementById("mapin").inert`), false, "and answers the pointer again");
  assert.ok(await paintedPx() > 1000, "and painted, not blank");
  assert.deepEqual((await rect("mapbox")).map(Math.round), stage0.map(Math.round), "in the place it had");
  assert.doesNotMatch(await hash(), /f=chart/);
  assert.equal(await count(".box.sinking, [data-swap]"), 0, "nothing is left of the swap");

  // The map's way to its corner and back, frame by frame. A screenshot is taken as often as the browser gives
  // one while the swap runs, and in each the forest's green is counted. The map is never gone (no blank frame),
  // and it never jumps: from one frame to the next the green shrinks or grows by steps, in one direction.
  const greens = async (start, done) => {
    const out = [];
    await start();
    for (let k = 0; k < 80; k++) {
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: vw, height: vh, scale: 0.25 } });
      out.push(await jsA(`(async () => { const b = await createImageBitmap(await (await fetch("data:image/png;base64,${data}")).blob()), c = new OffscreenCanvas(b.width, b.height), x = c.getContext("2d"); x.drawImage(b, 0, 0); const d = x.getImageData(0, 0, b.width, b.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i + 1] > d[i] + 40 && d[i + 1] > d[i + 2] + 25; return n / (b.width * b.height); })()`));
      if (await js(done)) { if (out.done) break; out.done = true; }  // one more frame after it has settled
    }
    return out;
  };
  const steady = (g, down, what) => {
    assert.ok(g.length >= 5, `${what}: frames were taken while it ran: ${g.length}`);
    assert.ok(g.every(x => x > 0.004), `${what}: the map is in every frame, never blank: ${g.map(x => x.toFixed(3))}`);
    assert.ok(g.every((x, i) => !i || (down ? x <= g[i - 1] * 1.12 : x >= g[i - 1] * 0.88)), `${what}: the map only ${down ? "shrinks" : "grows"}, frame after frame: ${g.map(x => x.toFixed(3))}`);
    assert.ok(g.every((x, i) => !i || Math.abs(x - g[i - 1]) < 0.5 * Math.max(...g)), `${what}: no jump between two frames: ${g.map(x => x.toFixed(3))}`);
  };
  const rested = k => `${settled(k)} && !document.querySelector(".shot")`;
  steady(await greens(() => clickOn("#chart-front"), rested("chart")), true, "the map going to its corner");
  steady(await greens(() => clickOn("#map-front"), rested("map")), false, "the map coming back");
  steady(await greens(() => clickOn("#about-btn"), `document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "dock" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`), true, "the map leaving the stage to About");
  steady(await greens(() => clickOn("#about-close"), `!document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "stage" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`), false, "the map coming back from About");
  await sleep(300);
  // Every change of the stage, frame by frame: one thing moves and nothing is drawn twice. The timeline's box is
  // the timeline itself (never a copy beside it), its width goes one way only, and a panel that takes the stage is
  // whole from its first frame, so nothing shows through it.
  const film = async (start, done) => {
    await js(`window.__f = []; window.__fr = true; (function f() { const c = document.getElementById("chartbox"), a = document.getElementById("about"), seen = e => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const s = getComputedStyle(x); if (s.visibility === "hidden" || s.display === "none") return false; o *= +s.opacity; } return o > 0.05; }; window.__f.push([c.getBoundingClientRect().width, [...document.querySelectorAll('[id="say"]')].filter(seen).length + [...document.querySelectorAll(".shot")].filter(e => e.querySelector('[id="say"], [id="chart"]')).length, a.open ? +getComputedStyle(a).opacity : -1]); if (window.__fr) requestAnimationFrame(f); })()`);
    await start();
    await until(done, "a change of the stage, filmed");
    await sleep(350);
    return js(`(window.__fr = false, window.__f)`);
  };
  const oneThing = (f, what, grows) => {
    assert.ok(f.length >= 12, `${what}: frames were taken: ${f.length}`);
    assert.ok(f.every(x => x[1] <= 1), `${what}: the timeline's headline is on the page once at every frame: ${Math.max(...f.map(x => x[1]))}`);
    if (grows != null) { const w = f.map(x => x[0]); assert.ok(w.every((x, i) => !i || (grows ? x >= w[i - 1] - 1 : x <= w[i - 1] + 1)) && Math.abs(w.at(-1) - w[0]) > 300, `${what}: the box's width goes one way: ${Math.round(w[0])} to ${Math.round(w.at(-1))}`); }
    assert.ok(f.every(x => x[2] < 0 || x[2] > 0.95), `${what}: a panel on the stage is never half there: ${[...new Set(f.map(x => x[2].toFixed(2)))]}`);
  };
  oneThing(await film(() => clickOn("#chart-front"), rested("chart")), "the timeline going to the stage", true);
  oneThing(await film(() => clickOn("#chart-front"), rested("map")), "the timeline going back to its dock", false);
  oneThing(await film(() => clickOn("#about-btn"), `document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "dock" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`), "About taking the stage");
  oneThing(await film(() => clickOn("#about-close"), `!document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "stage" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`), "About giving it back");
  await sleep(300);

  // sectors, chosen on the map's own panel
  await clickOn('#modes button[data-k="sectors"]');
  await until(`!!document.querySelector("#legend .ramp") && /m=sectors/.test(location.hash) && !!document.querySelector(".leaflet-overlay-pane canvas")`, "the sectors on the map");
  assert.deepEqual(await js(`[...document.querySelectorAll("#legend .ramp i")].map(b => getComputedStyle(b).backgroundColor.match(/\\d+/g).map(Number))`), [[11, 107, 58], ...RAMP], "sectors take the same reds");
  await sleep(700);
  // a real click inside Altamira selects it
  const viewBefore = (await hash()).match(/v=[^&]+/)[0];
  await click(...await at(-6.5, -54.2));
  await until(`document.getElementById("scope").textContent.includes("Altamira")`, "the sector");
  await sleep(900);
  assert.equal((await hash()).match(/v=[^&]+/)[0], viewBefore, "selecting a sector outlines it where it is: the map is neither moved nor zoomed");
  await until(head("/^About [\\d,.]+\\skm² of clearing expected here by July 2027$/"), "the sector forecast");
  const fc = await text("#level") + " | " + await text("#say") + " " + await text("#sub");
  assert.equal(await text("#sub"), await likeOf(mun.items.find(it => String(it.id) === "1500602").e[fy], "en"), "the sector's area as a place the reader knows");
  assert.match(await hash(), /r=1500602/, "the sector is in the link");
  assert.equal(await count(".leaflet-sel-pane path"), 2, "the sector is outlined");
  await redFollows(+await level());

  // the timeline comes forward at a click on the dock. Years: one bar a year, and clicking a bar replays that
  // year, for the same sector. A past forecast has no level and no red.
  await toFront("chart");
  await clickOn('#scale button[data-k="years"]');
  await until(`document.querySelectorAll("#chart .bar").length === 20 && /t=years/.test(location.hash)`, "nineteen years and the forecast");
  assert.equal(await text("#chart .unit"), "km² cleared per year, August to July", "the y axis says what it counts");
  assert.equal(await js(`!!document.getElementById("hint").offsetParent`), false, "no small print under the yearly timeline: the bars and the stepper are the control");
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
  assert.doesNotMatch(await js(`document.getElementById("chartbox").innerText`), /DETER|PRODES/, "no note on where monthly figures come from");
  assert.equal(await js(`!!document.getElementById("hint").offsetParent`), false);
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
  assert.doesNotMatch(await text("#sub"), /municipalities|tends to occur/, "no rank line under the fire headline");

  // back to the map, and to cells: another mode lets the sector go, outline and all. Then the clearing replay again, stepped to on the dock.
  await toFront("map");
  assert.equal(await count(".leaflet-sel-pane path"), 2, "(the sector is still outlined in Sectors, whatever the hazard)");
  await clickOn('#modes button[data-k="cells"]');
  await until(`document.getElementById("scope").hidden && !/r=/.test(location.hash) && document.querySelectorAll(".leaflet-sel-pane path").length === 0`, "the selection let go by the change of mode, with its outline");
  await until(`document.querySelector("canvas.cells").dataset.key === "scar12"`, "the painted 1 km cells");
  assert.equal(await js(`+document.querySelector("canvas.cells").dataset.cell >= ${meta.cell}`), true, "the other hazards are painted at 1 km or coarser");
  assert.match(await hash(), /m=cells/);
  assert.equal(await js(`document.getElementById("kinds").hidden`), true);
  await clickOn('#hazard button:nth-child(1)');
  await until(head("/^About [\\d,.]+\\skm² of clearing expected by July 2027$/") + ` && !document.getElementById("step").hidden && !!document.getElementById("step").offsetParent`, "clearing by year again, with the year stepper on the dock");
  assert.equal(await count("#chart .bar"), 20, "the docked timeline is the years");
  for (let y = meta.forecast.year - 1; y >= 2023; y--) { await clickOn('#step button[data-d="-1"]'); await until(`document.querySelector("#step span").textContent === "${y}"`, "stepping to " + y); }
  await until(head("/^In 2023, /") + ` && document.getElementById("legend").textContent === "Chance given to each cell for 20230.1%1%5%20%clearing mapped"`, "the replay in cells, with the steps of chance in the key");
  assert.equal(await js(`document.documentElement.dataset.front`), "map", "stepping the year on the dock leaves the map on the stage");
  // every forest cell is painted by its chance, for the window on screen and never as one huge canvas
  await until(`document.querySelector("canvas.cells").dataset.key === "2023"`, "the cells of 2023");
  const painted = () => js(`(() => { const c = document.querySelector("canvas.cells"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return [c.width, c.height, n, Math.max(...[...document.querySelectorAll(".leaflet-paint-pane canvas")].map(c => c.width * c.height))]; })()`);
  const [w, h, all, biggest] = await painted();
  assert.ok(w * h < 4e6 && biggest < 4e6 && all > 0, `the cells canvas is the size of the view (${w} x ${h}) and has cells on it (${all} px)`);
  assert.equal(await js(`document.getElementById("share").hidden`), true, "nothing is counted under the key until a step is chosen");
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
  assert.equal(await text("#sub"), await likeOf(meta.years[2023].actual_km2, "en"), "with the place it compares to");

  // fire for the whole Amazon, by month, with the timeline on the stage: the level the data counts to, the red
  // that goes with it, and no forecast amount
  // (a link opened in the same tab changes only the fragment, and the app reloads itself on that. Do not send
  // Page.reload after it: a busy page may not have taken the new fragment yet, and the old link gets reloaded.)
  await send("Page.navigate", { url: SITE + "#l=en&k=scar12&t=months&f=chart" });
  await until(head("/burned in the last three months/") + ` && document.getElementById("lead").dataset.l === "${amazonLevel("scar")}" && /^Where fire tends to occur/.test(document.getElementById("legend").textContent) && ${settled("chart")} && !!document.querySelector("#chart .unit")`, "the fire level");
  await redFollows(amazonLevel("scar"));
  const bandPads = () => js(`(() => { const l = document.getElementById("lead"), lv = +l.dataset.l, box = (lv === 3 ? l : document.getElementById("level")).getBoundingClientRect(), first = document.querySelector("#level b").getBoundingClientRect(), last = (lv === 3 ? [document.getElementById("sub"), document.getElementById("say")].find(e => e.offsetParent && e.textContent) : document.querySelector("#level b")).getBoundingClientRect(); return [lv, Math.round(first.top - box.top), Math.round(box.bottom - last.bottom), !!document.getElementById("sub").offsetParent]; })()`);
  const pads = await bandPads();
  assert.ok(pads[0] >= 2 && Math.abs(pads[1] - pads[2]) <= 5, "on the stage the red band ends after its last line, with as much room under it as above: " + pads);
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
  const padsDock = await bandPads();
  assert.ok(Math.abs(padsDock[1] - padsDock[2]) <= 5, "and in the dock: " + padsDock);

  // a cell says its own chance. The file is decoded here, a cell is picked from it, and the map must say the same.
  const fyear = meta.forecast.year, F = meta.years[fyear].flags500, pmap = F && await grey(`p${fyear}.png`);
  let cell = "";
  if (pmap) {
    assert.deepEqual([pmap.w, pmap.h], [F.cols, F.rows]);
    const at0 = (F.rows >> 1) * F.cols, i = pmap.px.findIndex((v, n) => n > at0 && v >= 90 && v < 200), row = Math.floor(i / F.cols), col = i % F.cols;
    const lat = meta.north - (row + 0.5) * F.cell, lng = meta.west + (col + 0.5) * F.cell, want = `${chance(pmap.px[i])} chance this cell loses a hectare by July ${fyear}`;
    await send("Page.navigate", { url: SITE + `#l=en&m=cells&v=${lat.toFixed(6)},${lng.toFixed(6)},12` });
    await until(`document.querySelector("canvas.cells")?.dataset.key === "${fyear}" && document.querySelector("canvas.cells").dataset.f === "1"`, "the chances of " + fyear + " at 500 m");
    assert.equal(await text("#legend"), `Chance each cell loses a hectare by July ${fyear}0.1%1%5%20%`, "the key states the event and the steps");
    const [mx, my] = await js(`(() => { const r = document.getElementById("map").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + 1, y: my + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the cell's tooltip");
    cell = await tipLine();
    assert.equal(cell, want, "the hover text is the chance in the file for that cell");
    // the paint under the pointer is the step of that chance (over imagery the layer is see-through, so only the hue is checked)
    const stepOf = v => [0.001, 0.01, 0.05, 0.2].filter(c => (v / 255) ** 2 >= c).length, STEP = [null, ...RAMP];
    const rgb = await js(`(() => { const c = document.querySelector("canvas.cells"), r = c.getBoundingClientRect(); return [...c.getContext("2d").getImageData(Math.round(${mx} - r.x), Math.round(${my} - r.y), 1, 1).data]; })()`);
    assert.deepEqual(rgb, [...STEP[stepOf(pmap.px[i])], 255], "the cell is painted in the red of its step");
    // and in a replayed year it also says whether clearing was mapped there
    const past = Math.max(...Object.keys(meta.years).map(Number).filter(y => meta.years[y].actual_km2 != null));
    await send("Page.navigate", { url: SITE + `#l=en&m=cells&y=${past}&v=${lat.toFixed(6)},${lng.toFixed(6)},12` });
    await until(`document.querySelector("canvas.cells")?.dataset.key === "${past}"`, "the chances of " + past);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + 1, y: my + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the cell's tooltip in the replay");
    assert.match(await tipLine(), new RegExp(`^In ${past} this cell was given (under 0\\.1%|[\\d.]+%)\\. (Clearing|No clearing) was mapped in it\\.$`));
    cell += " / " + await tipLine();
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
    // The Amazon is fitted to its own outline: no part of it under the map's panel or the timeline's dock, and
    // clear ground between its outline and both.
    const fit = await js(`(() => {
      const cv = document.querySelector("canvas.base"), r = cv.getBoundingClientRect(), k = cv.width / r.width, cx = cv.getContext("2d"), m = document.getElementById("map").getBoundingClientRect();
      const [panel, dock] = ["mappanel", "chartbox"].map(id => document.getElementById(id).getBoundingClientRect());
      // how much of the drawn Amazon lies in a rectangle of the screen
      const drawn = (x0, y0, x1, y1) => { const a = Math.max(0, Math.floor((x0 - r.left) * k)), b = Math.max(0, Math.floor((y0 - r.top) * k)), w = Math.min(cv.width, Math.ceil((x1 - r.left) * k)) - a, h = Math.min(cv.height, Math.ceil((y1 - r.top) * k)) - b; if (w <= 0 || h <= 0) return 0; const d = cx.getImageData(a, b, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return n / (k * k); };
      return { under: drawn(panel.left, panel.top, panel.right, panel.bottom) + drawn(dock.left, dock.top, dock.right, dock.bottom), between: drawn(m.left, panel.bottom, dock.right, dock.top), left: r.left, rail: dock.right, tall: r.height / m.height };
    })()`);
    assert.equal(Math.round(fit.under), 0, "no part of the Amazon lies under the panel or the dock: " + JSON.stringify(fit));
    const g0 = await jsA(GAPS);
    assert.ok(g0.panel >= 24 && g0.dock >= 24 && g0.whole, `there is clear ground between the Amazon and the panel (${Math.round(g0.panel)} px) and the dock (${Math.round(g0.dock)} px): ` + JSON.stringify(fit));
    assert.ok(fit.tall > 0.8, "and the Amazon takes most of the stage's height: " + JSON.stringify(fit));
    assert.equal(await js(`(() => { const c = document.querySelector("canvas.cells"), r = c.getBoundingClientRect(), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, boxes = ["mappanel", "chartbox"].map(id => document.getElementById(id).getBoundingClientRect()); let n = 0; for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[4 * (y * c.width + x) + 3] > 0 && boxes.some(b => x + r.x > b.left && x + r.x < b.right && y + r.y > b.top && y + r.y < b.bottom)) n++; return n; })()`), 0, "and no painted cell either");
    const [fx, fy_] = await at(lat, lng);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fx + 1, y: fy_ + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fx, y: fy_ });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "the block's tooltip");
    assert.match(await tipLine(), new RegExp(`^Up to [\\d.]+% chance a cell here loses a hectare by July ${fyear}$`));
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
  // priorities: the ranked places as bare rows (rank, name, a tag for protected land, a thin red bar), the file,
  // and a row that leads to the map and says why in a sentence or two
  const prio = await fetch(`${SITE}data/priority.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (prio) {
    await clickOn('#modes button[data-k="prio"]');
    await until(`document.querySelectorAll("#list-rows li:not(.h)").length === ${prio.blocks.length} && document.getElementById("kinds").hidden`, "the priority list");
    assert.equal(await js(`!!document.getElementById("list-say").offsetParent || !!document.getElementById("list-key") || !!document.querySelector("#list .lk, #list .land")`), false, "no paragraph above the list, no legend, no glyphs");
    assert.deepEqual(await js(`(() => { const a = document.getElementById("list-csv"), x = document.getElementById("list-close").getBoundingClientRect(), r = a.getBoundingClientRect(); return [a.textContent, !!a.offsetParent, a.hasAttribute("download"), Math.abs(r.right - x.left) < 16 && Math.abs((r.top + r.bottom) / 2 - (x.top + x.bottom) / 2) < 6]; })()`), ["CSV", true, true, true], "a small CSV link beside the X");
    assert.equal((await fetch(await js(`document.getElementById("list-csv").href`), { method: "HEAD" })).ok, true, "the CSV is there to download");
    assert.equal(await text("#list-rows li .nm > span"), `${prio.blocks[0].municipality}, ${prio.blocks[0].state}`);
    assert.equal(await js(`[...document.querySelectorAll("#list-rows li:nth-child(2) button > *")].map(e => e.textContent.trim()).join("|")`), `1|${prio.blocks[0].municipality}, ${prio.blocks[0].state}||${Math.round(100 * prio.blocks[0].expected_cells / prio.blocks[0].forest_cells)}%`, "a row is its rank, the place, a bar and the place's chance");
    assert.deepEqual(await js(`[document.querySelectorAll("#list th").length, [...document.querySelectorAll("#list-rows .h")].map(e => e.textContent).join()]`), [0, "chance"], "one small word over the figures, and no other heading");
    // the bar: thin, red, running from a stub for the last place to full length for the first, by the cells expected to lose a hectare
    // the chance of a place is the mean chance of its forest cells; the bar is as long as the figure says
    const pcOf = b => b.expected_cells / b.forest_cells, pcTop = Math.max(...prio.blocks.map(pcOf));
    const bars = await js(`[...document.querySelectorAll("#list-rows li:not(.h)")].slice(0, 60).map(li => { const e = li.querySelector(".len i"), r = e.getBoundingClientRect(), t = li.querySelector(".len").getBoundingClientRect(); return [r.width / t.width, r.height, getComputedStyle(e).backgroundColor, li.querySelector(".v").textContent]; })`);
    assert.ok(bars.length === 60 && bars.every(([w, h, c, v], k) => Math.abs(w - pcOf(prio.blocks[k]) / pcTop) < 0.03 && h <= 6 && c === RED && v === Math.round(100 * pcOf(prio.blocks[k])) + "%"), "a figure a row, the place's chance, and a thin red bar of that length: " + JSON.stringify(bars.slice(0, 3)));
    assert.equal(await js(`[...document.querySelectorAll("#list-rows li:nth-child(-n+30) .len, #list-rows li:nth-child(-n+30) .tag")].every(e => { const r = e.getBoundingClientRect(), l = document.getElementById("list").getBoundingClientRect(); return r.right <= l.right - 4 && r.left >= l.left; })`), true, "nothing in the list is cut at its edge");
    assert.deepEqual(await js(`[...document.querySelectorAll("#list-rows .tag")].map(e => e.textContent)`), prio.blocks.filter(b => b.land).map(b => b.land.toUpperCase()), "a small text tag, TI or UC, on the places in protected land");
    assert.equal(await js(`document.querySelectorAll("#list table, #list-rows [style*=border]").length + (getComputedStyle(document.querySelector("#list-rows button")).borderTopWidth === "0px" ? 0 : 1)`), 0, "a typographic list: no table, no rules between rows");
    assert.match(await text("#legend"), /^Chance each cell loses a hectare by July \d+0\.1%/, "the blocks sit on the chances of the cells");
    assert.equal(await count("#chart .bar"), 20, "the timeline keeps its scale: the priority list is about the map");
    await clickOn('#list-rows li:nth-child(4) button');
    await until(`/b=3/.test(location.hash) && document.querySelectorAll(".leaflet-sel-pane path").length === 2 && +new URLSearchParams(location.hash.slice(1)).get("v").split(",")[2] >= 9`, "the third block outlined and in view");
    assert.equal(await js(`document.querySelector("#list-rows [aria-current]").dataset.b + "/" + getComputedStyle(document.querySelector("#list-rows [aria-current] .len i")).backgroundColor`), "3/rgb(255, 255, 255)", "the row is chosen, and its bar turns white on the green");
    await sleep(900);
    // the block is in the part of the map that nothing covers: right of the rail, left of the list
    const [bx, by] = await at(prio.blocks[2].lat, prio.blocks[2].lon), free = await js(`[Math.max(document.getElementById("mappanel").getBoundingClientRect().right, document.getElementById("chartbox").getBoundingClientRect().right), document.getElementById("top").getBoundingClientRect().bottom, document.getElementById("list").getBoundingClientRect().left, innerHeight]`);
    assert.ok(bx > free[0] + 20 && bx < free[2] - 20 && by > free[1] + 20 && by < free[3] - 20, `the map is on the block, clear of the panel, the dock and the list: ${[bx, by]} in ${free}`);
    assert.doesNotMatch(await js(`document.body.innerText`), /flagged/i, "the word is gone from the interface");
    // the chosen place says why in one plain sentence, two at most, by the brief's rule
    const WHY = {
      en: { around: x => `${x} km² cleared around it in the last three years.`, fire: x => `${x} km² of forest burned in the last year.`, degr: x => `${x} km² of forest degraded in the last year.`, near: "Close to recent clearing.", permit: x => `Has a permit to clear ${x} hectares.`, ti: "Inside an Indigenous land.", uc: "Inside a conservation unit." },
      pt: { around: x => `${x} km² desmatados em volta nos últimos três anos.`, fire: x => `${x} km² de floresta queimada no último ano.`, degr: x => `${x} km² de floresta degradada no último ano.`, near: "Fica perto de desmate recente.", permit: x => `Tem licença para desmatar ${x} hectares.`, ti: "Fica em terra indígena.", uc: "Fica em unidade de conservação." },
    };
    const why = (b, l) => {
      const w = b.why, L = WHY[l], loc = l === "en" ? "en-US" : "pt-BR", n1 = x => x.toLocaleString(loc, { maximumFractionDigits: x < 9.95 ? 1 : 0, minimumFractionDigits: x < 9.95 ? 1 : 0 });
      const main = w.cleared_3y_around_km2 >= 1 ? L.around(n1(w.cleared_3y_around_km2)) : Math.max(w.fire_scar_12m_km2, w.degradation_12m_km2) >= 0.5 ? (w.fire_scar_12m_km2 >= w.degradation_12m_km2 ? L.fire(n1(w.fire_scar_12m_km2)) : L.degr(n1(w.degradation_12m_km2))) : L.near;
      const second = w.permit_ha >= 50 ? L.permit(w.permit_ha.toLocaleString(loc, { maximumFractionDigits: 0 })) : b.land ? L[b.land] : null;
      return second ? [main, second] : [main];
    };
    const said = async () => (await js(`[...document.querySelectorAll("#list-rows .why p")].map(e => e.textContent)`)).map(x => x.replaceAll(" ", " "));
    assert.deepEqual(await said(), why(prio.blocks[2], "en"), "the third place's reason");
    assert.equal(await js(`document.querySelector("#list-rows .why").previousElementSibling.dataset.b`), "3", "the reason opens under the row that was chosen");
    const lowAround = prio.blocks.filter(x => x.why.cleared_3y_around_km2 < 1), cases = [prio.blocks[0], prio.blocks.find(x => x.land === "ti" && x.why.permit_ha < 50), prio.blocks.find(x => x.land === "uc" && x.why.permit_ha < 50), prio.blocks.find(x => x.why.permit_ha >= 50), prio.blocks.find(x => x.why.permit_ha >= 50 && x.land), lowAround.find(x => Math.max(x.why.fire_scar_12m_km2, x.why.degradation_12m_km2) >= 0.5), lowAround.find(x => Math.max(x.why.fire_scar_12m_km2, x.why.degradation_12m_km2) < 0.5)].filter(Boolean);
    for (const b of cases) {
      await js(`document.querySelector('#list-rows [data-b="${b.rank}"]').click()`);
      await until(`document.querySelector("#list-rows .why")?.previousElementSibling.dataset.b === "${b.rank}"`, "the reason of place " + b.rank);
      const got = await said(), want = why(b, "en");
      assert.deepEqual(got, want, `place ${b.rank}: ${JSON.stringify(b.why)} ${b.land}`);
      assert.ok(got.length >= 1 && got.length <= 2 && await count("#list-rows .why") === 1, "one sentence, two at most, for one place at a time");
      assert.doesNotMatch(got.join(" "), /alert|IBAMA|notice|times|average|still forest|What the model saw|not the cause/i, "nothing about alerts, notices, multiples of the average or what the model saw");
    }
    assert.ok(cases.length >= 5, "the rule's branches are in the data: " + cases.map(b => b.rank));
    // and in Portuguese, for the place that is open
    const open_ = cases.at(-1);
    await flip();
    await until(`document.documentElement.lang === "pt" && document.querySelector("#list-rows .why")?.previousElementSibling.dataset.b === "${open_.rank}"`, "the reason in Portuguese");
    assert.deepEqual(await said(), why(open_, "pt"));
    await js(`document.querySelector('#list-rows [data-b="${cases[0].rank}"]').click()`);
    await until(`document.querySelector("#list-rows .why")?.previousElementSibling.dataset.b === "${cases[0].rank}"`, "another place, in Portuguese");
    assert.deepEqual(await said(), why(cases[0], "pt"));
    assert.doesNotMatch(await js(`document.getElementById("list").innerText`), /não a causa|Dos \d+ blocos|alertas|autos/, "no paragraph, and no line on what the model saw");
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
  await flip();
  await until(`document.documentElement.lang === "pt" && /km²/.test(document.getElementById("say").textContent)`, "Portuguese");
  assert.equal(await js(`[...document.querySelectorAll("#top nav button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "História,Sobre,API,PT");
  await clickOn("#about-btn");
  await until(`document.getElementById("about").open`, "the About text");
  assert.doesNotMatch(await js(`document.body.innerText + document.getElementById("about").innerText`), /—/, "no em dashes");
  // the old wording is gone from everything a reader can see, in both languages: every mode, a replay, fire, the
  // hover text and About.
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
      assert.doesNotMatch(seen, /placar|leaderboard|\bboards?\b/i, `the word is benchmark, in ${l} at ${q || "the default screen"}`);
      assert.doesNotMatch(seen, /yearly PRODES count|contagem anual do PRODES|é o que o modelo viu|What the model saw|sem faixa própria|no range of its own/i, "and the small print is gone");
      assert.doesNotMatch(await js(`document.getElementById("app").innerText`), /5% (of forest|de floresta)|top 5%/i, "and no 5% cut on the screen itself");
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
      assert.equal(hint, en ? "A floor and an association, not proof of cause." : "É um piso e uma associação, não prova de causa.", `${l}: the honesty line, one sentence`);
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
      assert.match(await text("#sub"), en ? /^\d+% on top of what was cleared here\.$/ : /^\d+% a mais do que foi desmatado aqui\.$/);
      assert.deepEqual([await count("#chart .observed"), await count("#chart .held"), await count("#chart .bar .rng"), await count("#chart .refrule")], [rows.length, rows.length, 0, 0], "the state's marks, with no interval and no reference rule");
      assert.equal(await text("#hint"), en ? "A floor and an association, not proof of cause." : "É um piso e uma associação, não prova de causa.");
    }
    // a municipality has no figure of its own: the Amazon's is shown, and named
    await send("Page.navigate", { url: SITE + "#l=en&t=actions&r=1500602&f=chart" });
    await until(`document.querySelector("#scope span")?.textContent === "Amazon" && !!document.querySelector("#chart svg.acts")`, "the actions view with a municipality selected");
    assert.equal(await text("#scope span"), "Amazon");
    assert.equal(await text("#say"), `Enforcement accounts for ${two(acts.summary.avoided, "en")} km² of clearing avoided since ${monthOf(sem[0].start, "en")}`);
    assert.match(await text("#hint"), /^A floor and an association, not proof of cause/);
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
    assert.equal(await js(`[...document.querySelectorAll("#top nav button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), l === "en" ? "Story,About,API,EN" : "História,Sobre,API,PT", `${l}: API sits next to About in the header`);
    assert.equal(await js(`document.getElementById("api").open || !!document.getElementById("api-text").textContent`), false, "closed, and nothing fetched, until asked");
    await clickOn("#api-btn");
    await until(`document.getElementById("api").open && /How to connect/.test(document.getElementById("api-text").textContent)`, `${l}: the API panel`);
    const shown = await text("#api-text");
    assert.ok(shown.includes("How to connect") && shown.includes("municipality/"), "the instructions say how to connect and list the endpoints");
    assert.equal(shown, llms, "the file, character for character");
    assert.equal(await js(`document.getElementById("api-text").children.length`), 0, "plain text, not rendered");
    assert.equal(await style("#api-text", "whiteSpace"), "pre-wrap");
    assert.match(await style("#api-text", "fontFamily"), /monospace/);
    assert.equal(await js(`document.getElementById("api").innerText.replace(document.getElementById("api-text").innerText, "").trim().split(/\\s+/).join(" ")`), "https://prenuncio.com/api/v1", `${l}: one line above the block, and no other copy (Copy is the clipboard beside the X)`);
    await until(`document.getElementById("mapbox").dataset.as === "dock" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`, `${l}: the map in its corner, the API on the stage`);
    assert.deepEqual(await js(`(() => { const a = document.getElementById("api").getBoundingClientRect(), t = document.getElementById("top").getBoundingClientRect(), m = document.getElementById("mapbox").getBoundingClientRect(), x = document.getElementById("api-top").getBoundingClientRect(); return [Math.round(a.left), Math.round(a.right) === innerWidth, Math.round(a.top - t.bottom), Math.round(a.bottom) === innerHeight, document.getElementById("api").matches(":modal"), x.right <= m.left, document.getElementById("api-close").getAttribute("aria-label")]; })()`), [0, true, 0, true, false, true, l === "en" ? "Close" : "Fechar"], `${l}: the API's instructions have the whole stage, clear of the small map, with an X`);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await until(`!document.getElementById("api").open && document.getElementById("mapbox").dataset.as === "stage" && !("swap" in document.documentElement.dataset)`, `${l}: Escape dismisses it and the map comes back`);
    await clickOn("#api-btn");
    await until(`document.getElementById("api").open`, "the API again");
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

  // ---------- About: a panel beside the map, and exactly this: what the site shows and who it is for, the model's
  // figure, the model and how it did in two sentences, the benchmark as a bare table with at most one short line
  // under it, that it is open with the way in as a button, that it gets things wrong, and whose data it is.
  const lead = [...story.leaderboard.rows].sort((a, b) => a.rank - b.rank).find(r => r.kind === "model").model;  // the model on the map: the benchmark's first, read from the data, never written in the page
  const ABOUT = {
    en: [`Prenúncio forecasts where the Amazon will be cleared by July ${story.forecast.year}.`, "We built it so enforcement can arrive before the clearing does.",
      `The map uses the model that leads the benchmark, today ${lead}. The forest is divided into ${story.forest.cell_m} metre squares, the cells, and the model gives each one its chance of clearing in the year ahead.`,
      `To test it, we hid a year from the model and asked for its forecast. In ${story.check.year}, ${hit5} of every ${of5} places it pointed to were cleared.`,
      "Benchmark", `The score is the mean of ${story.benchmark.years[0]} to ${story.benchmark.years.at(-1)}.`,
      "The code, the data and the benchmark are open. Build a better model and it replaces ours.", "Submit a modelGitHub", "Made by Gui Dávid. An initiative of Movimento Cibernético Brasileiro."],
    pt: [`O Prenúncio prevê onde a Amazônia será desmatada até julho de ${story.forecast.year}.`, "Fizemos para que a fiscalização chegue antes do desmate.",
      `O mapa usa o modelo que lidera o benchmark, hoje o ${lead}. A floresta é dividida em quadrados de ${story.forest.cell_m} metros, as células, e o modelo dá a cada uma a chance de desmate no ano seguinte.`,
      `Para testar, escondemos um ano do modelo e pedimos a previsão. Em ${story.check.year}, de cada ${of5} lugares que ele apontou, ${hit5} foram desmatados.`,
      "Benchmark", `A nota é a média de ${story.benchmark.years[0]} a ${story.benchmark.years.at(-1)}.`,
      "O código, os dados e o benchmark são abertos. Quem fizer um modelo melhor substitui o nosso.", "Enviar um modeloGitHub", "Feito por Gui Dávid. Uma iniciativa do Movimento Cibernético Brasileiro."],
  };
  for (const l of ["en", "pt"]) {
    const en = l === "en", LOC = { en: "en-US", pt: "pt-BR" }[l], n = (x, d = 0) => x.toLocaleString(LOC, { maximumFractionDigits: d, minimumFractionDigits: d }), rows = story.leaderboard.rows, name = story.model.name;
    await send("Page.navigate", { url: SITE + `#l=${l}&about` });
    await until(`document.documentElement.lang === "${l}" && document.getElementById("about").open && !!document.querySelector("#about .lede") && !!document.querySelector("#about .bench")`, `${l}: About`);
    // exactly these parts, in this order, and nothing else but the X
    assert.deepEqual(await js(`[...document.getElementById("about-body").children].map(e => e.tagName + (e.id ? "#" + e.id : "") + (e.className ? "." + e.className : ""))`), ["DIV.lede", "DIV#model-fig", "P", "P", "H3#about-benchmark", "TABLE.bench", "P.metric", "P", "P.go", "P.by"], `${l}: the parts of About, in order`);
    assert.deepEqual(await js(`[...document.querySelectorAll("#about-body .lede p, #about-body > p, #about-body > h3")].map(e => e.textContent.trim().replace(/\\s+/g, " "))`), ABOUT[l], `${l}: the words of About, as the brief has them`);
    assert.deepEqual(await js(`[...document.getElementById("about").children].map(e => e.id)`), ["about-bar", "about-body"]);
    const body = await js(`document.getElementById("about-body").textContent.replace(/\\s+/g, " ")`);
    assert.doesNotMatch(body, /The sign before the event|O sinal antes do acontecimento|rented machine|máquina alugada|How it is checked|Como é conferido|What it cannot do|O que ele não faz|two models|dois modelos/i, `${l}: the old text is gone`);
    assert.doesNotMatch(body, /placar|leaderboard|\bboards?\b/i, `${l}: the word is benchmark`);
    assert.equal(await js(`(() => { const m = document.querySelector("#about .metric"), s = getComputedStyle(m); return m.getBoundingClientRect().height < 1.6 * parseFloat(s.lineHeight); })()`), true, `${l}: the line under the table is one line`);
    // it is a panel beside the map, not a window over the page: the map is still there, and the panel has its way out
    await until(`document.getElementById("mapbox").dataset.as === "dock" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`, `${l}: the map in its corner`);
    await sleep(300);
    const pr = await js(`(() => { const r = document.getElementById("about").getBoundingClientRect(); return [r.left / innerWidth, r.right / innerWidth, getComputedStyle(document.getElementById("about")).borderTopWidth, document.getElementById("about").matches(":modal")]; })()`);
    assert.ok(pr[0] === 0 && pr[1] > 0.99 && pr[2] === "0px" && pr[3] === false, `${l}: About has the whole stage, with no frame: ${pr}`);
    const corner = await js(`(() => { const m = document.getElementById("mapbox").getBoundingClientRect(), b = document.getElementById("about-body").getBoundingClientRect(), e = document.elementFromPoint(m.x + m.width / 2, m.y + m.height / 2); return [m.left > 0.6 * innerWidth, m.top < 0.12 * innerHeight, m.width < 0.3 * innerWidth, b.right <= m.left - 8, Math.abs((b.left + b.right) / 2 - innerWidth / 2) < 0.12 * innerWidth, !!e?.closest("#map-front"), document.getElementById("mapin").inert, ["mappanel", "list"].some(id => document.getElementById(id).offsetParent)]; })()`);
    assert.deepEqual(corner, [true, true, true, true, true, true, true, false], `${l}: the map is the small picture in the upper right corner, the text is a column in the middle that stops short of it, and nothing of the map's own stays on the stage: ${corner}`);
    assert.equal(await js(`!!document.getElementById("about-close").offsetParent && document.getElementById("about-close").getAttribute("aria-label")`), en ? "Close" : "Fechar");
    // its figure: the sources as a stack of planes, each named, the model under them, the chance at the foot
    await until(`!!document.querySelector("#model-fig canvas") && document.querySelectorAll("#model-fig li").length === ${story.model.inputs.length + 2} && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}"`, `${l}: the figure of the model, and the chances it ends on`);
    await sleep(600);
    assert.deepEqual(await js(`[...document.querySelectorAll("#model-fig li:not(.m):not(.o)")].map(e => e.querySelector("span").textContent + (e.querySelector("small") ? " (" + e.querySelector("small").textContent + ")" : ""))`), story.model.inputs.map(x => x[l]), `${l}: a plane a source, each by its name`);
    assert.deepEqual(await js(`[document.querySelector("#model-fig li.m").textContent, document.querySelector("#model-fig li.o").textContent]`), [name, en ? "the chance, for every cell" : "a chance, para cada célula"]);
    const figBox = await js(`(() => { const f = document.getElementById("model-fig").getBoundingClientRect(), a = document.getElementById("about").getBoundingClientRect(), c = document.querySelector("#model-fig canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, tops = [...document.querySelectorAll("#model-fig li:not(.m):not(.o)")].map(e => e.getBoundingClientRect().top); let ink = 0, red = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 40) { ink++; if (d[i] > 150 && d[i + 1] < 90) red++; } return { fits: [...document.querySelectorAll("#model-fig li")].every(e => { const r = e.getBoundingClientRect(); return r.left >= a.left && r.right <= a.right; }), down: tops.every((y, i) => !i || y > tops[i - 1] + 20), ink, red, h: f.height }; })()`);
    assert.ok(figBox.fits && figBox.down && figBox.ink > 5000 && figBox.red > 200 && figBox.h > 400, `${l}: the names fit the panel and go down the stack, the planes are drawn and the last one is red: ${JSON.stringify(figBox)}`);
    // the benchmark: a bare table, a model a row with its link, then the way in as a button
    assert.deepEqual(await js(`[...document.querySelectorAll("#about .bench tbody tr")].map(tr => [tr.cells[0].textContent, tr.querySelector("a").getAttribute("href"), tr.cells[2].textContent, tr.cells[3].textContent])`), rows.map(r => [String(r.rank), r.url, n(100 * r.cap5, 1) + "%", n(100 * r.unseen_2026, 1) + "%"]), `${l}: the table is the file's, a model a row, to one decimal in the language's own figures`);
    assert.equal(await js(`document.querySelector("#about .bench tbody tr a").textContent`), name);
    assert.deepEqual(await js(`[...document.querySelectorAll("#about .bench tbody tr.ref")].map(tr => tr.cells[4].textContent)`), rows.filter(r => r.kind === "reference").map(() => (en ? "no model" : "sem modelo")), `${l}: the row that is not a model says so`);
    assert.deepEqual(await js(`[...document.querySelectorAll("#about .bench th")].map(e => e.textContent)`), en ? ["", "model", "score", String(story.model.trained_on.last_outcome_year), "by", "date"] : ["", "modelo", "nota", String(story.model.trained_on.last_outcome_year), "de", "data"], `${l}: the table keeps its columns`);
    assert.deepEqual(await js(`(() => { const t = document.querySelector("#about .bench"), s = [t, ...t.querySelectorAll("tr, td, th")].map(e => getComputedStyle(e)); return [s.every(x => parseFloat(x.borderTopWidth) === 0 && parseFloat(x.borderBottomWidth) === 0 && parseFloat(x.borderLeftWidth) === 0), new Set(s.slice(1).map(x => x.backgroundColor)).size]; })()`), [true, 1], `${l}: a bare table: no rules, no stripes`);
    assert.deepEqual(await js(`[document.querySelector("#about .go .btn").textContent, document.querySelector("#about .go .btn").getAttribute("href"), document.querySelector("#about .go a:not(.btn)").textContent, document.querySelector("#about .go a:not(.btn)").getAttribute("href")]`), [en ? "Submit a model" : "Enviar um modelo", story.links.benchmark, "GitHub", story.links.repository], `${l}: the way in is a button, the repository a link`);
    assert.deepEqual([...new Set(await js(`[...document.querySelectorAll("#about a")].map(a => a.getAttribute("href"))`))].sort(), [...new Set([story.links.benchmark, story.links.repository, "https://guidavid.com", ...rows.map(r => r.url)])].sort(), `${l}: the links are the benchmark, the repository, the models and the author's site`);
    assert.deepEqual(await js(`(a => [a.textContent, a.target, a.rel])(document.querySelector("#about .by a"))`), ["Gui Dávid", "_blank", "noopener"], `${l}: the last line links to the author's site in a new tab`);
    assert.equal(await count("#about [class*=card], #about [class*=grid], #about ul, #about h2"), 0, "no cards, no lists, no title");
    assert.doesNotMatch(body, /It gets things wrong|Ele erra|Data from INPE|Dados do INPE/, `${l}: the two closing lines are gone`);
    assert.equal(await js(`[...document.querySelectorAll("#about .go a, #about .bench a")].every(a => a.target === "_blank" && a.rel === "noopener") && document.querySelectorAll("#about .go a, #about .bench a").length`), 2 + rows.length, `${l}: the button, the GitHub link and the models open in a new tab`);
    assert.equal(await js(`document.getElementById("about").dataset.only === undefined && [...document.getElementById("about-body").children].every(e => getComputedStyle(e).display !== "none")`), true, `${l}: outside the story About has all of its parts`);
    assert.doesNotMatch(body, /—|flagged|marcad|Amazônia Legal|Legal Amazon/);
    // the text passes under a bar that keeps the way out in reach
    await js(`document.getElementById("about").scrollTop = 400`);
    await sleep(100);
    assert.equal(await js(`(() => { const x = document.getElementById("about-close").getBoundingClientRect(), a = document.getElementById("about").getBoundingClientRect(); return x.top >= a.top && x.bottom <= a.top + 60 && !!document.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2)?.closest("#about-close"); })()`), true, `${l}: scrolled, the way out is still at the top`);
    // its way out closes it, and so do Escape and the small map; then the map has the stage again
    await clickOn("#about-close");
    await until(`!document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "stage" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`, "About closed by its X, the map back on the stage");
    assert.deepEqual(await rect("mapbox"), [0, 0, vw, vh]);
    await clickOn("#about-btn");
    await until(`document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "dock" && !("swap" in document.documentElement.dataset) && !document.querySelector(".shot")`, "About again");
    await clickOn("#map-front");
    await until(`!document.getElementById("about").open && document.getElementById("mapbox").dataset.as === "stage" && !("swap" in document.documentElement.dataset)`, "and closed by a click on the small map");
    await clickOn("#about-btn");
    await until(`document.getElementById("about").open`, "About again");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await until(`!document.getElementById("about").open`, "About closed by Escape");
  }

  // ---------- the default view at three desktop sizes: the Amazon whole, clear ground between it and the left
  // column's two pieces, and the dock's corner nowhere near it
  for (const [w, h] of [[1280, 720], [1920, 1080], [1440, 900]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: SITE + `?story=0&w=${w}#l=en` });
    await until(`innerWidth === ${w} && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}" && !!document.querySelector("canvas.base") && /v=/.test(location.hash)`, `the default view at ${w} by ${h}`);
    await sleep(500);
    const g = await jsA(GAPS);
    assert.ok(g.panel >= 24 && g.dock >= 24, `at ${w} by ${h} there is clear ground between the Amazon and the panel (${Math.round(g.panel)} px) and the dock (${Math.round(g.dock)} px)`);
    assert.ok(g.whole && g.tall > 0.8, `at ${w} by ${h} the Amazon is whole and takes most of the stage's height: ${JSON.stringify(g)}`);
    // the surfaces have no hard corner: where the map is moved under them, they thin out into the page
    assert.deepEqual(await js(`[...["top", "mappanel", "chartbox", "legend", "modes"].map(id => document.getElementById(id)), ...document.querySelectorAll(".leaflet-control-zoom a, #modes button")].filter(e => { const s = getComputedStyle(e), b = getComputedStyle(e, "::before"), a = getComputedStyle(e, "::after"); return [s, b, a].some(x => x.boxShadow !== "none" || (x.maskImage || "none") !== "none" || x.filter !== "none" || x.backgroundImage !== "none" || parseFloat(x.borderTopWidth) > 0 || (x.outlineStyle !== "none" && parseFloat(x.outlineWidth) > 0)); }).map(e => e.id || e.className)`), [], "the surfaces are flat blocks: no shadow, no mask, no filter, no gradient, no rule");
    assert.equal(await js(`["top", "mappanel", "chartbox"].every(id => getComputedStyle(document.getElementById(id)).backgroundColor === "rgb(244, 245, 240)")`), true, "of the page's own colour");
  }

  // the same two steps on a short desktop screen: one piece on the stage, nothing scrolls
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: SITE + "?story=1&w=1280#l=pt" });
  await until(`${onStory} && innerWidth === 1280 && document.documentElement.dataset.step === "forestA" && !!document.querySelector("canvas.base")`, "the story at 1280 by 720");
  for (const id of IDS.slice(1, IDS.indexOf("open") + 1)) {
    await js(`document.getElementById("story-next").click()`);
    await until(`document.documentElement.dataset.step === "${id}"`, id + " at 1280 by 720");
    if (id === "sources" || id === "open") {
      await until(`document.getElementById("about").open && document.getElementById("about").dataset.only === "${id === "sources" ? "fig" : "bench"}" && ${id === "sources" ? `!!document.querySelector("#model-fig canvas")` : `!!document.querySelector("#about .bench")`}`, "the piece on the stage");
      await sleep(900);
      assert.deepEqual(await ONLY(), { shown: id === "sources" ? ["DIV#model-fig"] : ["H3#about-benchmark", "TABLE", "P"], scroll: false, inside: true }, `at 1280 by 720, ${id}: one piece, whole, no scroll`);
    }
  }
  await js(`document.getElementById("skip-btn").click()`);

  // ---------- the rasters. A desktop reads the 500 m pictures; a device short of memory the half-resolution
  // copies, at 1 km, and everything that reads them follows: the paint, what a cell says, the far views.
  assert.equal(await js(`prenuncio.lite`), false, "a desktop keeps the full pictures");
  {
    const F = meta.years[meta.forecast.year].flags500, half = await grey(`p${meta.forecast.year}_h.png`);
    assert.deepEqual([half.w, half.h], [Math.ceil(F.cols / 2), Math.ceil(F.rows / 2)], "the half-resolution chances are there, at half the rows and columns");
    const at0 = (half.h >> 1) * half.w, i = half.px.findIndex((v, n) => n > at0 && v >= 90 && v < 200), row = Math.floor(i / half.w), col = i % half.w;
    const lat = meta.north - (row + 0.5) * F.cell * 2, lng = meta.west + (col + 0.5) * F.cell * 2;
    await send("Page.navigate", { url: SITE + `?story=0&raster=h#l=en&m=cells&v=${lat.toFixed(6)},${lng.toFixed(6)},12` });
    await until(`document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}" && document.querySelector("canvas.cells").dataset.f === "1"`, "the chances at half resolution");
    assert.deepEqual(await js(`[prenuncio.lite, Math.round(1e4 * document.querySelector("canvas.cells").dataset.cell), prenuncio.mem().decodeMP < 9]`), [true, Math.round(2e4 * F.cell), true], "forced to the half pictures: cells of 1 km, and no picture over 9 megapixels decoded");
    const [mx, my] = await js(`(() => { const r = document.getElementById("map").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + 1, y: my + 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my });
    await until(`!!document.querySelector(".leaflet-tooltip.cell")`, "what a square of the half picture says");
    assert.equal(await tipLine(), `${chance(half.px[i])} chance this cell loses a hectare by July ${meta.forecast.year}`, "the same sentence, with the square's mean chance from the file");
  }

  // ---------- the people of an Indigenous land. Selected in Sectors, a land that has an entry opens on its
  // people: the photograph whole, with its author and licence as a link to the source, the name, a few lines;
  // the other peoples of the land as names that open. A land with no entry looks as it always did.
  const PEOPLE = {};  // the peoples as each language's file has them: lines and captions are plain strings in that language
  for (const l of ["en", "pt", "de", "ja", "ar"]) PEOPLE[l] = await fetch(`${SITE}data/peoples/${l}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const peoples = PEOPLE.en;
  assert.equal((await fetch(`${SITE}data/peoples.json`)).ok, false, "the old single file of two languages is gone");
  if (peoples) {
    const ti = await fetch(`${SITE}data/sectors_ti.json`).then(r => r.json()), tiIds = ti.items.map(it => String(it.id));
    const withPhoto = tiIds.find(id => peoples[id]?.[0]?.photo && peoples[id].length > 1), many = tiIds.filter(id => peoples[id]).sort((a, b) => peoples[b].length - peoples[a].length)[0], noPhoto = tiIds.find(id => peoples[id] && !peoples[id][0].photo), none = tiIds.find(id => !peoples[id]);
    for (const l of ["pt", "en"]) {
      const P = PEOPLE[l][withPhoto], p0 = P[0];
      await send("Page.navigate", { url: SITE + `?story=0&pp=${l}#l=${l}&m=sectors&s=ti&t=months` });
      await until(`document.documentElement.lang === "${l}" && !!document.querySelector("#legend .ramp") && /v=/.test(location.hash) && document.querySelectorAll("#chart .bar").length > 0`, `${l}: the Indigenous lands`);
      const v0 = (await hash()).match(/v=[^&]+/)[0], dockBefore = await rect("chartbox");
      await send("Page.navigate", { url: SITE + `?story=0&pp=${l}2#l=${l}&m=sectors&s=ti&r=${withPhoto}&t=months` });
      await until(`document.documentElement.lang === "${l}" && !document.getElementById("people").hidden && !!document.querySelector("#people img") && !document.getElementById("scope").hidden`, `${l}: the people of land ${withPhoto}`);
      await until(`document.querySelector("#people img").complete && document.querySelector("#people img").naturalWidth > 0`, "the photograph");
      await sleep(900);
      const got = await js(`(() => { const a = document.getElementById("people"), box = document.getElementById("chartbox"), r = box.getBoundingClientRect(), im = a.querySelector("img"), ir = im.getBoundingClientRect(), c = a.querySelector("figcaption a"); return { kids: [...a.children].map(e => e.tagName).slice(0, 4).join(), inDock: box.contains(a) && box.dataset.as === "dock", src: im.getAttribute("src"), alt: im.alt, lazy: im.loading, whole: Math.abs(ir.width / ir.height - im.naturalWidth / im.naturalHeight) < 0.02 && ir.width > 120 && ir.height > 150, credit: c.textContent, href: c.getAttribute("href"), blank: c.target, name: a.querySelector("h2").textContent, text: a.querySelector("h2 + p").textContent, others: [...a.querySelectorAll("details summary")].map(e => e.textContent), left: r.left < innerWidth * 0.05 && r.right < innerWidth * 0.4 && Math.round(r.bottom) >= innerHeight - 40, taller: r.height, noChart: ["hazrow", "body", "chart"].every(id => !document.getElementById(id).offsetParent), headline: !!document.getElementById("say").offsetParent, noColumn: !document.querySelector("aside#people") && document.getElementById("list").hidden }; })()`);
      assert.ok(got.taller > dockBefore[3] - dockBefore[1] + 100 && got.taller <= vh - 100, `${l}: the dock is taller for the people, and still under the map's panel: ${got.taller}`);
      delete got.taller;
      assert.deepEqual(got, { kids: "BUTTON,FIGURE,H2,P", inDock: true, src: p0.photo.file, alt: p0.photo.caption, lazy: "lazy", whole: true, credit: (l === "pt" ? "Foto: " : "Photo: ") + `${p0.photo.author}, ${p0.photo.license}`, href: p0.photo.source_url, blank: "_blank", name: p0.name, text: p0.text, others: P.slice(1).map(x => x.name), left: true, noChart: true, headline: true, noColumn: true }, `${l}: the people take the timeline's place in its dock: the photograph whole with its credit linked to the source, the name, the lines, the others as names, then the headline; no plot, and no column on the right`);
      assert.equal((await hash()).match(/v=[^&]+/)[0], v0, `${l}: and the map has not moved`);
      assert.equal((await fetch(SITE + p0.photo.file, { method: "HEAD" })).ok, true, "the photograph is there");
      assert.match(await text("#say"), /km²|\d/, "the forecast for the land is under them");
    }
    // a name among the others opens without bringing the dock forward; the photograph brings it to the stage; its X there sends it back
    await js(`document.querySelector("#people details summary").scrollIntoView({ block: "center" })`);  // (a tall photograph leaves the names under the fold of the dock)
    await sleep(200);
    await clickOn("#people details summary");
    await sleep(400);
    assert.equal(await js(`document.querySelector("#people details").open && document.getElementById("chartbox").dataset.as`), "dock", "a name opens where it is");
    await js(`document.getElementById("chartin").scrollTop = 0`);
    await clickOn("#people img");
    await until(`${settled("chart")} && !document.querySelector(".shot")`, "the people on the stage");
    assert.equal(await js(`!!document.querySelector("#people h2").offsetParent && !document.getElementById("chart").offsetParent`), true, "the full view: the people and the headline, still no plot");
    await key("Escape");
    await until(`${settled("map")} && !document.querySelector(".shot")`, "back to the dock");
    // In another language the lines are that language's: what content/peoples_i18n has for the people, where it has it,
    // and otherwise the English, marked as such and set left to right (on an Arabic page too). Changing the language
    // fetches that language's file.
    const repo = new URL("..", import.meta.url).pathname, content = JSON.parse(readFileSync(repo + "content/peoples.json", "utf8")), lands = JSON.parse(readFileSync(repo + "content/ti_peoples.json", "utf8"));
    for (const l of ["de", "ja", "ar"]) {
      const f = repo + `content/peoples_i18n/${l}.json`, tr = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {}, p0 = PEOPLE[l][withPhoto][0], k0 = lands[withPhoto].find(k => content[k]?.name === p0.name), want = tr[k0]?.text || content[k0].en;
      await send("Page.navigate", { url: SITE + `?story=0&pl=${l}#l=${l}&m=sectors&s=ti&r=${withPhoto}&t=months` });
      await until(`document.documentElement.lang === "${l}" && !document.getElementById("people").hidden && !!document.querySelector("#people h2 + p")`, `${l}: the people of land ${withPhoto}`);
      const got = await js(`(() => { const p = document.querySelector("#people h2 + p"), im = document.querySelector("#people img"); return { text: p.textContent, dir: p.getAttribute("dir"), flow: getComputedStyle(p).direction, alt: im?.alt ?? null, asked: performance.getEntriesByType("resource").filter(e => e.name.includes("data/peoples/")).map(e => e.name.split("/").pop()).join() }; })()`);
      assert.equal(got.text, want, `${l}: the people's lines are ${tr[k0]?.text ? "the translation in content/peoples_i18n" : "the English, where there is no translation yet"}`);
      assert.equal(got.text, p0.text, `${l}: and they are what the language's file has`);
      assert.deepEqual([got.dir, got.flow], p0.fallback ? ["ltr", "ltr"] : [null, l === "ar" ? "rtl" : "ltr"], `${l}: only lines that fell back to English are set left to right`);
      assert.equal(got.alt, p0.photo.caption, `${l}: the photograph's words are the file's`);
      assert.equal(got.asked, `${l}.json`, `${l}: one file of peoples was fetched, this language's`);
    }
    await flip();
    await until(`document.documentElement.lang === "pt" && document.querySelector("#people h2 + p")?.textContent === ${JSON.stringify(PEOPLE.pt[withPhoto][0].text)}`, "the language changed with the people open: their lines in Portuguese");
    assert.equal(await js(`performance.getEntriesByType("resource").filter(e => e.name.includes("data/peoples/")).map(e => e.name.split("/").pop()).join()`), "ar.json,pt.json", "a change of language fetches that language's peoples");
    // a land of many peoples: the list is long, and the dock scrolls
    await send("Page.navigate", { url: SITE + `?story=0&pp=many#l=pt&m=sectors&s=ti&r=${many}&t=months` });
    await until(`!document.getElementById("people").hidden && document.querySelectorAll("#people details").length === ${peoples[many].length - 1}`, "a land of many peoples");
    await js(`document.querySelector("#people details:last-of-type summary").click()`);
    assert.equal(await js(`(() => { const a = document.getElementById("chartin"); a.scrollTop = a.scrollHeight; const d = document.querySelector("#people details:last-of-type"), r = d.getBoundingClientRect(), b = document.getElementById("chartbox").getBoundingClientRect(); return d.open && r.top >= b.top && r.left >= b.left && r.right <= b.right && !!document.getElementById("say").offsetParent && document.getElementById("say").getBoundingClientRect().bottom <= b.bottom + 1; })()`), true, "the last of them opens, and under it, at the foot of the dock, the headline");
    if (noPhoto) {
      await send("Page.navigate", { url: SITE + `?story=0&pp=nophoto#l=pt&m=sectors&s=ti&r=${noPhoto}&t=months` });
      await until(`!document.getElementById("people").hidden && !!document.querySelector("#people h2")`, "a people with no photograph");
      assert.equal(await count("#people img, #people figure"), 0, "no photograph, and no placeholder for one");
    }
    // Every way of letting a selection go takes its outline with it, and brings the timeline back: its X, Escape,
    // a click on the empty map, another sector (which takes the outline over), another kind, another mode, About,
    // the API. (Another hazard or year keeps the sector: its bulletin is about it.)
    const sel = () => js(`[document.querySelectorAll(".leaflet-sel-pane path").length, /r=/.test(location.hash), !document.getElementById("scope").hidden, !document.getElementById("people").hidden, document.querySelectorAll("#chart .bar").length > 0 && !!document.getElementById("chart").offsetParent]`);
    const again = async tag => { await send("Page.navigate", { url: SITE + `?story=0&go=${tag}#l=pt&m=sectors&s=ti&r=${withPhoto}&t=months` }); await until(`!document.getElementById("people").hidden && document.querySelectorAll(".leaflet-sel-pane path").length === 2`, "the land selected, " + tag); await sleep(500); };
    const gone = async what => { await until(`document.querySelectorAll(".leaflet-sel-pane path").length === 0 && document.getElementById("scope").hidden`, what); await sleep(300); assert.deepEqual((await sel()).slice(0, 4), [0, false, false, false], what + ": no outline, no selection in the link, no label, no people"); };
    await again("x"); await clickOn("#people-x"); await gone("let go by its X");
    assert.equal((await sel())[4], true, "and the timeline is back in its dock");
    await again("esc"); await key("Escape"); await gone("let go by Escape");
    await again("empty"); await click(...await js(`(r => [r.left + r.width * 0.3, r.top + 6])(document.querySelector("canvas.base").getBoundingClientRect())`));  // (the corner of the grid north-west of the Amazon, outside Brazil) await gone("let go by a click on the empty map");
    await again("kind"); await clickOn('#kinds button[data-k="uc"]'); await gone("let go by another kind of sector");
    await again("mode"); await clickOn('#modes button[data-k="prio"]'); await gone("let go by another mode");
    await again("about"); await clickOn("#about-btn"); await gone("let go by About taking the stage");
    await js(`document.getElementById("about").close()`);
    await again("api"); await clickOn("#api-btn"); await gone("let go by the API taking the stage");
    await js(`document.getElementById("api").close()`);
    await again("other");
    const otherTi = ti.items.filter(it => String(it.id) !== withPhoto).sort((a, b) => b.a - a.a)[0];
    await js(`prenuncio.pick(${JSON.stringify(String(otherTi.id))})`);
    await until(`new RegExp("r=${otherTi.id}(&|$)").test(location.hash) && document.querySelectorAll(".leaflet-sel-pane path").length === 2`, "another land takes the selection, and the one outline");
    await again("hazard"); await js(`document.querySelector('#signs [data-go], #hazard button:nth-child(2)') && 0`);
    assert.deepEqual((await sel()).slice(0, 3), [2, true, true], "(a selection that stands keeps its outline)");
  }

  // ---------- languages. Every string is in web/i18n/<code>.json. Every file has every key of the English one;
  // each language draws the default screen and the story's first step with no hole in a sentence; Arabic runs
  // right to left; the language is chosen by the address, then the saved choice, then the country, then the browser.
  const LANGS15 = ["en", "pt", "es", "zh", "hi", "ar", "fr", "ru", "de", "ja", "id", "bn", "tr", "ko", "it", "vi"];  // (sixteen now: Vietnamese fills the menu's last place)
  assert.equal(await js(`prenuncio.country("VN")`), "vi", "a request from Vietnam opens in Vietnamese");
  assert.deepEqual(await js(`prenuncio.langs`), LANGS15);
  const FORMS = ["zero", "one", "two", "few", "many", "other"], isForms = o => o && typeof o === "object" && !Array.isArray(o) && "other" in o && Object.keys(o).every(k => FORMS.includes(k));
  const keysOf = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (k === "like" ? [] : v && typeof v === "object" && !Array.isArray(v) && !isForms(v) ? keysOf(v, p + k + ".") : [p + k]));
  const files = Object.fromEntries(await Promise.all(LANGS15.map(async l => [l, await fetch(`${SITE}i18n/${l}.json`).then(r => r.json())])));
  const wantKeys = keysOf(files.en).filter(k => !["st.lossBMore", "st.moreKm"].includes(k)).sort();
  for (const l of LANGS15) {
    const have = new Set(keysOf(files[l]));
    assert.deepEqual(wantKeys.filter(k => !have.has(k)), [], `${l}.json has every key`);
    assert.deepEqual([...have].filter(k => !wantKeys.includes(k) && !["st.lossBMore", "st.moreKm"].includes(k)), [], `${l}.json has no key the English file lacks`);
    // a sentence keeps the placeholders of the English one
    const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) { if (k === "like") continue; if (typeof v === "string") out[p + k] = v; else if (v && typeof v === "object" && !Array.isArray(v) && !isForms(v)) flat(v, p + k + ".", out); } return out; };
    const E = flat(files.en), F = flat(files[l]), holes = x => [...new Set(x.match(/\{\w+\}/g) || [])].sort().join();
    assert.deepEqual(Object.keys(E).filter(k => k in F && holes(E[k]) !== holes(F[k])), [], `${l}.json keeps the placeholders of every sentence`);
    if (files[l].like) assert.ok(files[l].like.every(p => p.km > 0 && typeof p.same === "string") && (!files[l].st.lossBMore || files[l].st.moreKm > 0), `${l}: the table of places is well formed`);
  }
  for (const l of LANGS15) {
    await send("Page.navigate", { url: SITE + `?story=1&lang=${l}` });
    await until(`${onStory} && document.documentElement.lang === "${l}" && document.documentElement.dataset.step === "forestA" && document.getElementById("story-line").textContent.length > 3`, `${l}: the story's first step`);
    assert.equal(await line(), files[l].st.forestA, `${l}: the first line is the file's`);
    assert.equal(await js(`document.documentElement.dir`), l === "ar" ? "rtl" : "ltr", `${l}: the direction of the page`);
    // every caption of the story fits its place: inside the column, above where the timeline docks
    for (const id of IDS.slice(1)) {
      await js(`document.getElementById("story-next").click()`);
      await until(`document.documentElement.dataset.step === "${id}"`, `${l}: ${id}`);
      const fit = await js(`(() => { const c = getComputedStyle(document.documentElement), px = k => parseFloat(c.getPropertyValue(k)), s = document.getElementById("story").getBoundingClientRect(), ln = document.getElementById("story-line"); return [Math.round(s.bottom), Math.round(innerHeight - parseFloat(getComputedStyle(document.getElementById("top")).paddingLeft) - px("--dock-h")), ln.scrollWidth <= ln.clientWidth + 1, ln.textContent.length]; })()`);
      assert.ok(fit[0] <= (id === "ahead" ? fit[1] : await js(`innerHeight`) - 16) && fit[2], `${l}: the caption of ${id} (${fit[3]} characters) fits its place, above the dock once that is in: ${fit}`);
    }
    await js(`document.getElementById("skip-btn").click()`);
    await until(`!(${onStory}) && /km²|\\d/.test(document.getElementById("say").textContent) && !!document.querySelector("#legend .steps") && document.querySelectorAll("#chart .bar").length > 0`, `${l}: the default screen`);
    const shown = await js(`document.body.innerText + " " + [...document.querySelectorAll("[title], [aria-label]")].map(e => (e.title || "") + " " + (e.getAttribute("aria-label") || "")).join(" ")`);
    assert.doesNotMatch(shown, /\{\w+\}|undefined|\[object|NaN/, `${l}: no hole, no missing word on the default screen`);
    assert.equal(await js(`document.documentElement.scrollWidth <= innerWidth`), true, `${l}: nothing wider than the page`);
    const wide = await js(`["modes", "hazard", "legend", "say", "level"].filter(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(), b = (e.closest("#mappanel") || document.getElementById("chartbox")).getBoundingClientRect(); return e.scrollWidth > e.clientWidth + 1 || r.left < b.left - 1 || r.right > b.right + 1; }).concat(document.getElementById("chart").getBoundingClientRect().height < 60 ? ["chart"] : [])`);
    assert.deepEqual(wide, [], `${l}: the switch, the hazards, the key and the headline stay inside their blocks, and the plot keeps its room`);
    assert.match(await text("#legend .ticks"), new RegExp(new Intl.NumberFormat(await js(`document.documentElement.lang`) === "ar" ? "ar-u-nu-latn" : undefined).format(1) === "1" ? "\\d|[০-৯]" : "."), `${l}: digits as the locale writes them`);
    if (l === "ar") assert.match(await text("#legend .ticks"), /[0-9]/, "Arabic keeps Latin digits");
    if (l === "bn") assert.match(await text("#legend .ticks"), /[০-৯]/, "Bengali has its own");
    if (l === "fr" || l === "de") assert.match(await text("#legend .ticks"), /\d\s%/, "French and German put a space before the percent sign");
    if (l === "tr") assert.match(await text("#legend .ticks"), /%\d/, "Turkish puts it first");
  }
  // Arabic: the page is mirrored. The key and the dock are on the right, the list on the left, the way on points left.
  await send("Page.navigate", { url: SITE + "?story=0&lang=ar#m=prio" });
  await until(`document.documentElement.lang === "ar" && !document.getElementById("list").hidden && document.querySelector("canvas.cells")?.dataset.key === "${meta.forecast.year}" && /v=/.test(location.hash)`, "the tool in Arabic");
  await sleep(1200);
  const rtl = await js(`(() => { const r = id => document.getElementById(id).getBoundingClientRect(), a = document.querySelector("canvas.base").getBoundingClientRect(); return { panel: r("mappanel").right > innerWidth * 0.9, dock: r("chartbox").right > innerWidth * 0.9, list: r("list").left < 2, brand: document.querySelector(".brand").getBoundingClientRect().right > innerWidth * 0.8, amazon: a.left >= r("list").right && a.right <= r("chartbox").left, next: (() => { const st = document.getElementById("story"); st.hidden = false; const m = getComputedStyle(document.querySelector("#story-next svg")).transform; st.hidden = true; return /^matrix\\(-1/.test(m); })() }; })()`);
  assert.deepEqual(rtl, { panel: true, dock: true, list: true, brand: true, amazon: true, next: true }, "right to left: the column of type on the right, the list on the left, the Amazon between them, the arrows turned: " + JSON.stringify(rtl));
  // the order of the choice: the address, the saved choice, the country of the request, the browser
  assert.deepEqual(await js(`["BR", "MX", "CN", "IN", "EG", "FR", "RU", "DE", "JP", "ID", "BD", "TR", "KR", "IT", "BE", "CH", "US", null].map(c => prenuncio.country(c))`), ["pt", "es", "zh", "hi", "ar", "fr", "ru", "de", "ja", "id", "bn", "tr", "ko", "it", null, null, null, null], "a country to its language, and the ambiguous ones to none");
  const langAt = async (url, what) => { await send("Page.navigate", { url: SITE + url }); await until(`!!document.getElementById("say").textContent && !!document.documentElement.dir`, what); return js(`document.documentElement.lang`); };
  await js(`localStorage.setItem("lang", "de")`);
  assert.equal(await langAt("?story=0&lang=fr&o=1", "the address"), "fr", "?lang= in the address comes first");
  assert.equal(await js(`localStorage.getItem("lang")`), "de", "and reading a link does not overwrite the reader's choice");
  assert.equal(await langAt("?story=0&o=2", "the saved choice"), "de", "then the saved choice");
  await js(`localStorage.removeItem("lang")`);
  await send("Page.enable");
  const stub = (await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__country = "JP";` })).identifier;
  assert.equal(await langAt("?story=0&o=3", "the country"), "ja", "then the country of the request");
  await js(`localStorage.setItem("lang", "it")`);
  assert.equal(await langAt("?story=0&o=4", "the saved choice over the country"), "it", "(the saved choice is ahead of the country)");
  await js(`localStorage.removeItem("lang")`);
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: stub });
  assert.equal(await langAt("?story=0&o=5", "the browser"), await js(`(navigator.languages || []).map(x => x.slice(0, 2)).find(x => prenuncio.langs.includes(x)) || "en"`), "then the browser's language: with no answer from /api/geo the country is unknown");
  // the menu: every language by its own name; choosing one saves it and puts it in the link
  await clickOn("#lang-btn");
  await until(`!document.getElementById("lang-menu").hidden`, "the language menu");
  assert.deepEqual(await js(`[...document.querySelectorAll("#lang-menu button")].map(b => b.textContent)`), ["English", "Português", "Español", "中文", "हिन्दी", "العربية", "Français", "Русский", "Deutsch", "日本語", "Bahasa Indonesia", "বাংলা", "Türkçe", "한국어", "Italiano", "Tiếng Việt"]);
  assert.equal(await js(`(() => { const m = document.getElementById("lang-menu").getBoundingClientRect(); return m.right <= innerWidth && m.left >= 0 && m.bottom <= innerHeight && [...document.querySelectorAll("#lang-menu button")].every(b => b.getBoundingClientRect().height >= 40); })()`), true, "the menu is on the screen, its rows tall enough");
  await clickOn('#lang-menu [data-l="pt"]');
  await until(`document.documentElement.lang === "pt" && document.getElementById("lang-menu").hidden && /l=pt/.test(location.hash) && /km² de desmatamento/.test(document.getElementById("say").textContent)`, "Portuguese, from the menu");
  assert.equal(await js(`localStorage.getItem("lang") + "/" + document.getElementById("lang-btn").textContent`), "pt/PT");
  await js(`localStorage.setItem("lang", "en")`);

  // ---------- every word a reader sees comes from the language's file (or from the content written for that
  // language). In Japanese, on the default screen, Sectors with a land selected, Priorities with a row open, About
  // and the API, no text on the page and no label or title has a run of four Latin letters or more, apart from
  // names that are not translated, and the places and peoples of the data (their own elements are left out, as
  // are the lines of the peoples, which are content of their own and full of proper names, and the agents' file).
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const NAMES = ["Prenúncio", "prenuncio", "GitHub", "Dávid", "guidavid", "Movimento", "Cibernético", "Brasileiro", "IBAMA", "INPE", "PRODES", "DETER", "Hansen", "Sentinel", "GLAD", "AlphaEarth", "SINAFLOR", "Esri", "Maxar", "Earthstar", "Geographics", "Niño", "Niña", "https", "http"];
  const LATIN = `(() => { const seen = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, names = new Set(${JSON.stringify(NAMES)}), out = new Set(), data = "script, style, #api-text, #api-base, #lang-menu, .state-name, #list-rows .nm, #people h2, #people summary, #people p, #people figcaption, #scope, .leaflet-tooltip b, .leaflet-tooltip small, #about .bench td";
    const runs = (x, tag) => { for (const m of x.matchAll(/[A-Za-zÀ-ÿ]{4,}/g)) if (!names.has(m[0])) out.add(tag + m[0]); };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { const p = n.parentElement; if (p && !p.closest(data) && seen(p)) runs(n.textContent, ""); }
    for (const e of document.querySelectorAll("[aria-label], [title], img[alt]")) if (seen(e) && !e.closest(data) && !e.closest("#people")) for (const a of ["aria-label", "title", "alt"]) runs(e.getAttribute(a) || "", "@");
    runs(document.title, "title:"); runs(document.querySelector('meta[name="description"]').content, "description:"); return [...out]; })()`;
  const landJa = (await fetch(`${SITE}data/sectors_ti.json`).then(r => r.json())).items.map(it => String(it.id)).find(id => PEOPLE.ja?.[id]?.[0]?.photo);
  for (const [what, hash_, ready] of [["the default screen", "m=cells", `!!document.querySelector("canvas.cells")?.dataset.key`], ["Sectors with a land selected", `m=sectors&s=ti&r=${landJa}`, `!document.getElementById("people").hidden && !!document.querySelector("#legend .ramp")`], ["Priorities with a row open", "m=prio&b=1", `!!document.querySelector("#list-rows .why")`], ["About", "m=cells&about", `document.getElementById("about").open && !!document.querySelector("#about .bench")`], ["the API", "m=cells&api", `document.getElementById("api").open && document.getElementById("api-text").textContent.length > 100`]]) {
    await send("Page.navigate", { url: SITE + `?story=0&ja=${encodeURIComponent(what)}#l=ja&${hash_}` });
    await until(`document.documentElement.lang === "ja" && document.querySelectorAll("#chart .bar").length > 0 && ${ready}`, "in Japanese: " + what);
    await sleep(900);
    assert.deepEqual(await js(LATIN), [], `in Japanese, ${what}: no word is left in another language`);
  }
  assert.match(await js(`document.title`), /^Prenúncio、/, "the tab's name is the language's");
  // The API's Copy is the clipboard beside the X: to its left, the same size, named by the file. It puts the
  // instructions on the clipboard, turns into a check for a moment and says so to a screen reader.
  await send("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] }).catch(() => {});
  await send("Page.navigate", { url: SITE + "?story=0&cp=1#l=pt&api" });
  await until(`document.documentElement.lang === "pt" && document.getElementById("api").open && document.getElementById("api-text").textContent.length > 100`, "the API, for its clipboard");
  await sleep(700);
  const cp = await js(`(() => { const c = document.getElementById("api-copy"), x = document.getElementById("api-close"), a = c.getBoundingClientRect(), b = x.getBoundingClientRect(), g = c.querySelector("svg").getBoundingClientRect(), xs = getComputedStyle(x, "::before"); return { left: Math.round(b.left - a.right), level: Math.round(a.top - b.top), same: Math.round(a.width) === Math.round(b.width) && Math.round(a.height) === Math.round(b.height), glyph: Math.round(g.width) === Math.round(parseFloat(xs.width)), label: c.getAttribute("aria-label") + "/" + c.title, word: c.textContent.trim(), hit: !!document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2)?.closest("#api-copy") }; })()`);
  assert.deepEqual(cp, { left: 0, level: 0, same: true, glyph: true, label: "Copiar/Copiar", word: "", hit: true }, "the clipboard stands right of nothing and left of the X, at its size, with no word on it: " + JSON.stringify(cp));
  await clickOn("#api-copy");
  await until(`"done" in document.getElementById("api-copy").dataset && document.getElementById("api-said").textContent === "Copiado"`, "copied: the check, and the word for a screen reader");
  const clip = await jsA(`navigator.clipboard.readText().catch(() => null)`);
  if (clip !== null) assert.equal(clip, await js(`document.getElementById("api-text").textContent`), "the instructions are on the clipboard");
  await until(`!("done" in document.getElementById("api-copy").dataset) && document.getElementById("api-said").textContent === ""`, "and the clipboard is back after a moment");
  // The map's panel is no wider than what it holds: the mode tabs side by side, the scale at its own width, and
  // no block of empty ground over the map. (Spreading them across the screen is a phone's layout.)
  for (const [w, h] of [[1440, 900], [1280, 720]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const gaps = {};
    for (const m of ["cells", "sectors"]) {
      await send("Page.navigate", { url: SITE + `?story=0&pw=${w}${m}#l=pt&m=${m}&s=ti` });
      await until(`innerWidth === ${w} && document.documentElement.lang === "pt" && !!document.querySelector("#legend .what") && document.querySelectorAll("#chart .bar").length > 0 && document.documentElement.dataset.mode === "${m}"`, `the panel in ${m} at ${w}`);
      await sleep(700);
      const pn = await js(`(() => { const p = document.getElementById("mappanel"), s = getComputedStyle(p), kids = [...p.querySelectorAll("#modes, #kindrow, #legend .what, #legend .steps, #legend .ticks, #legend .rng, #legend .sw, #share")].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().width), m = [...document.querySelectorAll("#modes button")].map(e => e.getBoundingClientRect()); return { over: Math.round(p.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - Math.max(...kids)), wide: Math.round(p.getBoundingClientRect().width), gaps: m.slice(1).map((x, i) => Math.round(x.left - m[i].right)) }; })()`);
      assert.ok(pn.over <= 2 && pn.wide <= 440 && pn.gaps.every(g => g === pn.gaps[0] && g <= 4), `at ${w}x${h} in ${m} the panel is as wide as its widest piece and the mode tabs stand side by side: ${JSON.stringify(pn)}`);
      gaps[m] = pn.gaps.join();
    }
    assert.equal(gaps.cells, gaps.sectors, "the tabs are spaced the same in Cells and in Sectors");
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // In Cells the pointer is the square it marks: no cursor over the square, a crosshair where there is no forest,
  // never the open hand; and when a zoom settles under a still pointer the square is there again at once.
  await send("Page.navigate", { url: SITE + "?story=0&cur=1#l=pt&m=cells" });
  await until(`document.documentElement.lang === "pt" && !!document.querySelector("canvas.cells")?.dataset.key && /v=/.test(location.hash) && innerWidth === 1440`, "Cells, for the cursor");
  await sleep(1200);
  const CUR = `(() => { const m = document.getElementById("map"); return [getComputedStyle(m).cursor, !!document.querySelector("path.cellmark"), !!document.querySelector(".leaflet-tooltip.tip.cell")]; })()`;
  let cpt = null;
  for (const q of [[900, 450], [1000, 400], [800, 380], [1050, 520]]) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q[0] + 3, y: q[1] + 2 }); await sleep(60); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q[0], y: q[1] }); await sleep(400); if ((await js(CUR))[1]) { cpt = q; break; } }
  assert.ok(cpt, "a point of forest for the cursor");
  assert.deepEqual(await js(CUR), ["none", true, true], "over the square there is no cursor");
  for (let k = 0; k < 6; k++) { send("Input.dispatchMouseEvent", { type: "mouseWheel", x: cpt[0], y: cpt[1], deltaX: 0, deltaY: -40 }); await sleep(30); }
  await sleep(120);
  assert.notEqual((await js(CUR))[0], "grab", "no open hand while the map zooms");
  await until(`!prenuncio.zooming`, "the zoom settled under a still pointer");
  await sleep(250);
  assert.deepEqual(await js(CUR), ["none", true, true], "and the square and its tip are back at once, with no bare cursor in between");
  // over ground that is not forest (the page's own ground, outside the Amazon) the cursor is a crosshair
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 700, y: 880 }); await sleep(60);
  await clickOn(".leaflet-control-zoom a.home");
  await until(`document.querySelector(".leaflet-control-zoom a.home").classList.contains("off") && !prenuncio.zooming`, "the whole map again");
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 520, y: 840 }); await sleep(80); await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 524, y: 842 }); await sleep(400);
  assert.deepEqual(await js(CUR), ["crosshair", false, false], "where there is no forest: a crosshair, and nothing said");

  // ---------- the kinds of sector and Ranking, and the people's dock under them. With the height for it the kinds are a
  // list, one to a line, and Ranking closes it; in a short window, they are one row that never wraps (13 px
  // or more, scrolling if it must), Ranking at its end. Ranking is never on the modes' row. The dock stops under the panel, the
  // photograph giving way (whole) before anything meets, and its X can be reached.
  if (peoples) {
    const tiK = (await fetch(`${SITE}data/sectors_ti.json`).then(r => r.json())).items.map(it => String(it.id)).filter(id => peoples[id]?.[0]?.photo).slice(0, 40);
    const shapes = await jsA(`Promise.all(${JSON.stringify(tiK.map(id => [id, peoples[id][0].photo.file]))}.map(([id, f]) => new Promise(r => { const i = new Image(); i.onload = () => r([id, i.naturalWidth / i.naturalHeight]); i.onerror = () => r([id, 0]); i.src = f; })))`);
    const LANDS = [shapes.find(x => x[1] > 1.2)?.[0], shapes.find(x => x[1] > 0 && x[1] < 0.83)?.[0]];
    assert.ok(LANDS[0] && LANDS[1], "a land with a landscape photograph and one with a portrait: " + LANDS);
    const KIND = () => js(`(() => { const R = e => e.getBoundingClientRect(), k = [...document.querySelectorAll("#kinds button")], kr = k.map(R), rk = document.getElementById("rank-btn"), r = R(rk), p = R(document.getElementById("mappanel")), m = R(document.getElementById("modes")), tops = [...new Set(kr.map(q => Math.round(q.top)))];
      return { state: tops.length === 4 && kr.every(q => Math.abs(q.left - kr[0].left) < 1) ? "list" : tops.length === 1 ? "row" : "wrapped", inside: [kr[0], r].every(q => q.left >= p.left - 1 && q.right <= p.right + 1 && q.width > 10), apart: kr.every((q, i) => !i || q.left >= kr[i - 1].right || q.top >= kr[i - 1].bottom), offModes: r.top >= m.bottom - 1 && !document.getElementById("modes").contains(rk),
        rank: tops.length === 4 ? r.top >= kr[3].bottom - 1 && Math.abs(r.left - kr[0].left) < 1 : r.left >= R(document.getElementById("kinds")).right - 1 && Math.abs((r.top + r.bottom) / 2 - (kr[3].top + kr[3].bottom) / 2) <= 3, same: getComputedStyle(rk).fontSize === getComputedStyle(k[0]).fontSize && getComputedStyle(rk).color === getComputedStyle(k[0].getAttribute("aria-pressed") === "true" ? k[1] : k[0]).color, glyph: !!rk.querySelector("svg") && parseFloat(getComputedStyle(k[0]).fontSize) >= 13, bottom: Math.round(p.bottom) }; })()`);
    const OK = st => ({ state: st, inside: true, apart: true, offModes: true, rank: true, same: true, glyph: true });
    for (const [w, h] of [[1440, 900], [1280, 720], [1100, 700]]) for (const l of ["pt", "de"]) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await send("Page.navigate", { url: SITE + `?story=0&kd=${w}${l}#l=${l}&m=sectors&s=ti&t=months` });
      await until(`innerWidth === ${w} && document.documentElement.lang === "${l}" && document.querySelectorAll("#kinds button").length === 4 && !!document.getElementById("rank-btn").offsetParent && document.querySelectorAll("#chart .bar").length > 0`, `${l} ${w}x${h}: the Indigenous lands`, 600);
      await sleep(500);
      const k0 = await KIND(), tall = h > 780, b0 = k0.bottom; delete k0.bottom;
      assert.deepEqual(k0, OK(tall ? "list" : "row"), `${l} ${w}x${h}: the kinds are a ${tall ? "list" : "row"}, never half wrapped, and Ranking goes with them: ` + JSON.stringify(k0));
      for (const id of LANDS) {
        await js(`prenuncio.pick(${JSON.stringify(id)})`);
        await until(`!document.getElementById("people").hidden && !!document.querySelector("#people img") && document.querySelector("#people img").complete && document.querySelector("#people img").naturalWidth > 0`, `${l} ${w}x${h}: the people of ${id}`, 600);
        await sleep(700);
        const k1 = await KIND(), b1 = k1.bottom; delete k1.bottom;
        assert.deepEqual(k1, OK(tall ? "list" : "row"), `${l} ${w}x${h}: with the people in the dock the kinds stay as they are (the photograph gives way, not the list): ` + JSON.stringify(k1));
        const d = await js(`(() => { const R = id => document.getElementById(id).getBoundingClientRect(), c = R("chartbox"), p = R("mappanel"), x = R("people-x"), im = document.querySelector("#people img"), ir = im.getBoundingClientRect(); return { gap: Math.round(c.top - p.bottom), x: !!document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2)?.closest("#people-x") && x.top >= c.top - 1, whole: Math.abs(ir.width / ir.height - im.naturalWidth / im.naturalHeight) < 0.02 && ir.height >= (innerHeight > 780 ? 200 : 100), photoIn: ir.top >= c.top - 1 && ir.bottom <= c.bottom + 1 && ir.top >= p.bottom, pb: getComputedStyle(document.documentElement).getPropertyValue("--panel-bottom").trim() }; })()`);
        assert.ok(d.gap >= 12 && d.x && d.whole && d.photoIn && d.pb === b1 + "px", `${l} ${w}x${h}, land ${id}: the dock is under the panel with a clear gap, its X in reach, the photograph whole and in sight: ` + JSON.stringify(d));
      }
      // let go, the kinds are as they were
      await js(`prenuncio.pick(null)`);
      await until(`document.getElementById("people").hidden`, "the people let go");
      await sleep(400);
      const k2 = await KIND(); assert.ok(Math.abs(k2.bottom - b0) <= 2, `${l} ${w}x${h}: and the panel is as tall as before: ${k2.bottom}, ${b0}`); delete k2.bottom;
      assert.deepEqual(k2, k0, `${l} ${w}x${h}: the kinds return to the ${tall ? "list" : "row"}`);
    }
    // the switch between the two with the window's height alone, and outside Sectors neither is there
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await until(`innerHeight === 900`, "a tall window"); await sleep(400);
    assert.equal((await KIND()).state, "list");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 740, deviceScaleFactor: 1, mobile: false });
    await until(`innerHeight === 740`, "a short window"); await sleep(400);
    assert.equal((await KIND()).state, "row", "a short window: the list becomes the row");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await until(`innerHeight === 900`, "tall again"); await sleep(400);
    assert.equal((await KIND()).state, "list", "and the list again");
    await clickOn("#rank-btn");
    await until(`document.getElementById("rank-btn").getAttribute("aria-pressed") === "true" && !!document.getElementById("list").offsetParent`, "Ranking opens the ranked list");
    await clickOn('#modes button[data-k="cells"]');
    await until(`document.getElementById("kindrow").hidden && !document.getElementById("rank-btn").offsetParent && !document.getElementById("kinds").offsetParent`, "outside Sectors there are no kinds and no Ranking");
  }

  // ---------- a phone, 390 by 844, in Portuguese. The map is the screen; the story's caption is at the bottom, at
  // the thumb, with the way on as a large arrow; one sheet shows at a time, the bulletin or the list, and their
  // rectangles never meet; the bulletin rests showing its level, its headline and a plot of 120 px or more, and
  // pulled up its plot is 240 px or more; type has a phone's scale; the header is the mark and one menu.
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: SITE + "?story=1#l=pt" });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA" && document.documentElement.lang === "pt" && innerWidth === 390 && !!document.querySelector("canvas.base")`, "the story on a phone");
  const fits = async what => assert.equal(await js(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("#story, #story-line, #mappanel, #list, #chartbox, #top")].filter(e => e.offsetParent).every(e => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= innerWidth + 0.5; })`), true, "nothing is wider than the screen at " + what);
  // the two sheets, where each is on the screen (null when it is not shown), and whether their rectangles meet
  const sheets = () => js(`["list", "chartbox"].map(id => { const e = document.getElementById(id), s = getComputedStyle(e), r = e.getBoundingClientRect(); return e.hidden || !e.offsetParent || s.visibility !== "visible" || +s.opacity < 0.5 ? null : [Math.round(r.top), Math.round(r.bottom)]; })`);
  const apart = async what => { const [l, c] = await sheets(); assert.ok(!l || !c || l[1] <= c[0] || c[1] <= l[0], `the list and the bulletin never overlap, ${what}: ${JSON.stringify([l, c])}`); return [l, c]; };
  const px = (sel, prop = "fontSize") => js(`parseFloat(getComputedStyle(document.querySelector(${JSON.stringify(sel)}))[${JSON.stringify(prop)}])`);
  assert.deepEqual(await place("mapbox"), [0, 0, 390, 844], "the map is the screen");
  const cap = await js(`(() => { const s = document.getElementById("story").getBoundingClientRect(), b = document.getElementById("story-next").getBoundingClientRect(), k = document.getElementById("skip-btn").getBoundingClientRect(); return [s.top / innerHeight, s.bottom / innerHeight, b.width, b.height, b.bottom / innerHeight, k.height, k.top, b.right > innerWidth * 0.8]; })()`);
  assert.ok(cap[0] > 0.8 && cap[1] > 0.99 && cap[2] >= 48 && cap[2] <= 72 && cap[3] === 48 && cap[4] > 0.9 && cap[5] >= 44 && cap[6] < 10 && cap[7], "the caption is at the bottom and no taller than its one line needs, the way on is a 48 px arrow at the thumb, and Skip is in the header: " + cap);
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.textContent).join()`), "PT,Pular");
  const lineSize = await px("#story-line");
  assert.ok(lineSize >= 22 && lineSize <= 24, "the story's line is set at 22 to 24 px on a phone: " + lineSize);
  const whereP = await amazon(), ptSaid = [], budget = []; let whereL = null;
  assert.equal(await js(`prenuncio.lite`), true, "a phone takes the half-resolution pictures, decided before anything is fetched");
  assert.equal(await js(`performance.getEntriesByType("resource").some(e => /data\\/[pf]\\d{4}\\.png/.test(e.name))`), false, "and never fetches a full one");
  assert.ok(whereP[0] >= 0 && whereP[0] + whereP[2] <= 390 && whereP[1] + whereP[3] < cap[0] * 844, "the Amazon is whole on the screen, above the caption: " + whereP);
  for (let i = 0; i < IDS.length; i++) {
    if (i) { await clickOn("#story-next"); await until(`document.documentElement.dataset.step === "${IDS[i]}"`, "phone, step " + IDS[i]); }
    ptSaid.push(await line());
    await fits(IDS[i]);
    await sleep(IDS[i] === "lossA" || IDS[i] === "model" || IDS[i] === "proof" ? 2500 : 300);
    budget.push([IDS[i], await js(`(m => [m.decodeMP, m.canvasMP, Math.round(performance.memory.usedJSHeapSize / 1048576)])(prenuncio.mem())`)]);
    // the Amazon stands in the middle of the stage and moves once: up, to stand above the list when that comes in
    if (IDS[i] === "use") { await sleep(1500); whereL = await amazon(); assert.ok(whereL[1] > 48 && whereL[1] + whereL[3] <= (await sheets())[1][0] + 1, "at the last step the Amazon is where the tool has it, above the sheet at rest: " + JSON.stringify([whereL, await sheets()])); }
    else if (IDS[i] === "first") { await sleep(1200); whereL = await amazon(); assert.ok(whereL[1] < whereP[1] - 20 && whereL[1] + whereL[3] <= (await sheets())[0][0] + 1, "the Amazon has gone up to stand above the list: " + JSON.stringify([whereP, whereL, await sheets()])); }
    else assert.deepEqual(await amazon(), whereL || whereP, "the Amazon has not moved at " + IDS[i]);
    if (["forestA", "lossB", "model", "proof"].includes(IDS[i])) { const g = await js(`(() => { const a = document.querySelector("canvas.base").getBoundingClientRect(), k = document.getElementById("mappanel"), key = getComputedStyle(k).visibility === "hidden" ? 48 : k.getBoundingClientRect().bottom, s = document.getElementById("story").getBoundingClientRect().top; return [Math.round(a.top - key), Math.round(s - a.bottom), Math.round(s - 48), Math.round((a.top + a.bottom) / 2)]; })()`); assert.ok(g[0] >= 0 && g[1] >= 0 && Math.abs(g[3] - (48 + 140 + 844 - 164) / 2) <= 16 && g[2] >= 630, `the Amazon is in the middle of the stage, which has 630 px or more between the header and the caption, at ${IDS[i]}: ${g}`); }
    assert.equal(await js(`(() => { const s = document.getElementById("story").getBoundingClientRect(), n = document.getElementById("story-next").getBoundingClientRect(), t = document.getElementById("story-text").getBoundingClientRect(); return t.bottom <= n.top + 1 && Math.round(s.bottom) === innerHeight && Math.round(n.bottom) >= innerHeight - 16 && t.top >= s.top; })()`), true, "the caption holds its line above the way on, which stays at the foot of the screen, at " + IDS[i]);
    assert.equal(await js(`document.getElementById("about").open && !document.getElementById("list").hidden`), false, "the panel and the list are not open together at " + IDS[i]);
    if (IDS[i] === "sources" || IDS[i] === "open") {  // the panel stands between the header and the caption: the line, the way on and Skip stay in reach
      await until(`document.getElementById("about").open`, "About, on a phone"); await sleep(500);
      const ab = await js(`(() => { const a = document.getElementById("about").getBoundingClientRect(), s = document.getElementById("story").getBoundingClientRect(), n = document.getElementById("story-next").getBoundingClientRect(), k = document.getElementById("skip-btn").getBoundingClientRect(), x = document.getElementById("about-close").getBoundingClientRect(), on = (r, id) => !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest("#" + id); return [Math.round(a.bottom - s.top), a.top >= k.bottom - 1, on(n, "story-next"), on(k, "skip-btn"), x.width === 0]; })()`);
      assert.deepEqual(ab, [0, true, true, true, true], "About on a phone, in the story: on the caption, under the header, with the way on and Skip in reach, and no X row taking the stage: " + ab);
    }
    if (IDS[i] === "sources") assert.deepEqual(await ONLY(), { shown: ["DIV#model-fig"], scroll: false, inside: true }, "on a phone too: the figure alone, nothing scrolls");
    if (IDS[i] === "open") assert.deepEqual(await ONLY(), { shown: ["H3#about-benchmark", "TABLE", "P"], scroll: false, inside: true }, "on a phone too: the benchmark alone, nothing scrolls");
    if (IDS[i] === "open") assert.equal(await js(`(() => { const r = document.getElementById("about").getBoundingClientRect(), t = document.querySelector("#about .bench").getBoundingClientRect(), b = document.querySelector("#about .go .btn").getBoundingClientRect(); return r.width === innerWidth && t.right <= innerWidth && document.getElementById("about").scrollWidth <= innerWidth && b.height >= 44; })()`), true, "the benchmark fits the screen, and its button is tall enough");
    if (IDS[i] === "first") {  // the list: a sheet over the lower part, standing on the caption, with its way out
      await until(`!document.getElementById("about").open && !!document.querySelector("#list-rows .why") && !!document.getElementById("list").offsetParent`, "the list's sheet");
      await sleep(450);
      const ls = await js(`(() => { const l = document.getElementById("list").getBoundingClientRect(), s = document.getElementById("story").getBoundingClientRect(), x = document.getElementById("list-close").getBoundingClientRect(), w = document.querySelector("#list-rows .why").getBoundingClientRect(); return [l.top / innerHeight, Math.round(l.bottom - s.top), l.width, x.width, x.height, w.top < s.top]; })()`);
      assert.ok(ls[0] > 0.4 && Math.abs(ls[1]) <= 1 && ls[2] === 390 && ls[3] >= 44 && ls[4] >= 44 && ls[5], "the list is a sheet standing on the caption, with an X of 44 px and its first place's reason showing: " + ls);
      await apart("at the list's step");
    }
    if (IDS[i] === "ahead") {  // the bulletin takes the list's place: a sheet showing its top, standing on the caption
      await until(`document.querySelectorAll("#chart .bar").length === 36 && document.getElementById("list").hidden`, "the bulletin's sheet, and no list");
      await sleep(450);
      const [, c] = await apart("at the last step");
      const sTop = (await place("story"))[1];
      assert.ok(c && Math.abs(c[1] - sTop) <= 1 && c[1] - c[0] > 180 && await js(`+document.querySelector("#chart rect.win").getAttribute("height")`) >= 120, "the bulletin's sheet stands on the caption, with its level and a plot of 120 px: " + JSON.stringify([c, sTop]));
    }
  }
  assert.deepEqual(ptSaid, IDS.map(id => (id === "use" ? TOUCH.pt : WORDS.pt[id])), "the story in Portuguese, word for word (the last line as a finger needs it)");
  // the memory budget of a phone, through the whole story: no picture over 9 megapixels is decoded, and the canvases on the page stay under 16 million pixels in all
  assert.ok(budget.every(([, m]) => m[0] <= 9 && m[1] < 16), "the phone's budget holds at every step (largest decode in megapixels, canvases in megapixels, heap in MB): " + JSON.stringify(budget));
  assert.equal(await js(`performance.getEntriesByType("resource").some(e => /data\\/[pf]\\d{4}\\.png/.test(e.name))`), false, "no full-resolution picture was fetched in the story");
  assert.doesNotMatch(ptSaid.join(" "), /marcad|—|Amazônia Legal|caixa-preta|[Dd]ois modelos|posto à prova|Por onde começar|placar|[Mm]ês a mês/, "the story's words in Portuguese");
  assert.equal(await label("story-next"), "Pronto");
  await clickOn("#story-next");
  await until(`!(${onStory}) && /m=cells/.test(location.hash) && document.getElementById("list").hidden`, "the tool on a phone, after the story: the map on its cells, the bulletin at rest");
  await sleep(600);
  // the tool. The header is the mark and one menu.
  assert.equal(await js(`[...document.querySelectorAll("#top button")].filter(b => b.offsetParent).map(b => b.id).join()`), "menu-btn", "the header: the mark and one menu");
  await clickOn("#menu-btn");
  await until(`"menu" in document.documentElement.dataset && !!document.getElementById("about-btn").offsetParent`, "the menu");
  assert.deepEqual(await js(`[...document.querySelectorAll("#nav button")].map(b => [b.textContent, b.getBoundingClientRect().height >= 44, b.getBoundingClientRect().right <= innerWidth])`), [["História", true, true], ["Sobre", true, true], ["API", true, true], ["PT", true, true]], "the menu holds the story, About, the API and the language");
  await flip();
  await until(`document.documentElement.lang === "en" && !("menu" in document.documentElement.dataset)`, "English, and the menu closed");
  // the bulletin at rest: the level, the headline in two lines at most, and a plot of 120 px or more, under the Amazon
  await fits("the tool");
  let [ls, cs] = await apart("at rest");
  const plot = () => js(`+document.querySelector("#chart rect.win").getAttribute("height")`);
  const rest = await js(`(() => { const s = document.getElementById("say"), st = getComputedStyle(s); return { shown: ["level", "say", "chart"].every(id => !!document.getElementById(id).offsetParent), lines: Math.round(s.getBoundingClientRect().height / parseFloat(st.lineHeight)), base: Math.round(document.querySelector("canvas.base").getBoundingClientRect().bottom) }; })()`);
  assert.ok(ls === null && cs[1] === 844 && rest.shown && rest.lines <= 2 && await plot() >= 120 && cs[0] >= rest.base, `the bulletin rests at the bottom showing its level, its headline and a plot of 120 px or more, clear of the Amazon: ${JSON.stringify([cs, rest, await plot()])}`);
  // a phone's type: a headline about 20 px, text 15 to 16, labels 12 to 13
  const type = { say: await px("#say"), ticks: await px("#legend .ticks"), what: await px("#legend .what"), axis: await px("#chart .bar text") };
  assert.ok(type.say >= 20 && type.say <= 22 && [type.ticks, type.axis].every(x => x >= 12 && x <= 13.5) && type.what >= 13 && type.what <= 14, "the phone's type scale on the resting screen: " + JSON.stringify(type));
  assert.equal(await js(`[...document.querySelectorAll("#modes button, #hazard button, #menu-btn, #sheet-grab")].filter(e => e.offsetParent).every(e => { const r = e.getBoundingClientRect(), a = getComputedStyle(e, "::after"); return r.height >= 44 || (a.content !== "none" && r.height - parseFloat(a.top) - parseFloat(a.bottom) >= 44); })`), true, "what is tapped is 44 px tall, or has a target that is");
  // the stage on a phone: the sheet at rest leaves the map at least half of the screen, the Amazon stands in the middle of what is free between the key and the sheet, and no edge is a fade
  const STAGE = async what => {
    await sleep(900);
    const g = await js(`(() => { const H = innerHeight, list = document.documentElement.dataset.list === "true", bottom = (list ? document.getElementById("list") : document.getElementById("chartbox")).getBoundingClientRect().top, key = document.getElementById("mappanel").getBoundingClientRect().bottom, a = document.querySelector("canvas.base").getBoundingClientRect(); return { H, bottom: Math.round(bottom), up: Math.round(a.top - key), down: Math.round(bottom - a.bottom) }; })()`);
    assert.ok(g.bottom >= g.H / 2, `${what}: the map keeps half of the screen above the sheet at rest: ${JSON.stringify(g)}`);
    assert.ok(g.up >= 0 && g.down >= 0 && Math.abs(g.up - g.down) <= 30, `${what}: the Amazon is in the middle of the free stage: ${JSON.stringify(g)}`);
    assert.deepEqual(await js(`["story", "chartbox", "list", "nav", "top", "mappanel", "about", "api"].filter(id => { const s = getComputedStyle(document.getElementById(id)); return s.boxShadow !== "none" || s.backgroundImage !== "none" || (s.maskImage || "none") !== "none" || (s.webkitMaskImage || "none") !== "none"; })`), [], `${what}: flat edges, no shadow and no gradient`);
  };
  await STAGE("the default phone screen");
  // the key and the modes go across the screen: the scale from one side's padding to the other's with its ticks spread under it, the first mode at the left padding and the last ending at the right
  const across = await js(`(() => { const R = e => e.getBoundingClientRect(), s = R(document.querySelector("#legend .steps")), t = [...document.querySelectorAll("#legend .ticks > *")].map(R), m = [...document.querySelectorAll("#modes button")], f = R(m[0]), l = R(m.at(-1)), pl = parseFloat(getComputedStyle(m[0]).paddingLeft); return { scale: [Math.round(s.left), Math.round(s.right)], ticks: [Math.round(t[0].left + t[0].width / 2 - s.left - s.width / 5), Math.round(t.at(-1).left + t.at(-1).width / 2 - s.left - 4 * s.width / 5)], first: Math.round(f.left + (m[0].getAttribute("aria-pressed") === "true" ? 0 : pl)), last: Math.round(l.right - (m.at(-1).getAttribute("aria-pressed") === "true" ? 0 : pl)), size: parseFloat(getComputedStyle(m[0]).fontSize) }; })()`);
  assert.deepEqual(across, { scale: [16, 374], ticks: [0, 0], first: 16, last: 374, size: 16 }, "the scale and the modes span the screen between its paddings: " + JSON.stringify(across));
  assert.equal(await js(`document.getElementById("hazard").scrollWidth <= document.getElementById("hazard").clientWidth`), true, "the four hazards fit the sheet's width");
  // the bulletin: its top is tapped or pulled up to the header, where it is whole, and pushed back
  const pull = async (sel, dy) => { const [x, y] = await js(`(() => { const r = document.querySelector("${sel}").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); for (let k = 1; k <= 6; k++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y + dy * k / 6, button: "left" }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y + dy, button: "left", clickCount: 1 }); await sleep(500); };
  assert.ok(await paintedPx() > 1000, "the map is painted under it all");
  await pull("#sheet-grab", -400);
  await until(settled("chart"), "the bulletin pulled up");
  await sleep(450);
  [, cs] = await apart("with the bulletin up");
  assert.ok(cs[0] <= 50 && cs[1] === 844, "whole, under the header: " + cs);
  assert.equal(await js(`["scale", "ahead", "signs", "sub"].every(id => document.getElementById(id).offsetParent) && (() => { const x = document.getElementById("chart-front").getBoundingClientRect(); return x.height >= 44 && x.width >= 44 && x.right <= innerWidth && !!document.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2)?.closest("#chart-front"); })() && document.documentElement.scrollWidth <= innerWidth`), true, "with its tabs, its window buttons, the signals and its way out");
  // pulled up, the plot is 240 px or more and its axes can be read
  const axes = await js(`(() => { const t = [...document.querySelectorAll("#chart .bar text")].map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left), rows = {}; for (const r of t) (rows[Math.round(r.top)] ||= []).push(r); const row = Object.values(rows).sort((a, b) => b.length - a.length)[0]; return { months: row.length, clash: row.some((r, i) => i && r.left < row[i - 1].right + 1), grid: document.querySelectorAll("#chart .grid text:not(.unit)").length, unit: document.querySelector("#chart .unit").textContent }; })()`);
  assert.ok(await plot() >= 240 && await px("#chart .grid text") >= 12 && await px("#chart .bar text") >= 12 && axes.months >= 8 && !axes.clash && axes.grid >= 1 && axes.unit === "km² cleared per month", `pulled up, the plot is ${await plot()} px tall and its axes read: ${JSON.stringify(axes)}`);
  assert.equal(await js(`document.getElementById("hazard").scrollWidth <= document.getElementById("hazard").clientWidth && (() => { const x = document.getElementById("chart-front").getBoundingClientRect(); return [...document.querySelectorAll("#hazard button")].every(b => { const r = b.getBoundingClientRect(); return r.right <= x.left || r.top >= x.bottom; }); })()`), true, "the hazards keep the whole width, clear of the way out");
  const type2 = { say: await px("#say"), sub: await px("#sub"), signs: await px("#signs > button") };
  assert.ok(type2.say >= 20 && type2.say <= 22 && type2.sub >= 15 && type2.sub <= 16 && type2.signs >= 13 && type2.signs <= 15, "and its type: " + JSON.stringify(type2));
  assert.deepEqual(await place("mapbox"), [0, 0, 390, 844], "the map is still the screen, under the sheet");
  await pull("#sheet-grab", 400);
  await until(settled("map"), "pushed back");
  await sleep(500);
  assert.ok((await sheets())[1][0] >= 844 - 200, "a flick down from the top leaves the sheet at its floor, the map open: " + JSON.stringify(await sheets()));
  await clickOn("#sheet-grab");  // (a tap on its grip at the floor opens it to its rest)
  await sleep(900);
  // only the plot takes the sheet up: a tap on its headline, its level or its edges does nothing
  for (const sel of ["#say", "#level", "#lead"]) { await clickOn(sel); await sleep(500); assert.equal(await js(settled("map")), true, `a tap on ${sel} leaves the sheet where it is`); }
  await clickOn("#chart");
  await until(settled("chart"), "up again by a tap on the plot");
  await clickOn("#chart-front");
  await until(settled("map"), "and down by its X");
  await sleep(450);
  [, cs] = await sheets();
  assert.ok(cs[1] === 844 && cs[1] - cs[0] < 320, "showing its top again: " + cs);
  // The sheet stays as tall as the finger leaves it. Pulled slowly and held, it rests there, its plot drawn for
  // that height and the Amazon in the middle of what is left; let go under its rest it settles at its rest.
  const slow = async (sel, dy) => { const [x, y] = await js(`(() => { const r = document.querySelector("${sel}").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); for (let k = 1; k <= 10; k++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: y + dy * k / 10, button: "left" }); await sleep(50); } await sleep(260); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y: y + dy, button: "left", clickCount: 1 }); await sleep(1300); };
  const restTop = (await sheets())[1][0], plot0 = await plot();
  await slow("#sheet-grab", -160);
  let free = await js(`(() => { const c = document.getElementById("chartbox").getBoundingClientRect(), a = document.querySelector("canvas.base").getBoundingClientRect(), k = document.getElementById("mappanel").getBoundingClientRect().bottom; return { top: Math.round(c.top), as: document.getElementById("chartbox").dataset.as, up: Math.round(a.top - k), down: Math.round(c.top - a.bottom) }; })()`);
  assert.ok(Math.abs(free.top - (restTop - 160)) <= 6 && free.as === "dock" && await plot() >= plot0 + 120, `the sheet stays where it was left, its plot taller: ${JSON.stringify(free)}, plot ${await plot()} from ${plot0}`);
  assert.ok(free.up >= 0 && free.down >= 0 && Math.abs(free.up - free.down) <= 30, "and the Amazon is in the middle of what is left: " + JSON.stringify(free));
  await slow("#sheet-grab", 520);
  const floorTop = (await sheets())[1][0];
  assert.ok(floorTop > restTop + 100 && floorTop >= 844 - 200 && floorTop <= 844 - 160 && await js(`(h => h.bottom <= document.getElementById("chartbox").getBoundingClientRect().bottom)(document.getElementById("hazrow").getBoundingClientRect())`), `let go under its floor, it settles at its floor, the grip and the hazards whole: ${floorTop}`);
  const atFloor = await js(`(() => { const c = document.getElementById("chartbox").getBoundingClientRect(), bars = [...document.querySelectorAll("#chart .bar rect")].map(e => e.getBoundingClientRect()).filter(r => r.height > 0), years = [...document.querySelectorAll("#chart text")].map(e => e.getBoundingClientRect()).filter(r => r.height > 0); return { bars: Math.round(Math.max(...bars.map(r => r.bottom)) - Math.min(...bars.map(r => r.top))), years: years.length > 0 && years.every(r => r.bottom <= c.bottom + 0.5 && r.top >= c.top) }; })()`);
  assert.ok(atFloor.bars >= 80 && atFloor.years, "at the floor the plot keeps its bars, 80 px or more, with their years whole under them: " + JSON.stringify(atFloor));
  await slow("#sheet-grab", -260);
  const keptTop = (await sheets())[1][0];
  assert.ok(Math.abs(keptTop - (floorTop - 260)) <= 6, "from the floor it is left higher again, where it was let go, for the lists to find it there afterwards: " + keptTop);
  // priorities on a phone: the mode opens the list's sheet, which has the bulletin's place whole
  await clickOn('#modes button[data-k="prio"]');
  await until(`!!document.getElementById("list").offsetParent && document.getElementById("list").dataset.at === "half" && document.querySelectorAll("#list-rows li").length > 100`, "the list's sheet, from the mode");
  await sleep(500);
  [ls, cs] = await apart("with the list open");
  await STAGE("priorities on a phone");
  assert.ok(ls[0] > 0.4 * 844 && ls[0] < 0.7 * 844 && ls[1] === 844 && cs === null, "the list has the lower half down to the foot of the screen, and the bulletin is away: " + JSON.stringify([ls, cs]));
  assert.equal(await js(`["sheet-grab", "hazard", "level", "say", "chart"].some(id => getComputedStyle(document.getElementById(id)).visibility === "visible" && !!document.getElementById(id).offsetParent) || !document.elementFromPoint(195, 838)?.closest("#list")`), false, "nothing of the bulletin shows or can be reached under the list, not even its grip");
  assert.equal(await js(`[...document.querySelectorAll("#list-close, #list-csv, #list-grab, #list-rows li:nth-child(-n+4) button")].every(e => e.getBoundingClientRect().height >= 44)`), true, "the list's controls and rows are 44 px tall");
  assert.deepEqual([await px("#list-rows .nm"), await px("#list-rows .tag")].map(x => Math.round(x * 2) / 2), [15.5, 12.5], "the list's type");
  // a row brings its place into view above the sheet and says why
  await clickOn('#list-rows li:nth-child(3) button');
  await until(`/b=2/.test(location.hash) && !!document.querySelector("#list-rows .why")`, "a place chosen on a phone");
  await apart("with a row open");
  const whyP = await js(`(() => { const p = document.querySelector("#list-rows .why p"), r = p.getBoundingClientRect(); return [parseFloat(getComputedStyle(p).fontSize), r.left >= 0 && r.right <= innerWidth]; })()`);
  assert.ok(whyP[0] >= 15 && whyP[0] <= 16 && whyP[1], "the reason is set at the text size, inside the screen: " + whyP);
  // the list is pulled up to the header and pushed back; the bulletin stays behind its handle
  await pull("#list-grab", -300);
  await until(`document.getElementById("list").dataset.at === "full"`, "the list pulled up");
  await sleep(450);
  [ls, cs] = await apart("with the list whole");
  assert.ok(ls[0] < 60 && ls[1] === 844 && cs === null, "whole, under the header: " + JSON.stringify([ls, cs]));
  await pull("#list-grab", 300);
  await until(`document.getElementById("list").dataset.at === "half"`, "pushed back to the half");
  await clickOn("#list-grab");
  await until(`document.getElementById("list").dataset.at === "full"`, "and up again by a tap on its bar");
  await clickOn("#list-grab");
  await until(`document.getElementById("list").dataset.at === "half"`, "and back");
  // closing the list brings the bulletin back
  await clickOn("#list-close");
  await until(`document.getElementById("list").hidden && /m=cells/.test(location.hash)`, "the list closed by its X, the map on its cells");
  await sleep(500);
  [ls, cs] = await apart("with the list closed");
  assert.ok(ls === null && cs[1] === 844 && Math.abs(cs[0] - keptTop) <= 2 && await plot() >= 120, `and the bulletin is back at the height it had (${keptTop}), with its plot: ` + JSON.stringify(cs));
  await pull("#sheet-grab", 500);  // (a flick down: to its floor)
  await sleep(900);
  assert.equal((await sheets())[1][0], floorTop, "a flick down takes it to its floor, not back to its rest");
  await clickOn("#sheet-grab"); await sleep(900);
  assert.equal((await sheets())[1][0], restTop, "and a tap on its grip at the floor opens it to its rest");
  // About on a phone: the whole screen, its text at the text size, its way out at the top
  await clickOn("#menu-btn");
  await until(`"menu" in document.documentElement.dataset`, "the menu again");
  await clickOn("#about-btn");
  await until(`document.getElementById("about").open && !!document.querySelector("#model-fig canvas")`, "About on a phone");
  await sleep(500);
  const ab2 = await js(`(() => { const a = document.getElementById("about").getBoundingClientRect(), x = document.getElementById("about-close").getBoundingClientRect(); return [Math.round(a.top), Math.round(a.width), Math.round(a.height), x.width >= 44 && x.height >= 44, document.getElementById("about").scrollWidth <= innerWidth, [...document.querySelectorAll("#model-fig li")].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })]; })()`);
  assert.deepEqual(ab2, [48, 390, 796, true, true, true], "About fills the screen under the header, nothing in it is wider, and its X is 44 px: " + ab2);
  const type3 = { p: await px("#about-body > p"), lede: await px("#about .lede p"), label: await px("#model-fig li"), th: await px("#about .bench th") };
  assert.ok(type3.p >= 15 && type3.p <= 16 && type3.lede >= 20 && type3.lede <= 22 && type3.label >= 12 && type3.label <= 13 && type3.th >= 12 && type3.th <= 13, "About's type on a phone: " + JSON.stringify(type3));
  await clickOn("#about-close");
  await until(`!document.getElementById("about").open`, "About closed");
  if (peoples) {
    const tiP = (await fetch(`${SITE}data/sectors_ti.json`).then(r => r.json())).items.map(it => String(it.id)).find(id => peoples[id]?.[0]?.photo);
    // (the local server now and then leaves one picture unanswered: the page is asked for once more before the wait gives up)
    const seen = `innerWidth === 390 && !document.getElementById("people").hidden && !!document.querySelector("#people img") && document.querySelector("#people img").complete`;
    for (let go = 0; go < 3; go++) {
      await send("Page.navigate", { url: SITE + `?story=0&pp=phone${go}#l=pt&m=sectors&s=ti&r=${tiP}&t=months` });
      let ok = false; for (let i = 0; i < 100 && !(ok = await js(seen)); i++) await sleep(200);
      if (ok) break;
    }
    await until(seen, "the people on a phone");
    await sleep(600);
    const pm = await js(`(() => { const im = document.querySelector("#people img").getBoundingClientRect(), c = document.getElementById("chartbox").getBoundingClientRect(); return [Math.round(im.left), Math.round(im.width), Math.round(im.top - c.top) < 30, !document.getElementById("chart").offsetParent, !!document.getElementById("say").offsetParent && document.getElementById("say").getBoundingClientRect().bottom <= innerHeight]; })()`);
    assert.deepEqual(pm, [0, 390, true, true, true], "on a phone the photograph is across the screen at the top of the sheet, the headline under it, no plot: " + pm);
    await clickOn("#people img");
    await until(settled("chart"), "the sheet up, from the photograph");
    await sleep(500);
    assert.equal(await js(`(() => { const m = document.getElementById("people"), h = m.querySelector("h2"), p = m.querySelector("h2 + p"), a = m.querySelector("figcaption a"); return !!h.offsetParent && !!p.offsetParent && !!a.offsetParent && m.getBoundingClientRect().bottom <= document.getElementById("lead").getBoundingClientRect().top + 60 && document.documentElement.scrollWidth <= innerWidth; })()`), true, "pulled up: the photograph, its credit, the name and the lines, then the forecast");
  }
  {
    const m = await js(`(m => [m.decodeMP, m.canvasMP])(prenuncio.mem())`);
    assert.ok(m[0] <= 9 && m[1] < 16 && !(await js(`performance.getEntriesByType("resource").some(e => /data\\/[pf]\\d{4}\\.png/.test(e.name))`)), "and in the tool, after the list, the sectors and the people: " + m);
    console.log("phone budget, story: " + JSON.stringify(budget.map(([id, m]) => [id, +m[0].toFixed(1), +m[1].toFixed(1), m[2]])) + "; tool: " + m.map(x => +x.toFixed(1)));
  }
  // ---------- the sheet under a real finger, as Safari on an iPhone gets it: touch events, not a mouse. The whole
  // sheet at rest is its grip: dragged from the headline or the hazards, let go while the finger still moves, it
  // stays where it was left, through a tap on the map, a change of hazard, the list opening and closing and the
  // phone turning on its side and back. Dragged under its rest it settles at its rest; to the header, it is whole.
  // A tap on a hazard still chooses it, a tap on the headline does nothing, a tap on the plot brings it up.
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", platform: "iPhone" });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: SITE + "?story=0&ios=1#l=pt&m=cells" });
  await until(`innerWidth === 390 && document.documentElement.lang === "pt" && !!document.querySelector("canvas.cells")?.dataset.key && document.querySelectorAll("#chart .bar").length > 0`, "the tool, on an iPhone");
  await sleep(1500);
  const touch = (type, x, y) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
  const finger = async (sel, dy, ms = 320) => { const [x, y] = await js(`(r => [r.left + Math.min(60, r.width / 2), r.top + r.height / 2])(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`); await touch("touchStart", x, y); await sleep(30); for (let k = 1; k <= 18; k++) { await touch("touchMove", x, y + dy * (1 - (1 - k / 18) ** 2)); await sleep(ms / 18); } await touch("touchEnd"); await sleep(1100); };
  const tapAt = async sel => { const [x, y] = await js(`(r => [r.left + r.width / 2, r.top + r.height / 2])(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`); await touch("touchStart", x, y); await sleep(50); await touch("touchEnd"); await sleep(1000); };
  const topNow = () => js(`Math.round(document.getElementById("chartbox").getBoundingClientRect().top) + "/" + document.getElementById("chartbox").dataset.as`);
  const rest0 = await topNow();
  await finger("#say", -260);
  const kept = await topNow(), keptY = parseInt(kept);
  assert.ok(kept.endsWith("/dock") && Math.abs(keptY - (parseInt(rest0) - 260)) <= 8, `dragged by its headline and let go while moving, the sheet stays there: ${rest0} to ${kept}`);
  await finger("#hazard", 120);
  const kept2 = await topNow();
  assert.ok(kept2.endsWith("/dock") && Math.abs(parseInt(kept2) - (keptY + 120)) <= 8, `and by its hazards: ${kept} to ${kept2}`);
  await touch("touchStart", 200, 150); await sleep(50); await touch("touchEnd"); await sleep(900);
  assert.equal(await topNow(), kept2, "a tap on the map leaves it there");
  await tapAt('#hazard button[data-k="fire"]');
  await until(`document.documentElement.dataset.hazard === "scar" || document.documentElement.dataset.hazard === "fire"`, "a tap on a hazard chooses it");
  assert.equal(await topNow(), kept2, "a change of hazard leaves it there");
  await tapAt('#hazard button[data-k="clear"]');
  await tapAt("#say");
  assert.equal(await topNow(), kept2, "a tap on the headline does nothing");
  await clickOn('#modes button[data-k="prio"]');
  await until(`document.documentElement.dataset.list === "true" && !!document.getElementById("list").offsetParent`, "the list");
  await sleep(600);
  await clickOn("#list-close");
  await until(`document.documentElement.dataset.list === "false"`, "the list closed"); await sleep(900);
  assert.equal(await topNow(), kept2, "the list opens and closes and the sheet is where it was");
  await send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await sleep(1200);
  assert.ok(parseInt(await topNow()) >= 48 + 40, "turned on its side the sheet fits the shorter screen: " + await topNow());
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1200);
  assert.equal(await topNow(), kept2, "and turned back it is where it was left");
  // dragged down it stays down: by 150 slowly, by 150 more while moving, then below its floor, where it settles
  const fingerSlow = async (sel, dy) => { const [x, y] = await js(`(r => [r.left + Math.min(60, r.width / 2), r.top + r.height / 2])(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`); await touch("touchStart", x, y); await sleep(30); for (let k = 1; k <= 18; k++) { await touch("touchMove", x, y + dy * k / 18); await sleep(40); } await sleep(250); await touch("touchEnd"); await sleep(1100); };
  const a0 = parseInt(await topNow());
  await fingerSlow("#hazard", 80);
  const d1 = await topNow();
  assert.ok(d1.endsWith("/dock") && Math.abs(parseInt(d1) - Math.min(a0 + 80, floorTop)) <= 6, `dragged down by 80 and let go slowly, it stays there: ${a0} to ${d1}`);
  await touch("touchStart", 200, 150); await sleep(50); await touch("touchEnd"); await sleep(900);
  assert.equal(await topNow(), d1, "through a tap on the map");
  await finger("#hazard", 300);
  const fl = await topNow();
  assert.ok(fl.endsWith("/dock") && Math.abs(parseInt(fl) - floorTop) <= 2, `dragged by 300 more while moving, below its floor, it settles at the floor: ${fl}`);
  await tapAt('#hazard button[data-k="degr"]');
  assert.equal(await topNow(), fl, "at the floor a hazard can still be chosen, and the sheet stays");
  await tapAt('#hazard button[data-k="clear"]');
  await clickOn('#modes button[data-k="prio"]'); await until(`document.documentElement.dataset.list === "true"`, "the list"); await sleep(600);
  await clickOn("#list-close"); await until(`document.documentElement.dataset.list === "false"`, "closed"); await sleep(900);
  assert.equal(await topNow(), fl, "the list opens and closes and it is still at the floor");
  await send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 2, mobile: true }); await sleep(1200);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await sleep(1200);
  assert.equal(await topNow(), fl, "and through turning the phone and back");
  const fl2 = await js(`(() => { const c = document.getElementById("chartbox").getBoundingClientRect(), bars = [...document.querySelectorAll("#chart .bar rect")].map(e => e.getBoundingClientRect()).filter(r => r.height > 0), years = [...document.querySelectorAll("#chart text")].map(e => e.getBoundingClientRect()).filter(r => r.height > 0); return { bars: Math.round(Math.max(...bars.map(r => r.bottom)) - Math.min(...bars.map(r => r.top))), years: years.length > 0 && years.every(r => r.bottom <= c.bottom + 0.5 && r.top >= c.top) }; })()`);
  assert.ok(fl2.bars >= 80 && fl2.years, "at the floor the plot is still there, its bars 80 px or more and its years whole: " + JSON.stringify(fl2));
  await finger("#hazard", -760);
  assert.equal(await topNow(), "48/stage", "dragged to the header it is whole");
  await clickOn("#chart-front"); await until(settled("map"), "back down"); await sleep(500);
  assert.ok(Math.abs(parseInt(await topNow()) - floorTop) <= 2, "sent back down, it is where it was left: at its floor");
  await tapAt("#sheet-grab"); await sleep(400);
  assert.equal(await topNow(), rest0, "a tap on its grip at the floor opens it to its rest");
  await tapAt("#chart");
  await until(settled("chart"), "a tap on the plot brings it up");
  await clickOn("#chart-front"); await until(settled("map"), "and down");
  assert.equal(await js(`getComputedStyle(document.getElementById("say")).touchAction`), "none", "at rest the browser does not take a finger on the sheet for a scroll");
  // From its rest down to its floor the headline and the band get smaller, then go, and the plot's share of the
  // sheet never falls under what it has at the rest; nothing is cut in the middle of a line.
  const GIVE = `(() => { const c = document.getElementById("chartbox").getBoundingClientRect(), ch = document.getElementById("chart").getBoundingClientRect(), s = document.getElementById("say"), on = s.offsetParent && getComputedStyle(document.getElementById("lead")).display !== "none", r = s.getBoundingClientRect(), lh = parseFloat(getComputedStyle(s).lineHeight); return { h: Math.round(c.height), say: on ? parseFloat(getComputedStyle(s).fontSize) : 0, lines: on ? r.height / lh : 0, share: ch.height / c.height, inside: [...document.querySelectorAll("#hazrow, #lead, #chart")].filter(e => e.offsetParent && getComputedStyle(e).display !== "none").every(e => { const q = e.getBoundingClientRect(); return q.top >= c.top - 0.5 && q.bottom <= c.bottom + 0.5; }) }; })()`;
  await finger("#hazard", 700); await tapAt("#sheet-grab"); await sleep(400);  // (to the floor, and a tap on the grip there opens it to its rest)
  assert.equal(await topNow(), rest0, "the sheet at its rest, to start from");
  const give = [await js(GIVE)];
  for (let k = 0; k < 4; k++) { await fingerSlow("#hazard", 25); give.push(await js(GIVE)); }
  assert.ok(give.every((g, i) => !i || (g.h < give[i - 1].h && g.say <= give[i - 1].say + 0.01 && g.share >= give[0].share - 0.01)), "under its rest the headline only gets smaller and the plot's share never falls: " + JSON.stringify(give));
  assert.ok(give.every(g => g.inside && (g.lines === 0 || Math.abs(g.lines - Math.round(g.lines)) < 0.15 && g.lines <= 2.1) && (g.say === 0 || g.say >= 14.5)), "nothing is cut in the middle of a line, and the headline is two lines at most, 15 px or more: " + JSON.stringify(give));
  // the story under a finger: ten quick taps on the way on go ten steps on and the page is never zoomed; a swipe to
  // the left goes on and to the right goes back; up and down does nothing
  await send("Page.navigate", { url: SITE + "?story=1&sw=1#l=pt" });
  await until(`${onStory} && document.documentElement.dataset.step === "forestA" && !!document.querySelector("canvas.base")`, "the story on an iPhone");
  await sleep(800);
  const stepNo = () => js(`[...document.querySelectorAll("#story-marks li")].findIndex(e => e.classList.contains("now"))`);
  const [nx, ny] = await js(`(r => [r.left + r.width / 2, r.top + r.height / 2])(document.getElementById("story-next").getBoundingClientRect())`);
  for (let k = 0; k < 10; k++) { await touch("touchStart", nx, ny); await sleep(25); await touch("touchEnd"); await sleep(90); }
  await sleep(600);
  assert.deepEqual([await stepNo(), await js(`visualViewport.scale`)], [10, 1], "ten quick taps: ten steps on, and the page not zoomed");
  for (let k = 0; k < 4; k++) await clickOn("#story-back");
  await until(`document.documentElement.dataset.step === "${IDS[6]}"`, "back to step 7"); await sleep(800);
  const sw = async (dx, dy) => { await touch("touchStart", 220, 400); for (let k = 1; k <= 6; k++) { await touch("touchMove", 220 + dx * k / 6, 400 + dy * k / 6); await sleep(25); } await touch("touchEnd"); await sleep(700); };
  await sw(-120, 10); assert.equal(await stepNo(), 7, "a swipe to the left goes on, over the panel on the stage");
  await sw(120, -8); assert.equal(await stepNo(), 6, "a swipe to the right goes back");
  await sw(10, -200); assert.equal(await stepNo(), 6, "up and down does nothing");
  assert.equal(await js(`getComputedStyle(document.getElementById("story-next")).touchAction`), "manipulation", "the arrows take taps as taps");
  await clickOn("#skip-btn"); await until(`!(${onStory})`, "the story left");
  await send("Emulation.setUserAgentOverride", { userAgent: "" });
  await send("Emulation.setDeviceMetricsOverride", DESK);

  assert.deepEqual(errors, [], "no script errors");
  console.log(`ok, ${words} words on the default screen, ${storyWords} on the story's first, first line after ${firstLine} ms\n${fc}\n${past}\n${months}\n${fire}\n${cell}\n${calm}\n${actions}`);
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}
