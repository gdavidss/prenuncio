// Prenúncio. The map of the Amazon is the page, and a bulletin with its timeline is docked in the corner: an
// alert level, a headline, a histogram and a few signals. The two swap places. A first visit opens with a story.
// It follows docs/BRAND.md: green is forest, red is clearing. No build step, no keys.
// Data formats: pipeline/export.py (cells) and pipeline/regions.py (sectors, months).
const $ = id => document.getElementById(id);
const root = document.documentElement;

// ---------- words. Every string a reader sees is in web/i18n/<code>.json, one file a language, fetched when the
// language is asked for (web/i18n/README.md says what each key is). A string is a whole sentence with named
// placeholders in braces. Where a sentence changes with a count it is an object of plural forms (one, few, many,
// other...) chosen by Intl.PluralRules; where it changes with a sector being selected it is { all, here }. A key
// a language lacks falls back to English, except its table of places for comparisons (like) and the story's
// sentence that uses one, which are never borrowed from another language.
const LANGS = { en: ["English", "en-US"], pt: ["Português", "pt-BR"], es: ["Español", "es"], zh: ["中文", "zh-CN"], hi: ["हिन्दी", "hi-IN"], ar: ["العربية", "ar-u-nu-latn"], fr: ["Français", "fr-FR"], ru: ["Русский", "ru-RU"], de: ["Deutsch", "de-DE"], ja: ["日本語", "ja-JP"], id: ["Bahasa Indonesia", "id-ID"], bn: ["বাংলা", "bn-BD"], tr: ["Türkçe", "tr-TR"], ko: ["한국어", "ko-KR"], it: ["Italiano", "it-IT"], vi: ["Tiếng Việt", "vi-VN"] };
const RTL = new Set(["ar"]), FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);
const plural = o => "other" in o && Object.keys(o).every(k => FORMS.has(k)), plain = o => o && typeof o === "object" && !Array.isArray(o);
const RAW = {}, T = {};
function compile(x, l, ordinal) {
  if (typeof x === "string") return /\{\w+\}/.test(x) ? v => x.replace(/\{(\w+)\}/g, (m, k) => v?.[k] ?? m) : x;
  if (Array.isArray(x)) return x.map(y => compile(y, l));
  if (!plain(x)) return x;
  const ks = Object.keys(x), sub = Object.fromEntries(ks.map(k => [k, compile(x[k], l)])), say = (f, v) => (typeof f === "function" ? f(v) : f);
  if (ks.length === 2 && "all" in x && "here" in x) return v => say(v?.here ? sub.here : sub.all, v);
  if (plural(x)) { const pr = new Intl.PluralRules(LANGS[l][1], ordinal ? { type: "ordinal" } : {}); return v => say(sub[pr.select(+v?.count || 0)] ?? sub.other, v); }
  return sub;
}
const over = (a, b) => { for (const k in b) a[k] = plain(b[k]) && plain(a[k]) && !plural(b[k]) ? over(a[k], b[k]) : b[k]; return a; };
async function loadLang(l) {
  if (!LANGS[l]) return null;
  if (T[l]) return T[l];
  const get = c => (RAW[c] ||= fetch(`i18n/${c}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null));
  const [en, own] = await Promise.all([get("en"), get(l)]);
  const m = over(structuredClone(en), own || {});
  m.like = own?.like; m.st.lossBMore = own?.st?.lossBMore; m.st.moreKm = own?.st?.moreKm;  // a language's own places, or none
  T[l] = compile(m, l);
  T[l].rank = compile(m.rank, l, true);
  return T[l];
}
// Which language. In this order: ?lang= in the address (or l= in a link's fragment), the reader's saved choice,
// the country the request comes from (/api/geo, a small function on the host; no answer within a moment counts
// as unknown), the browser's languages, English.
const COUNTRY = Object.fromEntries(Object.entries({
  pt: "BR PT AO MZ", es: "ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ", zh: "CN SG", hi: "IN",
  ar: "DZ BH KM DJ EG IQ JO KW LB LY MR MA OM PS QA SA SO SD SY TN AE YE", fr: "FR CD CI SN", ru: "RU BY KZ", de: "DE AT",
  ja: "JP", id: "ID", bn: "BD", tr: "TR", ko: "KR", it: "IT", vi: "VN",
}).flatMap(([l, cs]) => cs.split(" ").map(c => [c, l])));

// An area as a place people know. A pure choice: among the language's places and the multiples it has a sentence
// for (the same size, twice to five times, ten times, a half, a third), the pair whose area is nearest the one
// given, if it is within 15% of it. On a tie the plain size comes first, then the small multiples, then the
// fractions. Under 15 km², or with no table for the language, there is nothing to say.
const LIKE = [["same", 1], ["x2", 2], ["x3", 3], ["x4", 4], ["x5", 5], ["x10", 10], ["half", 1 / 2], ["third", 1 / 3]];
function likeArea(a, places) {
  if (!places || !(a >= 15)) return "";
  let best = null;
  for (const [k, m] of LIKE) for (const p of places) {
    if (!p[k] || Math.abs(p.km * m - a) > 0.15 * a) continue;
    const d = Math.abs(Math.log(a / (p.km * m)));
    if (!best || d < best.d - 0.02) best = { d, say: p[k] };  // (a plainer multiple keeps its place unless another is nearer by two points or more)
  }
  return best ? best.say : "";
}
const H = new URLSearchParams(location.hash.slice(1)), Q = new URLSearchParams(location.search);
const browserLang = () => (navigator.languages?.length ? navigator.languages : [navigator.language || "en"]).map(x => x.slice(0, 2).toLowerCase()).find(x => LANGS[x]) || "en";
let lang = [Q.get("lang"), H.get("l"), (() => { try { return localStorage.lang; } catch (err) { return null; } })()].find(x => LANGS[x]);
let langInLink = !!LANGS[H.get("l")];
if (!lang) {
  lang = browserLang();
  const country = window.__country !== undefined ? window.__country : await Promise.race([fetch("/api/geo").then(r => (r.ok ? r.json() : null)).then(j => j?.country ?? null).catch(() => null), new Promise(r => setTimeout(r, 350, null))]);
  if (COUNTRY[country]) lang = COUNTRY[country];
}
await loadLang(lang);
// ---------- which rasters. The chances and the masks of clearing are pictures of the whole grid: at 500 m they
// are 5180 by 6664, 34 megapixels, which a phone cannot decode (about 138 MB each, and iOS reloads the page). So a
// phone, a tablet or a machine short of memory takes the half-resolution copies (`_h`, 1 km, under 9 megapixels),
// decided here before anything is fetched; a desktop keeps the full ones. Everything that reads them takes its
// rows, columns and cell size from ras(). ?raster=h or ?raster=full forces one (for the test).
const LITE = Q.get("raster") ? Q.get("raster") === "h" : /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || "")) || navigator.deviceMemory <= 4 || (matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 900) || Math.min(screen.width, screen.height) < 600;
const ras = F => (LITE ? { cols: Math.ceil(F.cols / 2), rows: Math.ceil(F.rows / 2), cell: F.cell * 2, suf: "_h", far: [3, 6, 12], mult: 4 } : { cols: F.cols, rows: F.rows, cell: F.cell, suf: "", far: [2, 6, 12, 24], mult: 1 });
const MEM = { decode: 0 };  // the largest picture decoded so far, in pixels (for the test's budget)
const t = () => T[lang];
const loc = () => LANGS[lang][1];
window.prenuncio = { get zoom() { return map.getZoom(); }, get zooming() { return ZOOM.to != null; }, get mapped() { return veil.mapped ? veil.amt : 0; }, lite: LITE, mem: () => ({ decodeMP: MEM.decode / 1e6, canvasMP: [...document.querySelectorAll("canvas")].reduce((x, c) => x + c.width * c.height, 0) / 1e6 }), like: async (a, l) => likeArea(a, (await loadLang(l))?.like), country: c => COUNTRY[c] ?? null, pick: id => select(id), langs: Object.keys(LANGS), step: async id => classOf((await sectors(S.kind)).byId.get(String(id))) };  // (for the test)
const fmt = (x, d = 0) => x.toLocaleString(loc(), { maximumFractionDigits: d, minimumFractionDigits: d });
const km = x => fmt(x, x < 9.95 ? 1 : 0);
const round = (x, n) => { const p = 10 ** (Math.floor(Math.log10(x)) - n + 1); return Math.round(x / p) * p; };
const approx = x => (x < 9.95 ? fmt(x, 1) : fmt(round(x, 2)));    // forecasts: two figures is all they are good for
// a share as a percentage, written the way the language writes it (12%, 12 %, %12)
const pcOf = (x, d = 0, signed = false) => new Intl.NumberFormat(loc(), { style: "percent", maximumFractionDigits: d, minimumFractionDigits: d, signDisplay: signed ? "always" : "auto" }).format(x);
const ordinal = n => t().rank({ n: fmt(n), count: n });
const share = x => (x < 0.1 ? t().tiny : fmt(x, 1));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// The story was decided in the page's head, before the first paint (index.html). Its first line needs no data,
// so it is on the screen before anything is fetched.
let storyOn = "story" in root.dataset;
if (storyOn) { $("story").hidden = false; $("story-line").textContent = t().st.forestA; $("story-next").setAttribute("aria-label", t().st.next); $("skip-btn").textContent = t().skip; $("lang-btn").textContent = lang.toUpperCase(); }
const [M, R, MO, P, ACT, ST] = await Promise.all(["meta", "regions", "monthly", "prob", "actions", "story"].map(f => fetch(`data/${f}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)));  // monthly.json, prob.json, actions.json and story.json may not be there yet
if (!ST) storyOn = false;
M.layers ||= {};
if (Math.abs(R.total_km2 / M.forecast.total_km2 - 1) > 1e-6) console.warn("Sector numbers are older than the forecast, run pipeline/regions.py");
const PARTIAL = 2026;  // the year whose outcome is INPE's priority scenes only, until the full map is out

// ---------- hazards. Each has a forecast layer in meta.json, a monthly DETER series, a hue and a glyph, so it
// can be told apart by shape as well as colour. Clearing is red and also has the yearly forecast. The steps are
// the four map colours above standing forest, which stays green: they climb from near the forest to the
// hazard's most vivid tone, so on the green map brighter is more. Clearing is red through its whole range: a dark,
// bruised red where the chance is low, the brand's red, and a hotter one at the top. One hue, lightness rising
// with the chance, so the order holds without colour (docs/BRAND.md has the numbers).
const FOREST = [11, 107, 58], DARK = [255, 212, 0];  // standing forest, and clearing mapped in a replayed year (a yellow that reads on the reds, the green and the cream alike)
const HAZ = {
  clear: { series: "clear", glyph: "M1 1h10v6l-4 4H1z", steps: [[106, 15, 36], [174, 12, 44], [228, 0, 43], [255, 90, 64]] },
  fire: { layer: "scar12", series: "scar", glyph: "M6 .5C8 3 10.6 5 10.6 7.7A4.6 4 0 0 1 1.4 7.7C1.4 6 2.6 5 3.4 3.6C3.9 5 4.5 5.5 5.2 5.5C5 3.7 5.3 2 6 .5z", steps: [[112, 128, 48], [176, 146, 30], [236, 170, 8], [255, 214, 46]] },
  degr: { layer: "degr12", series: "degr", glyph: "M1 1.5h10v2.2H1zM1 4.9h10v2.2H1zM1 8.3h10v2.2H1z", steps: [[36, 112, 124], [40, 118, 180], [56, 136, 236], [140, 196, 255]] },
  mine: { layer: "mine12", series: "mine", glyph: "M6 .5L11.5 6L6 11.5L.5 6z", steps: [[92, 92, 128], [132, 70, 172], [176, 58, 214], [236, 140, 255]] },
};
const hazards = () => Object.keys(HAZ).filter(k => k === "clear" || M.layers[HAZ[k].layer]);  // only the ones that have a layer
const glyph = k => `<svg class="glyph" viewBox="0 0 12 12" style="--c:var(--${k})" aria-hidden="true"><path d="${HAZ[k].glyph}"/></svg>`;

// hazard: one of the above. scale: how the timeline tells time, by months (the default), by years, or as actions
// (what enforcement accounts for, clearing only). h: the window ahead in the monthly clearing view, 3 or 6 months,
// or 0 for the year being forecast, which is the default and leaves the map on the yearly chances.
const FY = M.forecast.year;
const S = { year: FY, hazard: "clear", scale: "months", h: 0, mode: "cells", kind: "mun", sel: null, min: 0, block: null, rank: false, line: false };
// mode: what the map shows (sectors, cells, or the priority blocks over the cells). min: the lowest chance step shown.
// block: the priority block selected. rank: the sector ranking is open. line: the timeline as a line instead of bars.
const cellsOn = () => S.mode !== "sectors";  // the priority list sits on top of the cells
if (M.years[H.get("y")]) S.year = +H.get("y");
S.hazard = hazards().find(k => HAZ[k].layer && HAZ[k].layer === H.get("k")) || "clear";
if (/^clear[36]$/.test(H.get("k") || "")) S.h = +H.get("k").slice(5);
// A link always says its scale and its mode. One that does not was written when years and sectors were the
// defaults, and keeps meaning that; the bare address gets months and cells.
const OLD = ["y", "k", "r", "s", "g"].some(k => H.has(k));
S.scale = ["years", "months", "actions"].includes(H.get("t")) ? H.get("t") : S.h || !OLD ? "months" : "years";
S.mode = ["sectors", "cells", "prio"].includes(H.get("m")) ? H.get("m") : OLD ? "sectors" : "cells";
if (H.get("b") > 0) S.block = +H.get("b");
S.rank = H.get("g") === "1"; S.line = H.get("c") === "line";
if (H.get("p") > 0 && H.get("p") < 5) S.min = +H.get("p");
if (["uf", "mun", "ti", "uc"].includes(H.get("s"))) S.kind = H.get("s");
if (H.get("r")) S.sel = H.get("r");
// which forecast map is on screen: a PRODES year, or one of the shorter layers
const key = () => (S.hazard !== "clear" ? HAZ[S.hazard].layer : S.scale === "months" && S.h ? "clear" + S.h : S.year);
const info = () => (typeof key() === "number" ? M.years[key()] : M.layers[key()]);
const isPast = () => typeof key() === "number" && info().actual_km2 != null;
// the benchmark's yardstick, quoted in About only: the share of a year's clearing inside the 5% of forest ranked
// highest, at 500 m when the export has it, at 1 km otherwise
const cap5 = Y => Y.flags500?.capture5 ?? Y.capture["5"];
const naive5 = Y => Y.flags500?.naive5 ?? Y.naive["5"];  // the naive map's share, at 500 m once the export has it
const month = (y, mo, opt = { month: "long", year: "numeric" }) => new Date(y, mo, 1).toLocaleDateString(loc(), opt);
const endOf = L_ => { const [y, mo] = L_.from.split("-").map(Number); return month(y, mo - 2 + L_.months); };
const [LY, LM] = (MO?.last_month || R.months.end).split("-").map(Number);  // the last complete month
const back = (k, opt) => month(LY, LM - 1 - k, opt);              // the month k months before it
const toJuly = Math.max(1, Math.min(12, (FY - LY) * 12 + 7 - LM));  // months left in the year being forecast, which ends in July
const reach = () => info().months ?? toJuly;                      // how many months ahead the map on screen looks

// ---------- sectors: numbers and shapes per kind, fetched when first needed ----------
const SEC = {};
const rings = g => g.map(poly => poly.map(r => {
  const out = [];
  for (let i = 0, x = 0, y = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; out.push([y / R.q, x / R.q]); }
  return out;
}));
function sectors(kind) {
  return (SEC[kind] ||= fetch(`data/sectors_${kind}.json`).then(r => r.json()).then(d => {
    for (const it of d.items) { it.ll = rings(it.g); delete it.g; }
    d.items.sort((a, b) => b.a - a.a);  // big ones first, so small ones are drawn on top and can be clicked
    return { kind, items: d.items, byId: new Map(d.items.map(it => [String(it.id), it])) };
  }));
}
const expOf = it => (typeof key() === "number" ? it.e[R.eyears.indexOf(S.year)] : it.L[key()]?.[0] ?? 0);
const actOf = it => it.c[R.cyears.indexOf(S.year)] ?? 0;
const hitOf = it => it.h[R.hyears.indexOf(S.year)] ?? 0;
const rankOf = (it, K) => 1 + K.items.filter(s => expOf(s) > expOf(it)).length;
// monthly series, newest last: the whole Amazon since 2016, a sector for 36 months
const monthly = (it, name) => (it ? it.m[R.months.names.indexOf(name)] : R.months[name]);
const ago = (a, k) => a[a.length - 1 - k] ?? 0;
const three = a => [ago(a, 0) + ago(a, 1) + ago(a, 2), ago(a, 12) + ago(a, 13) + ago(a, 14)];
// how a three-month total compares with a year before, as short text. Under 1 a year before, a ratio means nothing.
const delta = (now, prev, unit = " km²") => (prev < 1 ? (now < 0.05 ? null : km(now) + unit) : now / prev >= 2 ? "×" + fmt(now / prev, 1) : pcOf(now / prev - 1, 0, true));
const rising = (now, prev) => (now < 1 ? 0 : now / Math.max(prev, 1) >= 2 ? 2 : now / Math.max(prev, 1) >= 1.1 ? 1 : 0);
const enso = () => { const x = R.months.oni.v.at(-1), side = x >= 0.5 ? 0 : x <= -0.5 ? 1 : 2, a = Math.abs(x); return { x, side, word: side === 2 ? t().ensoLevel[2] : t().ensoLevel[side][a >= 2 ? 0 : a >= 1.5 ? 1 : a >= 1 ? 2 : 3] }; };

