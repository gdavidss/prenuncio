// Prenúncio. An alert level, a headline, a timeline and a few signals, beside a drawn map of the Legal Amazon.
// It follows docs/BRAND.md. No build step, no keys.
// Data formats: pipeline/export.py (cells) and pipeline/regions.py (sectors, months).
const $ = id => document.getElementById(id);

const T = {
  en: {
    hazard: { clear: "Clearing", fire: "Fire", degr: "Degradation", mine: "Mining" }, scale: { years: "Years", months: "Months" },
    amazon: "Amazon", about: "About", close: "Close", views: { chart: "Timeline", map: "Map" },
    axisY: "km² cleared per year, August to July",
    shareOf: v => `<b>${v.pct}%</b> of forest cells flagged, ${v.km} km²`, prevYear: "Previous year", nextYear: "Next year",
    modes: { sectors: "Sectors", cells: "Cells" },
    kinds: { uf: "States", mun: "Municipalities", ti: "Indigenous lands", uc: "Conservation units" },
    many: { uf: "states", mun: "municipalities", ti: "Indigenous lands", uc: "conservation units" },
    rank: n => n + (n % 100 > 10 && n % 100 < 14 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"),
    tiny: "under 0.1",
    // the level, and the two facts it was counted from
    level: ["Quiet", "Watch", "Warning", "Alarm"], replay: "Past forecast", made: y => `made on 31 July ${y - 1}`,
    none: s => `no ${s}`, rankWhy: (r, n) => `rank ${r} of ${n}`,
    // headlines: one short sentence each
    fc: v => `About ${v.km} km² of clearing expected${v.here} by July ${v.y}`,
    fcNone: v => `Almost no clearing expected here by July ${v.y}`,
    fcSub: v => `Likely between ${v.lo} and ${v.hi}.`,
    rankSub: v => `${v.rank} of ${v.n} ${v.many}. ${v.share}% of the Amazon total.`,
    past: v => `In ${v.y}, ${v.cap}% of clearing fell inside the flagged 5% of forest`,
    pastSub: v => `Repeating the year before would have caught ${v.naive}%.`,
    partial: " Priority scenes only, so far.",
    pastHere: v => `In ${v.y}, ${v.act} km² were cleared here, ${v.inside}% inside flagged cells`,
    pastHereNone: v => `In ${v.y} no clearing was mapped here`,
    pastHereSub: v => `Forecast share ${v.ps}%, actual share ${v.as}%.`,
    mfc: {
      clear: v => `About ${v.km} km² expected to be cleared${v.here} in the next ${v.h} months`,
      fire: v => `About ${v.km} km² expected to burn${v.here} in the next ${v.h} months`,
      degr: v => `About ${v.km} km² expected to be degraded${v.here} in the next ${v.h} months`,
      mine: v => `About ${v.km} km² of mining expected${v.here} in the next ${v.h} months`,
    },
    mobs: {
      clear: v => `${v.km} km² cleared${v.here} in the last three months`,
      fire: v => `${v.km} km² burned${v.here} in the last three months`,
      degr: v => `${v.km} km² degraded${v.here} in the last three months`,
      mine: v => `${v.km} km² mined${v.here} in the last three months`,
    },
    scaledSub: v => `Its share of the Amazon forecast, with no range of its own. ${v.rank} of ${v.n} ${v.many}.`,
    unsure: v => `Very uncertain, anywhere from ${v.lo} to ${v.hi}. In backtests this total missed by ${v.miss}% on average.`, veryUnsure: "very uncertain",
    rankOnly: v => `${v.rank} of ${v.n} ${v.many} on the risk map.`,
    deter: "Monthly figures are what INPE's DETER detects. The yearly PRODES count is larger.",
    axisM: { clear: "km² cleared per month", fire: "km² burned per month", degr: "km² degraded per month", mine: "km² mined per month" },
    axisW: { fire: "km² burned per 12 months", degr: "km² degraded per 12 months", mine: "km² mined per 12 months" },
    whole: "Whole Amazon", to: (a, b) => `${a} to ${b}`,
    where: {
      fire: v => `Where forest is most likely to burn by ${v.end}`,
      degr: v => `Where forest is most likely to be degraded or logged by ${v.end}`,
      mine: v => `Where mining is most likely to spread by ${v.end}`,
    },
    whereHere: v => `Ranks ${v.rank} of ${v.n} ${v.many} for ${v.risk} by ${v.end}`,
    risk: { fire: "fire risk", degr: "degradation risk", mine: "mining risk" },
    lastSub: {
      fire: v => `${v.km} km² burned${v.here} in the last twelve months.`,
      degr: v => `${v.km} km² degraded or logged${v.here} in the last twelve months.`,
      mine: v => `${v.km} km² mined${v.here} in the last twelve months.`,
    },
    here: " here",
    short: { clear: "clearing", scar: "burning", degr: "degradation", mine: "mining" },
    sign: { clear: "Clearing", scar: "Burning", degr: "Degradation", mine: "Mining", autos: "IBAMA fines" },
    hintY: v => `Pick a year from ${v.first} on to replay it.`,
    now: "now", ahead: n => `${n} months`, window: "forecast",
    signs: "Signals, three months against last year",
    enso: ["El Niño", "La Niña", "Pacific"], ensoLevel: [["very strong", "strong", "moderate", "weak"], ["very strong", "strong", "moderate", "weak"], "neutral"],
    signTitle: v => `${v.now} in the last three months, ${v.prev} a year before`,
    legend: { clear: "Clearing risk", fire: "Fire risk", degr: "Degradation risk", mine: "Mining risk" }, lower: "lower", higher: "higher", next: n => `next ${n} months`,
    flagged: "flagged", hit: "flagged and cleared", miss: "cleared, missed",
    about_: x => `about ${x} km²`, range: (lo, hi) => `likely ${lo} to ${hi}`, inside: p => `${p}% inside flagged cells`,
    tipFc: v => `about ${v.exp} km² expected`, tipPast: v => `${v.exp} km² expected, ${v.act} cleared`, tipRank: v => `${v.rank} of ${v.n}`,
    credit: "Imagery: Esri, Maxar, Earthstar Geographics",
    aboutHtml: v => `
      <h2>The sign before the event</h2>
      <p>Prenúncio is an early warning for Brazil's Legal Amazon. It forecasts where forest will be cleared, burned, degraded or mined next, and shows how hard the pressure is now.</p>
      <h3>What it shows</h3>
      <ul>
        <li><b>The level.</b> Quiet, Watch, Warning or Alarm. It is counted from the hazard's last three months against a year before, a strong El Niño for the whole Amazon, and a sector's rank in the forecast. Red follows the level and nothing else.</li>
        <li><b>The timeline.</b> By year, clearing with the forecast at the end, and any year since ${v.first} can be replayed. By month, what was cleared and what the model expects for each month ahead, with its range.</li>
        <li><b>The map.</b> By sector or by cell. Flagged cells are the 5% of standing forest where the model expects the most. The yearly clearing forecast is painted at 500 metres, the rest at one kilometre.</li>
      </ul>
      <h3>How sure</h3>
      <ul>
        <li><b>Where is the strong part.</b> Forecasting each year from ${v.first} to ${v.last} blind, the flagged 5% of forest held ${v.cap}% of the clearing that followed. Repeating the year before held ${v.naive}%.</li>
        <li><b>How much is the weak part.</b> The yearly total missed by ${v.mape}% on average, against ${v.previsia}% for Imazon's PrevisIA as published.</li>
        <li><b>Shorter windows and other hazards.</b> Their maps were tested for place, on ${v.tmin} to ${v.tmax} past dates.</li>${v.mo ? `
        <li><b>Month by month.</b> On ${v.mo.origins} past forecast dates the total cleared over three months missed by ${v.mo.h3}% on average, against ${v.mo.n3}% for repeating the same months of the year before. Monthly figures are what INPE's DETER detects, and the yearly PRODES count is larger.</li>` : ""}
      </ul>
      <h3>What it cannot do</h3>
      <ul>
        <li>Say why a place is flagged. The signals are things the model reads, not causes.</li>
        <li>Give a range for a single sector, or see a change of policy coming.</li>
        <li>Forecast one municipality, Indigenous land or conservation unit month by month. Theirs is their share of the Amazon forecast.</li>${v.fire ? `
        <li>Say how much will burn. In backtests the fire total over three months missed by ${v.fire}% on average.</li>` : ""}
        <li>Replace INPE's official figures. The ${v.partial} outcome covers priority scenes only so far.</li>
      </ul>
      <h3>Open and democratic</h3>
      <ul>
        <li>The code, the data pipeline and a public benchmark are on GitHub.</li>
        <li>Anyone can submit a model by pull request, with its scores, its code and a written report of how it was made. Building with AI agents is welcome, as long as the report says which agent was used and how.</li>
        <li>Forecasts for 2027 can be registered until 31 December 2026 and are scored when INPE publishes the map, so nobody, including us, can adjust one after seeing the outcome.</li>
        <li>Researchers are invited to put their models on the leaderboard next to ours. A model that beats the published one, and that someone else reproduces, can take its place on this site.</li>
      </ul>
      <p>Start with the <a href="${v.repo}">code</a>, the <a href="${v.repo}/tree/HEAD/benchmark">benchmark</a> and <a href="${v.repo}/blob/HEAD/CONTRIBUTING.md">how to contribute</a>.</p>
      <h3>Data</h3>
      <p>INPE PRODES and DETER, through TerraBrasilis, and INPE Queimadas fire detections. Global Forest Change by Hansen, UMD, Google, USGS and NASA. GLAD Sentinel-2 alerts, University of Maryland. IBAMA open enforcement records. NOAA's Oceanic Niño Index. Boundaries of states, municipalities, Indigenous lands and conservation units as INPE distributes them. Close-up imagery by Esri, Maxar and Earthstar Geographics. Map drawn with Leaflet.</p>`,
  },
  pt: {
    hazard: { clear: "Desmatamento", fire: "Fogo", degr: "Degradação", mine: "Garimpo" }, scale: { years: "Anos", months: "Meses" },
    amazon: "Amazônia", about: "Sobre", close: "Fechar", views: { chart: "Linha do tempo", map: "Mapa" },
    axisY: "km² desmatados por ano, de agosto a julho",
    shareOf: v => `<b>${v.pct}%</b> das células de floresta marcadas, ${v.km} km²`, prevYear: "Ano anterior", nextYear: "Ano seguinte",
    modes: { sectors: "Setores", cells: "Células" },
    kinds: { uf: "Estados", mun: "Municípios", ti: "Terras indígenas", uc: "Unidades de conservação" },
    many: { uf: "estados", mun: "municípios", ti: "terras indígenas", uc: "unidades de conservação" },
    rank: n => n + "º",
    tiny: "menos de 0,1",
    level: ["Calmo", "Atenção", "Alerta", "Alarme"], replay: "Previsão passada", made: y => `feita em 31 de julho de ${y - 1}`,
    none: s => `sem ${s}`, rankWhy: (r, n) => `${r}º de ${n}`,
    fc: v => `Cerca de ${v.km} km² de desmatamento esperados${v.here} até julho de ${v.y}`,
    fcNone: v => `Quase nenhum desmatamento esperado aqui até julho de ${v.y}`,
    fcSub: v => `Provavelmente entre ${v.lo} e ${v.hi}.`,
    rankSub: v => `${v.rank} entre ${v.n} ${v.many}. ${v.share}% do total da Amazônia.`,
    past: v => `Em ${v.y}, ${v.cap}% do desmatamento caiu nos 5% de floresta marcados`,
    pastSub: v => `Repetir o ano anterior teria pegado ${v.naive}%.`,
    partial: " Só cenas prioritárias, por enquanto.",
    pastHere: v => `Em ${v.y}, ${v.act} km² desmatados aqui, ${v.inside}% em células marcadas`,
    pastHereNone: v => `Em ${v.y}, nenhum desmatamento mapeado aqui`,
    pastHereSub: v => `Fatia prevista de ${v.ps}%, fatia real de ${v.as}%.`,
    mfc: {
      clear: v => `Cerca de ${v.km} km² devem ser desmatados${v.here} nos próximos ${v.h} meses`,
      fire: v => `Cerca de ${v.km} km² devem queimar${v.here} nos próximos ${v.h} meses`,
      degr: v => `Cerca de ${v.km} km² devem ser degradados${v.here} nos próximos ${v.h} meses`,
      mine: v => `Cerca de ${v.km} km² de garimpo devem surgir${v.here} nos próximos ${v.h} meses`,
    },
    mobs: {
      clear: v => `${v.km} km² desmatados${v.here} nos últimos três meses`,
      fire: v => `${v.km} km² queimados${v.here} nos últimos três meses`,
      degr: v => `${v.km} km² degradados${v.here} nos últimos três meses`,
      mine: v => `${v.km} km² de garimpo${v.here} nos últimos três meses`,
    },
    scaledSub: v => `É a fatia deste setor na previsão da Amazônia, sem faixa própria. ${v.rank} entre ${v.n} ${v.many}.`,
    unsure: v => `Muito incerto, de ${v.lo} a ${v.hi}. Nos testes, esse total errou ${v.miss}% em média.`, veryUnsure: "muito incerto",
    rankOnly: v => `${v.rank} entre ${v.n} ${v.many} no mapa de risco.`,
    deter: "Os valores mensais são o que o DETER, do INPE, detecta. A contagem anual do PRODES é maior.",
    axisM: { clear: "km² desmatados por mês", fire: "km² queimados por mês", degr: "km² degradados por mês", mine: "km² de garimpo por mês" },
    axisW: { fire: "km² queimados em 12 meses", degr: "km² degradados em 12 meses", mine: "km² de garimpo em 12 meses" },
    whole: "Amazônia inteira", to: (a, b) => `${a} a ${b}`,
    where: {
      fire: v => `Onde a floresta tem mais chance de queimar até ${v.end}`,
      degr: v => `Onde a floresta tem mais chance de ser degradada até ${v.end}`,
      mine: v => `Onde o garimpo tem mais chance de avançar até ${v.end}`,
    },
    whereHere: v => `${v.rank} entre ${v.n} ${v.many} em risco de ${v.risk} até ${v.end}`,
    risk: { fire: "fogo", degr: "degradação", mine: "garimpo" },
    lastSub: {
      fire: v => `${v.km} km² queimados${v.here} nos últimos doze meses.`,
      degr: v => `${v.km} km² degradados${v.here} nos últimos doze meses.`,
      mine: v => `${v.km} km² de garimpo${v.here} nos últimos doze meses.`,
    },
    here: " aqui",
    short: { clear: "desmatamento", scar: "queimadas", degr: "degradação", mine: "garimpo" },
    sign: { clear: "Desmate", scar: "Queimadas", degr: "Degradação", mine: "Garimpo", autos: "Autos IBAMA" },
    hintY: v => `Escolha um ano a partir de ${v.first} para revê-lo.`,
    now: "agora", ahead: n => `${n} meses`, window: "previsão",
    signs: "Sinais, três meses contra o ano passado",
    enso: ["El Niño", "La Niña", "Pacífico"], ensoLevel: [["muito forte", "forte", "moderado", "fraco"], ["muito forte", "forte", "moderada", "fraca"], "neutro"],
    signTitle: v => `${v.now} nos últimos três meses, ${v.prev} um ano antes`,
    legend: { clear: "Risco de desmatamento", fire: "Risco de fogo", degr: "Risco de degradação", mine: "Risco de garimpo" }, lower: "menor", higher: "maior", next: n => `próximos ${n} meses`,
    flagged: "marcado", hit: "marcado e desmatado", miss: "desmatado, não marcado",
    about_: x => `cerca de ${x} km²`, range: (lo, hi) => `provável de ${lo} a ${hi}`, inside: p => `${p}% em células marcadas`,
    tipFc: v => `cerca de ${v.exp} km² esperados`, tipPast: v => `${v.exp} km² esperados, ${v.act} desmatados`, tipRank: v => `${v.rank} entre ${v.n}`,
    credit: "Imagens: Esri, Maxar, Earthstar Geographics",
    aboutHtml: v => `
      <h2>O sinal antes do acontecimento</h2>
      <p>O Prenúncio é um alerta antecipado para a Amazônia Legal. Ele prevê onde a floresta vai ser desmatada, queimada, degradada ou minerada a seguir e mostra quanta pressão existe agora.</p>
      <h3>O que ele mostra</h3>
      <ul>
        <li><b>O nível.</b> Calmo, Atenção, Alerta ou Alarme. Ele é contado a partir dos últimos três meses daquele risco contra um ano antes, de um El Niño forte para a Amazônia inteira e da posição do setor na previsão. O vermelho segue o nível e nada mais.</li>
        <li><b>A linha do tempo.</b> Por ano, o desmatamento com a previsão no fim, e qualquer ano desde ${v.first} pode ser revisto. Por mês, o que foi desmatado e o que o modelo espera para cada mês à frente, com a faixa.</li>
        <li><b>O mapa.</b> Por setor ou por célula. As células marcadas são os 5% da floresta em pé onde o modelo espera mais. A previsão anual de desmatamento é pintada a 500 metros, e o resto a um quilômetro.</li>
      </ul>
      <h3>Quão certo</h3>
      <ul>
        <li><b>Onde é a parte forte.</b> Prevendo cada ano de ${v.first} a ${v.last} às cegas, os 5% de floresta marcados concentraram ${v.cap}% do desmatamento que veio depois. Repetir o ano anterior concentrou ${v.naive}%.</li>
        <li><b>Quanto é a parte fraca.</b> O total anual errou ${v.mape}% em média, contra ${v.previsia}% do PrevisIA, do Imazon, como publicado.</li>
        <li><b>Janelas curtas e outros riscos.</b> Os mapas foram testados quanto ao lugar, em ${v.tmin} a ${v.tmax} datas passadas.</li>${v.mo ? `
        <li><b>Mês a mês.</b> Em ${v.mo.origins} datas de previsão passadas, o total desmatado em três meses errou ${v.mo.h3}% em média, contra ${v.mo.n3}% de repetir os mesmos meses do ano anterior. Os valores mensais são o que o DETER, do INPE, detecta, e a contagem anual do PRODES é maior.</li>` : ""}
      </ul>
      <h3>O que ele não faz</h3>
      <ul>
        <li>Dizer por que um lugar foi marcado. Os sinais são coisas que o modelo lê, não causas.</li>
        <li>Dar uma faixa para um setor sozinho, nem ver chegar uma mudança de política.</li>
        <li>Prever mês a mês um município, uma terra indígena ou uma unidade de conservação. A previsão deles é a fatia que têm na previsão da Amazônia.</li>${v.fire ? `
        <li>Dizer quanto vai queimar. Nos testes, o total de fogo em três meses errou ${v.fire}% em média.</li>` : ""}
        <li>Substituir os números oficiais do INPE. O resultado de ${v.partial} cobre só cenas prioritárias até agora.</li>
      </ul>
      <h3>Aberto e democrático</h3>
      <ul>
        <li>O código, o pipeline de dados e um benchmark público estão no GitHub.</li>
        <li>Qualquer pessoa pode enviar um modelo por pull request, com as notas, o código e um relatório escrito de como ele foi feito. Usar agentes de IA é bem-vindo, desde que o relatório diga qual agente foi usado e como.</li>
        <li>Previsões para 2027 podem ser registradas até 31 de dezembro de 2026 e recebem nota quando o INPE publicar o mapa, então ninguém, nem nós, consegue ajustar uma previsão depois de ver o resultado.</li>
        <li>Pesquisadores estão convidados a pôr seus modelos no placar ao lado do nosso. Um modelo que supere o publicado, e que outra pessoa reproduza, pode tomar o lugar dele neste site.</li>
      </ul>
      <p>Comece pelo <a href="${v.repo}">código</a>, pelo <a href="${v.repo}/tree/HEAD/benchmark">benchmark</a> e por <a href="${v.repo}/blob/HEAD/CONTRIBUTING.md">como contribuir</a>.</p>
      <h3>Dados</h3>
      <p>PRODES e DETER do INPE, pelo TerraBrasilis, e focos de fogo do INPE Queimadas. Global Forest Change, de Hansen, UMD, Google, USGS e NASA. Alertas GLAD do Sentinel-2, da Universidade de Maryland. Registros abertos de fiscalização do IBAMA. Índice Oceânico Niño da NOAA. Limites de estados, municípios, terras indígenas e unidades de conservação como o INPE distribui. Imagens de satélite da Esri, Maxar e Earthstar Geographics. Mapa desenhado com o Leaflet.</p>`,
  },
};
const H = new URLSearchParams(location.hash.slice(1));
let lang = H.get("l") || localStorage.lang || ((navigator.language || "en").startsWith("pt") ? "pt" : "en");
if (!T[lang]) lang = "en";
let langInLink = H.has("l");
const t = () => T[lang];
const loc = () => (lang === "pt" ? "pt-BR" : "en-US");
const fmt = (x, d = 0) => x.toLocaleString(loc(), { maximumFractionDigits: d, minimumFractionDigits: d });
const km = x => fmt(x, x < 9.95 ? 1 : 0);
const round = (x, n) => { const p = 10 ** (Math.floor(Math.log10(x)) - n + 1); return Math.round(x / p) * p; };
const approx = x => (x < 9.95 ? fmt(x, 1) : fmt(round(x, 2)));    // forecasts: two figures is all they are good for
const share = x => (x < 0.1 ? t().tiny : fmt(x, 1));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const [M, R, MO] = await Promise.all(["meta", "regions", "monthly"].map(f => fetch(`data/${f}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)));  // monthly.json may not be there yet
M.layers ||= {};
if (Math.abs(R.total_km2 / M.forecast.total_km2 - 1) > 1e-6) console.warn("Sector numbers are older than the forecast, run pipeline/regions.py");
const PARTIAL = 2026;  // the year whose outcome is INPE's priority scenes only, until the full map is out
const REPO = "https://github.com/gdavidss/prenuncio";  // the public code and benchmark, linked from About

// ---------- hazards. Each has a forecast layer in meta.json, a monthly DETER series, a hue that is never red,
// and a glyph, so it can be told apart by shape as well as colour. Clearing also has the yearly forecast.
const HAZ = {
  clear: { series: "clear", glyph: "M1 1h10v6l-4 4H1z", steps: [[214, 200, 240], [176, 146, 226], [134, 92, 205], [98, 48, 180], [58, 17, 115]] },
  fire: { layer: "scar12", series: "scar", glyph: "M6 .5C8 3 10.6 5 10.6 7.7A4.6 4 0 0 1 1.4 7.7C1.4 6 2.6 5 3.4 3.6C3.9 5 4.5 5.5 5.2 5.5C5 3.7 5.3 2 6 .5z", steps: [[252, 230, 160], [248, 202, 84], [242, 169, 0], [200, 124, 0], [146, 84, 0]] },
  degr: { layer: "degr12", series: "degr", glyph: "M1 1.5h10v2.2H1zM1 4.9h10v2.2H1zM1 8.3h10v2.2H1z", steps: [[190, 226, 228], [128, 196, 201], [52, 160, 168], [11, 124, 134], [6, 82, 92]] },
  mine: { layer: "mine12", series: "mine", glyph: "M6 .5L11.5 6L6 11.5L.5 6z", steps: [[212, 212, 208], [160, 160, 156], [110, 110, 107], [62, 62, 60], [20, 20, 20]] },
};
const hazards = () => Object.keys(HAZ).filter(k => k === "clear" || M.layers[HAZ[k].layer]);  // only the ones that have a forecast
const glyph = k => `<svg class="glyph" viewBox="0 0 12 12" style="--c:var(--${k})" aria-hidden="true"><path d="${HAZ[k].glyph}"/></svg>`;

// hazard: one of the above. scale: years or months. h: months ahead, in the monthly clearing view.
const S = { year: M.forecast.year, hazard: "clear", scale: "years", h: 3, mode: "sectors", kind: "mun", sel: null };
if (M.years[H.get("y")]) S.year = +H.get("y");
S.hazard = hazards().find(k => HAZ[k].layer && HAZ[k].layer === H.get("k")) || "clear";
if (/^clear[36]$/.test(H.get("k") || "")) { S.scale = "months"; S.h = +H.get("k").slice(5); }
if (H.get("t") === "months") S.scale = "months";
if (H.get("m") === "cells") S.mode = "cells";
if (T.en.kinds[H.get("s")]) S.kind = H.get("s");
if (H.get("r")) S.sel = H.get("r");
// which forecast map is on screen: a PRODES year, or one of the shorter layers
const key = () => (S.hazard !== "clear" ? HAZ[S.hazard].layer : S.scale === "months" ? "clear" + S.h : S.year);
const info = () => (typeof key() === "number" ? M.years[key()] : M.layers[key()]);
const isPast = () => typeof key() === "number" && info().actual_km2 != null;
// the share of a year's clearing inside its flagged cells, for the cells the site paints: the 500 m flags when
// the export has them, the 1 km ones otherwise
const cap5 = Y => Y.flags500?.capture5 ?? Y.capture["5"];
const naive5 = Y => Y.flags500?.naive5 ?? Y.naive["5"];  // the naive map's share, at 500 m once the export has it
const month = (y, mo, opt = { month: "long", year: "numeric" }) => new Date(y, mo, 1).toLocaleDateString(loc(), opt);
const endOf = L_ => { const [y, mo] = L_.from.split("-").map(Number); return month(y, mo - 2 + L_.months); };
const [LY, LM] = (MO?.last_month || R.months.end).split("-").map(Number);  // the last complete month
const back = (k, opt) => month(LY, LM - 1 - k, opt);              // the month k months before it

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
const delta = (now, prev, unit = " km²") => (prev < 1 ? (now < 0.05 ? null : km(now) + unit) : now / prev >= 2 ? "×" + fmt(now / prev, 1) : (now >= prev ? "+" : "−") + fmt(Math.abs(100 * (now / prev - 1))) + "%");
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
  const fc = own ? own.forecast : hz ? hz.forecast.map(f => ({ month: f.month, p50: f.p50 * part })) : null;
  // how far the total over n months has missed in backtests. Above 60% (fire) the amount is said to be very uncertain.
  const miss = n => hz?.backtest?.[`h${n}sum_mape`] ?? null;
  return { obs, fc, part, scaled: !!(it && !own && hz), sums: (own || hz)?.sums, miss, unsure: n => miss(n) > 0.6 };
}
// the months ahead added up. The file gives the model's own total and range for 3, 6 and 12 months; a sector
// scaled from the Amazon gets the middle only. Without those, the monthly middles are added.
function ahead(mo, n) {
  if (!mo.fc || mo.fc.length < n) return null;
  const t_ = mo.sums?.[n], add = k => mo.fc.slice(0, n).reduce((x, f) => x + f[k], 0), ranged = !mo.scaled && (t_ || mo.fc[0].p10 != null);
  return { km: t_ ? t_.p50 * mo.part : add("p50"), lo: ranged ? (t_ ? t_.p10 : add("p10")) : null, hi: ranged ? (t_ ? t_.p90 : add("p90")) : null, miss: mo.miss(n), unsure: mo.unsure(n) };
}

// ---------- the alert level (docs/BRAND.md): counted from the hazard's own alerts, plus El Niño for the
// whole Amazon or the forecast rank for a sector. 0 quiet, 1 watch, 2 warning, 3 alarm.
function alarm(it, K) {
  const L_ = t(), name = HAZ[S.hazard].series, a = monthly(it, name), why = [];
  let pts = 0;
  if (a) {
    const [now, prev] = three(a);
    pts += rising(now, prev);
    why.push(delta(now, prev) ? `${L_.short[name]} ${delta(now, prev)}` : L_.none(L_.short[name]));
  }
  if (it) {
    const r = rankOf(it, K), n = K.items.length;
    if (expOf(it) > 0) pts += r <= Math.max(1, Math.ceil(0.02 * n)) ? 2 : r <= Math.max(3, Math.ceil(0.1 * n)) ? 1 : 0;
    why.push(L_.rankWhy(r, n));
  } else {
    const e = enso();
    if (e.x >= 1.5) pts += 1;
    why.push(`${L_.enso[e.side]} ${e.word}`);
  }
  return { l: Math.min(3, pts), why };
}

// ---------- map: the Legal Amazon drawn from the grid, satellite only when close ----------
const SAT_ZOOM = 10, AMAZON = [[-18.05, -74.0], [5.3, -43.9]];
const PHONE = matchMedia("(max-width: 860px)"), narrow = () => PHONE.matches;
let view = H.get("m") === "cells" || H.get("r") || H.get("v") ? "map" : "chart";  // on a phone, which of the two is on screen
const mapOn = () => !narrow() || view === "map";
const FIT = () => (narrow() ? { paddingTopLeft: [8, 8], paddingBottomRight: [8, 44] } : { paddingTopLeft: [14, 70], paddingBottomRight: [14, 52] });
const BOUNDS = [[M.north - M.rows * M.cell, M.west], [M.north, M.west + M.cols * M.cell]];
const map = L.map("map", { zoomControl: false, attributionControl: false, minZoom: 4, maxZoom: 14, zoomSnap: 0.25, maxBounds: [[-30, -92], [17, -26]], maxBoundsViscosity: 0.8 });
L.control.zoom({ position: "bottomright" }).addTo(map);
for (const [name, z] of [["veil", 250], ["base", 300], ["paint", 350], ["lines", 420], ["sel", 430], ["labels", 450]]) {
  const p = map.createPane(name);
  p.style.zIndex = z; p.style.pointerEvents = "none";
}
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { minZoom: SAT_ZOOM, maxNativeZoom: 17 }).addTo(map);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { pane: "labels", minZoom: SAT_ZOOM, opacity: 0.9 }).addTo(map);
const cvSectors = L.canvas({ padding: 0.4 }), cvLines = L.canvas({ pane: "lines", padding: 0.4 }), svgSel = L.svg({ pane: "sel", padding: 0.4 });
// the whole Amazon, as large as the pane allows. That fit may be fractional; any other zoom is whole
// (satellite tiles show seams otherwise).
function whole(animate) {
  map.options.zoomSnap = 0.25;
  animate ? map.flyToBounds(AMAZON, { ...FIT(), duration: 0.6 }) : map.fitBounds(AMAZON, { ...FIT(), animate: false });
  map.options.zoomSnap = 1;
}
let pristine = !H.get("v");  // until the reader moves the map, it keeps fitting the Amazon to its pane
if (pristine) whole(); else { const [la, lo, z] = H.get("v").split(",").map(Number); map.setView([la, lo], z); }
for (const ev of ["pointerdown", "wheel", "keydown"]) $("map").addEventListener(ev, () => (pristine = false), { capture: true, passive: true });
new ResizeObserver(() => { map.invalidateSize(); if (pristine) whole(); }).observe($("map"));

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
  const cx = new OffscreenCanvas(M.cols, M.rows).getContext("2d", { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  return cx.getImageData(0, 0, M.cols, M.rows).data;
}
// the base map and the state lines, fetched when the map is first on screen (on a phone that is after the timeline)
let base, started = false;
const names = L.layerGroup();
function startMap() {
  if (started) return;
  started = true;
  // every cell is a mix of forest, water, natural non-forest and cleared land (see pipeline/regions.py)
  pixels("base").then(d => {
    const px = new Uint32Array(M.cols * M.rows);
    const FOREST = [172, 199, 166], WATER = [168, 198, 214], NATURAL = [214, 214, 190], CLEARED = [232, 225, 208];
    for (let i = 0, j = 0; i < px.length; i++, j += 4) {
      if (d[j] === 255 && d[j + 1] === 255) continue;
      const f = d[j] / 240, w = d[j + 1] / 240, n = d[j + 2] / 240, c = Math.max(0, 1 - f - w - n);
      px[i] = rgba(f * FOREST[0] + w * WATER[0] + n * NATURAL[0] + c * CLEARED[0] | 0, f * FOREST[1] + w * WATER[1] + n * NATURAL[1] + c * CLEARED[1] | 0, f * FOREST[2] + w * WATER[2] + n * NATURAL[2] + c * CLEARED[2] | 0, 1);
    }
    const B = sheet(M.cols, M.rows, BOUNDS, "base");
    B.cx.putImageData(toMercatorRows(px, M.cols, M.rows, M.cell), 0, 0);
    base = B.layer;
    zoomed();
  });
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

// ---------- hazard colour on the map: five steps from pale to deep, in the hazard's own hue ----------
const steps = () => HAZ[S.hazard].steps;
const mix = k => {  // k in 0..1 along the five steps
  const s = steps(), x = Math.min(0.9999, Math.max(0, k)) * 4, i = Math.floor(x), u = x - i;
  return s[i].map((c, n) => c + (s[i + 1][n] - c) * u | 0);
};

// ---------- cells ----------
// Nothing here becomes one big canvas. Every forecast is kept as arrays, one value per cell, with coarser
// levels above it, and the map draws only the window on screen from the finest level whose cell is at least
// a screen pixel. Each screen row takes the grid row at its own latitude, so a cell lands on its ground.
//
// The yearly clearing forecast and its replay are painted on the 500 m cells they are scored on.
// f<year>.png is one grey band, twice the grid each way: value 85 * (flagged + 2 * cleared). It is 34.5 million
// pixels: a worker decodes it in tiles into a byte per cell and builds the coarser levels (a block takes the
// highest code in it and counts its flagged cells).
async function decodeMask(url, cols, rows, north, cell) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const T = 1024, cv = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(T, T) : Object.assign(document.createElement("canvas"), { width: T, height: T });
  const cx = cv.getContext("2d", { willReadFrequently: true }), code = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y += T) for (let x = 0; x < cols; x += T) {
    const w = Math.min(T, cols - x), h = Math.min(T, rows - y);
    cx.clearRect(0, 0, T, T);
    cx.drawImage(bmp, x, y, w, h, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    for (let r = 0; r < h; r++) for (let c = 0, o = (y + r) * cols + x, i = 4 * r * w; c < w; c++, i += 4) code[o + c] = (d[i] + 42) / 85 | 0;
  }
  if (bmp.close) bmp.close();
  const levels = [{ f: 1, cols, rows, code, n: null }];
  for (const k of [2, 3, 2, 2]) {  // 1 km, 3 km, 6 km and 12 km blocks
    const p = levels[levels.length - 1], c2 = Math.ceil(p.cols / k), r2 = Math.ceil(p.rows / k);
    const q = { f: p.f * k, cols: c2, rows: r2, code: new Uint8Array(c2 * r2), n: new Uint16Array(c2 * r2) };
    for (let r = 0; r < p.rows; r++) for (let c = 0, o = r * p.cols, j = ((r / k) | 0) * c2; c < p.cols; c++) {
      const v = p.code[o + c];
      if (!v) continue;
      const i = j + ((c / k) | 0);
      if (v > q.code[i]) q.code[i] = v;
      q.n[i] += p.n ? p.n[o + c] : v & 1;
    }
    levels.push(q);
  }
  // how much is flagged: cells, and their area by latitude
  let flagged = 0, km2 = 0;
  for (let r = 0; r < rows; r++) {
    let n = 0;
    for (let c = 0, o = r * cols; c < cols; c++) n += code[o + c] & 1;
    flagged += n; km2 += n * cell * 110.57 * cell * 111.32 * Math.cos((north - (r + 0.5) * cell) * Math.PI / 180);
  }
  levels[0].flagged = flagged; levels[0].km2 = km2;
  return levels;
}
function loadMask(y, F) {
  const args = [new URL(`data/f${y}.png`, location.href).href, F.cols, F.rows, M.north, F.cell];
  return new Promise(done => {
    let w;
    const here = () => { if (w) w.terminate(); done(decodeMask(...args)); };  // no worker, or no canvas inside one: decode here
    try {
      w = new Worker(URL.createObjectURL(new Blob([`onmessage = async e => { try { const lv = await (${decodeMask})(...e.data); postMessage(lv, lv.flatMap(l => (l.n ? [l.code.buffer, l.n.buffer] : [l.code.buffer]))); } catch (err) { postMessage(null); } };`], { type: "text/javascript" })));
      w.onmessage = e => { if (e.data) { w.terminate(); done(e.data); } else here(); };
      w.onerror = here;
      w.postMessage(args);
    } catch (err) { here(); }
  });
}
// The shorter windows and the other hazards are painted at 1 km, from one RGB PNG per layer (see
// pipeline/export.py for the encoding). This is also the fallback for a year exported without the 500 m flags.
// Here a level holds the cell's colour; a coarser block takes the most telling cell in it.
const CLEARED_CODE = 26; // at least 1 ha of the cell cleared: round(255 * sqrt(0.01))
const HIT = rgba(17, 17, 17, 1), MISS = rgba(184, 115, 10, 1);
async function kmLevels(y, I) {
  const d = await pixels(y), code = k => Math.round(255 * Math.cbrt(k));
  const lo = Math.max(1, code(I.cut["5"])), hi = Math.max(lo + 1, code(I.cut["0.2"])), past = I.actual_km2 != null;
  const lut = new Uint32Array(256);
  for (let v = lo; v < 256; v++) { const c = mix(0.25 + 0.75 * Math.min(1, (v - lo) / (hi - lo))); lut[v] = rgba(c[0], c[1], c[2], 1); }
  const color = new Uint32Array(M.cols * M.rows), tell = new Uint8Array(M.cols * M.rows);  // tell: which cell wins in a block
  let flagged = 0, forest = 0, km2 = 0;
  for (let r = 0, i = 0; r < M.rows; r++) {
    const area = M.cell * 110.57 * M.cell * 111.32 * Math.cos((M.north - (r + 0.5) * M.cell) * Math.PI / 180);
    for (let c = 0; c < M.cols; c++, i++) {
      const R_ = d[4 * i], cleared = past && d[4 * i + 1] >= CLEARED_CODE;
      color[i] = cleared ? (R_ >= lo ? HIT : MISS) : lut[R_];
      tell[i] = !color[i] ? 0 : cleared ? (R_ >= lo ? 255 : 254) : Math.min(253, R_);
      if (d[4 * i + 2] >= 3) forest++;  // a forest cell: at least 1% forest, the cells the 5% is taken from
      if (R_ >= lo) { flagged++; km2 += area; }
    }
  }
  const levels = [{ f: 1, cols: M.cols, rows: M.rows, color, tell, flagged, km2, forest }];
  for (const k of [3, 2, 2]) {  // 3 km, 6 km and 12 km blocks
    const p = levels.at(-1), c2 = Math.ceil(p.cols / k), r2 = Math.ceil(p.rows / k);
    const q = { f: p.f * k, cols: c2, rows: r2, color: new Uint32Array(c2 * r2), tell: new Uint8Array(c2 * r2), n: new Uint16Array(c2 * r2) };
    for (let r = 0; r < p.rows; r++) for (let c = 0, o = r * p.cols, j = ((r / k) | 0) * c2; c < p.cols; c++) {
      const i = j + ((c / k) | 0);
      if (!p.tell[o + c]) continue;
      q.n[i] += p.n ? p.n[o + c] : 1;
      if (p.tell[o + c] > q.tell[i]) { q.tell[i] = p.tell[o + c]; q.color[i] = p.color[o + c] | 0xff000000; }
    }
    // a block with only a few flagged cells is fainter, so a far view does not overstate how much is flagged
    for (let i = 0; i < q.color.length; i++) if (q.tell[i] && q.tell[i] < 254) q.color[i] = (q.color[i] & 0xffffff | (255 * (0.3 + 0.7 * Math.sqrt(q.n[i] / (q.f * q.f))) << 24)) >>> 0;
    levels.push(q);
  }
  return levels;
}
let grid = null;  // what the cells layer draws: { key, cell, levels }. One forecast at a time (the 500 m mask is 45 MB).
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
    if (!grid || S.mode !== "cells" || grid.key !== key() || !size.x || !size.y) { delete cv.dataset.key; return; }
    // the finest level whose cell is at least one screen pixel wide
    const px = grid.cell * 256 * 2 ** map_.getZoom() / 360, lv = grid.levels.find(l => px * l.f >= 1) || grid.levels.at(-1), cell = grid.cell * lv.f;
    const lng0 = map_.layerPointToLatLng(b.min).lng, dLng = (map_.layerPointToLatLng(b.max).lng - lng0) / size.x;
    const col = new Int32Array(size.x), row = new Int32Array(size.y);
    for (let x = 0; x < size.x; x++) { const c = Math.floor((lng0 + (x + 0.5) * dLng - M.west) / cell); col[x] = c >= 0 && c < lv.cols ? c : -1; }
    for (let y = 0; y < size.y; y++) { const r = Math.floor((M.north - map_.layerPointToLatLng([b.min.x, b.min.y + y + 0.5]).lat) / cell); row[y] = r >= 0 && r < lv.rows ? r : -1; }
    // 500 m codes: flagged cells in the clearing hue, deeper where more of a block is flagged; cleared ones as in the legend
    // (a block with only a few flagged cells is fainter, so a far view does not overstate how much is flagged)
    const st = HAZ.clear.steps, shade = (k, a) => { const x = Math.min(0.9999, k) * 4, i = Math.floor(x), u = x - i; return rgba(...st[i].map((c, n) => c + (st[i + 1][n] - c) * u | 0), a); };
    const lut = lv.code && Uint32Array.from({ length: lv.f * lv.f + 1 }, (_, n) => (lv.f === 1 ? shade(0.62, 1) : shade(0.45 + 0.55 * n / (lv.f * lv.f), 0.3 + 0.7 * Math.sqrt(n / (lv.f * lv.f)))));
    const img = this._cx.createImageData(size.x, size.y), out = new Uint32Array(img.data.buffer);
    for (let y = 0, i = 0; y < size.y; y++) {
      if (row[y] < 0) { i += size.x; continue; }
      for (let x = 0, o = row[y] * lv.cols; x < size.x; x++, i++) {
        const c = col[x];
        if (c < 0) continue;
        if (lv.color) out[i] = lv.color[o + c];
        else { const v = lv.code[o + c]; if (v) out[i] = v === 3 ? HIT : v === 2 ? MISS : lut[lv.n ? lv.n[o + c] : 1]; }
      }
    }
    this._cx.putImageData(img, 0, 0);
    cv.dataset.key = grid.key; cv.dataset.f = lv.f; cv.dataset.cell = cell;
  },
});
const gridLayer = new GridLayer({ pane: "paint", padding: 0.2 }).addTo(map);
async function paint() {
  const y = key(), I = info();
  if (S.mode !== "cells" || grid?.key === y) return zoomed();
  const g = I.flags500 ? { key: y, cell: I.flags500.cell, levels: await loadMask(y, I.flags500) } : { key: y, cell: M.cell, levels: await kmLevels(y, I) };
  if (y !== key() || S.mode !== "cells") return;
  // the share of forest cells that is flagged. At 1 km it is counted from the layer. At 500 m the export gives
  // the flagged cells but not the forest cells; they are flagged as the top 5% of them, so that is the share.
  const l0 = g.levels[0], F = I.flags500;
  g.pct = l0.forest ? 100 * l0.flagged / l0.forest : F.forest_cells ? 100 * l0.flagged / F.forest_cells : 5;
  g.km2 = l0.km2;
  grid = g;
  zoomed();
  flaggedShare();
}
function flaggedShare() {
  const on = S.mode === "cells" && grid && grid.key === key();
  $("share").hidden = !on;
  if (on) $("share").innerHTML = t().shareOf({ pct: fmt(grid.pct, 1), km: fmt(round(grid.km2, 3)) });
}
function zoomed() {
  const z = map.getZoom();
  gridLayer._container.style.opacity = z < SAT_ZOOM ? 1 : 0.7;  // over imagery, let the ground show through
  gridLayer._update();
  if (base) { base.setOpacity(z >= SAT_ZOOM ? 0 : 1); base.getElement().classList.toggle("crisp", z >= 9); }
  z < 7 ? names.addTo(map) : names.remove();
  $("credit").hidden = z < SAT_ZOOM;
}
map.on("zoomend", zoomed);

// ---------- sectors on the map: five classes of forecast risk per area, the lowest left as bare land ----------
let shown = null, outline = null, cuts = [];
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const density = it => expOf(it) / it.a;
const classOf = it => { const d = density(it); let c = 0; while (c < cuts.length && d >= cuts[c]) c++; return c; };
function styleOf(it) {
  const c = classOf(it), close = map.getZoom() >= SAT_ZOOM, thin = shown === "mun";
  return { fillColor: `rgb(${steps()[Math.max(0, c - 1)]})`, fillOpacity: c ? (close ? 0.5 : 0.94) : 0, color: INK, opacity: thin ? 0.25 : 0.55, weight: thin ? 0.5 : 0.8 };
}
function tipOf(it, K) {
  const L_ = t(), v = { exp: approx(expOf(it)), act: km(actOf(it)), rank: L_.rank(rankOf(it, K)), n: K.items.length };
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
  // class breaks: the lower 60% stays bare, then the next 20%, 12%, 6% and the top 2%
  const d = K.items.map(density).sort((a, b) => a - b), q = p => d[Math.min(d.length - 1, Math.floor(d.length * p))];
  cuts = [0.6, 0.8, 0.92, 0.98].map(q).map((x, i, a) => Math.max(x, 1e-9, (a[i - 1] ?? 0) * 1.0001));
  for (const it of K.items) it.layer.setStyle(styleOf(it));
}
map.on("zoomend", () => { if (shown) SEC[shown].then(K => K.items.forEach(it => it.layer.setStyle(styleOf(it)))); });
map.on("click", () => { if (S.mode === "sectors" && S.sel != null) select(null); });

async function select(id, fit = true) {
  S.sel = id == null ? null : String(id);
  if (outline) { outline.remove(); outline = null; }
  refresh();
  if (id == null) return;
  const it = (await sectors(S.kind)).byId.get(S.sel);
  if (!it || S.sel !== String(id)) return;
  outline = L.featureGroup([L.polygon(it.ll, { renderer: svgSel, fill: false, color: GROUND, weight: 6, interactive: false }), L.polygon(it.ll, { renderer: svgSel, fill: false, color: INK, weight: 2.5, interactive: false })]).addTo(map);
  // move only if the sector is partly off screen or too small to read
  const b = outline.getBounds(), size = map.latLngToContainerPoint(b.getNorthEast()).distanceTo(map.latLngToContainerPoint(b.getSouthWest()));
  if (fit && (size < 110 || !map.getBounds().contains(b))) { pristine = false; map.flyToBounds(b, { ...FIT(), maxZoom: 8, duration: calm() ? 0 : 0.6 }); }
}

// ---------- the bulletin: the level, then what is happening or what to expect, in one sentence ----------
let turn = 0;
async function say() {
  const mine = ++turn, L_ = t(), I = info(), k = key(), yearly = typeof k === "number", past = isPast(), y = S.year, hz = S.hazard;
  const K = S.sel != null ? await sectors(S.kind) : null;  // the sector's numbers; the whole Amazon needs none
  if (mine !== turn) return;
  const it = S.sel != null ? K.byId.get(S.sel) : null, here = it ? L_.here : "", pct = x => fmt(100 * x);
  const v = { y, here, many: L_.many[S.kind], n: K?.items.length };
  if (it) v.rank = L_.rank(rankOf(it, K));
  let head, sub = "";
  if (S.scale === "months" || hz !== "clear") {
    // what the model expects over the months ahead; where there is no monthly forecast, what was measured
    const mo = monthsOf(it), sum = ahead(mo, I.months);
    if (sum && (sum.km >= 0.05 || !it)) {
      head = L_.mfc[hz]({ km: approx(sum.km), here, h: I.months });
      sub = mo.scaled ? L_.scaledSub(v) : sum.lo == null ? "" : sum.unsure ? L_.unsure({ lo: approx(sum.lo), hi: approx(sum.hi), miss: fmt(100 * sum.miss) }) : L_.fcSub({ lo: approx(sum.lo), hi: approx(sum.hi) });
    } else if (S.scale === "months") {
      head = L_.mobs[hz]({ km: km(mo.obs(0) + mo.obs(1) + mo.obs(2)), here });
      if (it) sub = L_.rankOnly(v);
    } else {
      const a = it ? it.L[k] : R.amazon.L[k];
      head = it ? L_.whereHere({ ...v, risk: L_.risk[hz], end: endOf(I) }) : L_.where[hz]({ end: endOf(I) });
      if (a?.length > 1) sub = L_.lastSub[hz]({ km: km(a.at(-1)), here });
    }
  } else if (past) {
    const act = it ? actOf(it) : I.actual_km2;
    if (!it) { head = L_.past({ y, cap: pct(cap5(I)) }); sub = L_.pastSub({ naive: pct(naive5(I)) }); }
    else {
      head = act < 0.05 ? L_.pastHereNone(v) : L_.pastHere({ y, act: km(act), inside: pct(Math.min(1, hitOf(it) / act)) });
      sub = L_.pastHereSub({ ps: share(100 * expOf(it) / I.risk_km2), as: share(100 * act / I.actual_km2) });
    }
    if (y === PARTIAL) sub += L_.partial;
  } else if (it) {
    const e = expOf(it);
    head = e < 0.05 ? L_.fcNone(v) : L_.fc({ ...v, km: approx(e) });
    sub = L_.rankSub({ ...v, share: share(100 * e / I.risk_km2) });
  } else {
    head = L_.fc({ ...v, km: approx(M.forecast.total_km2) });
    sub = L_.fcSub({ lo: approx(M.forecast.range_km2[0]), hi: approx(M.forecast.range_km2[1]) });
  }
  // the level sets how much red there is. A replayed year has none: the alarm is about now.
  const A = past ? null : alarm(it, K), l = A ? A.l : "r";
  document.documentElement.dataset.level = $("lead").dataset.l = l;
  $("level").innerHTML = (A ? `<span class="meter" aria-hidden="true">${[1, 2, 3].map(n => `<i${n <= A.l ? ' class="on"' : ""}></i>`).join("")}</span>` : "")
    + `<b>${A ? L_.level[A.l] : L_.replay}</b><span>${A ? A.why.join(", ") : L_.made(y)}</span>`;
  // the whole Amazon needs no label; a sector is named, with a way back
  $("scope").innerHTML = it ? `<span>${esc(it.n)}${it.s ? ", " + it.s : ""}</span><button aria-label="${L_.whole}" title="${L_.whole}">×</button>` : "";
  $("scope").hidden = !it;
  $("say").textContent = head.replaceAll(" km²", "\u00a0km²");
  $("sub").textContent = sub.trim().replaceAll(" km²", "\u00a0km²");
  $("hint").textContent = S.scale === "months" ? L_.deter : yearly ? L_.hintY({ first: R.hyears[0] }) : "";
  chart(it);
  signs(it);
  // what the map colours mean
  const sw = (c, s) => `<span class="sw" style="--c:${c}">${s}</span>`, tone = `rgb(${steps()[2]})`;
  const what = `<span class="what">${glyph(hz)}${L_.legend[hz]}${yearly ? "" : ", " + L_.next(I.months)}</span>`;
  $("legend").innerHTML = what + (S.mode === "cells"
    ? `<span>${sw(tone, L_.flagged) + (past ? sw("var(--ink)", L_.hit) + sw("var(--miss)", L_.miss) : "")}</span>`
    : `<span>${L_.lower}<span class="ramp"><i style="--c:rgb(172,199,166)"></i>${steps().slice(0, 4).map(c => `<i style="--c:rgb(${c})"></i>`).join("")}</span>${L_.higher}</span>`);
  flaggedShare();
}
$("scope").onclick = e => { if (e.target.closest("button")) { select(null); if (mapOn()) { pristine = true; whole(!calm()); } } };

// ---------- signals: what the model is reading, as small traces. Red only where it is rising. ----------
function signs(it) {
  const L_ = t(), W = 100, Hh = 28;
  const line = (a, zero) => {
    const v = a.slice(-36), lo = Math.min(0, ...v), hi = Math.max(1e-9, ...v), X = i => (i / (v.length - 1)) * W, Y = x => Hh - 2 - (Hh - 4) * (x - lo) / (hi - lo);
    const path = (from, cls) => `<path class="${cls}" d="${v.slice(from).map((x, i) => `${i ? "L" : "M"}${X(i + from).toFixed(1)} ${Y(x).toFixed(1)}`).join("")}"/>`;
    return `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true">${zero ? `<line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>` : ""}${path(0, "")}${path(v.length - 3, "end")}</svg>`;
  };
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
        : f ? { key: s, d, v: f.p50, fc: true, range: f.p10 == null || -n > I.months || mo.unsure(I.months) ? null : [f.p10, f.p90], dim: -n > I.months, unsure: mo.unsure(I.months), sub } : { key: s, d, v: null, sub };
    });
  }
  if (S.hazard !== "clear") {
    const vals = (it ? it.L[k] : R.amazon.L[k]) || [], sum = ahead(monthsOf(it), I.months);
    const span = w => { const [y, m_] = w.split("-").map(Number); return t().to(month(y, m_ - 1), month(y, m_ - 2 + I.months)); };
    const end = w => new Date(+w.slice(0, 4), +w.slice(5) - 2 + I.months, 1).getFullYear();
    // the last slot is the forecast: the months ahead added up, or only the window when there is no monthly forecast
    const last = sum ? { v: sum.km, fc: true, on: true, range: sum.lo == null || sum.unsure ? null : [sum.lo, sum.hi], unsure: sum.unsure, sub: span(I.from) } : { v: null, win: true };
    return [...(R.layers[k]?.windows || []).map((w, i) => ({ key: w, label: end(w), v: vals[i + 1] ?? 0, sub: span(w) })), { key: I.from, label: end(I.from), ...last }];
  }
  const fy = M.forecast.year;
  const out = R.cyears.map((y, i) => {
    const Y = M.years[y], j = R.hyears.indexOf(y), v = it ? it.c[i] : Y?.actual_km2 ?? M.history[y] ?? 0;  // the replayed years use the total the headline quotes
    return { key: y, label: y, v, can: !!Y, on: y === S.year, hit: j < 0 || y !== S.year ? null : it ? Math.min(v, it.h[j]) : v * cap5(Y) };
  });
  out.push({ key: fy, label: fy, v: it ? it.e[R.eyears.indexOf(fy)] : M.forecast.total_km2, fc: true, can: true, on: fy === S.year, range: it ? null : M.forecast.range_km2 });
  return out;
}
function chart(it = scope) {
  scope = it;
  const el = $("chart"), W = el.clientWidth, H = el.clientHeight, L_ = t();
  if (W < 60 || H < 60) return;
  bars = series(it);
  const monthsView = S.scale === "months", sector = !!it;
  const gut = 42, top = monthsView ? 40 : 46, bot = monthsView ? 34 : 22, pw = W - gut, ph = H - top - bot, pitch = pw / bars.length, bw = Math.max(3, pitch * (monthsView ? 0.62 : 0.72));
  // the scale fits the bars, with a little room above them. A range that runs past it is cut off at the top, open.
  const peak = b => Math.max(b.v ?? 0, b.range ? b.range[1] : 0);
  const tallest = Math.max(sector ? 0.5 : 1, ...bars.map(b => b.v ?? 0)), max = tallest * (bars.some(b => b.range && b.range[1] > tallest) ? 1.15 : 1);
  const Y = v => top + ph - ph * Math.min(v, max) / max, X = i => gut + i * pitch, y0 = Y(0);
  const [tk, dec] = ticks(max), skip = pitch < 18 ? 2 : 1, onAt = bars.findIndex(b => b.on);
  let s = `<svg width="${W}" height="${H}" role="img"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgb(${steps()[0]})"/><rect width="3" height="6" fill="rgb(${steps()[3]})"/></pattern></defs><g class="grid">`;
  for (const v of tk) s += `<line x1="${gut}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${gut - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v, dec)}</text>`;
  // what the axis counts, written on it
  s += `<text class="unit" x="0" y="${monthsView ? top - 10 : 13}">${monthsView ? L_.axisM[S.hazard] : S.hazard === "clear" ? L_.axisY : L_.axisW[S.hazard]}</text></g>`;
  if (monthsView) {
    // the window ahead: from now to the end of the chosen horizon, the months the headline adds up.
    // For clearing there are two to choose from.
    const I = info(), hs = S.hazard === "clear" ? [3, 6].filter(h => M.layers["clear" + h]) : [I.months], now = X(24);
    s += `<rect class="win" x="${now}" y="${top}" width="${I.months * pitch}" height="${ph}"/><line class="winrule" x1="${now}" x2="${now + I.months * pitch}" y1="${top}" y2="${top}"/>`;
    s += `<line class="now" x1="${now}" x2="${now}" y1="${top - 24}" y2="${y0}"/><text class="caps" x="${now - 7}" y="${top - 10}" text-anchor="end">${L_.now}</text>`;
    s += `<text x="${now + 8}" y="${top - 10}">${hs.map((h, n) => `<tspan class="h${h === I.months ? " on" : ""}"${n ? ' dx="14"' : ""}${hs.length > 1 ? ` data-h="${h}" tabindex="0" role="button" aria-pressed="${h === I.months}"` : ""}>${L_.ahead(h)}</tspan>`).join("")}</text>`;
  }
  bars.forEach((b, i) => {
    const x = X(i) + (pitch - bw) / 2, cx = x + bw / 2, h = b.v > 0 ? Math.max(1.5, ph * Math.min(b.v, max) / max) : 0;
    const rect = (cls, yy, hh, fill = "") => `<rect class="${cls}" x="${x}" y="${yy}" width="${bw}" height="${Math.max(0, hh)}" ${fill}/>`;
    s += `<g class="bar${b.can ? " can" : ""}${b.on ? " on" : ""}${b.cur ? " cur" : ""}${b.dim ? " dim" : ""}" data-i="${i}"${b.can ? ` tabindex="0" role="button" aria-pressed="${!!b.on}" aria-label="${b.label}"` : ""}>`;
    if (b.win) s += `<rect class="win" x="${X(i) + 1}" y="${top}" width="${pitch - 2}" height="${ph}"/><line class="winrule" x1="${X(i) + 1}" x2="${X(i) + pitch - 1}" y1="${top}" y2="${top}"/><text class="h on end" x="${X(i) + pitch}" y="${top - 10}">${L_.window}</text>`;
    else if (b.fc) {
      s += rect("fc", y0 - h, h, 'fill="url(#hatch)"');
      if (b.range) s += `<path class="rng" fill="none" d="M${cx} ${Y(b.range[0])}V${Y(b.range[1])}M${cx - 4} ${Y(b.range[0])}h8${b.range[1] <= max ? `M${cx - 4} ${Y(b.range[1])}h8` : ""}"/>`;
    } else if (b.hit != null) {
      const hh = b.v > 0 ? h * b.hit / b.v : 0;
      s += rect("in", y0 - hh, hh) + rect("out", y0 - h, h - hh);
    } else if (b.v != null) s += rect("plain", y0 - h, h);
    if (monthsView) {
      s += `<text x="${cx}" y="${y0 + 15}"${pitch < 14 ? ' style="font-size:10px"' : ""}>${b.d.toLocaleDateString(loc(), { month: "narrow" })}</text>`;
      if (b.d.getMonth() === 0) s += `<text x="${cx}" y="${y0 + 30}">${b.d.getFullYear()}</text>`;
    } else if (skip === 1 || b.on || ((bars.length - 1 - i) % 2 === 0 && Math.abs(i - onAt) !== 1)) s += `<text x="${cx}" y="${H - 5}">${pitch < 40 ? String(b.label).slice(-2) : b.label}</text>`;  // four digits only where they fit
    s += `<rect class="hot" x="${X(i)}" y="${top - 12}" width="${pitch}" height="${H - top + 12}"/></g>`;
  });
  el.innerHTML = s + `<line class="axis" x1="${gut}" x2="${W}" y1="${y0}" y2="${y0}"/><g class="tip" pointer-events="none"><path/><text></text><text></text></g></svg>`;
  pinned = onAt >= 0 && bars[onAt].hit != null ? onAt : -1;  // a replayed year keeps its label; the forecast is already the headline
  tip(pinned);
  function tip(i) {
    const [t1, t2] = el.querySelectorAll(".tip text"), lead = el.querySelector(".tip path"), b = bars[i];
    if (!b || b.win || (b.v == null && !monthsView)) { t1.textContent = t2.textContent = ""; lead.setAttribute("d", ""); return; }
    const exact = x => `${sector || typeof key() !== "number" ? km(x) : fmt(x)} km²`;
    const lines = b.fc ? [(monthsView ? b.sub + ", " : "") + L_.about_(approx(b.v)), b.range ? L_.range(approx(b.range[0]), approx(b.range[1])) : b.unsure ? L_.veryUnsure : ""]
      : monthsView ? [b.v == null ? b.sub : `${b.sub}, ${exact(b.v)}`, ""]
      : [exact(b.v), b.hit != null ? (b.v >= 0.05 ? L_.inside(fmt(100 * b.hit / b.v)) : "") : b.sub || ""];
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
$("chart").onclick = e => {
  const h = e.target.closest("[data-h]"), g = e.target.closest(".bar.can");
  if (h) { S.h = +h.dataset.h; refresh(); }
  else if (g) pick(bars[g.dataset.i].key);
};
$("chart").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.closest(".bar.can, [data-h]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); } };
new ResizeObserver(() => chart()).observe($("chart"));

// ---------- controls ----------
function chrome() {
  const L_ = t(), btn = (k, label, on) => `<button data-k="${k}" aria-pressed="${on}">${label}</button>`;
  document.documentElement.lang = lang;
  document.documentElement.dataset.hazard = S.hazard;
  document.documentElement.style.setProperty("--hue", `var(--${S.hazard})`);
  $("hazard").className = $("scale").className = $("modes").className = $("kinds").className = "pick";
  $("hazard").innerHTML = hazards().map(k => btn(k, glyph(k) + L_.hazard[k], k === S.hazard)).join("");
  $("scale").innerHTML = ["years", "months"].map(k => btn(k, L_.scale[k], k === S.scale)).join("");
  $("modes").innerHTML = ["sectors", "cells"].map(k => btn(k, L_.modes[k], k === S.mode)).join("");
  $("kinds").innerHTML = Object.keys(L_.kinds).map(k => btn(k, L_.kinds[k], k === S.kind)).join("");
  $("kinds").hidden = S.mode !== "sectors";
  // on a phone: the timeline or the map, the window ahead as buttons, and a stepper for the replay years
  document.documentElement.dataset.view = view;
  $("views").className = $("ahead").className = "pick";
  $("views").innerHTML = ["chart", "map"].map(k => btn(k, L_.views[k], k === view)).join("");
  const hs = S.hazard === "clear" && S.scale === "months" ? [3, 6].filter(h => M.layers["clear" + h]) : [];
  $("ahead").innerHTML = hs.map(h => btn(h, L_.ahead(h), h === S.h)).join("");
  $("ahead").hidden = hs.length < 2;
  const ys = Object.keys(M.years).map(Number).sort(), at = ys.indexOf(S.year), [prev, , next] = $("step").children;
  $("step").hidden = typeof key() !== "number";
  $("step").children[1].textContent = S.year;
  prev.disabled = at <= 0; next.disabled = at >= ys.length - 1;
  prev.setAttribute("aria-label", L_.prevYear); next.setAttribute("aria-label", L_.nextYear);
  $("about-btn").textContent = L_.about;
  $("about-close").textContent = L_.close;
  $("lang-btn").textContent = lang === "pt" ? "EN" : "PT";
  $("lang-btn").setAttribute("aria-label", lang === "pt" ? "English" : "Português");
  $("credit").textContent = L_.credit;
}
async function refresh() {
  if (!hazards().includes(S.hazard)) S.hazard = "clear";
  if (S.hazard === "clear" && S.scale === "months" && !M.layers["clear" + S.h]) S.scale = "years";
  chrome();
  link();
  say();  // the bulletin and the timeline need only the two small JSON files, so they come first
  if (mapOn()) { startMap(); paint(); drawSectors(); }
}
PHONE.addEventListener("change", refresh);
const pressed = (id, fn) => ($(id).onclick = e => { const b = e.target.closest("button"); if (b) fn(b.dataset.k); });
pressed("hazard", k => { S.hazard = k; refresh(); });
pressed("scale", k => { S.scale = k; refresh(); });
pressed("modes", k => { S.mode = k; refresh(); });
pressed("kinds", k => { if (k !== S.kind) { S.kind = k; select(null); } });
pressed("views", k => { view = k; refresh(); });
pressed("ahead", k => { S.h = +k; refresh(); });
$("step").onclick = e => {
  const b = e.target.closest("button"), ys = Object.keys(M.years).map(Number).sort();
  if (b && ys[ys.indexOf(S.year) + +b.dataset.d]) pick(ys[ys.indexOf(S.year) + +b.dataset.d]);
};
function pick(y) { S.year = y; refresh(); }
document.addEventListener("keydown", e => {
  if ($("about").open) return;
  if (e.key === "Escape" && S.sel != null) return select(null);
  if (typeof key() !== "number" || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const ys = Object.keys(M.years).map(Number).sort(), i = ys.indexOf(S.year) + (e.key === "ArrowLeft" ? -1 : 1);
  if (ys[i]) pick(ys[i]);
});
$("lang-btn").onclick = () => { lang = localStorage.lang = lang === "pt" ? "en" : "pt"; langInLink = true; refresh(); };

$("about-btn").onclick = () => {
  const hy = R.hyears, mean = f => hy.reduce((s, y) => s + f(M.years[y]), 0) / hy.length, tests = Object.values(M.layers).map(l => l.tests);
  $("about-body").innerHTML = t().aboutHtml({
    first: hy[0], last: hy.at(-1), cap: fmt(100 * mean(cap5)), naive: fmt(100 * mean(naive5)),
    mape: fmt(100 * M.forecast.mape), previsia: fmt(100 * M.forecast.previsia_mape), tmin: Math.min(...tests), tmax: Math.max(...tests),
    partial: PARTIAL, repo: REPO,
    fire: (b => (b?.h3sum_mape > 0.6 ? fmt(100 * b.h3sum_mape) : ""))(MO?.hazards?.scar?.backtest),
    mo: (b => b && b.h3sum_mape != null && { origins: b.origins, h3: fmt(100 * b.h3sum_mape), n3: fmt(100 * b.naive_h3sum_mape) })(MO?.hazards?.clear?.backtest),
  });
  $("about").showModal();
  $("about").scrollTop = 0;
};
$("about-close").onclick = () => $("about").close();
$("about").onclick = e => { if (e.target === $("about")) $("about").close(); };

// shareable state: #y=2023&k=scar12&t=months&m=cells&s=ti&r=<sector id>&v=lat,lng,zoom&l=pt
// (k is the forecast layer when it is not a PRODES year: clear3 or clear6 for the months ahead of clearing,
// or another hazard's layer, such as scar12 for fire)
let leaving = false;
addEventListener("hashchange", e => { leaving = true; location.replace(e.newURL); location.reload(); });
function link() {
  if (leaving) return;
  const c = map.getCenter(), q = new URLSearchParams({ y: S.year });
  if (typeof key() !== "number") q.set("k", key());
  if (S.hazard !== "clear" && S.scale === "months") q.set("t", "months");
  if (S.mode === "cells") q.set("m", "cells");
  if (S.kind !== "mun") q.set("s", S.kind);
  if (S.sel != null) q.set("r", S.sel);
  q.set("v", `${c.lat.toFixed(3)},${c.lng.toFixed(3)},${+map.getZoom().toFixed(2)}`);
  if (langInLink) q.set("l", lang);
  history.replaceState(null, "", "#" + q.toString().replaceAll("%2C", ","));
}
map.on("moveend", link);

if (S.sel != null) select(S.sel, !H.get("v")); else refresh();
if (H.has("about")) $("about-btn").click();