// ---------- month by month: what was measured, and what the model expects for the months ahead ----------
// data/monthly.json has both for the whole Amazon and for each state. A municipality, an Indigenous land or a
// conservation unit has no forecast of its own there: it gets its share of the Amazon forecast, the share being
// its part of the risk map on screen, and no range. That is the same split the yearly number uses.
function monthsOf(it) {
  const name = HAZ[S.hazard].series, hz = MO?.hazards?.[name], own = !it ? hz : S.kind === "uf" ? hz?.states?.[it.id] : null;
  const ym = k => { const d = new Date(LY, LM - 1 - k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const a = monthly(it, name) || [], [ry, rm] = R.months.end.split("-").map(Number), off = (LY - ry) * 12 + LM - rm;  // regions.json may end on another month
  const obs = own ? k => own.history[ym(k)] ?? 0 : k => ago(a, k - off);
  const part = it && !own && hz ? expOf(it) / info().risk_km2 : 1;
  // fire has no forecast amount: how much burns depends on a drought that has not happened yet (the owner's decision)
  if (S.hazard === "fire") return { obs, fc: null, part: 1, scaled: false, sums: null };
  const fc = own ? own.forecast : hz ? hz.forecast.map(f => ({ month: f.month, p50: f.p50 * part })) : null;
  return { obs, fc, part, scaled: !!(it && !own && hz), sums: (own || hz)?.sums };
}
// the months ahead added up. The file gives the model's own total and range for 3, 6 and 12 months; a sector
// scaled from the Amazon gets the middle only. Without those, the monthly middles are added.
function ahead(mo, n) {
  if (!mo.fc || mo.fc.length < n) return null;
  const t_ = mo.sums?.[n], add = k => mo.fc.slice(0, n).reduce((x, f) => x + f[k], 0), ranged = !mo.scaled && (t_ || mo.fc[0].p10 != null);
  return { km: t_ ? t_.p50 * mo.part : add("p50"), lo: ranged ? (t_ ? t_.p10 : add("p10")) : null, hi: ranged ? (t_ ? t_.p90 : add("p90")) : null };
}

// ---------- actions: what measured enforcement accounts for (data/actions.json, from pipeline/actions.py) ----------
// Per six months since the reference year: the clearing measured, and the clearing the panel implies had IBAMA's
// answer per km² cleared stayed at each municipality's level of that year. The gap is the part of the fall that
// measured enforcement accounts for. A state has its own two series and no interval; a municipality, an
// Indigenous land or a conservation unit has none, so the Amazon is shown.
const acting = () => S.scale === "actions";
const ymOf = s => s.split("-").map(Number);
function actsOf(it) {
  const own = (it && S.kind === "uf" && ACT.states?.[it.id]) || null, rows = own || ACT.semesters, sum = k => rows.reduce((x, r) => x + r[k], 0);
  const avoided = own ? sum("held") - sum("observed") : ACT.summary.avoided, [a, b] = ACT.reference.split(" to ").map(ymOf);
  return { own: !!own, rows, avoided, over: own ? avoided / Math.max(1, sum("observed")) : ACT.summary.avoided_share,
    since: month(ymOf(rows[0].start)[0], ymOf(rows[0].start)[1] - 1), from: month(a[0], a[1] - 1), to: month(b[0], b[1] - 1), years: t().to({ a: a[0], b: b[0] }) };
}
// a share in plain words where it is close to a simple fraction, as a percentage otherwise
const partOf = x => { const i = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4].findIndex(f => Math.abs(x - f) < 0.03); return i < 0 ? fmt(100 * x) + "%" : t().act.parts[i]; };

// ---------- the alert level (docs/BRAND.md): counted from the hazard's own alerts, plus El Niño for the
// whole Amazon or the forecast rank for a sector. 0 quiet, 1 watch, 2 warning, 3 alarm.
function alarm(it, K) {
  const L_ = t(), name = HAZ[S.hazard].series, a = monthly(it, name), why = [];
  let pts = 0;
  if (a) {
    const [now, prev] = three(a);
    pts += rising(now, prev);
  }
  if (it) {
    const r = rankOf(it, K), n = K.items.length;
    if (expOf(it) > 0) pts += r <= Math.max(1, Math.ceil(0.02 * n)) ? 2 : r <= Math.max(3, Math.ceil(0.1 * n)) ? 1 : 0;
  } else {
    const e = enso();
    if (e.x >= 1.5) pts += 1;
  }
  return { l: Math.min(3, pts), why };
}

// ---------- map: the Legal Amazon drawn from the grid, satellite only when close ----------
const SAT_ZOOM = 10, AMAZON = [[-18.05, -74.0], [5.3, -43.9]];
const PHONE = matchMedia("(max-width: 860px)"), narrow = () => PHONE.matches;
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rectOf = el => el.getBoundingClientRect();
// ---------- the stage and the dock. Of the two boxes, the map and the timeline, one is large, on the stage,
// and the other is docked: the timeline in the lower left corner, the map in the upper right. `front` is the one on the stage; in a link, f=chart.
const BOX = { map: $("mapbox"), chart: $("chartbox") };
let front = H.get("f") === "chart" ? "chart" : "map", swapping = false;
const docked = k => BOX[k].dataset.as === "dock";
const mapSmall = () => docked("map") && !narrow();  // (on a phone the map stays the page, under the timeline's sheet)
// The page has one stage, and one thing holds it at a time. The map is its default occupant; the timeline can
// take it, and so can a panel (About, or the API's instructions). Whenever something else has the stage the map
// is the small picture in the upper right corner, and it comes back when that thing is dismissed.
let panel = null;
const place = () => { BOX.chart.dataset.as = front === "chart" ? "stage" : "dock"; if (!swapping) BOX.map.dataset.as = front === "map" && !panel ? "stage" : "dock"; root.dataset.front = panel || front; };
place();
// ---------- a phone's sheets and menu. One sheet shows at a time. The bulletin is a sheet that shows its top
// and can be pulled up to the header (the same thing as coming to the stage) and pushed back. When the ranked
// list is open it has the lower half, or the whole screen when pulled up, and the bulletin waits behind a small
// handle under it (style.css). Each has a grip that follows the finger and then takes the nearest place; a tap
// on a grip moves it one place.
const SHEET = { list: "half" };
function sheetAt(at) {
  if (at) SHEET.list = at;
  $("list").dataset.at = SHEET.list;
  // the list's half-way place: under the Amazon, which on a phone sits right under the map's band
  if (narrow()) { const H = innerHeight, y = lengthOf("--top") + lengthOf("--panel-h") + 8 + (innerWidth - 20) / 1.27 - 26; root.style.setProperty("--list-top", Math.round(Math.max(H * 0.5, Math.min(y, H - 300))) + "px"); }  // (its top may stand on the Amazon's southern tip)
}
function grip(handle, sheet, done) {  // done(dy, v, top): where the sheet goes when it is let go: how far it was pulled (0: a tap), how fast (px a ms, down is positive), and where its top was left
  let y0 = null, top0 = 0, last = null, v = 0;
  handle.addEventListener("pointerdown", e => { if (!narrow()) return; y0 = e.clientY; top0 = rectOf(sheet).top; last = [e.clientY, performance.now()]; v = 0; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener("pointermove", e => { if (y0 == null) return; const now = performance.now(); if (now > last[1]) v = 0.6 * v + 0.4 * (e.clientY - last[0]) / (now - last[1]); last = [e.clientY, now]; sheet.classList.add("dragging"); sheet.style.top = Math.max(lengthOf("--top"), top0 + e.clientY - y0) + "px"; });
  const end = e => { if (y0 == null) return; const dy = e.clientY - y0, top = Math.max(lengthOf("--top"), top0 + dy), still = performance.now() - last[1] > 120; y0 = null; sheet.classList.remove("dragging"); sheet.style.top = ""; done(Math.abs(dy) < 8 ? 0 : dy, still ? 0 : v, top); };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("click", e => e.stopPropagation());  // the grip has spoken for itself
}
// The bulletin's sheet stays as tall as the finger leaves it, anywhere between its rest and the header: a tap
// on the grip takes it up or down whole, a flick does the same, and let go under its rest it settles there. The
// height is kept while the page is open; the plot is drawn again for it and the Amazon takes the middle of what is left.
// At rest or anywhere below the header, the whole sheet is the grip: a finger on its grip, its hazards, its level
// or its headline (or on the plot) that moves up or down more than a few pixels moves the sheet with it, and a
// touch that does not move is a tap on what is under it. Pulled up whole, the sheet scrolls, and only its grip row
// brings it down. A finger lets go while still moving: only a fast flick counts as a flick, judged on the last
// tenth of a second; a slower release leaves the sheet where it is. A cancelled touch leaves it where it was.
// The sheet is as tall as the reader leaves it, anywhere from its floor (its grip and its row of hazards, nothing
// cut in the middle of a row) to the header. Until it is moved it rests at the height the page gives it; after
// that it never goes back there by itself: only a tap on its grip, at the floor, opens it to that rest again.
const SHEETY = { want: null };  // the height the reader left the sheet at (null: never moved), kept for the page's life and fitted to the screen it is on
// Under its rest the sheet gives its room to the plot: the level band and the headline get smaller together (down
// to about 15 px, two lines at most); when that is not enough the band goes, then the headline. The plot keeps
// its bars at 90 px or more with their years under them, and that, with the grip and the hazards, is the floor.
const PLOT_MIN = 112;  // the plot's own height at the floor: 6 above, 90 of bars, 16 for the years
const sheetParts = () => { const g = $("sheet-grab"), b = $("body"), bar = $("bar"); return { top: Math.ceil(rectOf($("hazrow")).bottom - rectOf(g).top), bar: bar.offsetParent ? bar.offsetHeight : 0, pad: parseFloat(getComputedStyle(b).paddingBottom) || 0 }; };
const sheetFloor = () => { if (!docked("chart") || !$("hazrow").offsetParent) return SHEETY.floor || 180; const q = sheetParts(); return (SHEETY.floor = q.top + q.bar + PLOT_MIN + q.pad); };  // (measured on the sheet at rest; pulled up whole it is laid out otherwise, and the last measure stands)
function sheetFit() {
  if (!narrow()) return;
  const lean = () => { root.style.removeProperty("--shrink"); delete root.dataset.sheet; };
  if (SHEETY.want == null) { root.style.removeProperty("--peek-user"); return lean(); }
  const most = innerHeight - lengthOf("--top") - lengthOf("--cap") - 48, floor = sheetFloor(), h = Math.round(Math.max(floor, Math.min(SHEETY.want, most)));
  root.style.setProperty("--peek-user", h + "px");
  const rest = lengthOf("--peek-min");
  if (h >= rest || root.dataset.people != null) return lean();
  // the plot never has a smaller share of the sheet than it has at the rest: the headline and the band shrink to keep
  // it so, and when that is not enough the band goes, then the headline. (Once the headline has gone, what is left
  // under the hazards is all plot, and only that shrinks, down to the floor.)
  lean();
  const q = sheetParts(), plot = () => h - q.top - $("lead").offsetHeight - q.bar - q.pad, u = Math.min(1, (rest - h) / Math.max(1, rest - floor));
  const share0 = (rest - q.top - $("lead").offsetHeight - q.bar - q.pad) / rest, want = Math.max(PLOT_MIN, h * share0) - 1;
  root.style.setProperty("--shrink", u.toFixed(3));
  if (plot() < want) root.dataset.sheet = "noband";
  if (plot() < want) root.dataset.sheet = "nohead";
}
function sheetTo(peek, full) {
  if (peek != null) { SHEETY.want = Math.round(peek); sheetFit(); }
  if (full !== (front === "chart")) swap(); else refresh();
  setTimeout(() => { if (narrow()) { chart(); refresh(); } }, 380);  // (when the sheet has arrived)
}
addEventListener("resize", sheetFit);
let dragged = false;  // a drag of the sheet is never a tap on what it started on
{
  const cb = BOX.chart;
  let d = null;
  const release = (e, cancelled) => {
    if (!d || (e && e.pointerId !== d.id)) return;
    const was = d; d = null;
    cb.classList.remove("dragging");
    if (!was.moved) {  // a tap on the grip: at the floor it opens to the page's rest; otherwise up whole, or back to where it was left
      if (was.grab && !cancelled) { if (docked("chart") && SHEETY.want != null && SHEETY.want <= sheetFloor() + 2) { SHEETY.want = null; sheetFit(); sheetTo(null, false); } else sheetTo(null, front === "map"); }
      return;
    }
    dragged = true; setTimeout(() => (dragged = false), 400);
    const top = parseFloat(cb.style.top) || rectOf(cb).top, now = performance.now(), recent = was.pts.filter(p => now - p[1] < 100), v = !cancelled && recent.length > 1 ? (recent.at(-1)[0] - recent[0][0]) / Math.max(16, recent.at(-1)[1] - recent[0][1]) : 0;
    cb.style.top = "";
    const H = innerHeight - lengthOf("--cap"), up = lengthOf("--top");
    if (Math.abs(v) > 1.2) return sheetTo(v < 0 ? null : 0, v < 0);       // a flick (over 1,200 px a second): up whole, or down to its floor
    if (top < up + 70) return sheetTo(null, true);                         // left at the header: up whole
    sheetTo(H - top, false);                                               // left anywhere else: it stays there (under its floor, at the floor)
  };
  cb.addEventListener("pointerdown", e => {
    if (!narrow() || storyOn || (e.pointerType === "mouse" && e.button !== 0)) return;
    const grab = !!e.target.closest("#sheet-grab");
    if (!docked("chart") && !grab) return;  // pulled up whole, the sheet's content scrolls
    d = { id: e.pointerId, x0: e.clientX, y0: e.clientY, top0: rectOf(cb).top, moved: false, grab, pts: [[e.clientY, performance.now()]] };
  });
  addEventListener("pointermove", e => {  // (on the window: the finger leaves the sheet's old place as soon as it moves it)
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(e.clientX - d.x0)) return;
      d.moved = true; cb.classList.add("dragging");
      try { cb.setPointerCapture(e.pointerId); } catch (err) { /* the finger is already gone */ }
    }
    d.pts.push([e.clientY, performance.now()]); if (d.pts.length > 8) d.pts.shift();
    cb.style.top = Math.max(lengthOf("--top"), d.top0 + dy) + "px";
  });
  addEventListener("pointerup", e => release(e, false));
  addEventListener("pointercancel", e => release(e, true));
  cb.addEventListener("touchmove", e => { if (d?.moved) e.preventDefault(); }, { passive: false });  // (Safari: the page never scrolls or bounces under a sheet being moved)
  cb.addEventListener("click", e => { if (dragged) { dragged = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}
grip($("list-grab"), $("list"), dy => sheetAt(dy ? (dy < -40 ? "full" : dy > 40 ? "half" : SHEET.list) : SHEET.list === "half" ? "full" : "half"));
// a phone's header: the mark and one menu
const menu = on => { if (on) root.dataset.menu = ""; else delete root.dataset.menu; $("menu-btn").setAttribute("aria-expanded", !!on); };
$("menu-btn").onclick = e => { e.stopPropagation(); menu(root.dataset.menu == null); };
document.addEventListener("click", () => menu(false));
const listOn = () => S.mode === "prio" || (S.mode === "sectors" && S.rank);
// the people of the Indigenous land that is selected take the timeline's place, in its dock (on a phone, in its sheet)
let peopleOf = null;
const sideOn = listOn;  // the ranked list stands on the right of the page
// The room the page's own pieces take from the map, in pixels of its pane. The map is the whole page, and the
// Amazon is fitted beside what stands on it: under the header; right of the left column, which holds the map's
// panel at the top and the timeline's dock at the bottom; left of the ranked list when that is open. When the
// list opens or closes the Amazon glides once to its new place; nothing else moves it. While the story plays, or
// the list is open, the left column is kept whole: the story's caption stands in it.
// On a phone the panel is a band under the header and the Amazon sits right under it, above the sheets.
const lengthOf = name => parseFloat(css(name)) || 0;
// where the map's panel ends: the people's dock stops under it, however tall the kinds and the key make it
const panelAt = () => { root.style.setProperty("--panel-bottom", Math.round(rectOf($("mappanel")).bottom) + "px"); try { recentre(); } catch (err) { /* the map is not made yet */ } };  // (on a phone the Amazon follows the band's height)
new ResizeObserver(panelAt).observe($("mappanel"));
addEventListener("resize", panelAt);
// the story until its last step: the caption and the key have their room kept; at the last step the page is laid out as the tool is
const touring = () => storyOn && !/\bnav\b/.test(root.dataset.has || "");
// how tall the bulletin's sheet rests on a phone, in pixels (the stylesheet has it as the larger of its rest and the height the finger left it at)
const peekPx = () => { const raw = css("--peek").trim(), u = root.style.getPropertyValue("--peek-user"); return /^-?[\d.]+px$/.test(raw) ? parseFloat(raw) : u ? parseFloat(u) : lengthOf("--peek-min"); };
const CAP_FIT = 164, KEY_FIT = 140;  // on a phone, in the story: the room kept for the caption and for the key, the same at every step so the map stays put
let restPeek = 0;
const pagePad = () => parseFloat(getComputedStyle($("top")).paddingLeft) || 0;
function room() {
  const m = map.getSize(), top = lengthOf("--top");
  if (mapSmall()) return { top: 6, right: 6, bottom: 6, left: 6 };
  if (narrow()) {  // a phone: the Amazon in the middle of what is free between the map's band and what stands at the bottom (the caption, the sheet at rest, the list)
    const tour = touring(), cap = tour ? CAP_FIT : 0, panel = $("mappanel"), y0 = tour ? top + KEY_FIT : panel.offsetParent ? rectOf(panel).bottom : top, lt = lengthOf("--list-top");
    if (!root.dataset.people) restPeek = peekPx();  // (the people's taller sheet does not move the map: selecting never does)
    const y1 = root.dataset.list === "true" || (tour && restPeek > 0) ? (lt > 100 ? lt : m.y * 0.56) : m.y - restPeek - cap;  // (in the story the timeline takes the list's place: the map stays where the list left it)
    return { top: y0 + 6, right: 10, left: 10, bottom: Math.max(10, m.y - y1 + 6) };
  }
  const left = pagePad() + lengthOf("--rail") + lengthOf("--in");  // the right edge of the left column's surfaces
  if (RTL.has(lang)) return { top, left: sideOn() ? lengthOf("--list-w") : 0, right: left + 16, bottom: 0 };  // mirrored: the column is on the right, the list on the left
  return { top, right: sideOn() ? lengthOf("--list-w") : 0, bottom: 0, left, panel: Math.max(top + lengthOf("--panel-h"), $("mappanel").offsetParent ? rectOf($("mappanel")).bottom : 0), dock: Math.min(m.y - pagePad() - lengthOf("--dock-h"), docked("chart") && BOX.chart.offsetParent && !peopleOf ? rectOf(BOX.chart).top : 1e9), column: sideOn() || touring() };
}
// the same room as the padding of a view that is sent somewhere: a sector or a block is brought to the middle of what is free
const FIT = () => { const r = room(), g = mapSmall() || narrow() ? 0 : 14; return { paddingTopLeft: [r.left + g, r.top + g], paddingBottomRight: [r.right + g, r.bottom + g] }; };
const BOUNDS = [[M.north - M.rows * M.cell, M.west], [M.north, M.west + M.cols * M.cell]];
const FLOOR = 2;  // the furthest out the page itself ever sends the map (the docked picture); the reader's own limit is the fit, set in limit()
const map = L.map("map", { zoomControl: false, attributionControl: false, minZoom: FLOOR, maxZoom: 14, zoomSnap: 0, zoomDelta: 0.75, scrollWheelZoom: false, doubleClickZoom: false, inertiaMaxSpeed: 900 });  // (no maxBounds: hold() keeps the Amazon in sight)
L.control.zoom({ position: "bottomright" }).addTo(map);
// above the two: back to the whole Amazon, as on load for the layout of the moment. Dimmed when that is the view.
const homeBtn = L.DomUtil.create("a", "home");
homeBtn.href = "#"; homeBtn.setAttribute("role", "button");
homeBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/><circle cx="8" cy="8" r="1.5"/></svg>`;
document.querySelector(".leaflet-control-zoom").prepend(homeBtn);
L.DomEvent.disableClickPropagation(homeBtn);
L.DomEvent.on(homeBtn, "click", e => { L.DomEvent.stop(e); pristine = true; whole(!calm()); });
for (const [name, z] of [["veil", 250], ["base", 300], ["paint", 350], ["lines", 420], ["sel", 430], ["labels", 450]]) {
  const p = map.createPane(name);
  p.style.zIndex = z; p.style.pointerEvents = "none";
}
// (asked for with CORS, which the host allows, so the picture of the map that moves between the stage and its corner can hold the imagery too)
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { minZoom: SAT_ZOOM, maxNativeZoom: 17, crossOrigin: "anonymous" }).addTo(map);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { pane: "labels", minZoom: SAT_ZOOM, opacity: 0.9, crossOrigin: "anonymous" }).addTo(map);
const cvSectors = L.canvas({ padding: LITE ? 0.1 : 0.4 }), cvLines = L.canvas({ pane: "lines", padding: LITE ? 0.1 : 0.4 }), svgSel = L.svg({ pane: "sel", padding: 0.4 });
// The view that fits the whole Amazon in a pane of a given size, as fitBounds would choose it: the largest zoom,
// in sixteenths, at which it fits inside the padding, centred in what the padding leaves. Worked out here so
// that the view the map will have in its dock is known before it gets there.
function fitView(size, fit) {
  const b = L.latLngBounds(AMAZON), tl = L.point(fit.paddingTopLeft), br = L.point(fit.paddingBottomRight), sw = map.project(b.getSouthWest(), 0), ne = map.project(b.getNorthEast(), 0);
  const room_ = size.subtract(tl).subtract(br), room = L.point(Math.max(40, room_.x), Math.max(40, room_.y)), z0 = Math.log2(Math.min(room.x / (ne.x - sw.x), room.y / (sw.y - ne.y)));
  const z = Math.max(FLOOR, Math.min(map.getMaxZoom(), Math.floor(z0 * 16 + 1e-6) / 16));
  return { c: map.unproject(map.project(b.getSouthWest(), z).add(map.project(b.getNorthEast(), z)).divideBy(2).add(br.subtract(tl).divideBy(2)), z), z };
}
// any zoom the map is sent to by the page may be fractional; the reader's own zooming is in whole steps
// (satellite tiles show seams otherwise)
function view(v, animate) {
  if (v.z < map.getMinZoom()) map.setMinZoom(v.z);
  animate ? map.once("moveend", limit) : setTimeout(limit);
  animate ? map.flyTo(v.c, v.z, { duration: 0.6 }) : map.setView(v.c, v.z, { animate: false });  // (zoom is continuous: nothing snaps, for the page or for the reader's wheel and pinch)
}
// The whole Amazon on the page, as large as the room allows. The fit knows the Amazon's outline: its western
// side may reach into the room between the map's panel and the timeline's dock, while its north-west and its
// south-west stay beside the two; unless the column is to be kept whole. The largest zoom, in sixteenths, at which some place fits, and at that zoom the
// place nearest the middle of what is free.
const SHAPE = rings(R.border).flatMap(p => p[0]).map(q => map.project(q, 0));
function fitShape(size, r) {
  const b = L.latLngBounds(AMAZON), nw = map.project(b.getNorthWest(), 0), se = map.project(b.getSouthEast(), 0), pad = 14, gap = 30, whole_ = r.column;  // gap: the clear ground kept between the Amazon and the column's pieces
  const x0 = pad, x1 = size.x - r.right - pad, y0 = r.top + pad, y1 = size.y - r.bottom - pad;
  for (let z = fitView(size, { paddingTopLeft: [x0, y0], paddingBottomRight: [size.x - x1, size.y - y1] }).z; z >= FLOOR; z -= 1 / 16) {
    const s = 2 ** z, w = (se.x - nw.x) * s, h = (se.y - nw.y) * s, xMax = x1 - w, yMax = y1 - h, mid = (x0 + x1 - w) / 2;
    let best = null;
    for (let ty = y0; ty <= yMax + 0.5; ty += 4) {
      let tx = x0;  // how far right the outline must start, so that what of it is level with a piece of the column is beside it and not under it
      for (const q of SHAPE) { const y = (q.y - nw.y) * s + ty; if (whole_ || y < r.panel + gap || y > r.dock - gap) tx = Math.max(tx, r.left + gap - (q.x - nw.x) * s); }
      if (tx > xMax) continue;
      const x = Math.min(xMax, Math.max(tx, mid)), cost = Math.abs(x - mid) + Math.abs(ty - (y0 + y1 - h) / 2);
      if (!best || cost < best.cost) best = { x, y: ty, cost };
    }
    if (best) return { c: map.unproject(L.point(nw.x * s - best.x + size.x / 2, nw.y * s - best.y + size.y / 2), z), z };
  }
  return fitView(size, FIT());
}
const fitNow = () => { const size = map.getSize(); return mapSmall() || narrow() || RTL.has(lang) ? fitView(size, FIT()) : fitShape(size, room()); };
function whole(animate) { view(fitNow(), animate); }
// The furthest out the reader can zoom is the fit of the moment: the whole Amazon on the stage, never smaller.
// Worked out again whenever the stage changes (a resize, the list opening or closing, the map leaving or coming
// back). And the way back to that view is dimmed while it is the view.
function limit() {
  if (swapping) return;
  const v = fitNow(), z = mapSmall() ? FLOOR : v.z;
  if (map.getZoom() >= z - 1e-6 || z < map.getMinZoom()) map.setMinZoom(z);
  const at = map.getZoom() < v.z + 0.03 && map.latLngToContainerPoint(v.c).distanceTo(map.getSize().divideBy(2)) < 4;
  homeBtn.classList.toggle("off", at);
  homeBtn.setAttribute("aria-disabled", at);
}
// The Amazon cannot be lost: however the map is dragged, a good part of it stays in the part of the stage that
// nothing covers. (Leaflet's own maxBounds will not do: the fitted view puts the Amazon to one side of the pane,
// beside the left column, which bounds on the view would forbid.)
let keeping = false;
let holdT = 0;
function hold() {
  clearTimeout(holdT);
  holdT = setTimeout(held, 260);  // only once the hand has stopped: nothing is refitted or pulled back in the middle of a zoom or a drag
}
function held() {
  limit();
  if (keeping || swapping || mapSmall() || map._animatingZoom) return;
  const b = L.latLngBounds(AMAZON), nw = map.latLngToContainerPoint(b.getNorthWest()), se = map.latLngToContainerPoint(b.getSouthEast()), r = room(), s = map.getSize();
  const fix = (a0, a1, f0, f1) => { const need = 0.3 * Math.min(a1 - a0, f1 - f0); return Math.min(a1, f1) - Math.max(a0, f0) >= need ? 0 : a1 < f0 + need ? f0 + need - a1 : f1 - need - a0; };
  const dx = fix(nw.x, se.x, r.left ?? 0, s.x - r.right), dy = fix(nw.y, se.y, r.top, s.y - r.bottom);
  if (!dx && !dy) return;
  keeping = true;
  map.panBy([-dx, -dy], { animate: !calm(), duration: 0.3 });
  setTimeout(() => (keeping = false), 450);
}
let pristine = !H.get("v");  // until the reader moves the map, it keeps fitting the Amazon to its pane
let stageView = null;        // while the map is docked: the view to give back to the stage, if the reader had moved it
if (!pristine) { const [la, lo, z] = H.get("v").split(",").map(Number); stageView = { c: L.latLng(la, lo), z }; }
if (pristine || front === "chart") whole(); else view(stageView);
if (front === "map") stageView = null;
for (const ev of ["pointerdown", "wheel", "keydown"]) $("map").addEventListener(ev, () => (pristine = false), { capture: true, passive: true });
new ResizeObserver(() => { if (swapping) return; map.invalidateSize(); if (pristine || mapSmall()) whole(); else limit(); }).observe($("map"));
map.on("moveend", hold);
// The wheel, the + and − and the double click zoom through one easing, the page's own. (Leaflet's wheel handler
// starts a 250 ms animation and drops what the wheel says meanwhile, so a long scroll gave a few uneven lurches.)
// What the wheel says adds to a target zoom; at every frame the zoom goes part of the way there, about the
// point under the pointer. During the gesture the layers are only scaled, as in a pinch; they are drawn again
// once, when it settles. Nothing is dropped: a notch of a mouse wheel is half a level, a hand's width of two
// fingers on a trackpad about two, a pinch on a trackpad four times as strong.
const ZOOM = { per: 0.005, pinch: 0.02, tau: 75, to: null, at: null, t: 0, raf: 0 };
function zoomStep(now) {
  const z = map.getZoom(), dt = Math.max(0, Math.min(34, now - ZOOM.t)), gap = ZOOM.to - z, done = Math.abs(gap) < 0.01;
  ZOOM.t = now;
  const nz = done ? ZOOM.to : z + gap * (1 - Math.exp(-dt / ZOOM.tau)), half = map.getSize().divideBy(2);
  map._move(map.unproject(map.project(ZOOM.ll, nz).subtract(ZOOM.at.subtract(half)), nz), nz, { pinch: true, round: false });  // the place under the pointer is held exactly: nothing adds up from frame to frame  // (as a pinch: the layers scale, nothing is redrawn)
  if (done) { ZOOM.raf = 0; ZOOM.to = null; map._moveEnd(true); cellAgain(); return; }  // (the pointer has not moved: what is under it now is said at once)
  ZOOM.raf = requestAnimationFrame(zoomStep);
}
function zoomBy(levels, at) {  // at: the point of the map's pane that stays where it is
  if (ZOOM.to == null) { map._stop(); map._moveStart(true, false); ZOOM.to = map.getZoom(); ZOOM.t = performance.now(); }
  ZOOM.to = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), ZOOM.to + levels));
  const p = at || map.getSize().divideBy(2);
  if (!ZOOM.at || !ZOOM.ll || p.distanceTo(ZOOM.at) > 0.5 || !ZOOM.raf) { ZOOM.at = p; ZOOM.ll = map.containerPointToLatLng(p); }  // the place that stays where it is, read once for a pointer that stays
  if (!ZOOM.raf) ZOOM.raf = requestAnimationFrame(zoomStep);
}
$("map").addEventListener("wheel", e => {
  if ($("mapin").inert || e.target.closest(".leaflet-control")) return;
  e.preventDefault();
  const px = e.deltaY * (e.deltaMode === 1 ? 100 / 3 : e.deltaMode === 2 ? innerHeight : 1);  // lines and pages, in pixels
  zoomBy(-px * (e.ctrlKey ? ZOOM.pinch : ZOOM.per), map.mouseEventToContainerPoint(e));
}, { passive: false });
map.zoomIn = (d = map.options.zoomDelta) => (zoomBy(d), map);  // the + and the − of the control
map.zoomOut = (d = map.options.zoomDelta) => (zoomBy(-d), map);
map.on("dblclick", e => { if (e.originalEvent.shiftKey) zoomBy(-1, e.containerPoint); else if (!(S.mode === "cells" && e.originalEvent.pointerType !== "touch" && cellPx() < 8)) zoomBy(1, e.containerPoint); });  // (in Cells, from far, each click already zooms)

// outside the Legal Amazon: bare ground when far, a veil over the imagery when close
const GROUND = css("--ground"), INK = css("--ink");
const border = rings(R.border);
L.polygon([[[85, -180], [85, 180], [-85, 180], [-85, -180]], ...border.map(p => p[0])], { renderer: L.svg({ pane: "veil", padding: 0.4 }), stroke: false, fillColor: GROUND, fillOpacity: 0.78, interactive: false }).addTo(map);
L.polygon(border, { renderer: cvLines, fill: false, color: INK, opacity: 0.85, weight: 1.4, interactive: false }).addTo(map);

// a canvas stretched over part of the grid (Leaflet's SVG overlay takes any element, and a canvas needs no PNG encoding)
const sheet = (w, h, bounds, pane) => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return { cx: cv.getContext("2d"), layer: L.svgOverlay(cv, bounds, { pane, className: pane }).addTo(map) };
};
const rgba = (r, g, b, a) => ((a * 255) << 24 | b << 16 | g << 8 | r) >>> 0;
// Leaflet stretches an overlay evenly between its north and south edges. That is right for rows that are even
// in Mercator, not for a grid that is even in latitude: left as it is, the paint sits up to 15 km north of the
// ground in the middle of the Amazon. So every grid image is resampled by row before it is shown: output row j
// is even in Mercator and takes the grid row at that latitude.
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
function toMercatorRows(src, w, h, cellLat) {  // src: a Uint32Array [h, w], rows even in latitude from M.north down
  const img = new ImageData(w, h), out = new Uint32Array(img.data.buffer), y0 = mercY(M.north), y1 = mercY(M.north - h * cellLat);
  for (let j = 0; j < h; j++) {
    const lat = (2 * Math.atan(Math.exp(y0 + (j + 0.5) / h * (y1 - y0))) - Math.PI / 2) * 180 / Math.PI;
    const r = Math.min(h - 1, Math.max(0, Math.floor((M.north - lat) / cellLat)));
    out.set(src.subarray(r * w, r * w + w), j * w);
  }
  return img;
}
async function pixels(name) {
  const bmp = await createImageBitmap(await (await fetch(`data/${name}.png`)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  MEM.decode = Math.max(MEM.decode, M.cols * M.rows);
  const cv = new OffscreenCanvas(M.cols, M.rows), cx = cv.getContext("2d", { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  if (bmp.close) bmp.close();
  const d = cx.getImageData(0, 0, M.cols, M.rows).data;
  cv.width = cv.height = 0;  // (the picture and the canvas it was read through are let go at once)
  return d;
}
// the base map and the state lines, fetched when the map is first on screen (on a phone that is after the timeline)
let base, baseCv, started = false;
const names = L.layerGroup();
let baseIn; const baseReady = new Promise(r => (baseIn = r));  // the base map has arrived (or failed): what the story needs later is fetched after it
setTimeout(() => baseIn(), 15000);
function startMap() {
  if (started) return;
  started = true;
  // every cell is a mix of forest, water, natural non-forest and cleared land (see pipeline/regions.py)
  pixels("base").then(d => {
    const px = new Uint32Array(M.cols * M.rows);
    const WATER = [156, 196, 212], NATURAL = [216, 214, 184], CLEARED = [236, 229, 210];
    for (let i = 0, j = 0; i < px.length; i++, j += 4) {
      if (d[j] === 255 && d[j + 1] === 255) continue;
      const f = d[j] / 240, w = d[j + 1] / 240, n = d[j + 2] / 240, c = Math.max(0, 1 - f - w - n);
      px[i] = rgba(f * FOREST[0] + w * WATER[0] + n * NATURAL[0] + c * CLEARED[0] | 0, f * FOREST[1] + w * WATER[1] + n * NATURAL[1] + c * CLEARED[1] | 0, f * FOREST[2] + w * WATER[2] + n * NATURAL[2] + c * CLEARED[2] | 0, 1);
    }
    const B = sheet(M.cols, M.rows, BOUNDS, "base");
    B.cx.putImageData(toMercatorRows(px, M.cols, M.rows, M.cell), 0, 0);
    base = B.layer; baseCv = B.cx.canvas;
    zoomed();
    if ($("about").open) figure();
  }).finally(baseIn);
  // state lines and names are always there, to say where you are
  sectors("uf").then(U => {
    for (const it of U.items) {
      L.polygon(it.ll, { renderer: cvLines, fill: false, color: INK, opacity: 0.6, weight: 0.9, interactive: false }).addTo(map);
      const ring = it.ll.map(p => p[0]).sort((a, b) => b.length - a.length)[0];
      let A = 0, cy = 0, cx = 0;
      for (let i = 0; i < ring.length; i++) {
        const [y0, x0] = ring[i], [y1, x1] = ring[(i + 1) % ring.length], k = x0 * y1 - x1 * y0;
        A += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
      }
      L.marker([cy / (3 * A), cx / (3 * A)], { pane: "labels", interactive: false, keyboard: false, icon: L.divIcon({ className: "", iconSize: [0, 0], html: `<div class="state-name">${esc(it.n)}</div>` }) }).addTo(names);
    }
    zoomed();
  });
}

// ---------- hazard colour on the map: forest green, then the hazard's four steps ----------
const steps = () => HAZ[S.hazard].steps;
const mix = k => {  // k in 0..1 along the four steps
  const s = steps(), x = Math.min(0.9999, Math.max(0, k)) * 3, i = Math.floor(x), u = x - i;
  return s[i].map((c, n) => c + (s[i + 1][n] - c) * u | 0);
};

// ---------- cells ----------
// Nothing here becomes one big canvas. Every layer is kept as arrays, one value per cell, with coarser levels
// above it, and the map draws only the window on screen from the finest level whose cell is at least a screen
// pixel. Each screen row takes the grid row at its own latitude, so a cell lands on its ground.
//
// The shorter windows, the other hazards and a year that has no chances are painted at 1 km, from one RGB PNG
// per layer (see pipeline/export.py for the encoding): the forest ranked highest, from the hazard's first step
// to its last, and in a replayed year the cells where clearing was mapped. Here a level holds the cell's colour;
// a coarser block takes the most telling cell in it.
const CLEARED_CODE = 26; // at least 1 ha of the cell cleared: round(255 * sqrt(0.01))
const MAPPED = rgba(...DARK, 1);
async function kmLevels(y, I) {
  const d = await pixels(y), code = k => Math.round(255 * Math.cbrt(k));
  const lo = Math.max(1, code(I.cut["5"])), hi = Math.max(lo + 1, code(I.cut["0.2"])), past = I.actual_km2 != null;
  const lut = new Uint32Array(256);
  for (let v = lo; v < 256; v++) { const c = mix(Math.min(1, (v - lo) / (hi - lo))); lut[v] = rgba(c[0], c[1], c[2], 1); }
  const color = new Uint32Array(M.cols * M.rows), raw8 = new Uint8Array(M.cols * M.rows), tell = new Uint8Array(M.cols * M.rows), clr = past ? new Uint8Array(M.cols * M.rows) : null;  // tell: which cell wins in a block
  for (let i = 0; i < color.length; i++) {
    const R_ = d[4 * i], cleared = past && d[4 * i + 1] >= CLEARED_CODE;
    raw8[i] = R_;
    color[i] = cleared ? MAPPED : lut[R_];
    if (cleared) clr[i] = 1; else if (color[i]) tell[i] = Math.min(255, R_);
  }
  const levels = [{ f: 1, cols: M.cols, rows: M.rows, color, tell, clr, code: raw8 }];
  for (const k of [3, 2, 2]) {  // 3 km, 6 km and 12 km blocks
    const p = levels.at(-1), c2 = Math.ceil(p.cols / k), r2 = Math.ceil(p.rows / k), n2 = (p.f * k) ** 2;
    const q = { f: p.f * k, cols: c2, rows: r2, color: new Uint32Array(c2 * r2), raw: new Uint32Array(c2 * r2), tell: new Uint8Array(c2 * r2), n: new Uint16Array(c2 * r2), clr: clr && new Uint16Array(c2 * r2) };
    for (let r = 0; r < p.rows; r++) for (let c = 0, o = r * p.cols, j = ((r / k) | 0) * c2; c < p.cols; c++) {
      const i = j + ((c / k) | 0);
      if (clr) q.clr[i] += p.clr[o + c];
      if (!p.tell[o + c]) continue;
      q.n[i] += p.n ? p.n[o + c] : 1;
      if (p.tell[o + c] > q.tell[i]) { q.tell[i] = p.tell[o + c]; q.raw[i] = (p.raw || p.color)[o + c]; }
    }
    // a block with only a few painted cells is fainter, so a far view does not overstate how much is at risk;
    // and it darkens with the share of it where clearing was mapped
    for (let i = 0; i < q.color.length; i++) {
      const a = clr && q.clr[i] ? Math.min(1, 1.1 * Math.sqrt(q.clr[i] / n2)) : 0, c = q.raw[i];
      q.color[i] = !q.tell[i] ? (a ? rgba(...DARK, a) : 0)
        : a ? rgba(...[0, 8, 16].map((sh, n) => (c >> sh & 255) + (DARK[n] - (c >> sh & 255)) * a | 0), 1)
        : (c & 0xffffff | (255 * (0.3 + 0.7 * Math.sqrt(q.n[i] / n2)) << 24)) >>> 0;
    }
    levels.push(q);
  }
  return levels;
}
// The yearly clearing forecast is a chance for every forest cell. p<year>.png is one grey band on the 500 m
// grid: 0 is not forest, otherwise chance = (value / 255) squared, the calibrated chance that the cell loses at
// least a hectare in that PRODES year. In a replay the f<year>.png mask adds where clearing was mapped (its bit
// 1: at least 1% of the cell). Seen from far, a block of cells takes the highest step that a fifth of its
// forest cells reach: a hot spot does not vanish when the map is small, and a single cell does not paint a
// whole block. With a fifth, red covers about as much of the far view as it does of the cells (0.13% of them
// in 2027). The chances are very skewed (three quarters of the cells are under 0.1%), so most of the forest
// stays green, the low chances stain it dark red and the bright reds are rare.
const PCUT = [0.001, 0.01, 0.05, 0.2];  // the steps of the legend: under 0.1%, to 1%, to 5%, to 20%, over
const PCLS = Uint8Array.from({ length: 256 }, (_, v) => PCUT.filter(c => (v / 255) ** 2 >= c).length);
const FAR_PART = 0.2;
async function decodeProb(urlP, urlF, cols, rows, cuts, part, steps, mult) {
  const raw = async url => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
    const T = 1024, cv = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(T, T) : Object.assign(document.createElement("canvas"), { width: T, height: T });
    const cx = cv.getContext("2d", { willReadFrequently: true }), out = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y += T) for (let x = 0; x < cols; x += T) {
      const w = Math.min(T, cols - x), h = Math.min(T, rows - y);
      cx.clearRect(0, 0, T, T);
      cx.drawImage(bmp, x, y, w, h, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data;
      for (let r = 0; r < h; r++) for (let c = 0, o = (y + r) * cols + x, i = 4 * r * w; c < w; c++, i += 4) out[o + c] = d[i];
    }
    if (bmp.close) bmp.close();
    return out;
  };
  const val = await raw(urlP), sq = Float64Array.from({ length: 256 }, (_, v) => (v / 255) ** 2), cls = Uint8Array.from(sq, x => cuts.filter(c => x >= c).length);
  let bits = null;
  if (urlF) {  // one bit per cell: clearing was mapped in it that year
    const f = await raw(urlF);
    bits = new Uint8Array(Math.ceil(val.length / 8));
    for (let i = 0; i < f.length; i++) if (((f[i] + 42) / 85 | 0) & 2) bits[i >> 3] |= 1 << (i & 7);
  }
  // per step of the legend: how many forest cells, their chances added up, and how many had clearing
  const stats = { n: [0, 0, 0, 0, 0], sum: [0, 0, 0, 0, 0], clr: bits ? [0, 0, 0, 0, 0] : null };
  // far views: blocks of 1, 3, 6 and 12 km. Each counts its forest cells, how many reach each step, and how many had clearing.
  const far = steps.map(f => {
    const c = Math.ceil(cols / f), r = Math.ceil(rows / f), A = f > 12 ? Uint16Array : Uint8Array;
    return { f, cols: c, rows: r, at: Int32Array.from({ length: cols }, (_, x) => (x / f) | 0), cnt: new A(c * r), ge: [0, 1, 2, 3].map(() => new A(c * r)), nclr: bits && new A(c * r), mx: new Uint8Array(c * r) };
  });
  for (let r = 0; r < rows; r++) {
    const off = far.map(l => ((r / l.f) | 0) * l.cols);
    for (let c = 0, o = r * cols; c < cols; c++) {
      const v = val[o + c];
      if (!v) continue;
      const k = cls[v], cl = bits ? (bits[(o + c) >> 3] >> ((o + c) & 7)) & 1 : 0;
      stats.n[k]++; stats.sum[k] += sq[v];
      if (cl) stats.clr[k]++;
      for (let n = 0; n < far.length; n++) {
        const l = far[n], i = off[n] + l.at[c];
        l.cnt[i]++;
        if (v > l.mx[i]) l.mx[i] = v;
        for (let s = 0; s < k; s++) l.ge[s][i]++;
        if (cl) l.nclr[i]++;
      }
    }
  }
  // a block's byte: the low half is 1 + the highest step that `part` of its forest cells reach (one cell at
  // least), the high half is the highest step any of its cells reaches. clr: how much of the block had clearing.
  const levels = [{ f: 1, cols, rows, val, bits }, ...far.map(l => {
    const k = new Uint8Array(l.cnt.length), clr = bits && new Uint8Array(l.cnt.length), n2 = l.f * l.f;
    for (let i = 0; i < k.length; i++) {
      if (!l.cnt[i]) continue;
      const need = Math.max(1, Math.ceil(part * l.cnt[i]));
      let a = 0, top = 0;
      for (let s = 0; s < 4; s++) { if (l.ge[s][i] >= need) a = s + 1; if (l.ge[s][i]) top = s + 1; }
      k[i] = (a + 1) | (top << 4);
      if (clr && l.nclr[i]) clr[i] = Math.max(1, Math.round(255 * l.nclr[i] / n2));
    }
    return { f: l.f, cols: l.cols, rows: l.rows, k, clr, mx: l.mx };  // mx: the highest chance byte among the block's cells
  })];
  if (mult > 1) for (const a of [stats.n, stats.sum, stats.clr]) if (a) for (let k = 0; k < a.length; k++) a[k] *= mult;  // (a square of the half-resolution picture stands for four cells)
  return { levels, stats };
}
function loadProb(y, F, withTruth) {
  const url = f => new URL(`data/${f}${y}${F.suf}.png`, location.href).href, args = [url("p"), withTruth ? url("f") : null, F.cols, F.rows, PCUT, FAR_PART, F.far, F.mult];
  MEM.decode = Math.max(MEM.decode, F.cols * F.rows);
  return new Promise(done => {
    let w;
    const here = () => { if (w) w.terminate(); done(decodeProb(...args)); };  // no worker, or no canvas inside one: decode here
    try {
      w = new Worker(URL.createObjectURL(new Blob([`onmessage = async e => { try { const g = await (${decodeProb})(...e.data); postMessage(g, g.levels.flatMap(l => [l.val, l.bits, l.k, l.clr, l.mx].filter(Boolean).map(a => a.buffer))); } catch (err) { postMessage(null); } };`], { type: "text/javascript" })));
      w.onmessage = e => { if (e.data) { w.terminate(); done(e.data); } else here(); };
      w.onerror = here;
      w.postMessage(args);
    } catch (err) { here(); }
  });
}
// which years have a p file: asked once per year, without downloading it
const probs = {};
const hasProb = y => (probs[y] ??= M.years[y]?.flags500 ? fetch(`data/p${y}${LITE ? "_h" : ""}.png`, { method: "HEAD" }).then(r => r.ok).catch(() => false) : Promise.resolve(false));
// the five steps: forest under 0.1% is left as the base map shows it, green; then clearing's four reds
const PRGB = HAZ.clear.steps, PCOL = [0, ...PRGB.map(c => rgba(...c, 1))], PCSS = [FOREST, ...PRGB].map(c => `rgb(${c})`);
const pct = c => pcOf(c, c < 0.01 ? 1 : 0);
const chanceText = ch => (ch < PCUT[0] ? t().under({ c: pct(PCUT[0]) }) : pct(ch));

let grid = null;  // what the cells layer draws: { key, cell, levels }. One layer at a time (a 500 m one is 45 MB).
// The story draws the same layer in parts. off: nothing yet. th: only the blocks whose highest chance reaches this
// byte, which lets the red spread outward from where the chance is highest. mapped: with the clearing on top.
const veil = { off: false, th: 0, mapped: true, amt: 1 };  // amt: how far the mapped clearing has come in, 0 to 1
// A canvas the size of the view, redrawn after every move. Leaflet's renderer base keeps it placed, and scales
// it during a zoom animation.
const GridLayer = L.Renderer.extend({
  _initContainer() { this._container = L.DomUtil.create("canvas", "cells"); this._cx = this._container.getContext("2d"); },
  _destroyContainer() { L.DomUtil.remove(this._container); },
  _update() {
    if (this._map._animatingZoom && this._bounds) return;
    L.Renderer.prototype._update.call(this);
    const b = this._bounds, size = b.getSize(), cv = this._container, map_ = this._map;
    L.DomUtil.setPosition(cv, b.min);
    cv.width = size.x; cv.height = size.y;
    cv.style.width = size.x + "px"; cv.style.height = size.y + "px";
    if (!grid || veil.off || !cellsOn() || grid.key !== key() || !size.x || !size.y) { delete cv.dataset.key; return; }
    // the finest level whose cell is at least one screen pixel wide
    const px = grid.cell * 256 * 2 ** map_.getZoom() / 360, lv = grid.levels.find(l => px * l.f >= 1) || grid.levels.at(-1), cell = grid.cell * lv.f;
    const lng0 = map_.layerPointToLatLng(b.min).lng, dLng = (map_.layerPointToLatLng(b.max).lng - lng0) / size.x;
    const col = new Int32Array(size.x), row = new Int32Array(size.y);
    for (let x = 0; x < size.x; x++) { const c = Math.floor((lng0 + (x + 0.5) * dLng - M.west) / cell); col[x] = c >= 0 && c < lv.cols ? c : -1; }
    for (let y = 0; y < size.y; y++) { const r = Math.floor((M.north - map_.layerPointToLatLng([b.min.x, b.min.y + y + 0.5]).lat) / cell); row[y] = r >= 0 && r < lv.rows ? r : -1; }
    const img = this._cx.createImageData(size.x, size.y), out = new Uint32Array(img.data.buffer);
    if (grid.prob) this._chances(lv, row, col, size, out);
    else for (let y = 0, i = 0; y < size.y; y++) {
      if (row[y] < 0) { i += size.x; continue; }
      for (let x = 0, o = row[y] * lv.cols; x < size.x; x++, i++) if (col[x] >= 0) out[i] = lv.color[o + col[x]];
    }
    this._cx.putImageData(img, 0, 0);
    cv.dataset.key = grid.key; cv.dataset.f = lv.f; cv.dataset.cell = cell; cv.dataset.min = grid.prob ? S.min : 0;
  },
  // every forest cell by its chance. Cells under the lowest step, or under the chosen minimum, are left to the
  // green base map; cells where clearing was mapped are yellow, on top. A far block shows the step a fifth of its
  // cells reach; when a minimum is chosen it is kept, fainter, if any of its cells reaches it; and it darkens
  // with the share of it that had clearing.
  _chances(lv, row, col, size, out) {
    const min = S.min, faint = PCOL.map(c => c && ((c & 0xffffff) | (120 << 24)) >>> 0), th = veil.th, soft = 14, shown = veil.mapped && veil.amt > 0, amt = veil.amt, MAPK = PRGB.map(c => rgba(...c.map((x, n) => x + (DARK[n] - x) * amt | 0), 1));
    const dark = (k, a) => (k ? rgba(...PRGB[k - 1].map((c, n) => c + (DARK[n] - c) * a | 0), 1) : rgba(...DARK, a));  // clearing over a step, or over the base map
    for (let y = 0, i = 0; y < size.y; y++) {
      if (row[y] < 0) { i += size.x; continue; }
      for (let x = 0, o = row[y] * lv.cols; x < size.x; x++, i++) {
        const c = col[x], j = o + c;
        if (c < 0) continue;
        if (lv.val) {
          const v = lv.val[j];
          if (!v) continue;
          if (v < th) continue;
          const k = PCLS[v], on = k && k >= min;
          if (shown && lv.bits && (lv.bits[j >> 3] >> (j & 7)) & 1) out[i] = amt >= 1 ? MAPPED : on ? MAPK[k - 1] : rgba(...DARK, amt);
          else if (on) out[i] = PCOL[k];
        } else if (lv.k[j]) {
          if (lv.mx[j] < th) continue;
          const k = (lv.k[j] & 15) - 1, on = k && k >= min;
          if (shown && lv.clr && lv.clr[j]) out[i] = dark(on ? k : 0, amt * Math.min(1, 0.55 + 1.8 * Math.sqrt(lv.clr[j] / 255)));
          else if (on) out[i] = th && lv.mx[j] < th + soft ? ((PCOL[k] & 0xffffff) | ((255 * (lv.mx[j] - th + 1) / soft) << 24)) >>> 0 : PCOL[k];  // the edge of the stain is soft
          else if (min && (lv.k[j] >> 4) >= min) out[i] = faint[min];
        }
      }
    }
  },
});
const gridLayer = new GridLayer({ pane: "paint", padding: 0.2 }).addTo(map);
async function paint() {
  const y = key(), I = info(), F = I.flags500 && ras(I.flags500);
  if (!cellsOn() || grid?.key === y) return zoomed();
  if (storyOn && y !== FY) return zoomed();  // the story brings its own, lighter copy of the year it replays
  if (storyOn) await baseReady;  // (the story opens on the base map alone, so it has the line to itself; the tool needs both, and fetches both at once)
  if (storyOn && LITE && LOSS.busy) await LOSS.busy;  // (on a phone one picture is decoded at a time: the masks of the loss first, then the chances)
  if (grid && grid.key !== y && !storyOn) grid = null;  // the year that was on screen is let go before the next is decoded
  const g = S.hazard === "clear" && typeof y === "number" && await hasProb(y)
    ? { key: y, prob: true, cell: F.cell, ...await loadProb(y, F, I.actual_km2 != null) }
    : { key: y, cell: M.cell, levels: await kmLevels(y, I) };
  if (y !== key() || !cellsOn()) { if (storyOn && y === FY) keep = g; return; }  // the story may be on another year by now: the forecast is kept for when it returns
  grid = g;
  zoomed();
  legend();
  if ($("about").open) figure();  // its last plane is this map
}
// the line that stands outside the legend box: how many cells, for the chances on screen
function shareLine() {
  const L_ = t(), n3 = x => fmt(round(Math.max(1, x), 3)), st = grid?.stats, past = !!st?.clr;
  const on = cellsOn() && grid?.prob && grid.key === key() && S.min > 0;
  $("share").hidden = !on;
  if (!on) return;
  const from = a => a.slice(S.min).reduce((x, v) => x + v, 0), all = a => a.reduce((x, v) => x + v, 0);
  $("share").innerHTML = (past ? L_.pSharePastMin : L_.pShareMin)({ n: n3(from(st.n)), cut: pct(PCUT[S.min - 1]), share: fmt(100 * (past ? from(st.clr) / all(st.clr) : from(st.sum) / all(st.sum))) });
}
// what a cell says when the pointer or a finger is on it. Close up it is the cell; from far it is the block on
// screen: the highest chance among its cells and, in a replay, how many of them had clearing.
// The first line: what the layer on screen says of the cell under the pointer. For the yearly clearing forecast,
// its chance (from far, the highest among the cells of the block; in a replay, whether clearing was mapped). For
// the 1 km layers, the hectares the layer expects there in its window, decoded as pipeline/export.py encodes them
// (the red channel is 255 times the cube root of the km²); for fire, which has no forecast amount, the band of
// the forest the cell stands in. Nothing where the layer has nothing.
function cellLine(ll, side) {  // side: how many cells across the square the pointer stands for (the chances only)
  const L_ = t();
  if (!cellsOn() || !grid || grid.key !== key() || !gridLayer._container.dataset.key) return "";
  const l0 = grid.levels[0], r = Math.floor((M.north - ll.lat) / grid.cell), c = Math.floor((ll.lng - M.west) / grid.cell);
  if (r < 0 || c < 0 || r >= l0.rows || c >= l0.cols) return "";
  if (!grid.prob) {
    const code = l0.code?.[r * l0.cols + c], I = info(), hz = S.hazard;
    if (!code) return "";
    const km2 = (code / 255) ** 3;
    if (hz === "fire") { const q = ["0.2", "1", "5"].find(k => km2 >= I.cut[k]); return q ? L_.cellFire({ p: fmt(+q, q === "0.2" ? 1 : 0) }) : L_.cellFireRest; }
    return 100 * km2 < 0.95 ? L_.cellHaLow[hz]({ n: I.months, count: I.months }) : L_.cellHa[hz]({ ha: approx(100 * km2), n: I.months, count: Math.round(100 * km2) });
  }
  const f = side || +gridLayer._container.dataset.f || 1;
  let v = 0, n = 0, clr = 0;
  for (let y = r - r % f; y < Math.min(l0.rows, r - r % f + f); y++) for (let x = c - c % f, j = y * l0.cols + x; x < Math.min(l0.cols, c - c % f + f); x++, j++) {
    if (!l0.val[j]) continue;
    n++;
    if (l0.val[j] > v) v = l0.val[j];
    if (l0.bits && (l0.bits[j >> 3] >> (j & 7)) & 1) clr++;
  }
  if (!v) return "";
  const ch = (v / 255) ** 2, low = ch < PCUT[0], o = { y: grid.key, p: chanceText(ch), clr: fmt(clr), n: fmt(n), count: n };
  if (f === 1) return l0.bits ? (clr ? L_.cellPast.yes : L_.cellPast.no)(o) : L_.cellFc(o);
  return l0.bits ? L_.areaPast[(low ? "every" : "upto") + (clr ? "Yes" : "No")](o) : (low ? L_.areaFc.every : L_.areaFc.upto)(o);
}
// The second line: where that is. The municipality and its state, and the Indigenous land or conservation unit
// the point lies in. The shapes are the sectors', fetched the first time they are asked for; until they are in,
// the first line stands alone.
const WHERE = { K: null, asked: false, last: {} };
const ringHas = (ring, la, lo) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [y1, x1] = ring[i], [y2, x2] = ring[j]; if ((y1 > la) !== (y2 > la) && lo < x1 + (la - y1) * (x2 - x1) / (y2 - y1)) inside = !inside; } return inside; };
const sectorHas = (it, la, lo) => it.ll.some(poly => ringHas(poly[0], la, lo) && !poly.slice(1).some(h => ringHas(h, la, lo)));
function placeAt(ll) {
  if (!WHERE.K) { if (!WHERE.asked) { WHERE.asked = true; Promise.all(["mun", "ti", "uc"].map(sectors)).then(K => { WHERE.K = K; if (map.hasLayer(cellTip)) WHERE.show?.(); }).catch(() => {}); } return ""; }  // (once they are in, whatever is being said gets its second line)
  const find = (K, k) => (WHERE.last[k] && sectorHas(WHERE.last[k], ll.lat, ll.lng) ? WHERE.last[k] : (WHERE.last[k] = K.items.find(it => (it.bb ||= L.latLngBounds(it.ll.flat(2))).contains(ll) && sectorHas(it, ll.lat, ll.lng)) || null));
  const [mun, ti, uc] = WHERE.K.map((K, n) => find(K, n));
  const land = ti ? `${t().tag.ti} ${ti.n}` : uc ? `${t().tag.uc} ${uc.n}` : "";
  return mun ? (land ? t().cellPlaceIn : t().cellPlace)({ mun: mun.n, uf: mun.s, land }) : "";
}
// The pointer shows it, at every zoom, and the cell (from far, the square of cells that is one mark on the screen)
// under it is let a little see-through, with a thin outline, so the ground shows. In Cells a click zooms in on
// that point, two levels at a time, until the cells are drawn one by one; there, as with a tap, it pins what the
// cell says, until a click elsewhere or Escape. Nothing is said while the map is being moved or zoomed.
const cellTip = L.tooltip({ className: "tip cell", direction: "top", offset: [0, -8], opacity: 1 });
const cellMark = L.rectangle([[0, 0], [0, 0]], { renderer: svgSel, interactive: false, color: INK, weight: 1, opacity: 0.9, fillColor: `rgb(${FOREST})`, fillOpacity: 0.45, className: "cellmark" });  // (the ground at 45% over the paint: the paint at 55%)
let pin = null, said = "", marked = "";
const cellPx = () => { const c = map.getCenter(); return grid ? map.project([c.lat, c.lng + grid.cell]).x - map.project(c).x : 99; };  // how wide a cell is on the screen
// the square the pointer stands for: one cell when cells can be told apart, otherwise as many as make 10 px (whole marks of the far view)
const cellSide = () => { const f = +gridLayer._container.dataset.f || 1, px = cellPx(); return !grid?.prob || px >= 8 ? 1 : f * Math.ceil(10 / px / f); };
function cellQuiet() { pin = null; said = marked = ""; map.closeTooltip(cellTip); cellMark.remove(); }
function cellSay(e) {
  if (mapSmall()) return;
  const moving = e.type === "mousemove", touch = e.originalEvent?.pointerType === "touch";
  if (moving && (ZOOM.to != null || map.dragging?.moving())) return;
  if (moving) { if (pin && map.hasLayer(cellTip)) return; pin = null; }
  const ll = e.latlng, f = cellSide(), line = cellLine(ll, f);
  if (!line) return cellQuiet();
  if (!moving && !touch && S.mode === "cells" && cellPx() < 8) {  // from far a click is the way in: on the point that was clicked
    if (ZOOM.to == null) { cellQuiet(); zoomBy(Math.min(2, Math.max(0.5, Math.log2(8.5 / cellPx()))), e.containerPoint); }
    return;
  }
  pin = moving ? null : ll;
  const c = grid.cell, r0 = Math.floor((M.north - ll.lat) / c), c0 = Math.floor((ll.lng - M.west) / c), key_ = `${r0 - r0 % f},${c0 - c0 % f},${f}`;
  if (key_ !== marked) { marked = key_; cellMark.setBounds([[M.north - (r0 - r0 % f + f) * c, M.west + (c0 - c0 % f) * c], [M.north - (r0 - r0 % f) * c, M.west + (c0 - c0 % f + f) * c]]); if (!map.hasLayer(cellMark)) cellMark.addTo(map); }
  const show = () => {
    const where = placeAt(ll), html = esc(line[0].toUpperCase() + line.slice(1)) + (where ? `<small>${esc(where)}</small>` : "");
    cellTip.setLatLng(ll);
    if (html !== said) cellTip.setContent(said = html);  // (the words are set only when they change: a move of the pointer is a move of the tip)
    if (!map.hasLayer(cellTip)) map.openTooltip(cellTip);
  };
  WHERE.show = show;
  show();
}
// where the pointer was last seen on the map: when a zoom settles under a still pointer, the cell there is said again without waiting for it to move
let pointerAt = null;
function cellAgain() { if (pointerAt && !pin && !mapSmall()) cellSay({ type: "mousemove", containerPoint: pointerAt, latlng: map.containerPointToLatLng(pointerAt) }); }
map.on("mousemove", e => { pointerAt = e.containerPoint; });
map.on("mousemove click", cellSay);
map.on("mouseout", () => { pointerAt = null; if (!pin) cellQuiet(); });
map.on("movestart zoomstart", () => { if (!pin || ZOOM.to != null) cellQuiet(); });
function zoomed() {
  const z = map.getZoom();
  gridLayer._container.style.opacity = z < SAT_ZOOM ? 1 : 0.7;  // over imagery, let the ground show through
  gridLayer._update();
  if (base) { base.setOpacity(z >= SAT_ZOOM ? 0 : 1); base.getElement().classList.toggle("crisp", z >= 9); }
  z < 7 ? names.addTo(map) : names.remove();
  if (here) z < 9 ? here.addTo(map) : here.remove();
  $("credit").hidden = z < SAT_ZOOM;
}
map.on("zoomend", zoomed);

// ---------- sectors on the map: five classes of forecast risk per area. The lowest is filled with the
// scale's green, like its swatch in the legend; the others take the hazard's four steps, up to red for clearing. ----------
let shown = null, outline = null, cls = new Map();
const classOf = it => cls.get(it) ?? 0;
function styleOf(it) {
  const c = classOf(it), close = map.getZoom() >= SAT_ZOOM, thin = shown === "mun";
  return { fillColor: `rgb(${c ? steps()[c - 1] : FOREST})`, fillOpacity: close ? 0.5 : 1, color: INK, opacity: thin ? 0.3 : 0.6, weight: thin ? 0.5 : 0.8 };
}
function tipOf(it, K) {
  const L_ = t(), v = { exp: approx(expOf(it)), act: km(actOf(it)), rank: ordinal(rankOf(it, K)), n: K.items.length };
  return `<b>${esc(it.n)}${it.s ? ", " + it.s : ""}</b><span>${(isPast() ? L_.tipPast : typeof key() === "number" ? L_.tipFc : L_.tipRank)(v)}</span>`;
}
async function drawSectors() {
  const want = S.mode === "sectors" ? S.kind : null;
  if (shown && shown !== want) { (await SEC[shown]).group.remove(); shown = null; }
  if (!want) return;
  const K = await sectors(want);
  if (want !== (S.mode === "sectors" ? S.kind : null)) return;
  K.group ||= L.layerGroup(K.items.map(it => (it.layer = L.polygon(it.ll, { renderer: cvSectors })
    .bindTooltip("", { sticky: true, direction: "top", offset: [0, -6], className: "tip" })
    .on("click", e => { L.DomEvent.stopPropagation(e); select(it.id); })
    .on("mouseover", () => { it.layer.setStyle({ color: INK, opacity: 1, weight: 2 }); it.layer.setTooltipContent(tipOf(it, K)); })
    .on("mouseout", () => it.layer.setStyle(styleOf(it))))));
  if (shown !== want) { K.group.addTo(map); shown = want; }
  // The colour says what the hover and the ranking say: the km² expected in the sector. The steps follow the
  // share of the total: the sectors that hold the first half of it take the brightest step, then those up to
  // 80%, 95% and 99%; the rest, with almost nothing, stay as the base map has them, green where there is forest.
  const by = [...K.items].sort((a, b) => expOf(b) - expOf(a)), tot = by.reduce((x, it) => x + expOf(it), 0);
  cls = new Map();
  let cum = 0;
  for (const it of by) { const e = expOf(it); cls.set(it, !(e > 0) || !tot ? 0 : cum < 0.5 * tot ? 4 : cum < 0.8 * tot ? 3 : cum < 0.95 * tot ? 2 : cum < 0.99 * tot ? 1 : 0); cum += e; }
  for (const it of K.items) it.layer.setStyle(styleOf(it));
}
map.on("zoomend", () => { if (shown) SEC[shown].then(K => K.items.forEach(it => it.layer.setStyle(styleOf(it)))); });
map.on("click", () => { if (S.mode === "sectors" && S.sel != null) select(null); });

// The people of an Indigenous land (data/peoples/<lang>.json, where there is an entry for it): the photograph
// first, whole, with its author and licence under it as the licence asks; then the people's name and a few lines.
// Other peoples of the same land follow as names that open. The lines and the caption are in the reader's
// language: the file of that language is fetched, and again when the language changes. Where the pipeline had no
// translation the English stands in, marked, and is set left to right.
const PEOPLES = {};
async function people() {
  const id = S.mode === "sectors" && S.kind === "ti" ? S.sel : null;
  const l = lang, all = id ? await (PEOPLES[l] ||= fetch(`data/peoples/${l}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))) : {};
  if (l !== lang || id !== (S.mode === "sectors" && S.kind === "ti" ? S.sel : null)) return;
  const list = all[id] || [], L_ = t().people, was = peopleOf, ltr = x => (x?.fallback ? ` dir="ltr" lang="en"` : "");
  peopleOf = list.length ? id : null;
  const one = (p, head) => `${p.photo && head ? `<figure><img src="${esc(p.photo.file)}" alt="${esc(p.photo.caption)}" loading="lazy"><figcaption>${p.photo.place ? `<span${ltr(p.photo)}>${esc(p.photo.caption)}</span> ` : ""}<a href="${esc(p.photo.source_url)}" target="_blank" rel="noopener">${esc(L_.credit({ author: p.photo.author, license: p.photo.license }))}</a></figcaption></figure>` : ""}`
    + (head ? `<h2 dir="auto">${esc(p.name)}</h2><p${ltr(p)}>${esc(p.text)}</p>` : `<details><summary dir="auto">${esc(p.name)}</summary><p${ltr(p)}>${esc(p.text)}</p></details>`);  // (a name sets its own direction; lines that fell back to English read left to right on a right-to-left page)
  $("people").innerHTML = list.length ? `<button id="people-x" class="x" aria-label="${esc(t().close)}" title="${esc(t().close)}"></button>` + one(list[0], true) + (list.length > 1 ? `<h3>${esc(L_.also)}</h3>` + list.slice(1).map(p => one(p, false)).join("") : "") : "";
  $("people").hidden = !list.length;
  if (list.length) root.dataset.people = ""; else delete root.dataset.people;
  if (was !== peopleOf) { $("chartin").scrollTop = 0; $("chartin").classList.remove("in"); void $("chartin").offsetWidth; $("chartin").classList.add("in"); chart(); }  // one leaves the dock and the other comes in, as on the stage
}
// The selection is one thing in one place: its outline is on the map only while a sector is selected, and goes
// with it by whatever way it is let go.
$("people").onclick = e => { if (e.target.closest("#people-x")) { e.stopPropagation(); select(null); } };  // its way out, always in reach at the top
function unselect() {
  S.sel = null;
  if (outline) { outline.remove(); outline = null; }
}
async function select(id) {  // (the sector is outlined where it is: the map is never moved to it)
  S.sel = id == null ? null : String(id);
  if (outline) { outline.remove(); outline = null; }
  refresh();
  if (id == null) return;
  const it = (await sectors(S.kind)).byId.get(S.sel);
  if (!it || S.sel !== String(id)) return;
  outline = L.featureGroup([L.polygon(it.ll, { renderer: svgSel, fill: false, color: GROUND, weight: 6, interactive: false }), L.polygon(it.ll, { renderer: svgSel, fill: false, color: INK, weight: 2.5, interactive: false })]).addTo(map);
}

// ---------- the bulletin: the level, then what is happening or what to expect, in one sentence ----------
let turn = 0;
async function say() {
  const mine = ++turn, L_ = t(), I = info(), k = key(), yearly = typeof k === "number", past = isPast(), y = S.year, hz = S.hazard;
  const K = S.sel != null ? await sectors(S.kind) : null;  // the sector's numbers; the whole Amazon needs none
  if (mine !== turn) return;
  const it = S.sel != null ? K.byId.get(S.sel) : null, here = !!it;
  const v = { y, here, many: L_.many[S.kind], n: K?.items.length };
  if (it) v.rank = ordinal(rankOf(it, K));
  let head, sub = "", hint = "";
  const like = a => likeArea(a, L_.like);  // the second line under a headline that states an area
  const D = acting() ? actsOf(it) : null;
  if (D) {
    // what enforcement accounts for, and in the same breath what it does not
    const o = { km: approx(D.avoided), here: !!D.own, since: D.since };
    head = D.avoided < 0.5 ? L_.act.none(o) : L_.act.say(o);
    sub = !D.own ? L_.act.sub({ part: partOf(ACT.summary.fall_accounted_share) }) : D.avoided < 0.5 ? "" : L_.act.subHere({ pct: fmt(100 * D.over) });
    hint = L_.act.honest;
  } else if (hz === "fire") {
    // fire: what burned against a year before. Three months by month; by year, the last twelve months against
    // the twelve before, the same windows the timeline draws.
    const mo = monthsOf(it), a = (it ? it.L[k] : R.amazon.L[k]) || [], sum3 = from => mo.obs(from) + mo.obs(from + 1) + mo.obs(from + 2);
    const [now, prev] = S.scale === "months" ? [sum3(0), sum3(12)] : [a.at(-1) ?? 0, a.at(-2) ?? 0];
    head = L_.burned[S.scale]({ km: km(now), prev: km(prev), here });
    sub = like(now);
  } else if (!yearly) {
    // what the model expects over the months ahead; where there is no monthly forecast, what was measured
    const mo = monthsOf(it), sum = ahead(mo, I.months);
    if (sum && (sum.km >= 0.05 || !it)) {
      head = L_.mfc[hz]({ km: approx(sum.km), here, h: I.months });
      sub = like(sum.km);
    } else if (S.scale === "months") {
      head = L_.mobs[hz]({ km: km(mo.obs(0) + mo.obs(1) + mo.obs(2)), here });
      sub = like(mo.obs(0) + mo.obs(1) + mo.obs(2));
    } else {
      const a = it ? it.L[k] : R.amazon.L[k];
      head = it ? L_.whereHere({ ...v, risk: L_.risk[hz], end: endOf(I) }) : L_.where[hz]({ end: endOf(I) });
      if (a?.length > 1) sub = L_.lastSub[hz]({ km: km(a.at(-1)), here });
    }
  } else if (past) {
    const act = it ? actOf(it) : I.actual_km2;
    const Y = P?.years?.[y], n3 = x => fmt(round(x, 3));
    // how the forecast did: cells expected to lose a hectare against cells that did, where the chances were
    // checked for that year; otherwise what was cleared
    if (!it && Y) head = L_.pastP({ y, exp: n3(Y.expected_cells), act: n3(Y.actual_cells) });
    else if (!it) { head = L_.past({ y, act: fmt(act) }); sub = like(act); }
    else {
      head = act < 0.05 ? L_.pastHereNone(v) : L_.pastHere({ y, act: km(act) });
      sub = like(act);
    }
    if (y === PARTIAL) sub += L_.partial;
  } else if (it) {
    const e = expOf(it);
    head = e < 0.05 ? L_.fcNone(v) : L_.fc({ ...v, km: approx(e) });
    sub = like(e);
  } else {
    head = L_.fc({ ...v, km: approx(M.forecast.total_km2) });
    sub = like(M.forecast.total_km2);
  }
  // the level sets how much red there is. A replayed year has none: the alarm is about now. Nor has the actions
  // view, which looks back and whose news is good.
  const A = past || D ? null : alarm(it, K), l = A ? A.l : "r", named = D && !D.own ? null : it;
  document.documentElement.dataset.level = $("lead").dataset.l = l;
  $("level").innerHTML = (A ? `<span class="meter" aria-hidden="true">${[1, 2, 3].map(n => `<i${n <= A.l ? ' class="on"' : ""}></i>`).join("")}</span>` : "")
    + `<b>${A ? L_.level[A.l] : D ? L_.act.band : L_.replay}</b>${A ? "" : `<span>${D ? (D.own ? L_.act.bandSub : L_.act.bandSubN({ n: fmt(ACT.municipalities), count: ACT.municipalities })) : L_.made({ date: (([oy, om, od]) => new Date(oy, om - 1, od).toLocaleDateString(loc(), { day: "numeric", month: "long", year: "numeric" }))(M.years[y].origin.split("-").map(Number)) })}</span>`}`;
  // the whole Amazon needs no label; a sector is named, with a way back. In the actions view a sector that has
  // no figure of its own is not named: the numbers are the Amazon's, and the label says so.
  $("scope").innerHTML = it ? `<span>${named ? esc(it.n) + (it.s ? ", " + it.s : "") : L_.amazon}</span><button aria-label="${L_.whole}" title="${L_.whole}">×</button>` : "";
  $("scope").hidden = !it;
  $("say").textContent = head.replaceAll(" km²", "\u00a0km²");
  $("sub").textContent = sub.trim().replaceAll(" km²", "\u00a0km²");
  $("hint").textContent = hint;
  chart(it);
  signs(it);
  legend();
}
// what the map colours mean. In cells, for the yearly clearing forecast, the steps of chance are also the filter:
// choosing one leaves only the cells at that chance or more.
async function legend() {
  const L_ = t(), I = info(), k = key(), yearly = typeof k === "number", past = isPast(), hz = S.hazard;
  const prob = cellsOn() && hz === "clear" && yearly && await hasProb(k);
  if (k !== key()) return;
  const mapped = past && cellsOn() ? `<span class="sw" style="--c:rgb(${DARK})">${L_.mapped}</span>` : "";
  const what = `<span class="what">${glyph(hz)}<span>${prob ? (past ? L_.chanceFor({ y: k }) : L_.chanceBy({ y: k })) : yearly || hz === "fire" ? L_.legend[hz] : L_.legendNext[hz]({ n: I.months, count: I.months })}</span></span>`;
  $("legend").innerHTML = what + (prob ? rampKey(true) : `<span class="rng">${cellsOn() ? L_.lower : L_.less}<span class="ramp">${[FOREST, ...steps()].map(c => `<i style="--c:rgb(${c})"></i>`).join("")}</span>${cellsOn() ? L_.higher : L_.more}</span>`) + mapped;
  $("legend").classList.toggle("prob", !!prob);
  shareLine();
}
// The key to the chances: one strip, forest green and then the four reds, with the chance written where two
// steps meet. On the map each step is a button, and each says its own range to a pointer or a screen reader.
const stepName = n => (n === 0 ? t().stepLo({ c: pct(PCUT[0]) }) : n === 4 ? t().stepHi({ c: pct(PCUT[3]) }) : t().stepMid({ a: fmt(100 * PCUT[n - 1], PCUT[n - 1] < 0.01 ? 1 : 0), b: pct(PCUT[n]) }));
const rampKey = live => `<span class="steps"${live ? ` role="group" title="${t().onlyFrom}" aria-label="${t().onlyFrom}"` : ""}>${PCSS.map((c, n) => (live ? `<button data-min="${n}" aria-pressed="${n >= S.min}" aria-label="${stepName(n)}" style="--c:${c}"></button>` : `<i style="--c:${c}"></i>`)).join("")}</span><span class="ticks">${PCUT.map(c => `<span>${pct(c)}</span>`).join("")}</span>`;
$("legend").onclick = e => { const b = e.target.closest("[data-min]"); if (b) { S.min = +b.dataset.min === S.min ? 0 : +b.dataset.min; refresh(); } };
$("scope").onclick = e => { if (e.target.closest("button")) { select(null); if (!docked("map")) { pristine = true; whole(!calm()); } } };

// ---------- signals: what the model is reading, as small traces. Red only where it is rising. ----------
// a small trace: the series thin, its last points heavy
function trace(a, zero, tail = 3) {
  const W = 100, Hh = 28, v = a.slice(-36), lo = Math.min(0, ...v), hi = Math.max(1e-9, ...v), X = i => (i / (v.length - 1)) * W, Y = x => Hh - 2 - (Hh - 4) * (x - lo) / (hi - lo);
  const path = (from, cls) => `<path class="${cls}" d="${v.slice(from).map((x, i) => `${i ? "L" : "M"}${X(i + from).toFixed(1)} ${Y(x).toFixed(1)}`).join("")}"/>`;
  return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true">${zero ? `<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>` : ""}${path(0, "")}${path(v.length - tail, "end")}</svg>`;
}
// the actions themselves, in the signals' place: each one's last year (August to July) against the reference year.
// Notices are per 100 km² cleared, so a year's rate weighs each semester by its clearing.
function actSigns() {
  const L_ = t().act, a = ACT.actions, n = a.start.length, [r0, r1] = ACT.reference.split(" to "), ref = a.start.flatMap((s, i) => (s >= r0 && s <= r1 ? [i] : [])), now = [n - 2, n - 1];
  const tot = (v, ix) => ix.reduce((x, i) => x + v[i], 0), rate = ix => ix.reduce((x, i) => x + a.notices_per_100km2[i] * a.clearing_km2[i], 0) / tot(a.clearing_km2, ix);
  const end = s => { const [y, m_] = ymOf(s); return month(y, m_ + 4); };  // a semester ends five months after it starts
  const item = (k, v, x, x0, unit) => `<div data-k="${k}" title="${L_.signTitle[k]}">${trace(v, false, 2)}<span>${L_.sign[k]}</span><b>${fmt(x)}${unit}</b><span>${L_.against({ x: fmt(x0) })}</span></div>`;
  $("signs").className = "acts";
  $("signs").removeAttribute("title");
  $("signs").innerHTML = `<p>${L_.signs({ now: end(a.start[n - 1]), ref: end(a.start[ref.at(-1)]) })}</p>` + item("notices", a.notices_per_100km2, rate(now), rate(ref), "")
    + ["remote", "field", "collective"].map(k => item(k, a[k + "_km2"], tot(a[k + "_km2"], now), tot(a[k + "_km2"], ref), " km²")).join("");
}
function signs(it) {
  if (acting()) return actSigns();
  const L_ = t(), line = trace;
  $("signs").className = "";
  const item = name => {
    const a = monthly(it, name), unit = name === "autos" ? "" : " km²";
    if (!a) return "";
    const [now, prev] = three(a), n = x => (unit ? km(x) + unit : fmt(x)), hz = hazards().find(h => HAZ[h].series === name);
    const up = unit && rising(now, prev) ? ' class="up"' : "", tag = hz ? "button" : "div";
    return `<${tag}${hz ? ` data-go="${hz}"` : ""}${up} title="${L_.signTitle({ now: n(now), prev: n(prev) })}">${line(a)}<span>${L_.sign[name]}</span><b>${delta(now, prev, unit) ?? n(now)}</b></${tag}>`;
  };
  const e = enso();
  $("signs").title = L_.signs;
  $("signs").innerHTML = ["clear", "scar", "degr", "mine"].map(item).join("")
    + `<div class="wide${e.x >= 1.5 && !it ? " up" : ""}" title="ONI ${fmt(e.x, 2)}">${line(R.months.oni.v, true)}<span>${L_.enso[e.side]}</span><b>${e.word}</b></div>` + item("autos");
}
$("signs").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  S.hazard = b.dataset.go; S.scale = "months";
  refresh();
};

// ---------- the timeline. Years: one bar per year, the forecast last, and it is the year control.
// Months: the last 24 months of alerts, each against the same month a year before, then 12 months ahead.
let bars = [], pinned = -1, scope = null;
function ticks(max) {
  const raw = max / 3.3, p = 10 ** Math.floor(Math.log10(raw)), s = [1, 2, 2.5, 5, 10].find(m => m * p >= raw) * p, out = [];
  for (let v = s; v <= max * 1.001; v += s) out.push(v);
  return [out, s >= 1 && Number.isInteger(s) ? 0 : s >= 0.1 ? 1 : 2];
}
function series(it) {
  const I = info(), k = key();
  if (S.scale === "months") {
    const mo = monthsOf(it);
    return Array.from({ length: 36 }, (_, s) => {
      const n = 23 - s, d = new Date(LY, LM - 1 - n, 1), sub = month(d.getFullYear(), d.getMonth()), f = n < 0 && mo.fc?.[-n - 1];  // n months back; negative is ahead
      return n >= 0 ? { key: s, d, v: mo.obs(n), cur: n < 3, sub }
        : f ? { key: s, d, v: f.p50, fc: true, range: f.p10 == null || -n > reach() ? null : [f.p10, f.p90], dim: -n > reach(), sub } : { key: s, d, v: null, sub };
    }).slice(0, mo.fc || S.hazard !== "fire" ? 36 : 24);  // fire has no months ahead
  }
  if (S.hazard !== "clear") {
    const vals = (it ? it.L[k] : R.amazon.L[k]) || [], sum = ahead(monthsOf(it), I.months);
    const span = w => { const [y, m_] = w.split("-").map(Number); return t().to({ a: month(y, m_ - 1), b: month(y, m_ - 2 + I.months) }); };
    const end = w => new Date(+w.slice(0, 4), +w.slice(5) - 2 + I.months, 1).getFullYear();
    // the last slot is the forecast: the months ahead added up, or only the window when there is no monthly forecast
    const last = sum ? { v: sum.km, fc: true, on: true, range: sum.lo == null ? null : [sum.lo, sum.hi], sub: span(I.from) } : { v: null, win: true };
    const past = (R.layers[k]?.windows || []).map((w, i, a) => ({ key: w, label: end(w), v: vals[i + 1] ?? 0, sub: span(w), cur: S.hazard === "fire" && i === a.length - 1 }));  // fire: the last twelve months are the headline
    return S.hazard === "fire" ? past : [...past, { key: I.from, label: end(I.from), ...last }];
  }
  const fy = M.forecast.year;
  const out = R.cyears.map((y, i) => {
    const Y = M.years[y], j = R.hyears.indexOf(y), v = it ? it.c[i] : Y?.actual_km2 ?? M.history[y] ?? 0;  // the replayed years use the total the headline quotes
    return { key: y, label: y, v, can: !!Y, on: y === S.year };
  });
  out.push({ key: fy, label: fy, v: it ? it.e[R.eyears.indexOf(fy)] : M.forecast.total_km2, fc: true, can: true, on: fy === S.year, range: it ? null : M.forecast.range_km2 });
  return out;
}
// The actions view, per six months: the clearing measured as bars, and above each the clearing the model
// implies with enforcement held at the reference year's level, with its 90% interval. The gap between the two
// is hatched forest green: it is modelled, and it is forest left standing. A thin rule marks the reference
// year's average, so the whole fall is on the chart and the gap can be read against it. As a line, the same.
function actsChart(it) {
  const el = $("chart"), W = el.clientWidth, H = el.clientHeight, L_ = t().act, D = actsOf(it), rows = D.rows, ref = D.own ? null : ACT.reference_km2, small = docked("chart");
  const gut = small ? 0 : 42, top = small ? 8 : 58, pw = W - gut, pitch = pw / rows.length, tight = pitch < 50, bot = small ? 16 : tight ? 36 : 22, ph = H - top - bot, bw = Math.max(3, pitch * 0.56);  // tight: the year goes under the month
  const peak = r => Math.max(r.observed, r.held, r.held_hi ?? 0), max = Math.max(D.own ? 0.5 : 1, ref ?? 0, ...rows.map(peak)) * 1.06;
  const Y = v => top + ph - ph * Math.min(v, max) / max, X = i => gut + i * pitch, mid = i => X(i) + pitch / 2, y0 = Y(0), [tk, dec] = ticks(max / 1.06);
  const span = r => { const [y, m_] = ymOf(r.start), o = { month: "short", year: "numeric" }; return t().to({ a: month(y, m_ - 1, o), b: month(y, m_ + 4, o) }); };
  const label = r => { const [y, m_] = ymOf(r.start); return [month(y, m_ - 1, { month: "short" }).replace(".", ""), String(y).slice(-2)]; };
  let s = `<svg class="acts" width="${W}" height="${H}" role="img"><defs><pattern id="spared" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="s0" width="6" height="6"/><rect class="s1" width="3" height="6"/></pattern></defs><g class="grid">`;
  if (!small) for (const v of tk) s += `<line x1="${gut}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${gut - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v, dec)}</text>`;
  // what the axis counts, and under it the two marks, named once
  s += small ? "</g>" : `<text class="unit" x="0" y="13">${L_.axis}</text></g><g class="key"><rect class="plain" x="0" y="22" width="11" height="11"/><text x="17" y="32">${L_.measured}</text><g><rect x="0" y="22" width="11" height="11" fill="url(#spared)"/><text x="17" y="32">${L_.held({ ref: D.years })}</text></g></g>`;
  rows.forEach((r, i) => {
    const x = X(i) + (pitch - bw) / 2, cx = mid(i);
    s += `<g class="bar" data-i="${i}">`;
    if (!S.line) {
      s += `<rect class="plain observed" x="${x}" y="${Y(r.observed)}" width="${bw}" height="${y0 - Y(r.observed)}"/>`;
      if (r.held > r.observed) s += `<rect x="${x}" y="${Y(r.held)}" width="${bw}" height="${Y(r.observed) - Y(r.held)}" fill="url(#spared)"/>`;
      s += `<line class="held" x1="${x}" x2="${x + bw}" y1="${Y(r.held)}" y2="${Y(r.held)}"/>`;
    }
    if (r.held_lo != null) s += `<path class="rng" fill="none" d="M${cx} ${Y(r.held_lo)}V${Y(r.held_hi)}M${cx - 4} ${Y(r.held_lo)}h8M${cx - 4} ${Y(r.held_hi)}h8"/>`;
    s += (small ? `<text x="${cx}" y="${H - 3}">${label(r)[1]}</text>` : tight ? label(r).map((x, n) => `<text x="${cx}" y="${y0 + 15 + 15 * n}">${x}</text>`).join("") : `<text x="${cx}" y="${H - 5}">${label(r).join(" ")}</text>`) + `<rect class="hot" x="${X(i)}" y="${top}" width="${pitch}" height="${H - top}"/></g>`;
  });
  if (S.line) {
    const at = (i, k) => `${mid(i).toFixed(1)} ${Y(rows[i][k]).toFixed(1)}`, path = k => rows.map((r, i) => (i ? "L" : "M") + at(i, k)).join("");
    s += `<g class="line" pointer-events="none"><path class="gap" d="${path("held")}${rows.map((r, i) => "L" + at(rows.length - 1 - i, "observed")).join("")}Z"/><path class="obs" d="${path("observed")}"/><path class="fcl" d="${path("held")}"/>`
      + rows.map((r, i) => `<circle class="dot observed" r="2.6" cx="${mid(i)}" cy="${Y(r.observed)}"/><circle class="fdot held" r="3.4" cx="${mid(i)}" cy="${Y(r.held)}"/>`).join("") + `</g>`;
  }
  if (ref != null) s += `<line class="refrule" x1="${gut}" x2="${W}" y1="${Y(ref)}" y2="${Y(ref)}"/>` + (small ? "" : `<text class="note ref" x="${W}" y="${Y(ref) - 6}" text-anchor="end">${L_.ref(D)}</text>`);
  el.innerHTML = s + `<line class="axis" x1="${gut}" x2="${W}" y1="${y0}" y2="${y0}"/><g class="tip" pointer-events="none"><rect class="back"/><path/><text></text><text></text></g></svg>`;
  bars = []; pinned = -1;
  el.onpointermove = el.onpointerdown = el.onpointerleave = el.onfocusin = null;
  if (small) return;  // docked, the chart is a picture: its labels come with the stage
  const k2 = el.querySelector(".key g");  // the second mark of the key sits after the first, on the next line if it does not fit
  const w1 = 17 + el.querySelector(".key > text").getComputedTextLength() + 18, w2 = 17 + k2.querySelector("text").getComputedTextLength();
  k2.setAttribute("transform", w1 + w2 <= W ? `translate(${w1} 0)` : "translate(0 17)");
  const [t1, t2] = el.querySelectorAll(".tip text"), lead = el.querySelector(".tip path"), back = el.querySelector(".tip .back");
  const tip = i => {
    const r = rows[i];
    back.setAttribute("width", 0);
    el.querySelector(".note.ref")?.setAttribute("visibility", r ? "hidden" : "visible");  // its caption would show through beside the label
    if (!r) { t1.textContent = t2.textContent = ""; lead.setAttribute("d", ""); return; }
    const n = x => (D.own ? km(x) : fmt(x)), hw = Math.min(150, W / 2 - 4), cx = mid(i), [anchor, x, left] = cx < hw ? ["start", 0, 0] : cx > W - hw ? ["end", W, W - 2 * hw] : ["middle", cx, cx - hw];
    let up = Y(peak(r));
    rows.forEach((c, j) => { if (X(j) + pitch > left && X(j) < left + 2 * hw) up = Math.min(up, Y(peak(c))); });
    up = Math.max(up, top + 38);  // stay clear of the key along the top
    t1.textContent = L_.tipObs({ span: span(r), obs: n(r.observed) });
    t2.textContent = (r.held_lo != null ? L_.tipHeldRange : L_.tipHeld)({ held: n(r.held), lo: r.held_lo != null && n(r.held_lo), hi: r.held_hi != null && n(r.held_hi) });
    for (const [el_, dy] of [[t1, -27], [t2, -9]]) { el_.setAttribute("x", x); el_.setAttribute("y", up + dy); el_.setAttribute("text-anchor", anchor); }
    lead.setAttribute("d", Y(peak(r)) - up > 8 ? `M${cx} ${Y(peak(r)) - 3}V${up - 3}` : "");
    // the label lies over the reference rule and its caption, so it gets the ground behind it
    const b1 = t1.getBBox(), b2 = t2.getBBox(), bx = Math.min(b1.x, b2.x) - 5;
    for (const [k, v] of [["x", bx], ["y", b1.y - 2], ["width", Math.max(b1.x + b1.width, b2.x + b2.width) + 5 - bx], ["height", b2.y + b2.height + 3 - b1.y]]) back.setAttribute(k, v);
  };
  el.onpointermove = el.onpointerdown = e => tip(Math.floor((e.clientX - el.getBoundingClientRect().left - gut) / pitch));
  el.onpointerleave = () => tip(-1);
}
function chart(it = scope) {
  scope = it;
  const el = $("chart"), W = el.clientWidth, H = el.clientHeight, L_ = t(), small = docked("chart");  // docked: the bars alone, no axis, no labels to read
  if (W < 60 || H < 40) return;
  if (acting()) return actsChart(it);
  bars = series(it);
  const monthsView = S.scale === "months", sector = !!it;
  const gut = small ? 0 : 42, top = small ? 6 : monthsView ? 40 : 46, bot = small ? 16 : monthsView ? 34 : 22, pw = W - gut, ph = H - top - bot, pitch = pw / bars.length, bw = Math.max(3, pitch * (monthsView ? 0.62 : 0.72));
  // the scale fits the bars, with a little room above them. A range that runs past it is cut off at the top, open.
  const peak = b => Math.max(b.v ?? 0, b.range ? b.range[1] : 0);
  const tallest = Math.max(sector ? 0.5 : 1, ...bars.map(b => b.v ?? 0)), max = tallest * (bars.some(b => b.range && b.range[1] > tallest) ? 1.15 : 1);
  const Y = v => top + ph - ph * Math.min(v, max) / max, X = i => gut + i * pitch, y0 = Y(0);
  const [tk, dec] = ticks(max), skip = pitch < 18 ? 2 : 1, onAt = bars.findIndex(b => b.on);
  let s = `<svg width="${W}" height="${H}" role="img"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="h0" width="6" height="6"/><rect class="h1" width="3" height="6"/></pattern></defs><g class="grid">`;
  if (!small) for (const v of tk) s += `<line x1="${gut}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${gut - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v, dec)}</text>`;
  // what the axis counts, written on it
  if (!small) s += `<text class="unit" x="0" y="${monthsView ? top - 10 : 13}">${monthsView ? L_.axisM[S.hazard] : S.hazard === "clear" ? L_.axisY : L_.axisW[S.hazard]}</text>`;
  s += `</g>`;
  if (monthsView && bars.length > 24) {
    // the window the headline is about. For clearing there are three to choose from: the year being forecast,
    // which began last August and so takes in the months of it already measured, or the next 3 or 6 months.
    const yearly = typeof key() === "number", n = reach(), now = X(24), from = yearly ? X(24 + n - 12) : now, on = yearly ? 0 : n;
    const hs = S.hazard === "clear" ? horizons() : [n], name = h => (h ? L_.ahead({ n: h, count: h }) : L_.byJuly({ y: FY }));
    s += `<rect class="win" x="${from}" y="${top}" width="${now + n * pitch - from}" height="${ph}"/><line class="winrule" x1="${from}" x2="${now + n * pitch}" y1="${top}" y2="${top}"/>`;
    s += `<line class="now" x1="${now}" x2="${now}" y1="${small ? top : top - 24}" y2="${y0}"/>`;
    if (!small) s += `<text class="caps" x="${now - 7}" y="${top - 10}" text-anchor="end">${L_.now}</text><text x="${now + 8}" y="${top - 10}">${hs.map((h, k) => `<tspan class="h${h === on ? " on" : ""}"${k ? ' dx="14"' : ""}${hs.length > 1 ? ` data-h="${h}" tabindex="0" role="button" aria-pressed="${h === on}"` : ""}>${name(h)}</tspan>`).join("")}</text>`;
  }
  bars.forEach((b, i) => {
    const x = X(i) + (pitch - bw) / 2, cx = x + bw / 2, h = b.v > 0 ? Math.max(1.5, ph * Math.min(b.v, max) / max) : 0;
    const rect = (cls, yy, hh, fill = "") => `<rect class="${cls}" x="${x}" y="${yy}" width="${bw}" height="${Math.max(0, hh)}" ${fill}/>`;
    s += `<g class="bar${b.can ? " can" : ""}${b.on ? " on" : ""}${b.cur ? " cur" : ""}${b.dim ? " dim" : ""}" data-i="${i}"${b.can ? ` tabindex="0" role="button" aria-pressed="${!!b.on}" aria-label="${b.label}"` : ""}>`;
    if (S.line && !b.win) { /* drawn below, as one line */ }
    else if (b.win) s += `<rect class="win" x="${X(i) + 1}" y="${top}" width="${pitch - 2}" height="${ph}"/><line class="winrule" x1="${X(i) + 1}" x2="${X(i) + pitch - 1}" y1="${top}" y2="${top}"/><text class="h on end" x="${X(i) + pitch}" y="${top - 10}">${L_.window}</text>`;
    else if (b.fc) {
      s += rect("fc", y0 - h, h, 'fill="url(#hatch)"');
      if (b.range && !small) s += `<path class="rng" fill="none" d="M${cx} ${Y(b.range[0])}V${Y(b.range[1])}M${cx - 4} ${Y(b.range[0])}h8${b.range[1] <= max ? `M${cx - 4} ${Y(b.range[1])}h8` : ""}"/>`;
    } else if (b.on && b.v != null) s += rect("in", y0 - h, h);
    else if (b.v != null) s += rect("plain", y0 - h, h);
    if (monthsView && small) {
      if (b.d.getMonth() === 0) s += `<text x="${cx}" y="${H - 3}">${b.d.getFullYear()}</text>`;
    } else if (monthsView) {
      if (pitch >= 13 || b.d.getMonth() % 3 === 0) s += `<text x="${cx}" y="${y0 + 15}">${b.d.toLocaleDateString(loc(), { month: "narrow" })}</text>`;  // every month where there is room, otherwise every third
      if (b.d.getMonth() === 0) s += `<text x="${cx}" y="${y0 + 30}">${b.d.getFullYear()}</text>`;
    } else if (skip === 1 || b.on || ((bars.length - 1 - i) % 2 === 0 && Math.abs(i - onAt) !== 1)) s += `<text x="${cx}" y="${H - (small ? 3 : 5)}">${pitch < 40 ? String(b.label).slice(-2) : b.label}</text>`;  // four digits only where they fit
    s += `<rect class="hot" x="${X(i)}" y="${top - 12}" width="${pitch}" height="${H - top + 12}"/></g>`;
  });
  if (S.line) {
    // the same series as a line: measured values solid, the forecast dashed in the hazard's hue, its range a band
    const at = ([b, i], v = b.v) => `${(X(i) + pitch / 2).toFixed(1)} ${Y(v).toFixed(1)}`, path = a => a.map((p, n) => (n ? "L" : "M") + at(p)).join("");
    const all = bars.map((b, i) => [b, i]), obs = all.filter(([b]) => b.v != null && !b.fc), fcs = all.filter(([b]) => b.fc), band = fcs.filter(([b]) => b.range);
    s += `<g class="line" pointer-events="none">`;
    if (small) { /* no ranges in the dock */ }
    else if (band.length > 1) s += `<path class="band" d="${band.map((p, n) => (n ? "L" : "M") + at(p, p[0].range[1])).join("")}${band.slice().reverse().map(p => "L" + at(p, p[0].range[0])).join("")}Z"/>`;
    else for (const [b, i] of band) { const cx = X(i) + pitch / 2; s += `<path class="rng" fill="none" d="M${cx} ${Y(b.range[0])}V${Y(b.range[1])}M${cx - 4} ${Y(b.range[0])}h8${b.range[1] <= max ? `M${cx - 4} ${Y(b.range[1])}h8` : ""}"/>`; }
    if (obs.length) s += `<path class="obs" d="${path(obs)}"/>`;
    const near = fcs.filter(([b]) => !b.dim), far = fcs.filter(([b]) => b.dim);  // months beyond the chosen window are fainter
    if (near.length) s += `<path class="fcl" d="${path([...obs.slice(-1), ...near])}"/>`;
    if (far.length) s += `<path class="fcl dim" d="${path([...near.slice(-1), ...far])}"/>`;
    for (const p of obs) if (p[0].on) s += `<circle class="ring" r="5" cx="${at(p).split(" ")[0]}" cy="${at(p).split(" ")[1]}"/>`; else if (p[0].can || p[0].cur) s += `<circle class="dot" r="2.6" cx="${at(p).split(" ")[0]}" cy="${at(p).split(" ")[1]}"/>`;
    for (const p of fcs) if (!p[0].dim) s += `<circle class="fdot" r="3.4" cx="${at(p).split(" ")[0]}" cy="${at(p).split(" ")[1]}"/>`;
    s += `</g>`;
  }
  el.innerHTML = s + `<line class="axis" x1="${gut}" x2="${W}" y1="${y0}" y2="${y0}"/><g class="tip" pointer-events="none"><path/><text></text><text></text></g></svg>`;
  pinned = onAt >= 0 && !bars[onAt].fc && !monthsView ? onAt : -1;  // a replayed year keeps its label; the forecast is already the headline
  tip(pinned);
  function tip(i) {
    const [t1, t2] = el.querySelectorAll(".tip text"), lead = el.querySelector(".tip path"), b = small ? null : bars[i];
    if (!b || b.win || (b.v == null && !monthsView)) { t1.textContent = t2.textContent = ""; lead.setAttribute("d", ""); return; }
    const exact = x => `${sector || typeof key() !== "number" ? km(x) : fmt(x)} km²`;
    const lines = b.fc ? [(monthsView ? b.sub + ", " : "") + L_.about_({ x: approx(b.v) }), b.range ? L_.range({ lo: approx(b.range[0]), hi: approx(b.range[1]) }) : ""]
      : monthsView ? [b.v == null ? b.sub : `${b.sub}, ${exact(b.v)}`, ""]
      : [exact(b.v), b.sub || ""];
    const x0 = X(i) + (pitch - bw) / 2, cx = x0 + bw / 2, yy = Y(b.v ?? 0);
    const hw = monthsView ? 96 : 74, [anchor, x, left] = cx < gut + hw ? ["start", x0, x0] : cx > W - hw ? ["end", x0 + bw, x0 + bw - 2 * hw] : ["middle", cx, cx - hw];
    // the label sits above every bar it spans, with a hairline down to its own
    let up = yy;
    bars.forEach((c, j) => { const bx = X(j) + (pitch - bw) / 2; if (bx + bw > left && bx < left + 2 * hw) up = Math.min(up, Y(c.v ?? 0)); });
    if (monthsView) up = Math.max(up, top + 44);  // stay clear of the labels along the top
    t1.textContent = lines[0]; t2.textContent = lines[1];
    for (const [el_, dy] of [[t1, lines[1] ? -27 : -9], [t2, -9]]) { el_.setAttribute("x", x); el_.setAttribute("y", up + dy); el_.setAttribute("text-anchor", anchor); }
    lead.setAttribute("d", yy - up > 8 ? `M${cx} ${yy - 3}V${up - 3}` : "");
  }
  // the label follows the pointer or the finger along the bars
  el.onpointermove = el.onpointerdown = e => { const i = Math.floor((e.clientX - el.getBoundingClientRect().left - gut) / pitch); tip(i >= 0 && i < bars.length ? i : pinned); };
  el.onpointerleave = () => tip(pinned);
  el.onfocusin = e => { const g = e.target.closest(".bar"); if (g) tip(+g.dataset.i); };
}
// the windows ahead the monthly clearing view offers: the year being forecast (0), then 3 and 6 months
const horizons = () => [0, 3, 6].filter(h => !h || M.layers["clear" + h]);
const ahead_ = h => { if (h) leavePrio(); S.h = h; refresh(); };  // the priority list is the yearly forecast, so a shorter window leaves it
$("chart").onclick = e => {
  if (docked("chart")) return;  // docked, a click anywhere brings the timeline forward
  const h = e.target.closest("[data-h]"), g = e.target.closest(".bar.can");
  if (h) ahead_(+h.dataset.h);
  else if (g) pick(bars[g.dataset.i].key);
};
$("chart").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.closest(".bar.can, [data-h]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); } };
new ResizeObserver(() => chart()).observe($("chart"));

// ---------- the swap. The box that grows takes its place on the stage at once and is drawn out from the
// dock; the one that shrinks is drawn down to its dock and only then laid out there. So what moves is always
// the large drawing, scaled, and nothing is laid out or painted again while it moves.
const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
// A box drawn between its place on the stage (big) and its place in the dock (small). The frame takes every
// rect in between; its rule is an outline on the box's ::after, kept at two pixels while the box is scaled. The
// contents keep their proportions inside it: ref is where one point of them sits on the page at each end, s their
// scale in the dock.
function morph(box, big, small, ref, s, down, ms) {
  const inner = box.firstElementChild, I = rectOf(inner), N = 24, outer = [], inn = [], rim = [], opt = { duration: ms, easing: "linear", fill: "both" };
  for (let k = 0; k <= N; k++) {
    const u = down ? ease(k / N) : 1 - ease(k / N), mid = (a, b) => a + (b - a) * u;
    const x = mid(big.x, small.x), y = mid(big.y, small.y), sx = mid(big.width, small.width) / big.width, sy = mid(big.height, small.height) / big.height;
    const sc = mid(1, s), cx = mid(ref.big[0], ref.small[0]), cy = mid(ref.big[1], ref.small[1]), rule = 2 / Math.min(sx, sy);
    outer.push({ transform: `translate(${x - big.x}px, ${y - big.y}px) scale(${sx}, ${sy})` });
    rim.push({ outlineWidth: rule + "px", outlineOffset: -rule + "px" });
    inn.push({ transform: `translate(${(cx + sc * (I.x - ref.big[0]) - x) / sx - (I.x - big.x)}px, ${(cy + sc * (I.y - ref.big[1]) - y) / sy - (I.y - big.y)}px) scale(${sc / sx}, ${sc / sy})` });
  }
  return [box.animate(outer, opt), inner.animate(inn, opt), box.animate(rim, { ...opt, pseudoElement: "::after" })];
}
// where a box will be in its dock, and the map's pane inside it, without anything being told
const dockOf = box => { box.dataset.as = "dock"; const r = [rectOf(box), rectOf($("map"))]; box.dataset.as = "stage"; return r; };
// the view the docked map takes: the whole Amazon if the reader never moved the map, otherwise the same area as on the stage
const dockView = size => (pristine ? fitView(size, { paddingTopLeft: [6, 6], paddingBottomRight: [6, 6] })
  : { c: map.getCenter(), z: Math.max(FLOOR, map.getZoom() + Math.log2(Math.min(size.x / map.getSize().x, size.y / map.getSize().y))) });
const corner = (big, small) => ({ big: [big.x, big.y], small: [small.x, small.y] });  // contents that scale from the box's own corner
// The map as it is drawn at this moment, in one bitmap: its canvases and its imagery tiles, in the order of their panes.
function mapShot(clear) {  // clear: the ground is left out, so what is under the picture shows around the Amazon
  const r = rectOf($("map")), k = Math.min(2, devicePixelRatio || 1), cv = document.createElement("canvas"), cx = cv.getContext("2d");
  cv.width = Math.max(1, Math.round(r.width * k)); cv.height = Math.max(1, Math.round(r.height * k));
  cv.style.cssText = `display:block;width:${r.width}px;height:${r.height}px`;
  if (!clear) { cx.fillStyle = GROUND; cx.fillRect(0, 0, cv.width, cv.height); }
  const z = c => +getComputedStyle(c.closest(".leaflet-pane")).zIndex || 0, all = [...$("map").querySelectorAll(".leaflet-pane canvas, .leaflet-pane img.leaflet-tile-loaded")];
  for (const c of all.map((e, i) => [e, i]).sort((a, b) => z(a[0]) - z(b[0]) || a[1] - b[1]).map(x => x[0])) {
    const q = rectOf(c);
    let o = 1; for (let x = c; x && x !== $("map"); x = x.parentElement) o *= +getComputedStyle(x).opacity;
    if (!q.width || !q.height || !o || (c.tagName === "CANVAS" ? !c.width || !c.height : !c.naturalWidth)) continue;
    cx.globalAlpha = o;
    const f = getComputedStyle(c.closest(".leaflet-pane")).filter;
    cx.filter = f && f !== "none" ? f : "none";  // (the imagery is drawn as the page shows it: a pale print)
    try { cx.drawImage(c, (q.x - r.x) * k, (q.y - r.y) * k, q.width * k, q.height * k); } catch (err) { /* a tile that came without leave to be copied */ }
    cx.filter = "none";
  }
  return cv;
}
// The map leaves the stage for its dock, or comes back. What moves is never the map itself but a picture of it:
// the map is laid out and painted in its new place at once, under the picture, and shown only when the picture
// has arrived and fades from over it. So nothing is cleared, resized or repainted in sight, in either direction.
async function mapMove(dock, ms, arrived = () => {}, overlap = false) {  // overlap: the small picture fades out over the first moments (when nothing else is moving), instead of going at once  // arrived: called as soon as the picture is in its place, before it hands over to the map itself
  const box = BOX.map, G = L.latLngBounds(AMAZON).getCenter(), frame = () => new Promise(r => requestAnimationFrame(r));
  const at = () => { const r = rectOf($("map")), p = map.latLngToContainerPoint(G); return [r.x + p.x, r.y + p.y]; };  // where the middle of the Amazon is on the page
  const boxed = (cv, r) => { const w = document.createElement("div"), i = document.createElement("div"); w.className = "box shot"; i.className = "in"; w.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`; i.append(cv); w.append(i); $("app").append(w); return w; };
  let big, small, ref, s, shot, first = null;
  if (dock) {
    big = rectOf(box);
    const g0 = at(), z0 = map.getZoom(), [sm, pane] = dockOf(box), size = L.point(pane.width, pane.height), v = dockView(size);
    if (!pristine) stageView = { c: map.getCenter(), z: z0 };
    if (ms) shot = boxed(mapShot(), big);
    box.dataset.as = "dock";
    map.invalidateSize({ pan: false }); view(v);
    const p = map.project(G, v.z).subtract(map.project(v.c, v.z));
    small = sm; ref = { big: g0, small: [pane.x + size.x / 2 + p.x, pane.y + size.y / 2 + p.y] }; s = 2 ** (v.z - z0);
  } else {
    small = rectOf(box);
    const g1 = at(), z1 = map.getZoom();
    if (ms && +getComputedStyle(box).opacity > 0) first = boxed(mapShot(), small);  // the small picture stays in sight while the map is laid out large
    if (ms) box.style.visibility = "hidden";
    box.dataset.as = "stage";
    map.invalidateSize({ pan: false });
    stageView ? view(stageView) : whole();
    stageView = null;
    big = rectOf(box); ref = { big: at(), small: g1 }; s = 2 ** (z1 - map.getZoom());
    if (ms) { await frame(); await frame(); shot = boxed(mapShot(true), big); shot.style.background = "none"; }  // (the lines are drawn on the next frame; the picture is the Amazon alone, so the timeline going down to its dock shows under it)
  }
  if (!ms) return;
  const anims = morph(shot, big, small, ref, s, dock, ms);
  if (first && overlap) { $("app").append(first); first.animate({ opacity: [1, 0] }, { duration: 200, fill: "forwards" }).finished.then(() => first.remove(), () => first.remove()); }
  else if (first) first.remove();  // (beside the timeline the moving picture starts where the small one was: one map at a time)
  await Promise.race([Promise.all(anims.map(a => a.finished)), new Promise(r => setTimeout(r, ms + 500))]).catch(() => {});  // (never left waiting on a drawing that was cut short)
  arrived();
  box.style.visibility = "";
  await frame();
  await shot.animate({ opacity: [1, 0] }, { duration: 180, easing: "linear" }).finished.catch(() => {});
  shot.remove();
}
// The timeline goes to the stage or back to its dock in three beats, and nothing in it is ever scaled. What it
// shows leaves, where it is (80 ms). An empty surface of its colour then travels from its old rectangle to its new
// one while the map makes its own move (180 ms, easing out); the timeline is laid out in its new place meanwhile,
// out of sight. When both have arrived what it shows comes in, already in its new layout (100 ms). So no word,
// bar or band is ever drawn at a size it does not have, twice, or under the map.
async function chartMove(up, ms, alongside = () => null) {
  const cb = BOX.chart, inn = $("chartin");
  if (!ms) { cb.dataset.as = up ? "stage" : "dock"; chart(); await alongside(); return; }
  const from = rectOf(cb), bg0 = getComputedStyle(cb).backgroundColor;
  // (the map's panel, the list and the zoom leave with it, in the same beat: they come back on their own when the swap is over)
  const side = [$("mappanel"), $("list"), document.querySelector(".leaflet-control-zoom")].filter(e => e && e.offsetParent).map(e => e.animate({ opacity: [+getComputedStyle(e).opacity, 0] }, { duration: 80, easing: "linear", fill: "forwards" }));
  const out = inn.animate({ opacity: [1, 0] }, { duration: 80, easing: "linear", fill: "forwards" });
  await Promise.race([out.finished, new Promise(r => setTimeout(r, 300))]).catch(() => {});
  root.dataset.swap = front;
  for (const a of side) a.cancel();
  const sf = document.createElement("div");
  sf.className = "surface"; sf.setAttribute("aria-hidden", "true");
  sf.style.cssText = `position:absolute;left:${from.x}px;top:${from.y}px;width:${from.width}px;height:${from.height}px;z-index:38;background:${bg0};transform-origin:0 0;pointer-events:none`;
  $("app").append(sf);
  cb.style.visibility = "hidden";
  cb.dataset.as = up ? "stage" : "dock";
  chart();
  const to = rectOf(cb), bg1 = getComputedStyle(cb).backgroundColor;
  const move = sf.animate([{ transform: "none", backgroundColor: bg0 }, { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.width / from.width}, ${to.height / from.height})`, backgroundColor: bg1 }], { duration: ms, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "forwards" });
  await Promise.all([Promise.race([move.finished, new Promise(r => setTimeout(r, ms + 400))]).catch(() => {}), alongside()]);
  out.cancel();
  inn.style.opacity = "0";
  cb.style.visibility = "";
  sf.remove();
  inn.style.opacity = "";
  await Promise.race([inn.animate({ opacity: [0, 1] }, { duration: 100, easing: "linear" }).finished, new Promise(r => setTimeout(r, 400))]).catch(() => {});
}
// The swap of the map and the timeline: the timeline's surface and the map move together, while what the timeline shows is away.
async function swap(to = front === "map" ? "chart" : "map") {
  if (swapping || to === front) return;
  if (narrow()) { front = to; place(); sheetAt(); refresh(); return; }  // a phone: the timeline's sheet goes up or down over the map, which stays where it is
  swapping = true;
  cellQuiet(); map.eachLayer(l => l.closeTooltip?.());  // no label rides the map into its dock
  const ms = calm() ? 0 : 180;
  front = to;
  let mapDone = null;
  await chartMove(to === "chart", ms, () => new Promise(r => { mapDone = mapMove(to === "chart", ms, r); if (!ms) mapDone.then(r); }));  // (what the timeline shows comes back as soon as the map is in its place)
  await mapDone;
  root.dataset.front = panel || to;
  delete root.dataset.swap;
  swapping = false;
  refresh();
}
// the map alone leaves the stage or comes back, for when what takes the stage is a panel
async function mapTo(dock) {
  swapping = true;
  cellQuiet(); map.eachLayer(l => l.closeTooltip?.());
  root.dataset.swap = "map";
  try { await mapMove(dock, calm() ? 0 : 600, undefined, true); }
  finally { BOX.map.dataset.as = dock ? "dock" : "stage"; BOX.map.style.visibility = ""; delete root.dataset.swap; swapping = false; }
}
// make the map's place agree with what holds the stage (a step of the story may change its mind while the map is on its way)
let syncing = false;
async function stageSync() {
  root.dataset.front = panel || front;
  if (syncing) return;
  syncing = true;
  try { while (!narrow() && !swapping && docked("map") !== (front !== "map" || !!panel)) await mapTo(!docked("map")); }
  finally { syncing = false; }
  refresh();
}
// a panel takes the stage, and gives it back when it is closed
function stageOn(id) {
  if (S.sel != null) { unselect(); refresh(); }
  for (const o of ["about", "api"]) if (o !== id && $(o).open) $(o).close();
  if (!$(id).open) $(id).show();
  panel = id;
  stageSync();
}
for (const id of ["about", "api"]) $(id).addEventListener("close", () => { if (panel === id) { panel = null; stageSync(); } });
$("chart-front").onclick = e => { e.stopPropagation(); swap(); };
$("map-front").onclick = () => (panel ? $(panel).close() : swap("map"));  // the small map is the way back to the map, whatever has the stage
// docked, the timeline comes forward at a click anywhere on it, except on the controls it keeps there: the
// hazards, the year stepper and the way out of a sector. (The path is the one the click took: by now a control
// may have redrawn itself, and its old button is no longer in the page.)
let pressAt = null;  // where a press on the timeline began: a drag is never a tap
BOX.chart.addEventListener("pointerdown", e => (pressAt = [e.clientX, e.clientY]), true);
BOX.chart.addEventListener("click", e => {
  const path = e.composedPath(), on = id => path.includes($(id));
  if (pressAt && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 8) return;
  if (narrow() && !on("chart") && !path.some(n => n.tagName === "IMG")) return;  // on a phone only the plot itself (or the people's photograph) takes the sheet up: a touch on its words or its edges does nothing
  if (docked("chart") && !on("hazard") && !on("step") && !(on("scope") && path.some(n => n.tagName === "BUTTON")) && !path.some(n => n.tagName === "A" || n.tagName === "SUMMARY")) swap("chart");
});

// ---------- controls ----------
// a row of words that is too long for its place in some language steps its type down until it fits
function fitRows() {
  for (const el of [$("hazard"), $("modes"), $("scale"), $("kinds")]) {
    for (const b of el.children) b.style.fontSize = b.style.letterSpacing = "";
    el.style.gap = "";
    for (const [size, gap] of el === $("kinds") ? [[14, "0 10px"], [13, "0 9px"], [13, "0 6px"], [13, "0 4px"]] : [[14, "0 12px"], [13, "0 9px"], [12, "0 7px"], [11, "0 5px"]]) {  // (the kinds stop at 13 px: after that their row scrolls)
      if (!el.offsetParent || el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= (el.parentElement.closest("#mappanel, #chartin") || el.parentElement).getBoundingClientRect().right + 1) break;
      for (const b of el.children) { b.style.fontSize = size + "px"; b.style.letterSpacing = "0.02em"; }
      if (el !== $("modes")) el.style.gap = gap;
    }
  }
  for (const k of ["fontSize", "letterSpacing"]) $("rank-btn").style[k] = $("kinds").firstElementChild?.style[k] || "";  // Ranking keeps the kinds' size, whatever it is
}
function chrome() {
  const L_ = t(), btn = (k, label, on) => `<button data-k="${k}" aria-pressed="${on}">${label}</button>`;
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? "rtl" : "ltr";
  document.title = L_.title; document.querySelector('meta[name="description"]').content = L_.description;  // the tab's name and the page's description, in the reader's language
  document.documentElement.dataset.hazard = S.hazard;
  document.documentElement.dataset.mode = S.mode;
  document.documentElement.dataset.scale = S.scale;
  document.documentElement.style.setProperty("--hue", `var(--${S.hazard})`);
  $("hazard").className = $("scale").className = $("kinds").className = $("ahead").className = "pick";
  $("modes").className = "seg";  // the mode is a switch of its own, apart from the list of sector kinds
  $("hazard").innerHTML = hazards().map(k => btn(k, glyph(k) + L_.hazard[k], k === S.hazard)).join("");
  $("scale").innerHTML = ["years", "months", ...(S.hazard === "clear" && ACT ? ["actions"] : [])].map(k => btn(k, L_.scale[k], k === S.scale)).join("");
  $("modes").innerHTML = ["sectors", "cells", ...(M.years[M.forecast.year]?.flags500 ? ["prio"] : [])].map(k => btn(k, L_.modes[k], k === S.mode)).join("");
  $("rank-btn").innerHTML = `<svg viewBox="0 0 14 11" aria-hidden="true"><path d="M0 1.5h2M4.5 1.5H14M0 5.5h2M4.5 5.5H14M0 9.5h2M4.5 9.5H14"/></svg>` + esc(L_.ranking);  // a small list before the word: it opens the ranked list of the kind, it is not a kind
  $("rank-btn").setAttribute("aria-pressed", S.rank);
  $("rank-btn").setAttribute("aria-label", L_.ranking); $("rank-btn").title = L_.ranking;
  $("rank-btn").hidden = S.mode !== "sectors";
  document.documentElement.dataset.list = listOn();
  // bars or a line: two small glyphs, no words
  $("shape").innerHTML = [["bars", "M1 12V6h3v6zM6 12V2h3v6zM11 12V8h3v4z"], ["line", "M1 11L5 5l4 3 5-6"]].map(([k, d]) => `<button data-k="${k}" aria-pressed="${(k === "line") === S.line}" aria-label="${L_[k]}" title="${L_[k]}"><svg viewBox="0 0 15 13" aria-hidden="true"><path d="${d}"/></svg></button>`).join("");
  $("kinds").innerHTML = ["uf", "mun", "ti", "uc"].map(k => btn(k, L_.kinds[k], k === S.kind)).join("");
  $("kinds").hidden = $("kindrow").hidden = S.mode !== "sectors";
  // the window ahead as buttons (on a phone; on a wide screen it is chosen on the chart itself), and a stepper
  // for the years, which also stands on the docked timeline
  const hs = S.hazard === "clear" && S.scale === "months" ? horizons() : [];
  $("ahead").innerHTML = hs.map(h => btn(h, h ? L_.ahead({ n: h, count: h }) : L_.byJuly({ y: FY }), h === S.h)).join("");
  $("ahead").hidden = hs.length < 2;
  const ys = Object.keys(M.years).map(Number).sort(), at = ys.indexOf(S.year), [prev, , next] = $("step").children;
  $("step").hidden = !replays();
  $("step").children[1].textContent = S.year;
  prev.disabled = at <= 0; next.disabled = at >= ys.length - 1;
  prev.setAttribute("aria-label", L_.prevYear); next.setAttribute("aria-label", L_.nextYear);
  // each box says how it comes forward; the timeline on the stage says how to send it back
  for (const [id, label] of [["chart-front", front === "chart" ? L_.close : L_.front.chart], ["map-front", L_.front.map]]) { $(id).setAttribute("aria-label", label); $(id).title = label; }
  for (const [id, label] of [["list-close", L_.closeList], ["about-close", L_.close], ["api-close", L_.close], ["menu-btn", L_.menu]]) { $(id).setAttribute("aria-label", label); $(id).title = label; }
  homeBtn.setAttribute("aria-label", L_.home); homeBtn.title = L_.home;
  for (const [sel, label] of [[".leaflet-control-zoom-in", L_.zoomIn], [".leaflet-control-zoom-out", L_.zoomOut]]) { const b = document.querySelector(sel); if (b) { b.title = label; b.setAttribute("aria-label", label); } }
  fitRows();
  $("list-title").textContent = S.mode === "sectors" ? L_.ranking : L_.modes.prio;
  $("story-btn").textContent = L_.story;
  $("skip-btn").textContent = L_.skip;
  $("about-btn").textContent = L_.about;
  $("api-copy").setAttribute("aria-label", L_.copy); $("api-copy").title = L_.copy;
  $("lang-btn").textContent = lang.toUpperCase();
  $("lang-btn").setAttribute("aria-label", L_.language); $("lang-btn").title = L_.language;
  $("lang-menu").innerHTML = Object.keys(LANGS).map(l => `<button data-l="${l}" lang="${l}" role="menuitemradio" aria-checked="${l === lang}">${LANGS[l][0]}</button>`).join("");
  $("list-csv").textContent = L_.csv;
  $("credit").textContent = L_.credit;
}
// only the yearly clearing timeline replays a past year: its bars and its stepper are the year control
const replays = () => S.hazard === "clear" && S.scale === "years";
async function refresh() {
  if (S.sel == null && outline) unselect();  // (no outline without a selection, whatever let it go)
  $("mapin").inert = mapSmall();  // docked, the map is a picture of itself: one click on it brings it back
  if (!hazards().includes(S.hazard)) S.hazard = "clear";
  if (S.mode === "prio") { S.hazard = "clear"; S.year = FY; S.h = 0; }  // the priority list is the yearly clearing forecast
  if (S.h && !M.layers["clear" + S.h]) S.h = 0;
  if (acting() && (S.hazard !== "clear" || !ACT)) S.scale = "years";
  if (S.hazard === "clear" && !replays()) S.year = FY;  // months and actions look around now; the map stays on the forecast
  chrome();
  if (sideOn() !== listWas) { listWas = sideOn(); sheetAt("half"); if (pristine && !mapSmall() && !narrow()) whole(!calm()); else setTimeout(limit); }  // the Amazon glides to make room for the list, and to take it back
  link();
  say();  // the bulletin and the timeline need only the small JSON files, so they come first
  startMap(); paint(); drawSectors();
  list();
  people();
  // a phone: when what stands around the map has changed enough, the Amazon glides to the middle of what is free
  recentre();
}
function recentre() {
  if (narrow() && pristine && map._loaded) requestAnimationFrame(() => {
    if (!pristine || !narrow() || swapping) return;
    const r = room();
    if (map.getSize().y - r.top - r.bottom < 140) return;  // (a sheet pulled far up leaves the map as it is: the Amazon is not made tiny for it)
    const v = fitNow(), d = map.latLngToContainerPoint(v.c).distanceTo(map.latLngToContainerPoint(map.getCenter()));
    if (d > 12 || Math.abs(v.z - map.getZoom()) > 0.05) view(v, !calm());
  });
}

// ---------- the ranked list, on the map's frame: where to look first ----------
// Priorities: the 500 blocks of 5 km where the most cells are expected to lose a hectare (data/priority.json),
// drawn as outlines over the cells. Sectors: the same idea at a coarser scale, the sectors of the kind on screen
// ranked by the forecast.
let PRIO = null, blocks = null, blockSel = null, here = null, listed = "", flown = false, listWas = sideOn();
const priority = () => (PRIO ||= fetch("data/priority.json").then(r => r.json()));
const blockBox = (PR, b) => { const h = PR.block_km * M.years[PR.year].flags500.cell; return [[b.lat - h, b.lon - h], [b.lat + h, b.lon + h]]; };  // 5 km is ten 500 m cells
// (the name gives way when the row is narrow; the mark of protected land after it does not)
const row = (attr, rank, name, right, on, mark = "") => `<li><button ${attr}${on ? ' aria-current="true"' : ""}><b>${rank}</b><span class="nm"><span>${name}</span>${mark}</span>${right}</button></li>`;
async function list() {
  const el = $("list"), L_ = t(), k = key();
  el.hidden = !listOn();
  $("list-csv").hidden = S.mode !== "prio";
  if (blocks && S.mode !== "prio") blocks.remove();
  if (blockSel && (S.mode !== "prio" || !S.block)) { blockSel.remove(); blockSel = null; if (here) { here.remove(); here = null; } }
  if (!listOn()) return;
  if (S.mode === "prio") {
    const PR = await priority();
    if (S.mode !== "prio") return;
    // the blocks on the map: a white outline inside a dark one, which reads on forest green and on red alike
    blocks ||= L.layerGroup(PR.blocks.flatMap(b => [
      L.rectangle(blockBox(PR, b), { renderer: cvSectors, color: INK, weight: 3.4, opacity: 1, fill: false, interactive: false }),
      L.rectangle(blockBox(PR, b), { renderer: cvSectors, color: "#fff", weight: 1.4, opacity: 1, fillOpacity: 0 }).on("click", e => { L.DomEvent.stopPropagation(e); block(b.rank, false); })]));
    if (S.mode === "prio") blocks.addTo(map);
    if (listed !== "prio" + lang) {
      // a place a row: its rank, its name, a tag if it lies in protected land, and a thin bar as long as the cells expected to lose a hectare there
      const pc = b => b.expected_cells / Math.max(1, b.forest_cells), top = Math.max(...PR.blocks.map(pc));  // a place's chance: the mean chance of its forest cells
      $("list-say").textContent = "";
      $("list-rows").innerHTML = `<li class="h" aria-hidden="true"><span>${L_.chance}</span></li>` + PR.blocks.map(b => row(`data-b="${b.rank}"`, b.rank, `${esc(b.municipality)}, ${b.state}`, `<span class="len" aria-hidden="true"><i style="width:${(100 * pc(b) / top).toFixed(1)}%"></i></span><span class="v">${pcOf(pc(b))}</span>`, false, b.land ? `<abbr class="tag" title="${L_.land[b.land]}">${L_.tag[b.land]}</abbr>` : "")).join("");
      listed = "prio" + lang;
    }
    $("list-rows").className = "prio";
    if (S.block && S.mode === "prio") { block(S.block, !storyOn && !flown && !H.get("v"), false); flown = true; }  // a block in the link is brought into view once; the story marks it and leaves the map where it is
  } else {
    const K = await sectors(S.kind), I = info(), yearly = typeof k === "number", past = isPast();
    if (!(S.mode === "sectors" && S.rank) || k !== key()) return;
    const top = [...K.items].sort((a, b) => expOf(b) - expOf(a)).slice(0, 100).filter(it => expOf(it) > 0);
    $("list-say").textContent = L_.rankSay({ kind: L_.kinds[S.kind], what: yearly ? (past ? L_.rankWhat.past : L_.rankWhat.fc)({ y: k }) : S.hazard === "fire" ? L_.rankWhat.fire : L_.rankWhat.risk });
    $("list-rows").className = "";
    $("list-rows").innerHTML = top.map((it, n) => row(`data-id="${esc(it.id)}"`, n + 1, esc(it.n) + (it.s ? ", " + it.s : ""), `<span class="v">${yearly ? `${approx(expOf(it))} km²` : `${share(100 * expOf(it) / I.risk_km2)}%`}</span>`, String(it.id) === S.sel)).join("");
    listed = "";
  }
}
// Why a place ranks high, in one plain sentence, two at most. The first is what was cleared around it in three
// years; where that is little, what burned or was degraded there in the last year, whichever is more; failing
// both, that it lies close to recent clearing. The second, only where it applies: a permit to clear, or the
// protected land the place lies in.
function reasons(PR, b) {
  const L_ = t().why, w = { cleared_3y_around_km2: 0, fire_scar_12m_km2: 0, degradation_12m_km2: 0, permit_ha: 0, ...b.why }, burned = w.fire_scar_12m_km2 >= w.degradation_12m_km2;
  const main = w.cleared_3y_around_km2 >= 1 ? L_.around({ km: km(w.cleared_3y_around_km2) })
    : Math.max(w.fire_scar_12m_km2, w.degradation_12m_km2) >= 0.5 ? L_[burned ? "fire" : "degr"]({ km: km(burned ? w.fire_scar_12m_km2 : w.degradation_12m_km2) })
    : L_.near;
  const second = w.permit_ha >= 50 ? L_.permit({ ha: fmt(w.permit_ha) }) : b.land ? L_.land[b.land] : "";
  return `<div class="why"><p>${main}</p>${second ? `<p>${second}</p>` : ""}</div>`;
}
// choose a priority block: outline it, bring it into view, mark its row and open it into its reasons
async function block(rank, fly = true, write = true) {
  const PR = await priority(), b = PR.blocks.find(x => x.rank === rank);
  if (!b || S.mode !== "prio") return;
  S.block = rank;
  if (blockSel) blockSel.remove();
  const box = blockBox(PR, b);
  blockSel = L.featureGroup([L.rectangle(box, { renderer: svgSel, fill: false, color: INK, weight: 7, interactive: false }), L.rectangle(box, { renderer: svgSel, fill: false, color: GROUND, weight: 3, interactive: false })]).addTo(map);
  // from far the block is smaller than a dot: a ring says where it is
  if (here) here.remove();
  here = L.marker([b.lat, b.lon], { pane: "labels", interactive: false, keyboard: false, icon: L.divIcon({ className: "here", iconSize: [26, 26] }) });
  zoomed();
  for (const el of $("list-rows").querySelectorAll("[aria-current]")) el.removeAttribute("aria-current");
  for (const el of $("list-rows").querySelectorAll(".why")) el.remove();
  const el = $("list-rows").querySelector(`[data-b="${rank}"]`);
  if (el) { el.setAttribute("aria-current", "true"); el.setAttribute("aria-expanded", "true"); el.insertAdjacentHTML("afterend", reasons(PR, b)); el.parentNode.scrollIntoView({ block: "nearest" }); }
  if (fly) { pristine = false; map.flyToBounds(L.latLngBounds(box).pad(3), { ...FIT(), maxZoom: 11, duration: calm() ? 0 : 0.6 }); }
  if (write) link();
}
// the list's way out: the map goes back to its cells, or the ranking closes
$("list-close").onclick = () => { if (storyOn) storyShut = true; if (S.mode === "prio") { S.mode = "cells"; S.block = null; } S.rank = false; refresh(); };
$("list-rows").onclick = e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.b) block(+b.dataset.b);
  else if (b.dataset.id) select(b.dataset.id);
};
PHONE.addEventListener("change", refresh);
const pressed = (id, fn) => ($(id).onclick = e => { const b = e.target.closest("button"); if (b) fn(b.dataset.k); });
const leavePrio = () => { if (S.mode === "prio") S.mode = "cells"; };  // the priority list is only the yearly clearing forecast
pressed("hazard", k => { if (k !== "clear") leavePrio(); S.hazard = k; refresh(); });
pressed("scale", k => { S.scale = k; refresh(); });
pressed("modes", k => { if (k !== S.mode) unselect(); S.mode = k; pristine = pristine || !S.block; refresh(); });
pressed("shape", k => { S.line = k === "line"; refresh(); });
$("rank-btn").onclick = () => { S.rank = !S.rank; refresh(); };
pressed("kinds", k => { if (k !== S.kind) { S.kind = k; select(null); } });
pressed("ahead", k => ahead_(+k));
$("step").onclick = e => {
  const b = e.target.closest("button"), ys = Object.keys(M.years).map(Number).sort();
  if (b && ys[ys.indexOf(S.year) + +b.dataset.d]) pick(ys[ys.indexOf(S.year) + +b.dataset.d]);
};
function pick(y) { if (y !== FY) leavePrio(); S.year = y; refresh(); }
document.addEventListener("keydown", e => {
  if (storyOn) return;
  if (e.key === "Escape" && pin) return cellQuiet();
  if (e.key === "Escape" && panel) return $(panel).close();
  if (panel) return;
  if (e.key === "Escape" && root.dataset.menu != null) return menu(false);
  if (e.key === "Escape" && front === "chart") return swap("map");
  if (e.key === "Escape" && S.sel != null) return select(null);
  if (e.key === "Escape" && listOn()) return $("list-close").click();
  if (!replays() || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const ys = Object.keys(M.years).map(Number).sort(), i = ys.indexOf(S.year) + (e.key === "ArrowLeft" ? -1 : 1);
  if (ys[i]) pick(ys[i]);
});
// the language: a menu of every language by its own name. Choosing one fetches its words, saves the choice and puts it in the link.
async function setLang(l) {
  if (!(await loadLang(l))) return;
  lang = l;
  try { localStorage.lang = l; } catch (err) { /* private mode */ }
  langInLink = true;
  refresh();
  if (storyOn) storyText();
}
const langMenu = on => { $("lang-menu").hidden = !on; $("lang-btn").setAttribute("aria-expanded", !!on); };
$("lang-btn").onclick = e => { e.stopPropagation(); langMenu($("lang-menu").hidden); };
$("lang-menu").onclick = e => { const b = e.target.closest("[data-l]"); if (b) { langMenu(false); setLang(b.dataset.l); } };
document.addEventListener("click", () => langMenu(false));

// About: a panel beside the map. What this is and who it is for, the model's figure, what the model is and how
// it did, the benchmark as a bare table with the way in as a button, and that it gets things wrong. Every number
// is read from data/story.json. `at` opens it on the figure or on the benchmark.
const MODEL = [...(ST?.leaderboard?.rows || [])].sort((a, b) => a.rank - b.rank).find(r => r.kind === "model")?.model || ST?.model?.name || "prenuncio";  // the model on the map is the one that leads the benchmark, by its name there
const of5 = x => (Math.abs(x * 5 - Math.round(x * 5)) < 0.02 ? [Math.round(x * 5), 5] : [Math.round(x * 10), 10]);  // a share as so many in five, or in ten
function bench() {
  const L_ = t().bench, B = ST.benchmark, pc = x => (x == null ? "" : pcOf(x, 1)), day = d => { const [y, m_, dd] = d.split("-").map(Number); return new Date(y, m_ - 1, dd).toLocaleDateString(loc(), { day: "numeric", month: "short", year: "numeric" }); };
  // until the file carries the table, the same rows from the benchmark's own figures
  const rows = ST.leaderboard?.rows || [{ rank: 1, model: MODEL, url: ST.links.leaderboard, cap5: B.today, unseen_2026: B.unseen_2026, by: "Prenúncio", kind: "model" }, { rank: 2, model: "last year", url: ST.links.benchmark, cap5: B.naive, by: "reference", kind: "reference" }];
  const head = L_.head.map((h, i) => `<th${i === 2 || i === 3 ? ' class="n"' : ""}>${i === 3 ? ST.model.trained_on.last_outcome_year : h}</th>`).join("");
  return `<table class="bench"><thead><tr>${head}</tr></thead><tbody>${rows.map(r => `<tr${r.kind === "reference" ? ' class="ref"' : ""}><td>${r.rank}</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.kind === "reference" && L_.refName ? L_.refName : r.model)}</a></td><td class="n">${pc(r.cap5)}</td><td class="n">${pc(r.unseen_2026)}</td><td>${r.kind === "reference" ? L_.ref : esc(r.by)}</td><td>${r.date ? day(r.date) : ""}</td></tr>`).join("")}</tbody></table>`;
}
function about(at) {
  if (!ST) return;
  const [hit, of] = of5(ST.check.priority_blocks_that_lost_10ha);
  const A = t().aboutText, B = t().bench, p = x => `<p>${x}</p>`;
  $("about-body").innerHTML = `<div class="lede">${p(esc(A.line1({ year: ST.forecast.year })))}${p(esc(A.line2))}</div><div id="model-fig"></div>`
    + p(esc(A.model({ name: "\u0001", m: ST.forest.cell_m })).replace("\u0001", `<b>${esc(MODEL)}</b>`)) + p(esc(A.tested({ y: ST.check.year, hit, of })))
    + `<h3 id="about-benchmark">${esc(A.benchmark)}</h3>${bench()}<p class="metric">${esc(A.metric({ b0: ST.benchmark.years[0], b1: ST.benchmark.years.at(-1) }))}</p>` + p(esc(A.open))
    + `<p class="go"><a class="btn" href="${esc(ST.links.benchmark)}" target="_blank" rel="noopener">${esc(B.submit)}</a><a href="${esc(ST.links.repository)}" target="_blank" rel="noopener">${esc(B.repo)}</a></p>`
    + `<p class="by">${esc(A.by({ name: "\u0001" })).replace("\u0001", `<a href="https://guidavid.com" target="_blank" rel="noopener">Gui Dávid</a>`)} ${esc(A.org({ org: "Movimento Cibernético Brasileiro" }))}<img class="org" src="img/mcbr.png" alt="" width="131" height="48" loading="lazy"></p>`;

  // in the story it is put together a piece at a time: the figure alone, then the benchmark alone, each entering as the other leaves
  const only = storyOn ? (at === "about-benchmark" ? "bench" : "fig") : "";
  if (only) { if ($("about").dataset.only !== only) { $("about-body").classList.remove("in"); void $("about-body").offsetWidth; $("about-body").classList.add("in"); } $("about").dataset.only = only; } else { delete $("about").dataset.only; $("about-body").classList.remove("in"); }
  stageOn("about");  // it takes the stage, and the map waits in its corner
  if (storyOn) $("story-next").focus({ preventScroll: true });  // (opening takes the focus to the panel's X; in the story it belongs to the way on, so Enter and Space go on)
  figure();
  $("about").scrollTop = !only && at && $(at) ? $(at).offsetTop - $("about-bar").offsetHeight : 0;  // that part, right under the bar
}
$("about-btn").hidden = !ST;
$("about-btn").onclick = () => about();
$("about-close").onclick = () => $("about").close();
// the API panel: the instructions for agents, shown as the file has them (api/v1/llms.txt), fetched when opened
let apiText = null;
$("api-btn").onclick = async () => {
  stageOn("api");
  apiText ??= await fetch("api/v1/llms.txt").then(r => (r.ok ? r.text() : null)).catch(() => null);
  $("api-text").textContent = apiText ?? "";
  $("api-text").scrollTop = 0;
};
$("api-copy").onclick = async () => {
  let ok = true;
  try { await navigator.clipboard.writeText(apiText ?? ""); }
  catch (err) { getSelection().selectAllChildren($("api-text")); ok = document.execCommand("copy"); }  // no clipboard access: select the text and copy that
  if (!ok) return;  // the text stays selected, ready to be copied by hand
  $("api-copy").dataset.done = ""; $("api-said").textContent = t().copied;  // the clipboard turns into a check for a moment, and the word is said to a screen reader
  setTimeout(() => { delete $("api-copy").dataset.done; $("api-said").textContent = ""; }, 1500);
};
$("api-close").onclick = () => $("api").close();

// shareable state: #y=2023&k=scar12&t=months&m=cells&f=chart&s=ti&r=<sector id>&v=lat,lng,zoom&l=pt
// (t is the timeline's scale, m the map's mode, f=chart when the timeline is on the stage. k is the forecast
// layer when it is not a PRODES year: clear3 or clear6 for the months ahead of clearing, or another hazard's
// layer, such as scar12 for fire. v is the view of the map on the stage.)
let leaving = false;
addEventListener("hashchange", e => { leaving = true; location.replace(e.newURL); location.reload(); });
function link() {
  if (leaving || storyOn) return;  // the story plays at the bare address
  const at = docked("map") ? stageView : { c: map.getCenter(), z: map.getZoom() }, q = new URLSearchParams({ y: S.year });
  if (typeof key() !== "number") q.set("k", key());
  q.set("t", S.scale);
  q.set("m", S.mode);
  if (front === "chart") q.set("f", "chart");
  if (S.mode === "prio" && S.block) q.set("b", S.block);
  if (S.mode === "sectors" && S.rank) q.set("g", 1);
  if (S.line) q.set("c", "line");
  if (S.min) q.set("p", S.min);
  if (S.kind !== "mun") q.set("s", S.kind);
  if (S.sel != null) q.set("r", S.sel);
  if (at) q.set("v", `${at.c.lat.toFixed(3)},${at.c.lng.toFixed(3)},${+at.z.toFixed(2)}`);
  if (langInLink) q.set("l", lang);
  history.replaceState(null, "", "#" + q.toString().replaceAll("%2C", ","));
}
map.on("moveend", link);

// ---------- the opening story. A first visit to the bare address is told what this is, one line at a time,
// while the interface is put together around the map. The map is there from the first line and never gives its
// place; the Amazon glides once, to make room when the priority list comes in. Each step brings in at most one
// piece of the tool, in the place it keeps: the key to the colours, About (which opens on the model's figure and
// then on the benchmark, and closes when the reader goes on), the priority list, the timeline in its dock. The
// model's panel and the list are never open together. When the last line is read the caption goes away and what
// is on the page is the tool. Skipping lands on that same page.
// Each step is a scene, a plain description of what is on the page, and scene() makes the page match it, so a
// step can be reached forward, backward or by a change of language. Heavy layers load while the first lines are read.
const CY = ST?.check?.year;  // the year the story replays
const SCENES = [
  { id: "forestA" },
  { id: "forestB", fx: "mosaic" },
  { id: "lossA", loss: true, fx: "loss", extra: "years" },
  { id: "lossB", loss: true, extra: "years" },
  { id: "model", has: "legend", cells: FY, fx: "sweep" },                                  // the key, and the Cells tab
  { id: "proof", has: "legend", cells: CY, fx: "proof" },
  { id: "sources", has: "legend", cells: FY, about: "model-fig" },
  { id: "open", has: "legend", cells: FY, about: "about-benchmark" },
  { id: "sectors", has: "legend sectors", cells: FY, mode: "sectors" },                    // the Sectors tab and the kinds
  { id: "first", has: "legend sectors prio list", cells: FY, mode: "prio" },               // the Priorities tab and the list
  { id: "ahead", has: "legend sectors prio list chart", cells: FY, mode: "prio" },         // the timeline in its dock
  { id: "use", has: "legend sectors prio list chart nav", cells: FY },                     // the header's links and the zoom: the tool as it will be left
].filter(s => s.cells !== CY || (CY && CY !== FY && M.years[CY]?.flags500 && P?.years?.[CY]));
let KIND0 = null;
const INERT = () => [$("mappanel"), $("chartbox"), $("list"), $("story-btn"), $("about-btn"), $("api-btn"), $("menu-btn"), document.querySelector(".leaflet-control-zoom")];
let sAt = 0, sRun = 0, storyShut = false;  // the step on screen; a count that tells a running effect it has been overtaken; whether the reader closed the list
const wait = ms => new Promise(r => setTimeout(r, ms));
// what each line says, from the data
function storyWords(id) {
  const L_ = t().st, n0 = x => fmt(Math.round(x)), hist = ST.history, chk = ST.check, sum = hist.km2.reduce((a, b) => a + b, 0), [hit, of] = of5(chk.priority_blocks_that_lost_10ha);
  switch (id) {
    case "forestA": return L_.forestA;
    case "forestB": return L_.forestB({ cells: n0(ST.forest.cells / 1e6), m: ST.forest.cell_m, count: Math.round(ST.forest.cells / 1e6) });
    case "lossA": return L_.lossA;
    case "lossB": return (L_.lossBMore && sum > L_.moreKm ? L_.lossBMore : L_.lossB)({ y: hist.years[0], k: n0(sum / 1000), km: n0(sum) });
    case "model": return L_.model;
    case "proof": return L_.proof({ y: chk.year, hit, of });
    case "sources": return L_.sources({ n: t().numSources[ST.model.inputs.length] ?? fmt(ST.model.inputs.length), count: ST.model.inputs.length });
    case "open": return L_.open;
    case "sectors": return L_.sectors;
    case "use": return LITE || matchMedia("(pointer: coarse)").matches ? L_.useTouch : L_.use;  // a finger has no pointer to move
    case "first": return L_.first({ n: n0(ST.priority.blocks), count: ST.priority.blocks });
    case "ahead": {  // the three months behind against a year before, as the level counts them, and the three ahead
      const [now, prev] = three(monthly(null, "clear")), hz = MO?.hazards?.clear, f = hz?.forecast?.[2], rise = prev >= 1 ? Math.round(100 * (now / prev - 1)) : 0;
      if (!hz?.sums?.[3] || !f) return t().fc({ km: approx(M.forecast.total_km2), here: "", y: FY }) + ".";
      const [y, m_] = f.month.split("-").map(Number);
      return (rise > 0 ? L_.ahead.rise : L_.ahead.flat)({ pct: fmt(rise), km: approx(hz.sums[3].p50), month: month(y, m_ - 1, { month: "long" }) });
    }
  }
}
// the years of clearing as small bars under the line: all of them up to `upTo`, the one being counted in ink
function yearBars(upTo, all) {
  const h = ST.history, W = 300, Hh = 56, n = h.years.length, pitch = W / n, max = Math.max(...h.km2), at = h.years.indexOf(upTo);
  const bars = h.years.map((y, i) => { const hh = Math.max(1.5, (Hh - 2) * h.km2[i] / max); return `<rect class="${i > at ? "todo" : all || i < at ? "done" : "now"}" x="${(i * pitch + 1.5).toFixed(1)}" y="${(Hh - hh).toFixed(1)}" width="${(pitch - 3).toFixed(1)}" height="${hh.toFixed(1)}"/>`; }).join("");
  return `<div class="years"><svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" aria-hidden="true">${bars}</svg><p>${all ? `${h.years[0]}<span>${h.years.at(-1)}</span>` : `<b>${upTo}</b> ${fmt(h.km2[Math.max(0, at)])} km²`}</p></div>`;
}
// ---------- the figure of the model, in About. The nine public sources are nine layers of the same territory:
// a stack of thin planes seen from above and to one side, each the Amazon's outline with a hint of what that
// source holds, each named. Thin traces run down through the stack into the model and out onto the last plane,
// which is the map the reader has been looking at: the chance, in red. Small particles travel the traces, slowly.
// (The idea of planes, traces and particles is borrowed from an animation study; nothing of its shapes is used.)
// Drawn on a canvas at the width it is given; the still picture is drawn once and only the particles move; they
// stop when the figure is off the screen, the panel is closed or the reader asks for less motion.
const FIG = { raf: 0, on: false, tenure: null, wants: false };
const seeded = s => () => { let x = (s += 0x6d2b79f5); x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
// for every pixel of a small north-up picture of the grid: is it inside the Amazon, how much of it is forest, and its step of chance
function figData(w, h) {
  const inside = new Uint8Array(w * h), forest = new Float32Array(w * h), cls = new Uint8Array(w * h), land = new Uint8Array(w * h);
  if (baseCv) {  // the base map is drawn with rows even in Mercator: each row here takes the one at its own latitude
    const c = new OffscreenCanvas(w, h), cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(baseCv, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, y0 = mercY(M.north), y1 = mercY(M.north - M.rows * M.cell);
    for (let j = 0; j < h; j++) { const jm = Math.min(h - 1, Math.max(0, Math.floor((y0 - mercY(M.north - (j + 0.5) / h * M.rows * M.cell)) / (y0 - y1) * h))); for (let i = 0; i < w; i++) { const o = 4 * (jm * w + i); if (d[o + 3] > 127) { inside[j * w + i] = 1; forest[j * w + i] = Math.max(0, Math.min(1, 1 - (d[o] - FOREST[0]) / 190)); } } }
  }
  const lv = grid?.prob && grid.key === FY ? grid.levels.filter(l => l.k && l.cols >= w).at(-1) : null;
  if (lv) for (let j = 0; j < h; j++) for (let i = 0, r = Math.floor((j + 0.5) / h * lv.rows) * lv.cols; i < w; i++) { const k = lv.k[r + Math.floor((i + 0.5) / w * lv.cols)]; if (k) { cls[j * w + i] = (k & 15) - 1; inside[j * w + i] ||= 1; } }
  if (FIG.tenure) for (let i = 0; i < w * h; i++) land[i] = FIG.tenure[i] < 250 ? FIG.tenure[i] : 0;
  return { inside, forest, cls, land, chance: !!lv };
}
// one small picture a source, north up: a hint of what that source holds. The clearing history is the land already
// cleared on the base map and who holds the land is the tenure layer; the others are marks of their own kind, set
// where the forest is under pressure.
function figLayers(w, h, D) {
  const ink = `rgb(${css("--ink").match(/\w\w/g)?.map(x => parseInt(x, 16)) || [16, 32, 26]})`, pick = (rnd, n, ok) => { const out = []; for (let k = 0; k < n * 60 && out.length < n; k++) { const i = Math.floor(rnd() * w), j = Math.floor(rnd() * h); if (ok(j * w + i)) out.push([i, j]); } return out; };
  const hot = min => i => D.inside[i] && (D.chance ? D.cls[i] >= min : D.forest[i] > 0.2 && D.forest[i] < 0.8), draw = fn => { const c = new OffscreenCanvas(w, h), cx = c.getContext("2d"); cx.fillStyle = cx.strokeStyle = ink; fn(cx); return c; };
  const dots = (seed, n, min, r, a) => draw(cx => { cx.globalAlpha = a; for (const [i, j] of pick(seeded(seed), n, hot(min))) { cx.beginPath(); cx.arc(i, j, r, 0, 7); cx.fill(); } });
  return [
    draw(cx => { const img = cx.createImageData(w, h); for (let i = 0; i < w * h; i++) if (D.inside[i] && D.forest[i] < 0.4) { img.data[4 * i] = 16; img.data[4 * i + 1] = 32; img.data[4 * i + 2] = 26; img.data[4 * i + 3] = 150; } cx.putImageData(img, 0, 0); }),  // what is already cleared
    dots(11, 240, 2, 1.5, 0.8),                                                                                            // alerts, day by day
    dots(12, 1300, 1, 0.8, 0.6),                                                                                           // loss at 30 m: fine and many
    draw(cx => { for (const [i, j] of pick(seeded(13), 120, hot(3))) { cx.globalAlpha = 0.85; cx.beginPath(); cx.arc(i, j, 1, 0, 7); cx.fill(); cx.globalAlpha = 0.4; cx.lineWidth = 0.6; cx.beginPath(); cx.arc(i, j, 3.4, 0, 7); cx.stroke(); } }),  // alerts at 10 m: a point and its ring
    draw(cx => { cx.globalAlpha = 0.6; cx.lineWidth = 0.9; for (const [i, j] of pick(seeded(14), 300, hot(1))) { cx.beginPath(); cx.moveTo(i - 3, j + 1.6); cx.lineTo(i + 3, j - 1.6); cx.stroke(); } }),  // logging and fire damage: short strokes
    draw(cx => { const rnd = seeded(15); for (let j = 3; j < h; j += 8) for (let i = 3; i < w; i += 8) { const a = rnd(); if (D.inside[j * w + i]) { cx.globalAlpha = 0.1 + 0.5 * a * a; cx.fillRect(i - 2, j - 2, 4.4, 4.4); } } }),  // embeddings: a number for every tile
    draw(cx => { cx.globalAlpha = 0.75; cx.lineWidth = 0.8; for (const [i, j] of pick(seeded(16), 44, hot(1))) cx.strokeRect(i - 3, j - 3, 6, 6); }),  // permits: parcels
    draw(cx => { cx.globalAlpha = 0.7; cx.lineWidth = 0.9; for (const [i, j] of pick(seeded(17), 130, hot(1))) { cx.beginPath(); cx.moveTo(i - 2.6, j); cx.lineTo(i + 2.6, j); cx.moveTo(i, j - 2.6); cx.lineTo(i, j + 2.6); cx.stroke(); } }),  // fire, fines, embargoes: crosses
    draw(cx => { const img = cx.createImageData(w, h), A = [0, 150, 96, 54, 26], rnd = seeded(18); for (let i = 0; i < w * h; i++) { const k = FIG.tenure ? D.land[i] : 0; if (D.inside[i] && k) { img.data[4 * i] = 16; img.data[4 * i + 1] = 32; img.data[4 * i + 2] = 26; img.data[4 * i + 3] = A[k] ?? 40; } } cx.putImageData(img, 0, 0); if (!FIG.tenure) { cx.globalAlpha = 0.3; for (let j = 0; j < h; j += 14) for (let i = 0; i < w; i += 14) if (D.inside[j * w + i] && rnd() < 0.3) cx.fillRect(i, j, 13, 13); } }),  // who holds the land: protected areas, darker the stricter
  ];
}
function figure() {
  const el = $("model-fig");
  cancelAnimationFrame(FIG.raf);
  if (!el || !ST || !el.clientWidth) return;  // (in the story's benchmark step the figure is off the stage)
  if (!FIG.tenure && !FIG.wants) {  // the tenure layer is small: fetched once, the first time the figure is asked for
    FIG.wants = true;
    fetch("data/tenure.png").then(r => r.blob()).then(b => createImageBitmap(b, { colorSpaceConversion: "none", premultiplyAlpha: "none" })).then(bmp => { const c = new OffscreenCanvas(320, 249), cx = c.getContext("2d", { willReadFrequently: true }); cx.imageSmoothingEnabled = false; cx.drawImage(bmp, 0, 0, 320, 249); const d = cx.getImageData(0, 0, 320, 249).data; FIG.tenure = Uint8Array.from({ length: 320 * 249 }, (_, i) => d[4 * i]); if ($("about").open) figure(); }).catch(() => {});
  }
  const W = el.clientWidth, slim = W < 440, src = ST.model.inputs.map(x => x[lang] || x.en).map(x => { const q = x.match(/^(.*?)\s*[(（]([^)）]*)[)）]$/); return q ? [q[1], q[2]] : [x, ""]; });  // the layer, and who makes it
  const n = src.length, S = slim ? W * 0.47 : Math.min(W * 0.42, Math.max(200, (innerHeight - lengthOf("--top") - 160) / 2.3)), asp = (M.cols * M.cell) / (M.rows * M.cell) * Math.cos(6.4 * Math.PI / 180);  // the grid's shape on the ground
  const E = [0.8 * S, 0.24 * S], So = [-0.5 * S / asp, 0.36 * S / asp], ph = E[1] + So[1], gap = slim ? (storyOn ? Math.max(31, Math.min(52, Math.floor(($("about-body").clientHeight - 24 - 10 - 2 * ph - 76) / (n - 1)))) : 31) : Math.max(36, Math.round(S * 0.157)), x0 = (slim ? 2 : 6) - So[0], y0 = 10;
  const yM = y0 + (n - 1) * gap + ph + (slim ? 34 : 42), yO = yM + (slim ? 30 : 38), H = Math.ceil(yO + ph + 12), mid = [x0 + (E[0] + So[0]) / 2, 0];
  const at = (i, u, v) => [x0 + u * E[0] + v * So[0], (i < n ? y0 + i * gap : yO) + u * E[1] + v * So[1]];  // a point of plane i: u east, v south
  // the outline, on a plane
  const border = rings(R.border).map(p => p[0]), outline = (cx, i) => { cx.beginPath(); for (const ring of border) { ring.forEach(([la, lo], k) => { const p = at(i, (lo - M.west) / (M.cols * M.cell), (M.north - la) / (M.rows * M.cell)); k ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1]); }); cx.closePath(); } };
  const w = 320, h = 249, D = figData(w, h), layers = figLayers(w, h, D), dpr = Math.min(2, devicePixelRatio || 1), INKC = css("--ink"), GR = css("--ground");
  const still = new OffscreenCanvas(Math.round(W * dpr), Math.round(H * dpr)), sx = still.getContext("2d");
  const onPlane = (cx, i, pic) => { cx.save(); outline(cx, i); cx.clip(); const o = at(i, 0, 0); cx.transform(E[0] / w, E[1] / w, So[0] / h, So[1] / h, o[0], o[1]); cx.drawImage(pic, 0, 0); cx.restore(); };
  sx.scale(dpr, dpr);
  // the last plane first, since it lies under everything: the chance, as the map has it
  const out = new OffscreenCanvas(w, h), ox = out.getContext("2d"), img = ox.createImageData(w, h), CLEARED = [226, 222, 200];
  for (let i = 0; i < w * h; i++) if (D.inside[i]) { const f = D.forest[i], c = D.cls[i] ? PRGB[D.cls[i] - 1] : FOREST.map((x, k) => x * f + CLEARED[k] * (1 - f)); img.data.set([c[0], c[1], c[2], 255], 4 * i); }
  ox.putImageData(img, 0, 0);
  onPlane(sx, n, out);
  outline(sx, n); sx.strokeStyle = INKC; sx.lineWidth = 1.1; sx.stroke();
  // then the sources, from the lowest up: each a sheet of the page's colour, its marks, its outline
  for (let i = n - 1; i >= 0; i--) {
    outline(sx, i); sx.fillStyle = GR; sx.globalAlpha = 0.9; sx.fill(); sx.globalAlpha = 1;
    onPlane(sx, i, layers[i]);
    outline(sx, i); sx.strokeStyle = INKC; sx.lineWidth = 0.9; sx.globalAlpha = 0.85; sx.stroke(); sx.globalAlpha = 1;
  }
  // the traces: from three places of every source straight down, gathered into the model, and out to the places where the chance is highest
  const rnd = seeded(7), spot = (i, min) => { for (let k = 0; k < 400; k++) { const a = Math.floor(rnd() * w), b = Math.floor(rnd() * h), q = b * w + a; if (D.inside[q] && (!D.chance || D.cls[q] >= min || k > 300)) return at(i, a / w, b / h); } return at(i, 0.5, 0.5); };
  const path = pts => { const out_ = []; let len = 0; pts.forEach((p, k) => { if (k) len += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]); out_.push([p[0], p[1], len]); }); return { pts: out_, len }; };
  const bend = (a, b, c, steps = 14) => Array.from({ length: steps + 1 }, (_, k) => { const t_ = k / steps, u = 1 - t_; return [u * u * a[0] + 2 * u * t_ * b[0] + t_ * t_ * c[0], u * u * a[1] + 2 * u * t_ * b[1] + t_ * t_ * c[1]]; });
  const core = [mid[0], yM], traces = [];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const p = spot(i, 1), join = [p[0], yM - (slim ? 22 : 28)]; traces.push({ ...path([p, join, ...bend(join, [p[0], yM], core).slice(1)]), red: false }); }
  for (let k = 0; k < 9; k++) { const q = spot(n, 3), turn = [q[0], yM + 10]; traces.push({ ...path([...bend(core, turn, [q[0], Math.min(q[1], yM + 26)]), q]), red: true }); }
  sx.lineWidth = 0.7;
  for (const tr of traces) { sx.strokeStyle = tr.red ? css("--red") : INKC; sx.globalAlpha = tr.red ? 0.55 : 0.3; sx.beginPath(); tr.pts.forEach((p, k) => (k ? sx.lineTo(p[0], p[1]) : sx.moveTo(p[0], p[1]))); sx.stroke(); }
  sx.globalAlpha = 1;
  // the model: one small plate where the traces meet
  const m = slim ? 17 : 21; sx.fillStyle = INKC; sx.beginPath(); sx.moveTo(core[0] - m, core[1]); sx.lineTo(core[0], core[1] - m * 0.46); sx.lineTo(core[0] + m, core[1]); sx.lineTo(core[0], core[1] + m * 0.46); sx.closePath(); sx.fill();
  // the names, as text on the page beside each plane
  // each beside the easternmost point of its plane, so there is no doubt which plane it names
  let tip = [0, 0]; for (const ring of border) for (const [la, lo] of ring) { const p = at(0, (lo - M.west) / (M.cols * M.cell), (M.north - la) / (M.rows * M.cell)); if (p[0] > tip[0]) tip = p; }
  const lx = tip[0] + (slim ? 8 : 14), name = (i, cls, text_) => `<li class="${cls}" style="left:${(i === "m" ? core[0] + m + 10 : lx).toFixed(1)}px;top:${(i === "m" ? core[1] : tip[1] - y0 + (i < n ? y0 + i * gap : yO)).toFixed(1)}px;max-width:${Math.floor(i === "m" ? W : W - lx)}px">${text_}</li>`;
  el.innerHTML = `<canvas width="${still.width}" height="${still.height}" style="width:${W}px;height:${H}px" role="img" aria-label="${esc(storyWords("sources"))}"></canvas><ol>${src.map(([x, by], i) => name(i, "", `<span>${esc(x)}</span>${by && !slim ? `<small>${esc(by)}</small>` : ""}`)).join("")}${name("m", "m", esc(MODEL))}${name(n, "o", t().chanceOut)}</ol>`;
  const cv = el.firstChild, cx = cv.getContext("2d"), RED = css("--red");
  const frame = now => {
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(still, 0, 0);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    traces.forEach((tr, k) => {  // a particle a trace, each with its own start; three faint ones behind it
      for (let g = 0; g < 4; g++) {
        const s = (((now / 1000) * 26 + k * 37.7 - g * 5) % (tr.len + 60) + tr.len + 60) % (tr.len + 60);
        if (s > tr.len) continue;
        let a = 1; while (a < tr.pts.length - 1 && tr.pts[a][2] < s) a++;
        const p = tr.pts[a - 1], q = tr.pts[a], f = (s - p[2]) / Math.max(1e-6, q[2] - p[2]);
        cx.globalAlpha = (tr.red ? 1 : 0.9) * (1 - g * 0.27); cx.fillStyle = tr.red ? RED : INKC;
        cx.beginPath(); cx.arc(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, g ? 1 : 1.7, 0, 7); cx.fill();
      }
    });
    cx.globalAlpha = 1;
  };
  frame(8000);  // one still picture, particles where they would be: all there is when less motion is asked for
  if (calm()) return;
  let last = 0;
  const tick = now => { FIG.raf = requestAnimationFrame(tick); if (!$("about").open || !FIG.on || document.hidden || now - last < 33) return; last = now; frame(now); };
  FIG.io ||= new IntersectionObserver(es => (FIG.on = es.at(-1).isIntersecting));
  FIG.io.disconnect(); FIG.io.observe(cv);
  FIG.raf = requestAnimationFrame(tick);
}
addEventListener("resize", () => { if ($("about").open) { clearTimeout(FIG.t); FIG.t = setTimeout(figure, 150); } });
$("about").addEventListener("close", () => cancelAnimationFrame(FIG.raf));
// the line, and under it, while the years run, their small bars. The way on and the way back are arrows.
function storyText() {
  const sc = SCENES[sAt], L_ = t().st, last = sAt === SCENES.length - 1;
  $("story-line").textContent = storyWords(sc.id).replaceAll(" km²", "\u00a0km²");
  $("story-extra").innerHTML = sc.extra === "years" ? yearBars(ST.history.years.at(-1), sc.id === "lossB") : "";
  $("story-line").classList.remove("in"); void $("story-line").offsetWidth; $("story-line").classList.add("in");  // the line arrives again
  for (const [id, label] of [["story-next", last ? L_.done : L_.next], ["story-back", L_.back]]) { $(id).setAttribute("aria-label", label); $(id).title = label; }
  $("story-back").disabled = sAt === 0;
  $("story-marks").innerHTML = SCENES.map((_, i) => `<li class="${i < sAt ? "done" : i === sAt ? "now" : ""}"></li>`).join("");
  root.dataset.step = sc.id;
  capAt();
}
// on a phone the caption is as tall as its words need, and the sheets stand on it: they are told its height
const capAt = () => { if (storyOn && narrow()) root.style.setProperty("--cap", (touring() ? $("story").offsetHeight : 0) + "px"); else root.style.removeProperty("--cap"); };  // (at the last step the sheet rests where the tool has it, and the caption lies over it)
new ResizeObserver(() => capAt()).observe($("story"));  // (the caption may wrap again when its type arrives)
addEventListener("resize", capAt);
// the clearing mapped year by year (the f<year>.png masks), counted per block of 2 km in a worker and drawn dark
// on the forest: the first n years of them
const LOSS = { f: 4, busy: null, years: R.hyears.filter(y => M.years[y]?.flags500), got: {}, shown: -1 };
async function decodeLoss(url, cols, rows, f) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const T = 1024, cx = new OffscreenCanvas(T, T).getContext("2d", { willReadFrequently: true }), c2 = Math.ceil(cols / f), out = new Uint8Array(c2 * Math.ceil(rows / f));
  for (let y = 0; y < rows; y += T) for (let x = 0; x < cols; x += T) {
    const w = Math.min(T, cols - x), h = Math.min(T, rows - y);
    cx.clearRect(0, 0, T, T);
    cx.drawImage(bmp, x, y, w, h, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    for (let r = 0; r < h; r++) for (let c = 0, i = 4 * r * w, o = (((y + r) / f) | 0) * c2; c < w; c++, i += 4) if (d[i] >= 128) out[o + (((x + c) / f) | 0)]++;  // 170 and 255: clearing mapped in the cell
  }
  if (bmp.close) bmp.close();
  return out;
}
function lossLoad() {
  const F = M.years[FY]?.flags500 && ras(M.years[FY].flags500);
  if (LOSS.worker || !F || !LOSS.years.length) return;
  MEM.decode = Math.max(MEM.decode, F.cols * F.rows);
  let free;
  LOSS.busy = new Promise(r => (free = r));
  setTimeout(free, 20000);
  try {
    LOSS.worker = new Worker(URL.createObjectURL(new Blob([`onmessage = async e => { for (const [y, url] of e.data.urls) { let a = null; try { a = await (${decodeLoss})(url, ...e.data.dim); } catch (err) {} postMessage({ y, a }, a ? [a.buffer] : []); } };`], { type: "text/javascript" })));
    LOSS.worker.onmessage = e => { if (e.data.a) { LOSS.got[e.data.y] = e.data.a; if (storyOn && SCENES[sAt].loss && LOSS.shown >= LOSS.years.indexOf(e.data.y) + 1) lossShow(LOSS.shown, true); } if (LOSS.years.every(y => y in LOSS.got || e.data.y === y) && e.data.y === LOSS.years.at(-1)) { LOSS.worker.terminate(); free(); } };
    LOSS.worker.onerror = free;
    const w = LOSS.worker;
    baseReady.then(() => { if (LOSS.worker === w) w.postMessage({ urls: LOSS.years.map(y => [y, new URL(`data/f${y}${F.suf}.png`, location.href).href]), dim: [F.cols, F.rows, LOSS.f] }); });  // (after the base map, which the first lines need)
  } catch (err) { free(); /* no worker: the bars run without the map */ }
}
function lossShow(n, again) {
  const F = M.years[FY]?.flags500 && ras(M.years[FY].flags500);
  if (!F || (n === LOSS.shown && !again)) return;
  LOSS.shown = n;
  const f = LOSS.f, c = Math.ceil(F.cols / f), r = Math.ceil(F.rows / f);
  if (!LOSS.sheet) { if (!n) return; LOSS.sheet = sheet(c, r, BOUNDS, "paint"); LOSS.sheet.layer.getElement().classList.add("loss"); }
  if (n) {
    const sum = new Uint16Array(c * r), px = new Uint32Array(c * r), lut = Uint32Array.from({ length: 8 * f * f + 1 }, (_, k) => (k ? rgba(228, 0, 43, Math.min(1, 0.35 + 0.9 * Math.sqrt(k / (f * f)))) : 0));  // what fell is red: the story has no chances on the map yet
    for (const y of LOSS.years.slice(0, n)) { const a = LOSS.got[y]; if (a) for (let i = 0; i < a.length; i++) sum[i] += a[i]; }
    for (let i = 0; i < px.length; i++) px[i] = lut[sum[i]];
    LOSS.sheet.cx.putImageData(toMercatorRows(px, c, r, F.cell * f), 0, 0);
  }
  LOSS.sheet.layer.setOpacity(n ? 1 : 0);
}
// the year the story replays, kept light: only the far views of it, which is all a whole Amazon needs
let lite = null, keep = null;
const liteYear = () => (lite ||= loadProb(CY, ras(M.years[CY].flags500), true).then(g => ({ key: CY, prob: true, cell: ras(M.years[CY].flags500).cell, levels: g.levels.filter(l => l.f * ras(M.years[CY].flags500).cell > 0.02), stats: g.stats })));
const gridOf = y => new Promise(done => { const look = () => (grid?.key === y && grid.prob ? done() : !storyOn ? 0 : setTimeout(look, 120)); look(); });
// effects, each run once on the way forward and overtaken by the next step
async function mosaic(my) {  // the forest as coarse squares that get finer: it is made of them
  if (!baseCv) return;
  const w = Math.round(M.cols / 8), h = Math.round(M.rows / 8), small = new OffscreenCanvas(w, h), tiny = new OffscreenCanvas(w, h), sh = sheet(w, h, BOUNDS, "paint");
  small.getContext("2d").drawImage(baseCv, 0, 0, w, h);
  sh.layer.getElement().classList.add("crisp", "base");
  sh.cx.imageSmoothingEnabled = false;
  for (const k of [30, 30, 21, 15, 10, 7, 5, 3, 2]) {
    const tw = Math.ceil(w / k), th = Math.ceil(h / k), tx = tiny.getContext("2d");
    tx.clearRect(0, 0, w, h); tx.drawImage(small, 0, 0, w, h, 0, 0, tw, th);
    sh.cx.clearRect(0, 0, w, h); sh.cx.drawImage(tiny, 0, 0, tw, th, 0, 0, tw * k, th * k);
    await wait(k > 20 ? 260 : 130);
    if (my !== sRun) break;
  }
  sh.layer.remove();
}
async function lossRun(my) {  // the years run: the small bars count them, and from the first mapped year the map darkens
  const h = ST.history, first = LOSS.years[0];
  for (const y of h.years) {
    if (my !== sRun) return;
    $("story-extra").innerHTML = yearBars(y);
    lossShow(LOSS.years.indexOf(y) + 1 || 0);
    await wait(y < first ? 90 : 430);
  }
}
async function sweep(my) {  // the chances arrive: from where they are highest, outward
  veil.th = 255;
  gridLayer._update();
  await gridOf(FY);
  if (my !== sRun) return;
  const t0 = performance.now(), ms = 3600, lo = Math.floor(255 * Math.sqrt(PCUT[0]));
  const tick = now => {
    if (my !== sRun) return;
    const x = Math.min(1, (now - t0) / ms);
    veil.th = x >= 1 ? 0 : Math.round(lo + (215 - lo) * (1 - x) ** 2.2);
    gridLayer._update();
    if (x < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
async function proof(my) {  // the year that is replayed: first the chances as they were given, then what was cleared, in yellow, coming in on top
  veil.mapped = false;
  await gridOf(CY);
  if (my !== sRun) return;
  gridLayer._update();
  await wait(1300);
  if (my !== sRun) return;
  veil.mapped = true; veil.amt = 0;
  $("legend").dataset.mapped = "in";  // its swatch comes in with it
  const t0 = performance.now(), ms = 1000;
  const tick = now => {
    if (my !== sRun) return;
    veil.amt = Math.min(1, (now - t0) / ms);
    gridLayer._update();
    if (veil.amt < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
async function scene(i, dir = 0) {
  const sc = SCENES[sAt = Math.max(0, Math.min(SCENES.length - 1, i))], my = ++sRun, fwd = dir > 0 && !calm(), has = sc.has || "", listed = !storyShut && sc.mode === "prio" && !(narrow() && /chart/.test(has));  // (a phone shows one sheet at a time: there the timeline takes the list's place)
  const had = (root.dataset.has || "").split(" ");
  root.dataset.has = has;  // the pieces of the tool that are on the page by now
  root.dataset.new = dir > 0 ? has.split(" ").filter(k => k && !had.includes(k)).join(" ") : "";  // what this step brings: it comes in with the stage's motion
  for (const el of INERT()) el.inert = true;  // what is on the page is not for the hand until the story is over
  storyText();
  // what the map and the timeline are set to
  S.hazard = "clear"; S.sel = null; S.min = 0; S.h = 0; S.rank = false; S.line = false;
  S.mode = listed ? "prio" : sc.mode === "sectors" ? "sectors" : "cells"; S.block = listed ? 1 : null;
  KIND0 ??= S.kind; S.kind = sc.mode === "sectors" ? "uf" : KIND0;  // (the story shows the states; the tool keeps the kind it had)
  if (sc.id === "use") pristine = true;  // the last step is the tool as it opens: the cells, the whole Amazon
  S.scale = sc.cells && sc.cells !== FY ? "years" : "months";
  S.year = sc.cells || FY;
  veil.off = !sc.cells; veil.mapped = !(fwd && sc.fx === "proof"); veil.th = 0; veil.amt = 1;
  if (veil.mapped) delete $("legend").dataset.mapped; else $("legend").dataset.mapped = "wait";
  if (outline) { outline.remove(); outline = null; }
  // the replayed year is the story's own light copy; the forecast year is the tool's, kept aside meanwhile
  if (sc.cells === CY) {
    if (grid?.key === FY) keep = grid;
    if (grid?.key !== CY) { veil.off = true; liteYear().then(g => { if (my === sRun) { grid = g; veil.off = false; zoomed(); legend(); } }); }
  } else if (grid?.key !== FY && keep) grid = keep;
  front = "map"; place();
  lossShow(sc.loss && !(fwd && sc.fx === "loss") ? LOSS.years.length : 0);
  sheetAt("half");
  refresh();
  if (sc.about) about(sc.about); else if ($("about").open) $("about").close();
  if (fwd && sc.fx === "mosaic") mosaic(my);
  if (fwd && sc.fx === "loss") lossRun(my);
  if (fwd && sc.fx === "sweep") sweep(my);
  if (fwd && sc.fx === "proof") proof(my);
}
function storyBegin() {
  root.dataset.story = "";
  $("story").hidden = false;
  pristine = true;
  scene(0);
  map.invalidateSize({ pan: false });
  whole();
  // while the first lines are read: the base map, the masks of the loss, the chances of the forecast year (the
  // ordinary way, since the map is in cells), and after them the year that is replayed
  lossLoad();
  if (SCENES.some(s => s.cells === CY)) gridOf(FY).then(() => liteYear()).catch(() => {});
}
// Finished or skipped, the story is remembered (with its version) and does not play by itself again. Either way
// the page is left as the last step has it: the key, the priority list with its first place open (unless the
// reader closed it), the timeline in its dock. Nothing else changes.
function storyEnd() {
  storyOn = false;
  sRun++;
  try { localStorage.setItem("story", root.dataset.storyVersion); } catch (err) { /* private mode: it plays again next time */ }
  for (const k of ["story", "has", "step", "new"]) delete root.dataset[k];
  for (const el of INERT()) el.inert = false;
  $("story").hidden = true;
  veil.off = false; veil.th = 0; veil.mapped = true; veil.amt = 1; delete $("legend").dataset.mapped;
  lossShow(0);
  if (LOSS.worker) LOSS.worker.terminate();
  if (LOSS.sheet) { LOSS.sheet.layer.remove(); LOSS.sheet.cx.canvas.width = 0; LOSS.sheet = null; LOSS.shown = -1; }  // the picture of the loss belongs to the story: let go with it
  LOSS.got = {};
  if (grid?.key !== FY && keep) grid = keep;
  keep = lite = null;
  if ($("about").open) $("about").close();
  unselect();
  S.hazard = "clear"; S.min = 0; S.h = 0; S.rank = false; S.scale = "months"; S.year = FY;
  S.mode = "cells"; S.block = null; pristine = true;  // as the last step leaves it: the cells, the whole Amazon
  if (KIND0) S.kind = KIND0;
  front = "map"; place();
  if (new URLSearchParams(location.search).has("story")) history.replaceState(null, "", location.pathname + location.hash);
  root.style.removeProperty("--cap");
  refresh();
  // skipped from an earlier step, the Amazon goes to where the tool has it (from the last step it is there already)
  requestAnimationFrame(() => { const v = fitNow(); if (pristine && (map.latLngToContainerPoint(v.c).distanceTo(map.latLngToContainerPoint(map.getCenter())) > 2 || Math.abs(v.z - map.getZoom()) > 0.01)) view(v, !calm()); });
}
const storyStep = d => { if (!storyOn) return; if (d > 0 && sAt === SCENES.length - 1) storyEnd(); else if (sAt + d >= 0) scene(sAt + d, d); };
$("story-next").onclick = () => storyStep(1);
$("story-back").onclick = () => storyStep(-1);
$("skip-btn").onclick = () => storyEnd();
$("story-btn").onclick = () => { leaving = true; location.href = location.pathname + "?story=1"; };  // played again from a clean page; what it loads is already cached
// on a touch screen a sideways swipe anywhere goes on (to the left) or back (to the right; the other way round in a
// right-to-left language): 40 px or more, more across than down, within 0.6 s. Up and down does nothing.
let swipe = null;
document.addEventListener("touchstart", e => { const t = e.touches[0]; swipe = storyOn && e.touches.length === 1 ? [t.clientX, t.clientY, performance.now()] : null; }, { passive: true });
document.addEventListener("touchend", e => {
  if (!swipe || !storyOn) return;
  const t = e.changedTouches[0], dx = t.clientX - swipe[0], dy = t.clientY - swipe[1], quick = performance.now() - swipe[2] < 600;
  swipe = null;
  if (quick && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) storyStep((dx < 0) !== RTL.has(lang) ? 1 : -1);
}, { passive: true });
// until the story is over, a click or a tap anywhere that is not a control goes on
document.addEventListener("click", e => { if (storyOn && !e.target.closest("button, a, dialog, #list")) storyStep(1); });
document.addEventListener("keydown", e => {
  if (!storyOn || $("api").open || e.metaKey || e.ctrlKey || e.altKey) return;
  const onControl = e.target.closest?.("button, a, input, select, textarea");
  if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key) || ([" ", "Enter"].includes(e.key) && !onControl)) { e.preventDefault(); storyStep(1); }
  else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); storyStep(-1); }
  else if (e.key === "Escape") storyEnd();
}, true);

document.fonts?.ready.then(fitRows);
document.fonts?.ready.then(() => requestAnimationFrame(sheetFloor));  // (the sheet's floor, measured once it is laid out in its own type)  // (the rows were fitted in the fallback face if the page was quicker than its type)
if (storyOn) storyBegin();
else if (S.sel != null) select(S.sel); else refresh();
if (H.has("about")) about();
if (H.has("api")) $("api-btn").click();
