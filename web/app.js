// Prenúncio. An alert level, a headline, a timeline and a few signals, beside a drawn map of the Amazon.
// It follows docs/BRAND.md: green is forest, red is clearing. No build step, no keys.
// Data formats: pipeline/export.py (cells) and pipeline/regions.py (sectors, months).
const $ = id => document.getElementById(id);

const T = {
  en: {
    hazard: { clear: "Clearing", fire: "Fire", degr: "Degradation", mine: "Mining" }, scale: { years: "Years", months: "Months", actions: "Actions" },
    amazon: "Amazon", about: "About", close: "Close", copy: "Copy", copied: "Copied", views: { chart: "Timeline", map: "Map", list: "List" },
    axisY: "km² cleared per year, August to July",
    // cells: every forest cell has its own chance
    chanceBy: y => `Chance each cell loses a hectare by July ${y}`, chanceFor: y => `Chance given to each cell for ${y}`, mapped: "clearing mapped",
    onlyFrom: "Choose a step to show only cells at that chance or more",
    stepLo: c => `under ${c}`, stepMid: (a, b) => `${a} to ${b}`, stepHi: c => `over ${c}`, under: c => `under ${c}`,
    cellFc: v => `${v.p} chance this cell loses a hectare by July ${v.y}`,
    cellPast: v => `In ${v.y} this cell was given ${v.p}. ${v.clr ? "Clearing was mapped in it." : "No clearing was mapped in it."}`,
    areaFc: v => (v.low ? `Every cell here has ${v.p} chance of losing a hectare by July ${v.y}` : `Up to ${v.p} chance a cell here loses a hectare by July ${v.y}`),
    areaPast: v => `In ${v.y} cells here were given ${v.low ? "" : "up to "}${v.p}. ${v.clr ? `Clearing was mapped in ${v.clr} of ${v.n}.` : "No clearing was mapped."}`,
    pShare: v => `<b>${v.exp}</b> of ${v.cells} million forest cells expected to lose a hectare`,
    pShareMin: v => `<b>${v.n}</b> cells at ${v.cut} or more, with ${v.share}% of the expected loss`,
    pSharePastNo: v => `<b>${v.act}</b> cells had clearing mapped`,
    pSharePastMin: v => `<b>${v.n}</b> cells at ${v.cut} or more, with ${v.share}% of the cells where clearing was mapped`,
    pastP: v => `In ${v.y}, ${v.exp} cells were expected to lose a hectare and ${v.act} did`, prevYear: "Previous year", nextYear: "Next year",
    modes: { sectors: "Sectors", cells: "Cells", prio: "Priorities" }, ranking: "Ranking", bars: "Bars", line: "Line",
    // the priority list: where to look first
    prioSay: v => `Of the ${v.top} blocks of ${v.km} km ranked highest, ${v.hit}% lost at least 10 hectares in ${v.y}, against ${v.base}% of all forest blocks.`,
    prioCols: ["cells", "max chance"], prioColsTitle: v => `Cells of the block expected to lose a hectare by July ${v.y}, and the highest chance among them`,
    csv: "Download CSV", land: { ti: "Indigenous land", uc: "conservation unit" },
    rankSay: v => `${v.kind} by ${v.what}`, rankWhat: { fc: y => `clearing expected by July ${y}`, past: y => `clearing expected for ${y}`, risk: "share of the risk map", fire: "share of where fire tends to occur" },
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
    past: v => `In ${v.y}, ${v.act} km² were cleared`,
    partial: " Priority scenes only, so far.",
    pastHere: v => `In ${v.y}, ${v.act} km² were cleared here`,
    pastHereNone: v => `In ${v.y} no clearing was mapped here`,
    pastHereSub: v => `Forecast share ${v.ps}%, actual share ${v.as}%.`,
    mfc: {
      clear: v => `About ${v.km} km² expected to be cleared${v.here} in the next ${v.h} months`,
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
    // fire: what burned, never how much will burn
    burned: { months: v => `${v.km} km² burned${v.here} in the last three months, ${v.prev} a year before`, years: v => `${v.km} km² burned${v.here} in the last twelve months, ${v.prev} in the twelve before` },
    fireRank: v => `${v.rank} of ${v.n} ${v.many} on the map of where fire tends to occur.`,
    rankOnly: v => `${v.rank} of ${v.n} ${v.many} on the risk map.`,
    deter: "Monthly figures are what INPE's DETER detects. The yearly PRODES count is larger.",
    axisM: { clear: "km² cleared per month", fire: "km² burned per month", degr: "km² degraded per month", mine: "km² mined per month" },
    axisW: { fire: "km² burned per 12 months", degr: "km² degraded per 12 months", mine: "km² mined per 12 months" },
    whole: "Whole Amazon", to: (a, b) => `${a} to ${b}`,
    where: {
      degr: v => `Where forest is most likely to be degraded or logged by ${v.end}`,
      mine: v => `Where mining is most likely to spread by ${v.end}`,
    },
    whereHere: v => `Ranks ${v.rank} of ${v.n} ${v.many} for ${v.risk} by ${v.end}`,
    risk: { degr: "degradation risk", mine: "mining risk" },
    lastSub: {
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
    legend: { clear: "Clearing risk", fire: "Where fire tends to occur", degr: "Degradation risk", mine: "Mining risk" }, lower: "lower", higher: "higher", next: n => `next ${n} months`,
    about_: x => `about ${x} km²`, range: (lo, hi) => `likely ${lo} to ${hi}`,
    tipFc: v => `about ${v.exp} km² expected`, tipPast: v => `${v.exp} km² expected, ${v.act} cleared`, tipRank: v => `${v.rank} of ${v.n}`,
    // actions: what measured enforcement accounts for. A floor and an association, and the screen says so.
    act: {
      band: "Enforcement", bandSub: v => `IBAMA notices and embargoes${v.n ? `, ${v.n} municipalities` : ""}`,
      say: v => `Enforcement accounts for ${v.km} km² of clearing avoided${v.here} since ${v.since}`,
      none: v => `Enforcement accounts for no clearing avoided here since ${v.since}`,
      sub: v => `About ${v.part} of the fall since then. The rest fell everywhere at once.`,
      subHere: v => `${v.pct}% on top of what was cleared here. No range for a single state.`, noRange: "No range for a single state.",
      parts: ["a quarter", "a third", "half", "two thirds", "three quarters"],
      honest: v => `A floor and an association, not proof of cause, since inspectors go where clearing is. ${v.own ? `In the Amazon as a whole, ${v.rest} of the fall is not attributed to anything.` : `The rest, ${v.rest} of the fall, is not attributed to anything.`}`,
      statesOnly: " Only states have a figure of their own.",
      axis: "km² cleared per six months", measured: "measured", held: v => `more, with enforcement as in ${v.ref}`, ref: v => `average of ${v.from} to ${v.to}`,
      tipObs: v => `${v.span}, ${v.obs} km² cleared`, tipHeld: v => `${v.held} with enforcement held${v.lo ? `, likely ${v.lo} to ${v.hi}` : ""}`,
      signs: v => `IBAMA actions, year to ${v.now} against year to ${v.ref}`, against: x => `against ${x}`,
      sign: { notices: "Notices per 100 km²", remote: "Remote embargoes", field: "Field embargoes", collective: "Collective embargoes" },
      signTitle: { notices: "Infraction notices per 100 km² of clearing", remote: "Area embargoed by satellite, with no visit", field: "Area embargoed on a field visit", collective: "Whole Indigenous lands and other public areas embargoed at once" },
    },
    credit: "Imagery: Esri, Maxar, Earthstar Geographics",
    aboutHtml: v => `
      <h2>The sign before the event</h2>
      <p>Prenúncio is an early warning for the Brazilian Amazon. It forecasts where forest will be cleared, burned, degraded or mined next, and shows how hard the pressure is now.</p>
      <h3>What it shows</h3>
      <ul>
        <li><b>The level.</b> Quiet, Watch, Warning or Alarm. It is counted from the hazard's last three months against a year before, a strong El Niño for the whole Amazon, and a sector's rank in the forecast. The red band follows the level.</li>
        <li><b>The timeline.</b> By year, clearing with the forecast at the end, and any year since ${v.first} can be replayed. By month, what was cleared and what the model expects for each month ahead, with its range.</li>
        <li><b>The map.</b> Green is forest, red is clearing. By sector or by cell. In cells, every 500 metre cell of forest carries its own chance of losing at least a hectare in the year, and the legend filters by minimum chance. Seen from far, a block takes the step a fifth of its cells reach. Shorter windows and other hazards show the 5% of forest with the highest risk, at one kilometre.</li>${v.prio ? `
        <li><b>Priorities.</b> The ${v.prio.top} blocks of ${v.prio.km} km where the most cells are expected to lose a hectare, ranked, with the list to download. In ${v.prio.y}, ${v.prio.hit}% of the blocks ranked highest lost at least 10 hectares, against ${v.prio.base}% of all forest blocks.</li>` : ""}${v.act ? `
        <li><b>Actions.</b> A model fitted on ${v.act.n} municipalities, six months at a time, relates clearing to IBAMA's notices and embargoes per km² cleared, and gives the clearing the same months imply had that answer stayed at each municipality's level of ${v.act.from} to ${v.act.to}. The gap to what was measured, ${v.act.km} km² since ${v.act.since}, is a floor and an association, since inspectors go where clearing is, and studies that correct for that find larger effects. The method is in <a href="${v.repo}/blob/HEAD/docs/POLICY.md">docs/POLICY.md</a> and the inputs in <a href="${v.repo}/blob/HEAD/docs/INPUTS.md">docs/INPUTS.md</a>.</li>` : ""}
      </ul>
      <h3>How sure</h3>
      <ul>
${v.rel ? `        <li><b>The chances are checked.</b> In ${v.rel.y}, cells given ${v.rel.said[0]}% lost a hectare ${v.rel.did[0]}% of the time, cells given ${v.rel.said[1]}% did ${v.rel.did[1]}% of the time, and cells given ${v.rel.said[2]}% did ${v.rel.did[2]}% of the time. ${v.rel.exp} cells were expected to lose a hectare and ${v.rel.act} did.</li>
` : ""}        <li><b>The yardstick for comparing models.</b> Forecasting each year from ${v.first} to ${v.last} blind, the 5% of forest ranked highest held ${v.cap}% of the clearing that followed. Repeating the year before held ${v.naive}%.</li>
        <li><b>How much is the weak part.</b> The yearly total missed by ${v.mape}% on average, against ${v.previsia}% for Imazon's PrevisIA as published.</li>
        <li><b>Shorter windows and other hazards.</b> Their maps were tested for place, on ${v.tmin} to ${v.tmax} past dates.</li>${v.mo ? `
        <li><b>Month by month.</b> On ${v.mo.origins} past forecast dates the total cleared over three months missed by ${v.mo.h3}% on average, against ${v.mo.n3}% for repeating the same months of the year before. Monthly figures are what INPE's DETER detects, and the yearly PRODES count is larger.</li>` : ""}
      </ul>
      <h3>What it cannot do</h3>
      <ul>
        <li>Say why a place is at risk. The signals are things the model reads, not causes.</li>
        <li>Give a range for a single sector, or see a change of policy coming.</li>
        <li>Forecast one municipality, Indigenous land or conservation unit month by month. Theirs is their share of the Amazon forecast.</li>
        <li>Say how much will burn. That depends on a drought that has not happened yet, so the site shows where fire tends to occur and what has burned.</li>
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
    hazard: { clear: "Desmatamento", fire: "Fogo", degr: "Degradação", mine: "Garimpo" }, scale: { years: "Anos", months: "Meses", actions: "Ações" },
    amazon: "Amazônia", about: "Sobre", close: "Fechar", copy: "Copiar", copied: "Copiado", views: { chart: "Linha do tempo", map: "Mapa", list: "Lista" },
    axisY: "km² desmatados por ano, de agosto a julho",
    chanceBy: y => `Chance de cada célula perder um hectare até julho de ${y}`, chanceFor: y => `Chance dada a cada célula para ${y}`, mapped: "desmatamento mapeado",
    onlyFrom: "Escolha um degrau para mostrar só as células com essa chance ou mais",
    stepLo: c => `abaixo de ${c}`, stepMid: (a, b) => `${a} a ${b}`, stepHi: c => `acima de ${c}`, under: c => `menos de ${c}`,
    cellFc: v => `${v.p} de chance de esta célula perder um hectare até julho de ${v.y}`,
    cellPast: v => `Em ${v.y} esta célula recebeu ${v.p}. ${v.clr ? "Houve desmatamento mapeado nela." : "Não houve desmatamento mapeado nela."}`,
    areaFc: v => (v.low ? `Cada célula aqui tem ${v.p} de chance de perder um hectare até julho de ${v.y}` : `Até ${v.p} de chance de uma célula aqui perder um hectare até julho de ${v.y}`),
    areaPast: v => `Em ${v.y} as células aqui receberam ${v.low ? "" : "até "}${v.p}. ${v.clr ? `Houve desmatamento mapeado em ${v.clr} de ${v.n}.` : "Não houve desmatamento mapeado."}`,
    pShare: v => `<b>${v.exp}</b> de ${v.cells} milhões de células de floresta devem perder um hectare`,
    pShareMin: v => `<b>${v.n}</b> células com ${v.cut} ou mais, com ${v.share}% da perda esperada`,
    pSharePastNo: v => `<b>${v.act}</b> células tiveram desmatamento mapeado`,
    pSharePastMin: v => `<b>${v.n}</b> células com ${v.cut} ou mais, com ${v.share}% das células com desmatamento mapeado`,
    pastP: v => `Em ${v.y}, esperava-se que ${v.exp} células perdessem um hectare e ${v.act} perderam`, prevYear: "Ano anterior", nextYear: "Ano seguinte",
    modes: { sectors: "Setores", cells: "Células", prio: "Prioridades" }, ranking: "Ranking", bars: "Barras", line: "Linha",
    prioSay: v => `Dos ${v.top} blocos de ${v.km} km no topo do ranking, ${v.hit}% perderam pelo menos 10 hectares em ${v.y}, contra ${v.base}% de todos os blocos de floresta.`,
    prioCols: ["células", "chance máxima"], prioColsTitle: v => `Células do bloco que devem perder um hectare até julho de ${v.y}, e a maior chance entre elas`,
    csv: "Baixar CSV", land: { ti: "terra indígena", uc: "unidade de conservação" },
    rankSay: v => `${v.kind} por ${v.what}`, rankWhat: { fc: y => `desmatamento esperado até julho de ${y}`, past: y => `desmatamento esperado para ${y}`, risk: "fatia do mapa de risco", fire: "fatia de onde o fogo costuma ocorrer" },
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
    past: v => `Em ${v.y}, ${v.act} km² desmatados`,
    partial: " Só cenas prioritárias, por enquanto.",
    pastHere: v => `Em ${v.y}, ${v.act} km² desmatados aqui`,
    pastHereNone: v => `Em ${v.y}, nenhum desmatamento mapeado aqui`,
    pastHereSub: v => `Fatia prevista de ${v.ps}%, fatia real de ${v.as}%.`,
    mfc: {
      clear: v => `Cerca de ${v.km} km² devem ser desmatados${v.here} nos próximos ${v.h} meses`,
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
    burned: { months: v => `${v.km} km² queimados${v.here} nos últimos três meses, ${v.prev} um ano antes`, years: v => `${v.km} km² queimados${v.here} nos últimos doze meses, ${v.prev} nos doze anteriores` },
    fireRank: v => `${v.rank} entre ${v.n} ${v.many} no mapa de onde o fogo costuma ocorrer.`,
    rankOnly: v => `${v.rank} entre ${v.n} ${v.many} no mapa de risco.`,
    deter: "Os valores mensais são o que o DETER, do INPE, detecta. A contagem anual do PRODES é maior.",
    axisM: { clear: "km² desmatados por mês", fire: "km² queimados por mês", degr: "km² degradados por mês", mine: "km² de garimpo por mês" },
    axisW: { fire: "km² queimados em 12 meses", degr: "km² degradados em 12 meses", mine: "km² de garimpo em 12 meses" },
    whole: "Amazônia inteira", to: (a, b) => `${a} a ${b}`,
    where: {
      degr: v => `Onde a floresta tem mais chance de ser degradada até ${v.end}`,
      mine: v => `Onde o garimpo tem mais chance de avançar até ${v.end}`,
    },
    whereHere: v => `${v.rank} entre ${v.n} ${v.many} em risco de ${v.risk} até ${v.end}`,
    risk: { degr: "degradação", mine: "garimpo" },
    lastSub: {
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
    legend: { clear: "Risco de desmatamento", fire: "Onde o fogo costuma ocorrer", degr: "Risco de degradação", mine: "Risco de garimpo" }, lower: "menor", higher: "maior", next: n => `próximos ${n} meses`,
    about_: x => `cerca de ${x} km²`, range: (lo, hi) => `provável de ${lo} a ${hi}`,
    tipFc: v => `cerca de ${v.exp} km² esperados`, tipPast: v => `${v.exp} km² esperados, ${v.act} desmatados`, tipRank: v => `${v.rank} entre ${v.n}`,
    act: {
      band: "Fiscalização", bandSub: v => `autos e embargos do IBAMA${v.n ? `, ${v.n} municípios` : ""}`,
      say: v => `A fiscalização responde por ${v.km} km² de desmate evitado${v.here} desde ${v.since}`,
      none: v => `A fiscalização não responde por desmate evitado aqui desde ${v.since}`,
      sub: v => `Cerca de ${v.part} da queda desde então. O resto caiu em toda parte ao mesmo tempo.`,
      subHere: v => `${v.pct}% a mais do que foi desmatado aqui. Sem faixa para um estado sozinho.`, noRange: "Sem faixa para um estado sozinho.",
      parts: ["um quarto", "um terço", "metade", "dois terços", "três quartos"],
      honest: v => `É um piso e uma associação, não prova de causa, porque o fiscal vai aonde o desmate está. ${v.own ? `Na Amazônia inteira, a parte da queda que não é atribuída a nada chega a ${v.rest}.` : `O restante, ${v.rest} da queda, não é atribuído a nada.`}`,
      statesOnly: " Só os estados têm número próprio.",
      axis: "km² desmatados por semestre", measured: "medido", held: v => `a mais, com a fiscalização de ${v.ref}`, ref: v => `média de ${v.from} a ${v.to}`,
      tipObs: v => `${v.span}, ${v.obs} km² desmatados`, tipHeld: v => `${v.held} com a fiscalização mantida${v.lo ? `, provável de ${v.lo} a ${v.hi}` : ""}`,
      signs: v => `Ações do IBAMA, ano até ${v.now} contra o ano até ${v.ref}`, against: x => `contra ${x}`,
      sign: { notices: "Autos por 100 km²", remote: "Embargos remotos", field: "Embargos em campo", collective: "Embargos coletivos" },
      signTitle: { notices: "Autos de infração por 100 km² de desmatamento", remote: "Área embargada por satélite, sem visita", field: "Área embargada em visita a campo", collective: "Terras indígenas inteiras e outras áreas públicas embargadas de uma vez" },
    },
    credit: "Imagens: Esri, Maxar, Earthstar Geographics",
    aboutHtml: v => `
      <h2>O sinal antes do acontecimento</h2>
      <p>O Prenúncio é um alerta antecipado para a Amazônia brasileira. Ele prevê onde a floresta vai ser desmatada, queimada, degradada ou minerada a seguir e mostra quanta pressão existe agora.</p>
      <h3>O que ele mostra</h3>
      <ul>
        <li><b>O nível.</b> Calmo, Atenção, Alerta ou Alarme. Ele é contado a partir dos últimos três meses daquele risco contra um ano antes, de um El Niño forte para a Amazônia inteira e da posição do setor na previsão. A faixa vermelha segue o nível.</li>
        <li><b>A linha do tempo.</b> Por ano, o desmatamento com a previsão no fim, e qualquer ano desde ${v.first} pode ser revisto. Por mês, o que foi desmatado e o que o modelo espera para cada mês à frente, com a faixa.</li>
        <li><b>O mapa.</b> Verde é floresta, vermelho é desmatamento. Por setor ou por célula. Nas células, cada célula de floresta de 500 metros tem a sua própria chance de perder pelo menos um hectare no ano, e a legenda filtra pela chance mínima. De longe, um bloco assume o degrau que um quinto das suas células alcança. As janelas curtas e os outros riscos mostram os 5% de floresta de maior risco, a um quilômetro.</li>${v.prio ? `
        <li><b>Prioridades.</b> Os ${v.prio.top} blocos de ${v.prio.km} km onde mais células devem perder um hectare, em ordem, com a lista para baixar. Em ${v.prio.y}, ${v.prio.hit}% dos blocos no topo perderam pelo menos 10 hectares, contra ${v.prio.base}% de todos os blocos de floresta.</li>` : ""}${v.act ? `
        <li><b>Ações.</b> Um modelo ajustado em ${v.act.n} municípios, semestre a semestre, relaciona o desmatamento aos autos e embargos do IBAMA por km² desmatado e dá quanto desmatamento os mesmos meses implicam se essa resposta tivesse ficado no nível que cada município tinha de ${v.act.from} a ${v.act.to}. A diferença para o medido, ${v.act.km} km² desde ${v.act.since}, é um piso e uma associação, porque o fiscal vai aonde o desmate está, e os estudos que corrigem isso encontram efeitos maiores. O método está em <a href="${v.repo}/blob/HEAD/docs/POLICY.md">docs/POLICY.md</a> e as fontes em <a href="${v.repo}/blob/HEAD/docs/INPUTS.md">docs/INPUTS.md</a>.</li>` : ""}
      </ul>
      <h3>Quão certo</h3>
      <ul>
${v.rel ? `        <li><b>As chances são conferidas.</b> Em ${v.rel.y}, as células com ${v.rel.said[0]}% perderam um hectare em ${v.rel.did[0]}% dos casos, as com ${v.rel.said[1]}% em ${v.rel.did[1]}%, e as com ${v.rel.said[2]}% em ${v.rel.did[2]}%. Esperava-se que ${v.rel.exp} células perdessem um hectare, e ${v.rel.act} perderam.</li>
` : ""}        <li><b>A régua para comparar modelos.</b> Prevendo cada ano de ${v.first} a ${v.last} às cegas, os 5% de floresta no topo do ranking concentraram ${v.cap}% do desmatamento que veio depois. Repetir o ano anterior concentrou ${v.naive}%.</li>
        <li><b>Quanto é a parte fraca.</b> O total anual errou ${v.mape}% em média, contra ${v.previsia}% do PrevisIA, do Imazon, como publicado.</li>
        <li><b>Janelas curtas e outros riscos.</b> Os mapas foram testados quanto ao lugar, em ${v.tmin} a ${v.tmax} datas passadas.</li>${v.mo ? `
        <li><b>Mês a mês.</b> Em ${v.mo.origins} datas de previsão passadas, o total desmatado em três meses errou ${v.mo.h3}% em média, contra ${v.mo.n3}% de repetir os mesmos meses do ano anterior. Os valores mensais são o que o DETER, do INPE, detecta, e a contagem anual do PRODES é maior.</li>` : ""}
      </ul>
      <h3>O que ele não faz</h3>
      <ul>
        <li>Dizer por que um lugar está em risco. Os sinais são coisas que o modelo lê, não causas.</li>
        <li>Dar uma faixa para um setor sozinho, nem ver chegar uma mudança de política.</li>
        <li>Prever mês a mês um município, uma terra indígena ou uma unidade de conservação. A previsão deles é a fatia que têm na previsão da Amazônia.</li>
        <li>Dizer quanto vai queimar. Isso depende de uma seca que ainda não aconteceu, então o site mostra onde o fogo costuma ocorrer e o que já queimou.</li>
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

const [M, R, MO, P, ACT] = await Promise.all(["meta", "regions", "monthly", "prob", "actions"].map(f => fetch(`data/${f}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)));  // monthly.json, prob.json and actions.json may not be there yet
M.layers ||= {};
if (Math.abs(R.total_km2 / M.forecast.total_km2 - 1) > 1e-6) console.warn("Sector numbers are older than the forecast, run pipeline/regions.py");
const PARTIAL = 2026;  // the year whose outcome is INPE's priority scenes only, until the full map is out
const REPO = "https://github.com/gdavidss/prenuncio";  // the public code and benchmark, linked from About

// ---------- hazards. Each has a forecast layer in meta.json, a monthly DETER series, a hue and a glyph, so it
// can be told apart by shape as well as colour. Clearing is red and also has the yearly forecast. The steps are
// the four map colours above standing forest, which stays green: they climb from near the forest to the
// hazard's most vivid tone, so on the green map brighter is more.
const FOREST = [11, 107, 58], DARK = [20, 20, 20];  // standing forest, and clearing mapped in a replayed year
const HAZ = {
  clear: { series: "clear", glyph: "M1 1h10v6l-4 4H1z", steps: [[74, 140, 62], [178, 198, 62], [247, 158, 30], [228, 0, 43]] },
  fire: { layer: "scar12", series: "scar", glyph: "M6 .5C8 3 10.6 5 10.6 7.7A4.6 4 0 0 1 1.4 7.7C1.4 6 2.6 5 3.4 3.6C3.9 5 4.5 5.5 5.2 5.5C5 3.7 5.3 2 6 .5z", steps: [[112, 128, 48], [176, 146, 30], [236, 170, 8], [255, 214, 46]] },
  degr: { layer: "degr12", series: "degr", glyph: "M1 1.5h10v2.2H1zM1 4.9h10v2.2H1zM1 8.3h10v2.2H1z", steps: [[36, 112, 124], [40, 118, 180], [56, 136, 236], [140, 196, 255]] },
  mine: { layer: "mine12", series: "mine", glyph: "M6 .5L11.5 6L6 11.5L.5 6z", steps: [[92, 92, 128], [132, 70, 172], [176, 58, 214], [236, 140, 255]] },
};
const hazards = () => Object.keys(HAZ).filter(k => k === "clear" || M.layers[HAZ[k].layer]);  // only the ones that have a layer
const glyph = k => `<svg class="glyph" viewBox="0 0 12 12" style="--c:var(--${k})" aria-hidden="true"><path d="${HAZ[k].glyph}"/></svg>`;

// hazard: one of the above. scale: years, months, or actions (what enforcement accounts for, clearing only).
// h: months ahead, in the monthly clearing view.
const S = { year: M.forecast.year, hazard: "clear", scale: "years", h: 3, mode: "sectors", kind: "mun", sel: null, min: 0, block: null, rank: false, line: false };
// mode: what the map shows (sectors, cells, or the priority blocks over the cells). min: the lowest chance step shown.
// block: the priority block selected. rank: the sector ranking is open. line: the timeline as a line instead of bars.
const cellsOn = () => S.mode !== "sectors";  // the priority list sits on top of the cells
if (M.years[H.get("y")]) S.year = +H.get("y");
S.hazard = hazards().find(k => HAZ[k].layer && HAZ[k].layer === H.get("k")) || "clear";
if (/^clear[36]$/.test(H.get("k") || "")) { S.scale = "months"; S.h = +H.get("k").slice(5); }
if (["months", "actions"].includes(H.get("t"))) S.scale = H.get("t");
if (["cells", "prio"].includes(H.get("m"))) S.mode = H.get("m");
if (H.get("b") > 0) S.block = +H.get("b");
S.rank = H.get("g") === "1"; S.line = H.get("c") === "line";
if (H.get("p") > 0 && H.get("p") < 5) S.min = +H.get("p");
if (T.en.kinds[H.get("s")]) S.kind = H.get("s");
if (H.get("r")) S.sel = H.get("r");
// which forecast map is on screen: a PRODES year, or one of the shorter layers
const key = () => (S.hazard !== "clear" ? HAZ[S.hazard].layer : S.scale === "months" ? "clear" + S.h : S.year);
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
    since: month(ymOf(rows[0].start)[0], ymOf(rows[0].start)[1] - 1), from: month(a[0], a[1] - 1), to: month(b[0], b[1] - 1), years: t().to(a[0], b[0]) };
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
let view = H.get("m") === "cells" || H.get("r") || H.get("v") || H.get("b") ? "map" : "chart";  // on a phone, which of the two is on screen
const mapOn = () => !narrow() || view === "map";
const listOn = () => S.mode === "prio" || (S.mode === "sectors" && S.rank);  // the ranked list takes the timeline's place in the column
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
    const WATER = [156, 196, 212], NATURAL = [216, 214, 184], CLEARED = [236, 229, 210];
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
  const color = new Uint32Array(M.cols * M.rows), tell = new Uint8Array(M.cols * M.rows), clr = past ? new Uint8Array(M.cols * M.rows) : null;  // tell: which cell wins in a block
  for (let i = 0; i < color.length; i++) {
    const R_ = d[4 * i], cleared = past && d[4 * i + 1] >= CLEARED_CODE;
    color[i] = cleared ? MAPPED : lut[R_];
    if (cleared) clr[i] = 1; else if (color[i]) tell[i] = Math.min(255, R_);
  }
  const levels = [{ f: 1, cols: M.cols, rows: M.rows, color, tell, clr }];
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
// stays green and red is rare.
const PCUT = [0.001, 0.01, 0.05, 0.2];  // the steps of the legend: under 0.1%, to 1%, to 5%, to 20%, over
const PCLS = Uint8Array.from({ length: 256 }, (_, v) => PCUT.filter(c => (v / 255) ** 2 >= c).length);
const FAR_PART = 0.2;
async function decodeProb(urlP, urlF, cols, rows, cuts, part) {
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
  const far = [2, 6, 12, 24].map(f => {
    const c = Math.ceil(cols / f), r = Math.ceil(rows / f), A = f > 12 ? Uint16Array : Uint8Array;
    return { f, cols: c, rows: r, at: Int32Array.from({ length: cols }, (_, x) => (x / f) | 0), cnt: new A(c * r), ge: [0, 1, 2, 3].map(() => new A(c * r)), nclr: bits && new A(c * r) };
  });
  for (let r = 0; r < rows; r++) {
    const off = far.map(l => ((r / l.f) | 0) * l.cols);
    for (let c = 0, o = r * cols; c < cols; c++) {
      const v = val[o + c];
      if (!v) continue;
      const k = cls[v], cl = bits ? (bits[(o + c) >> 3] >> ((o + c) & 7)) & 1 : 0;
      stats.n[k]++; stats.sum[k] += sq[v];
      if (cl) stats.clr[k]++;
      for (let n = 0; n < 4; n++) {
        const l = far[n], i = off[n] + l.at[c];
        l.cnt[i]++;
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
    return { f: l.f, cols: l.cols, rows: l.rows, k, clr };
  })];
  return { levels, stats };
}
function loadProb(y, F, withTruth) {
  const url = f => new URL(`data/${f}${y}.png`, location.href).href, args = [url("p"), withTruth ? url("f") : null, F.cols, F.rows, PCUT, FAR_PART];
  return new Promise(done => {
    let w;
    const here = () => { if (w) w.terminate(); done(decodeProb(...args)); };  // no worker, or no canvas inside one: decode here
    try {
      w = new Worker(URL.createObjectURL(new Blob([`onmessage = async e => { try { const g = await (${decodeProb})(...e.data); postMessage(g, g.levels.flatMap(l => [l.val, l.bits, l.k, l.clr].filter(Boolean).map(a => a.buffer))); } catch (err) { postMessage(null); } };`], { type: "text/javascript" })));
      w.onmessage = e => { if (e.data) { w.terminate(); done(e.data); } else here(); };
      w.onerror = here;
      w.postMessage(args);
    } catch (err) { here(); }
  });
}
// which years have a p file: asked once per year, without downloading it
const probs = {};
const hasProb = y => (probs[y] ??= M.years[y]?.flags500 ? fetch(`data/p${y}.png`, { method: "HEAD" }).then(r => r.ok).catch(() => false) : Promise.resolve(false));
// the five steps: forest under 0.1% is left as the base map shows it, green; then clearing's four steps, up to red
const PRGB = HAZ.clear.steps, PCOL = [0, ...PRGB.map(c => rgba(...c, 1))], PCSS = [FOREST, ...PRGB].map(c => `rgb(${c})`);
const pct = c => fmt(100 * c, c < 0.01 ? 1 : 0) + "%";
const chanceText = ch => (ch < PCUT[0] ? t().under(pct(PCUT[0])) : pct(ch));

let grid = null;  // what the cells layer draws: { key, cell, levels }. One layer at a time (a 500 m one is 45 MB).
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
    if (!grid || !cellsOn() || grid.key !== key() || !size.x || !size.y) { delete cv.dataset.key; return; }
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
  // green base map; cells where clearing was mapped are dark, on top. A far block shows the step a fifth of its
  // cells reach; when a minimum is chosen it is kept, fainter, if any of its cells reaches it; and it darkens
  // with the share of it that had clearing.
  _chances(lv, row, col, size, out) {
    const min = S.min, faint = PCOL.map(c => c && ((c & 0xffffff) | (120 << 24)) >>> 0);
    const dark = (k, a) => (k ? rgba(...PRGB[k - 1].map((c, n) => c + (DARK[n] - c) * a | 0), 1) : rgba(...DARK, a));  // clearing over a step, or over the base map
    for (let y = 0, i = 0; y < size.y; y++) {
      if (row[y] < 0) { i += size.x; continue; }
      for (let x = 0, o = row[y] * lv.cols; x < size.x; x++, i++) {
        const c = col[x], j = o + c;
        if (c < 0) continue;
        if (lv.val) {
          const v = lv.val[j];
          if (!v) continue;
          if (lv.bits && (lv.bits[j >> 3] >> (j & 7)) & 1) out[i] = MAPPED;
          else { const k = PCLS[v]; if (k && k >= min) out[i] = PCOL[k]; }
        } else if (lv.k[j]) {
          const k = (lv.k[j] & 15) - 1, on = k && k >= min;
          if (lv.clr && lv.clr[j]) out[i] = dark(on ? k : 0, Math.min(1, 0.1 + 1.8 * Math.sqrt(lv.clr[j] / 255)));
          else if (on) out[i] = PCOL[k];
          else if (min && (lv.k[j] >> 4) >= min) out[i] = faint[min];
        }
      }
    }
  },
});
const gridLayer = new GridLayer({ pane: "paint", padding: 0.2 }).addTo(map);
async function paint() {
  const y = key(), I = info(), F = I.flags500;
  if (!cellsOn() || grid?.key === y) return zoomed();
  const g = S.hazard === "clear" && typeof y === "number" && await hasProb(y)
    ? { key: y, prob: true, cell: F.cell, ...await loadProb(y, F, I.actual_km2 != null) }
    : { key: y, cell: M.cell, levels: await kmLevels(y, I) };
  if (y !== key() || !cellsOn()) return;
  grid = g;
  zoomed();
  legend();
}
// the line that stands outside the legend box: how many cells, for the chances on screen
function shareLine() {
  const L_ = t(), n3 = x => fmt(round(Math.max(1, x), 3)), st = grid?.stats, Y = P?.years?.[grid?.key], past = !!st?.clr;
  // (a replayed year whose chances were checked already has its count in the headline, or is about a sector)
  const on = cellsOn() && grid?.prob && grid.key === key() && (S.min || !(past && Y));
  $("share").hidden = !on;
  if (!on) return;
  const from = a => a.slice(S.min).reduce((x, v) => x + v, 0), all = a => a.reduce((x, v) => x + v, 0);
  $("share").innerHTML = S.min
    ? (past ? L_.pSharePastMin : L_.pShareMin)({ n: n3(from(st.n)), cut: pct(PCUT[S.min - 1]), share: fmt(100 * (past ? from(st.clr) / all(st.clr) : from(st.sum) / all(st.sum))) })
    : past ? L_.pSharePastNo({ act: n3(all(st.clr)) })
    : L_.pShare({ exp: n3(all(st.sum)), cells: fmt(all(st.n) / 1e6, 1) });
}
// what a cell says when the pointer or a finger is on it. Close up it is the cell; from far it is the block on
// screen: the highest chance among its cells and, in a replay, how many of them had clearing.
const cellTip = L.tooltip({ className: "tip cell", direction: "top", offset: [0, -8], opacity: 1 });
function cellSay(e) {
  const on = cellsOn() && grid?.prob && grid.key === key() && gridLayer._container.dataset.key, l0 = on && grid.levels[0], f = +gridLayer._container.dataset.f || 1;
  const r = on ? Math.floor((M.north - e.latlng.lat) / grid.cell) : -1, c = on ? Math.floor((e.latlng.lng - M.west) / grid.cell) : -1;
  if (r < 0 || c < 0 || r >= l0.rows || c >= l0.cols) return map.closeTooltip(cellTip);
  let v = 0, n = 0, clr = 0;
  for (let y = r - r % f; y < Math.min(l0.rows, r - r % f + f); y++) for (let x = c - c % f, j = y * l0.cols + x; x < Math.min(l0.cols, c - c % f + f); x++, j++) {
    if (!l0.val[j]) continue;
    n++;
    if (l0.val[j] > v) v = l0.val[j];
    if (l0.bits && (l0.bits[j >> 3] >> (j & 7)) & 1) clr++;
  }
  if (!v) return map.closeTooltip(cellTip);
  const ch = (v / 255) ** 2, o = { y: grid.key, p: chanceText(ch), low: ch < PCUT[0], clr: f === 1 ? clr : clr && fmt(clr), n: fmt(n) };
  const text = (f === 1 ? (l0.bits ? t().cellPast : t().cellFc) : l0.bits ? t().areaPast : t().areaFc)(o);
  cellTip.setLatLng(e.latlng).setContent(text[0].toUpperCase() + text.slice(1));
  map.openTooltip(cellTip);
}
map.on("mousemove click", cellSay);
map.on("mouseout", () => map.closeTooltip(cellTip));
function zoomed() {
  const z = map.getZoom();
  gridLayer._container.style.opacity = z < SAT_ZOOM ? 1 : 0.7;  // over imagery, let the ground show through
  gridLayer._update();
  if (base) { base.setOpacity(z >= SAT_ZOOM ? 0 : 1); base.getElement().classList.toggle("crisp", z >= 9); }
  z < 7 ? names.addTo(map) : names.remove();
  $("credit").hidden = z < SAT_ZOOM;
}
map.on("zoomend", zoomed);

// ---------- sectors on the map: five classes of forecast risk per area. The lowest is left as the base map
// shows it, green where there is forest; the others take the hazard's four steps, up to red for clearing. ----------
let shown = null, outline = null, cuts = [];
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const density = it => expOf(it) / it.a;
const classOf = it => { const d = density(it); let c = 0; while (c < cuts.length && d >= cuts[c]) c++; return c; };
function styleOf(it) {
  const c = classOf(it), close = map.getZoom() >= SAT_ZOOM, thin = shown === "mun";
  return { fillColor: `rgb(${steps()[Math.max(0, c - 1)]})`, fillOpacity: c ? (close ? 0.5 : 1) : 0, color: INK, opacity: thin ? 0.3 : 0.6, weight: thin ? 0.5 : 0.8 };
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
  const it = S.sel != null ? K.byId.get(S.sel) : null, here = it ? L_.here : "";
  const v = { y, here, many: L_.many[S.kind], n: K?.items.length };
  if (it) v.rank = L_.rank(rankOf(it, K));
  let head, sub = "", hint = yearly ? L_.hintY({ first: R.hyears[0] }) : S.scale === "months" && hz === "clear" ? L_.deter : "";
  const D = acting() ? actsOf(it) : null;
  if (D) {
    // what enforcement accounts for, and in the same breath what it does not
    const o = { km: approx(D.avoided), here: D.own ? L_.here : "", since: D.since };
    head = D.avoided < 0.5 ? L_.act.none(o) : L_.act.say(o);
    sub = !D.own ? L_.act.sub({ part: partOf(ACT.summary.fall_accounted_share) }) : D.avoided < 0.5 ? L_.act.noRange : L_.act.subHere({ pct: fmt(100 * D.over) });
    hint = L_.act.honest({ own: D.own, rest: partOf(1 - ACT.summary.fall_accounted_share) }) + (it && !D.own ? L_.act.statesOnly : "");
  } else if (hz === "fire") {
    // fire: what burned against a year before. Three months by month; by year, the last twelve months against
    // the twelve before, the same windows the timeline draws.
    const mo = monthsOf(it), a = (it ? it.L[k] : R.amazon.L[k]) || [], sum3 = from => mo.obs(from) + mo.obs(from + 1) + mo.obs(from + 2);
    const [now, prev] = S.scale === "months" ? [sum3(0), sum3(12)] : [a.at(-1) ?? 0, a.at(-2) ?? 0];
    head = L_.burned[S.scale]({ km: km(now), prev: km(prev), here });
    if (it) sub = L_.fireRank(v);
  } else if (S.scale === "months" || hz !== "clear") {
    // what the model expects over the months ahead; where there is no monthly forecast, what was measured
    const mo = monthsOf(it), sum = ahead(mo, I.months);
    if (sum && (sum.km >= 0.05 || !it)) {
      head = L_.mfc[hz]({ km: approx(sum.km), here, h: I.months });
      sub = mo.scaled ? L_.scaledSub(v) : sum.lo == null ? "" : L_.fcSub({ lo: approx(sum.lo), hi: approx(sum.hi) });
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
    const Y = P?.years?.[y], n3 = x => fmt(round(x, 3));
    // how the forecast did: cells expected to lose a hectare against cells that did, where the chances were
    // checked for that year; otherwise what was cleared
    if (!it && Y) head = L_.pastP({ y, exp: n3(Y.expected_cells), act: n3(Y.actual_cells) });
    else if (!it) head = L_.past({ y, act: fmt(act) });
    else {
      head = act < 0.05 ? L_.pastHereNone(v) : L_.pastHere({ y, act: km(act) });
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
  // the level sets how much red there is. A replayed year has none: the alarm is about now. Nor has the actions
  // view, which looks back and whose news is good.
  const A = past || D ? null : alarm(it, K), l = A ? A.l : "r", named = D && !D.own ? null : it;
  document.documentElement.dataset.level = $("lead").dataset.l = l;
  $("level").innerHTML = (A ? `<span class="meter" aria-hidden="true">${[1, 2, 3].map(n => `<i${n <= A.l ? ' class="on"' : ""}></i>`).join("")}</span>` : "")
    + `<b>${A ? L_.level[A.l] : D ? L_.act.band : L_.replay}</b><span>${A ? A.why.join(", ") : D ? L_.act.bandSub({ n: D.own ? 0 : fmt(ACT.municipalities) }) : L_.made(y)}</span>`;
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
  const what = `<span class="what">${glyph(hz)}${prob ? (past ? L_.chanceFor(k) : L_.chanceBy(k)) : L_.legend[hz] + (yearly || hz === "fire" ? "" : ", " + L_.next(I.months))}</span>`;
  const label = n => (n === 0 ? L_.stepLo(pct(PCUT[0])) : n === 4 ? L_.stepHi(pct(PCUT[3])) : L_.stepMid(fmt(100 * PCUT[n - 1], PCUT[n - 1] < 0.01 ? 1 : 0), pct(PCUT[n])));
  $("legend").innerHTML = what + (prob
    ? `<span class="steps" role="group" title="${L_.onlyFrom}" aria-label="${L_.onlyFrom}">${PCSS.map((c, n) => `<button data-min="${n}" aria-pressed="${n >= S.min}" style="--c:${c}">${label(n)}</button>`).join("")}${mapped}</span>`
    : `<span>${L_.lower}<span class="ramp">${[FOREST, ...steps()].map(c => `<i style="--c:rgb(${c})"></i>`).join("")}</span>${L_.higher}</span>` + mapped);
  $("legend").classList.toggle("prob", !!prob);
  shareLine();
}
$("legend").onclick = e => { const b = e.target.closest("[data-min]"); if (b) { S.min = +b.dataset.min === S.min ? 0 : +b.dataset.min; refresh(); } };
$("scope").onclick = e => { if (e.target.closest("button")) { select(null); if (mapOn()) { pristine = true; whole(!calm()); } } };

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
  const item = (k, v, x, x0, unit) => `<div data-k="${k}" title="${L_.signTitle[k]}">${trace(v, false, 2)}<span>${L_.sign[k]}</span><b>${fmt(x)}${unit}</b><span>${L_.against(fmt(x0))}</span></div>`;
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
        : f ? { key: s, d, v: f.p50, fc: true, range: f.p10 == null || -n > I.months ? null : [f.p10, f.p90], dim: -n > I.months, sub } : { key: s, d, v: null, sub };
    }).slice(0, mo.fc || S.hazard !== "fire" ? 36 : 24);  // fire has no months ahead
  }
  if (S.hazard !== "clear") {
    const vals = (it ? it.L[k] : R.amazon.L[k]) || [], sum = ahead(monthsOf(it), I.months);
    const span = w => { const [y, m_] = w.split("-").map(Number); return t().to(month(y, m_ - 1), month(y, m_ - 2 + I.months)); };
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
  const el = $("chart"), W = el.clientWidth, H = el.clientHeight, L_ = t().act, D = actsOf(it), rows = D.rows, ref = D.own ? null : ACT.reference_km2;
  const gut = 42, top = 58, pw = W - gut, pitch = pw / rows.length, tight = pitch < 50, bot = tight ? 36 : 22, ph = H - top - bot, bw = Math.max(3, pitch * 0.56);  // tight: the year goes under the month
  const peak = r => Math.max(r.observed, r.held, r.held_hi ?? 0), max = Math.max(D.own ? 0.5 : 1, ref ?? 0, ...rows.map(peak)) * 1.06;
  const Y = v => top + ph - ph * Math.min(v, max) / max, X = i => gut + i * pitch, mid = i => X(i) + pitch / 2, y0 = Y(0), [tk, dec] = ticks(max / 1.06);
  const span = r => { const [y, m_] = ymOf(r.start), o = { month: "short", year: "numeric" }; return t().to(month(y, m_ - 1, o), month(y, m_ + 4, o)); };
  const label = r => { const [y, m_] = ymOf(r.start); return [month(y, m_ - 1, { month: "short" }).replace(".", ""), String(y).slice(-2)]; };
  let s = `<svg class="acts" width="${W}" height="${H}" role="img"><defs><pattern id="spared" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="s0" width="6" height="6"/><rect class="s1" width="3" height="6"/></pattern></defs><g class="grid">`;
  for (const v of tk) s += `<line x1="${gut}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${gut - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v, dec)}</text>`;
  // what the axis counts, and under it the two marks, named once
  s += `<text class="unit" x="0" y="13">${L_.axis}</text></g><g class="key"><rect class="plain" x="0" y="22" width="11" height="11"/><text x="17" y="32">${L_.measured}</text><g><rect x="0" y="22" width="11" height="11" fill="url(#spared)"/><text x="17" y="32">${L_.held({ ref: D.years })}</text></g></g>`;
  rows.forEach((r, i) => {
    const x = X(i) + (pitch - bw) / 2, cx = mid(i);
    s += `<g class="bar" data-i="${i}">`;
    if (!S.line) {
      s += `<rect class="plain observed" x="${x}" y="${Y(r.observed)}" width="${bw}" height="${y0 - Y(r.observed)}"/>`;
      if (r.held > r.observed) s += `<rect x="${x}" y="${Y(r.held)}" width="${bw}" height="${Y(r.observed) - Y(r.held)}" fill="url(#spared)"/>`;
      s += `<line class="held" x1="${x}" x2="${x + bw}" y1="${Y(r.held)}" y2="${Y(r.held)}"/>`;
    }
    if (r.held_lo != null) s += `<path class="rng" fill="none" d="M${cx} ${Y(r.held_lo)}V${Y(r.held_hi)}M${cx - 4} ${Y(r.held_lo)}h8M${cx - 4} ${Y(r.held_hi)}h8"/>`;
    s += (tight ? label(r).map((x, n) => `<text x="${cx}" y="${y0 + 15 + 15 * n}">${x}</text>`).join("") : `<text x="${cx}" y="${H - 5}">${label(r).join(" ")}</text>`) + `<rect class="hot" x="${X(i)}" y="${top}" width="${pitch}" height="${H - top}"/></g>`;
  });
  if (S.line) {
    const at = (i, k) => `${mid(i).toFixed(1)} ${Y(rows[i][k]).toFixed(1)}`, path = k => rows.map((r, i) => (i ? "L" : "M") + at(i, k)).join("");
    s += `<g class="line" pointer-events="none"><path class="gap" d="${path("held")}${rows.map((r, i) => "L" + at(rows.length - 1 - i, "observed")).join("")}Z"/><path class="obs" d="${path("observed")}"/><path class="fcl" d="${path("held")}"/>`
      + rows.map((r, i) => `<circle class="dot observed" r="2.6" cx="${mid(i)}" cy="${Y(r.observed)}"/><circle class="fdot held" r="3.4" cx="${mid(i)}" cy="${Y(r.held)}"/>`).join("") + `</g>`;
  }
  if (ref != null) s += `<line class="refrule" x1="${gut}" x2="${W}" y1="${Y(ref)}" y2="${Y(ref)}"/><text class="note ref" x="${W}" y="${Y(ref) - 6}" text-anchor="end">${L_.ref(D)}</text>`;
  el.innerHTML = s + `<line class="axis" x1="${gut}" x2="${W}" y1="${y0}" y2="${y0}"/><g class="tip" pointer-events="none"><rect class="back"/><path/><text></text><text></text></g></svg>`;
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
    t2.textContent = L_.tipHeld({ held: n(r.held), lo: r.held_lo != null && n(r.held_lo), hi: r.held_hi != null && n(r.held_hi) });
    for (const [el_, dy] of [[t1, -27], [t2, -9]]) { el_.setAttribute("x", x); el_.setAttribute("y", up + dy); el_.setAttribute("text-anchor", anchor); }
    lead.setAttribute("d", Y(peak(r)) - up > 8 ? `M${cx} ${Y(peak(r)) - 3}V${up - 3}` : "");
    // the label lies over the reference rule and its caption, so it gets the ground behind it
    const b1 = t1.getBBox(), b2 = t2.getBBox(), bx = Math.min(b1.x, b2.x) - 5;
    for (const [k, v] of [["x", bx], ["y", b1.y - 2], ["width", Math.max(b1.x + b1.width, b2.x + b2.width) + 5 - bx], ["height", b2.y + b2.height + 3 - b1.y]]) back.setAttribute(k, v);
  };
  bars = []; pinned = -1;
  el.onpointermove = el.onpointerdown = e => tip(Math.floor((e.clientX - el.getBoundingClientRect().left - gut) / pitch));
  el.onpointerleave = () => tip(-1);
  el.onfocusin = null;
}
function chart(it = scope) {
  scope = it;
  const el = $("chart"), W = el.clientWidth, H = el.clientHeight, L_ = t();
  if (W < 60 || H < 60) return;
  if (acting()) return actsChart(it);
  bars = series(it);
  const monthsView = S.scale === "months", sector = !!it;
  const gut = 42, top = monthsView ? 40 : 46, bot = monthsView ? 34 : 22, pw = W - gut, ph = H - top - bot, pitch = pw / bars.length, bw = Math.max(3, pitch * (monthsView ? 0.62 : 0.72));
  // the scale fits the bars, with a little room above them. A range that runs past it is cut off at the top, open.
  const peak = b => Math.max(b.v ?? 0, b.range ? b.range[1] : 0);
  const tallest = Math.max(sector ? 0.5 : 1, ...bars.map(b => b.v ?? 0)), max = tallest * (bars.some(b => b.range && b.range[1] > tallest) ? 1.15 : 1);
  const Y = v => top + ph - ph * Math.min(v, max) / max, X = i => gut + i * pitch, y0 = Y(0);
  const [tk, dec] = ticks(max), skip = pitch < 18 ? 2 : 1, onAt = bars.findIndex(b => b.on);
  let s = `<svg width="${W}" height="${H}" role="img"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="h0" width="6" height="6"/><rect class="h1" width="3" height="6"/></pattern></defs><g class="grid">`;
  for (const v of tk) s += `<line x1="${gut}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${gut - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v, dec)}</text>`;
  // what the axis counts, written on it
  s += `<text class="unit" x="0" y="${monthsView ? top - 10 : 13}">${monthsView ? L_.axisM[S.hazard] : S.hazard === "clear" ? L_.axisY : L_.axisW[S.hazard]}</text></g>`;
  if (monthsView && bars.length > 24) {
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
    if (S.line && !b.win) { /* drawn below, as one line */ }
    else if (b.win) s += `<rect class="win" x="${X(i) + 1}" y="${top}" width="${pitch - 2}" height="${ph}"/><line class="winrule" x1="${X(i) + 1}" x2="${X(i) + pitch - 1}" y1="${top}" y2="${top}"/><text class="h on end" x="${X(i) + pitch}" y="${top - 10}">${L_.window}</text>`;
    else if (b.fc) {
      s += rect("fc", y0 - h, h, 'fill="url(#hatch)"');
      if (b.range) s += `<path class="rng" fill="none" d="M${cx} ${Y(b.range[0])}V${Y(b.range[1])}M${cx - 4} ${Y(b.range[0])}h8${b.range[1] <= max ? `M${cx - 4} ${Y(b.range[1])}h8` : ""}"/>`;
    } else if (b.on && b.v != null) s += rect("in", y0 - h, h);
    else if (b.v != null) s += rect("plain", y0 - h, h);
    if (monthsView) {
      s += `<text x="${cx}" y="${y0 + 15}"${pitch < 14 ? ' style="font-size:10px"' : ""}>${b.d.toLocaleDateString(loc(), { month: "narrow" })}</text>`;
      if (b.d.getMonth() === 0) s += `<text x="${cx}" y="${y0 + 30}">${b.d.getFullYear()}</text>`;
    } else if (skip === 1 || b.on || ((bars.length - 1 - i) % 2 === 0 && Math.abs(i - onAt) !== 1)) s += `<text x="${cx}" y="${H - 5}">${pitch < 40 ? String(b.label).slice(-2) : b.label}</text>`;  // four digits only where they fit
    s += `<rect class="hot" x="${X(i)}" y="${top - 12}" width="${pitch}" height="${H - top + 12}"/></g>`;
  });
  if (S.line) {
    // the same series as a line: measured values solid, the forecast dashed in the hazard's hue, its range a band
    const at = ([b, i], v = b.v) => `${(X(i) + pitch / 2).toFixed(1)} ${Y(v).toFixed(1)}`, path = a => a.map((p, n) => (n ? "L" : "M") + at(p)).join("");
    const all = bars.map((b, i) => [b, i]), obs = all.filter(([b]) => b.v != null && !b.fc), fcs = all.filter(([b]) => b.fc), band = fcs.filter(([b]) => b.range);
    s += `<g class="line" pointer-events="none">`;
    if (band.length > 1) s += `<path class="band" d="${band.map((p, n) => (n ? "L" : "M") + at(p, p[0].range[1])).join("")}${band.slice().reverse().map(p => "L" + at(p, p[0].range[0])).join("")}Z"/>`;
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
    const [t1, t2] = el.querySelectorAll(".tip text"), lead = el.querySelector(".tip path"), b = bars[i];
    if (!b || b.win || (b.v == null && !monthsView)) { t1.textContent = t2.textContent = ""; lead.setAttribute("d", ""); return; }
    const exact = x => `${sector || typeof key() !== "number" ? km(x) : fmt(x)} km²`;
    const lines = b.fc ? [(monthsView ? b.sub + ", " : "") + L_.about_(approx(b.v)), b.range ? L_.range(approx(b.range[0]), approx(b.range[1])) : ""]
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
  document.documentElement.dataset.scale = S.scale;
  document.documentElement.style.setProperty("--hue", `var(--${S.hazard})`);
  $("hazard").className = $("scale").className = $("kinds").className = "pick";
  $("modes").className = "seg";  // the mode is a switch of its own, apart from the list of sector kinds
  $("hazard").innerHTML = hazards().map(k => btn(k, glyph(k) + L_.hazard[k], k === S.hazard)).join("");
  $("scale").innerHTML = ["years", "months", ...(S.hazard === "clear" && ACT ? ["actions"] : [])].map(k => btn(k, L_.scale[k], k === S.scale)).join("");
  $("modes").innerHTML = ["sectors", "cells", ...(M.years[M.forecast.year]?.flags500 ? ["prio"] : [])].map(k => btn(k, L_.modes[k], k === S.mode)).join("");
  $("rank-btn").textContent = L_.ranking;
  $("rank-btn").setAttribute("aria-pressed", S.rank);
  $("rank-btn").hidden = S.mode !== "sectors";
  document.documentElement.dataset.list = listOn();
  // bars or a line: two small glyphs, no words
  $("shape").innerHTML = [["bars", "M1 12V6h3v6zM6 12V2h3v6zM11 12V8h3v4z"], ["line", "M1 11L5 5l4 3 5-6"]].map(([k, d]) => `<button data-k="${k}" aria-pressed="${(k === "line") === S.line}" aria-label="${L_[k]}" title="${L_[k]}"><svg viewBox="0 0 15 13" aria-hidden="true"><path d="${d}"/></svg></button>`).join("");
  $("kinds").innerHTML = Object.keys(L_.kinds).map(k => btn(k, L_.kinds[k], k === S.kind)).join("");
  $("kinds").hidden = S.mode !== "sectors";
  // on a phone: the timeline or the map, the window ahead as buttons, and a stepper for the replay years
  document.documentElement.dataset.view = view;
  $("views").className = $("ahead").className = "pick";
  $("views").innerHTML = ["chart", "map"].map(k => btn(k, k === "chart" && listOn() ? L_.views.list : L_.views[k], k === view)).join("");
  const hs = S.hazard === "clear" && S.scale === "months" ? [3, 6].filter(h => M.layers["clear" + h]) : [];
  $("ahead").innerHTML = hs.map(h => btn(h, L_.ahead(h), h === S.h)).join("");
  $("ahead").hidden = hs.length < 2;
  const ys = Object.keys(M.years).map(Number).sort(), at = ys.indexOf(S.year), [prev, , next] = $("step").children;
  $("step").hidden = typeof key() !== "number" || acting();
  $("step").children[1].textContent = S.year;
  prev.disabled = at <= 0; next.disabled = at >= ys.length - 1;
  prev.setAttribute("aria-label", L_.prevYear); next.setAttribute("aria-label", L_.nextYear);
  $("about-btn").textContent = L_.about;
  $("about-close").textContent = $("api-close").textContent = L_.close;
  $("api-copy").textContent = L_.copy;
  $("lang-btn").textContent = lang === "pt" ? "EN" : "PT";
  $("lang-btn").setAttribute("aria-label", lang === "pt" ? "English" : "Português");
  $("credit").textContent = L_.credit;
}
async function refresh() {
  if (!hazards().includes(S.hazard)) S.hazard = "clear";
  if (S.mode === "prio") { S.hazard = "clear"; S.scale = "years"; S.year = M.forecast.year; }  // the priority list is the yearly clearing forecast
  if (S.hazard === "clear" && S.scale === "months" && !M.layers["clear" + S.h]) S.scale = "years";
  if (acting() && (S.hazard !== "clear" || !ACT)) S.scale = "years";
  if (acting()) S.year = M.forecast.year;  // the actions view looks back on its own; the map stays on the forecast
  chrome();
  link();
  say();  // the bulletin and the timeline need only the two small JSON files, so they come first
  if (mapOn()) { startMap(); paint(); drawSectors(); }
  list();
}

// ---------- the ranked list, in the timeline's place: where to look first ----------
// Priorities: the 500 blocks of 5 km where the most cells are expected to lose a hectare (data/priority.json),
// drawn as outlines over the cells. Sectors: the same idea at a coarser scale, the sectors of the kind on screen
// ranked by the forecast.
let PRIO = null, blocks = null, blockSel = null, listed = "", flown = false;
const priority = () => (PRIO ||= fetch("data/priority.json").then(r => r.json()));
const blockBox = (PR, b) => { const h = PR.block_km * M.years[PR.year].flags500.cell; return [[b.lat - h, b.lon - h], [b.lat + h, b.lon + h]]; };  // 5 km is ten 500 m cells
const row = (attr, rank, name, vals, on) => `<li><button ${attr}${on ? ' aria-current="true"' : ""}><b>${rank}</b><span class="nm">${name}</span>${vals.map(x => `<span class="v">${x}</span>`).join("")}</button></li>`;
async function list() {
  const el = $("list"), L_ = t(), k = key();
  el.hidden = !listOn();
  if (blocks && S.mode !== "prio") blocks.remove();
  if (blockSel && (S.mode !== "prio" || !S.block)) { blockSel.remove(); blockSel = null; }
  if (!listOn()) return;
  if (S.mode === "prio") {
    const PR = await priority();
    if (S.mode !== "prio") return;
    // the blocks on the map: a white outline inside a dark one, which reads on forest green and on red alike
    blocks ||= L.layerGroup(PR.blocks.flatMap(b => [
      L.rectangle(blockBox(PR, b), { renderer: cvSectors, color: INK, weight: 3.4, opacity: 1, fill: false, interactive: false }),
      L.rectangle(blockBox(PR, b), { renderer: cvSectors, color: "#fff", weight: 1.4, opacity: 1, fillOpacity: 0 }).on("click", e => { L.DomEvent.stopPropagation(e); block(b.rank, false); })]));
    if (mapOn()) blocks.addTo(map);
    if (listed !== "prio" + lang) {
      const y0 = Object.keys(PR.replay)[0], r0 = PR.replay[y0];
      $("list-say").innerHTML = `${L_.prioSay({ top: PR.top, km: PR.block_km, y: y0, hit: fmt(100 * r0.lost_10ha), base: fmt(100 * r0.base_10ha, 1) })} <a href="data/priority.csv" download>${L_.csv}</a>`;
      $("list-key").innerHTML = `<span class="lk"><i class="land ti"></i>${L_.land.ti}<i class="land uc"></i>${L_.land.uc}</span>${L_.prioCols.map(c => `<span class="v" title="${L_.prioColsTitle({ y: PR.year })}">${c}</span>`).join("")}`;
      $("list-rows").innerHTML = PR.blocks.map(b => row(`data-b="${b.rank}"`, b.rank, `${esc(b.municipality)}, ${b.state}${b.land ? ` <i class="land ${b.land}" title="${L_.land[b.land]}"></i>` : ""}`, [fmt(b.expected_cells), pct(b.max_chance)])).join("");
      listed = "prio" + lang;
    }
    $("list-rows").className = "two";
    if (S.block) { block(S.block, !flown && !H.get("v"), false); flown = true; }  // a block in the link is brought into view once
  } else {
    const K = await sectors(S.kind), I = info(), yearly = typeof k === "number", past = isPast();
    if (!(S.mode === "sectors" && S.rank) || k !== key()) return;
    const top = [...K.items].sort((a, b) => expOf(b) - expOf(a)).slice(0, 100).filter(it => expOf(it) > 0);
    $("list-say").textContent = L_.rankSay({ kind: L_.kinds[S.kind], what: yearly ? (past ? L_.rankWhat.past(k) : L_.rankWhat.fc(k)) : S.hazard === "fire" ? L_.rankWhat.fire : L_.rankWhat.risk });
    $("list-key").innerHTML = "";
    $("list-rows").className = "";
    $("list-rows").innerHTML = top.map((it, n) => row(`data-id="${esc(it.id)}"`, n + 1, esc(it.n) + (it.s ? ", " + it.s : ""), [yearly ? `${approx(expOf(it))} km²` : `${share(100 * expOf(it) / I.risk_km2)}%`], String(it.id) === S.sel)).join("");
    listed = "";
  }
}
// choose a priority block: outline it, bring it into view, mark its row
async function block(rank, fly = true, write = true) {
  const PR = await priority(), b = PR.blocks.find(x => x.rank === rank);
  if (!b || S.mode !== "prio") return;
  S.block = rank;
  if (blockSel) blockSel.remove();
  const box = blockBox(PR, b);
  blockSel = L.featureGroup([L.rectangle(box, { renderer: svgSel, fill: false, color: INK, weight: 7, interactive: false }), L.rectangle(box, { renderer: svgSel, fill: false, color: GROUND, weight: 3, interactive: false })]).addTo(map);
  for (const el of $("list-rows").querySelectorAll("[aria-current]")) el.removeAttribute("aria-current");
  const el = $("list-rows").querySelector(`[data-b="${rank}"]`);
  if (el) { el.setAttribute("aria-current", "true"); if (!fly) el.scrollIntoView({ block: "nearest" }); }
  if (fly) { pristine = false; map.flyToBounds(L.latLngBounds(box).pad(3), { ...FIT(), maxZoom: 11, duration: calm() ? 0 : 0.6 }); }
  if (write) link();
}
$("list-rows").onclick = async e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (narrow()) { view = "map"; refresh(); await new Promise(r => setTimeout(r, 120)); }  // on a phone the row leads to the map
  if (b.dataset.b) block(+b.dataset.b);
  else if (b.dataset.id) select(b.dataset.id);
};
PHONE.addEventListener("change", refresh);
const pressed = (id, fn) => ($(id).onclick = e => { const b = e.target.closest("button"); if (b) fn(b.dataset.k); });
const leavePrio = () => { if (S.mode === "prio") S.mode = "cells"; };  // the priority list is only the yearly clearing forecast
pressed("hazard", k => { if (k !== "clear") leavePrio(); S.hazard = k; refresh(); });
pressed("scale", k => { if (k === "months") leavePrio(); S.scale = k; refresh(); });
pressed("modes", k => { S.mode = k; pristine = pristine || !S.block; refresh(); });
pressed("shape", k => { S.line = k === "line"; refresh(); });
$("rank-btn").onclick = () => { S.rank = !S.rank; refresh(); };
pressed("kinds", k => { if (k !== S.kind) { S.kind = k; select(null); } });
pressed("views", k => { view = k; refresh(); });
pressed("ahead", k => { S.h = +k; refresh(); });
$("step").onclick = e => {
  const b = e.target.closest("button"), ys = Object.keys(M.years).map(Number).sort();
  if (b && ys[ys.indexOf(S.year) + +b.dataset.d]) pick(ys[ys.indexOf(S.year) + +b.dataset.d]);
};
function pick(y) { if (y !== M.forecast.year) leavePrio(); S.year = y; refresh(); }
document.addEventListener("keydown", e => {
  if ($("about").open || $("api").open) return;
  if (e.key === "Escape" && S.sel != null) return select(null);
  if (typeof key() !== "number" || acting() || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const ys = Object.keys(M.years).map(Number).sort(), i = ys.indexOf(S.year) + (e.key === "ArrowLeft" ? -1 : 1);
  if (ys[i]) pick(ys[i]);
});
$("lang-btn").onclick = () => { lang = localStorage.lang = lang === "pt" ? "en" : "pt"; langInLink = true; refresh(); };

$("about-btn").onclick = async () => {
  const PR = M.years[M.forecast.year]?.flags500 ? await priority().catch(() => null) : null, py = PR && Object.keys(PR.replay)[0];
  const hy = R.hyears, mean = f => hy.reduce((s, y) => s + f(M.years[y]), 0) / hy.length, tests = Object.values(M.layers).map(l => l.tests);
  $("about-body").innerHTML = t().aboutHtml({
    first: hy[0], last: hy.at(-1), cap: fmt(100 * mean(cap5)), naive: fmt(100 * mean(naive5)),
    mape: fmt(100 * M.forecast.mape), previsia: fmt(100 * M.forecast.previsia_mape), tmin: Math.min(...tests), tmax: Math.max(...tests),
    partial: PARTIAL, repo: REPO,
    act: ACT && (D => ({ n: fmt(ACT.municipalities), from: D.from, to: D.to, since: D.since, km: fmt(ACT.summary.avoided) }))(actsOf(null)),
    prio: PR && { top: PR.top, km: PR.block_km, y: py, hit: fmt(100 * PR.replay[py].lost_10ha), base: fmt(100 * PR.replay[py].base_10ha, 1) },
    rel: (y => { const Y = P?.years?.[y], pick = lo => Y?.reliability.find(b => b[0] === lo), bins = [0.02, 0.1, 0.2].map(pick), one = x => fmt(100 * x, x < 0.2 ? 1 : 0);
      return Y && bins.every(Boolean) && { y, said: bins.map(b => one(b[2])), did: bins.map(b => one(b[3])), exp: fmt(Y.expected_cells), act: fmt(Y.actual_cells) }; })(Object.keys(P?.years || {})[0]),
    mo: (b => b && b.h3sum_mape != null && { origins: b.origins, h3: fmt(100 * b.h3sum_mape), n3: fmt(100 * b.naive_h3sum_mape) })(MO?.hazards?.clear?.backtest),
  });
  $("about").showModal();
  $("about").scrollTop = 0;
};
$("about-close").onclick = () => $("about").close();
$("about").onclick = e => { if (e.target === $("about")) $("about").close(); };
// the API panel: the instructions for agents, shown as the file has them (api/v1/llms.txt), fetched when opened
let apiText = null;
$("api-btn").onclick = async () => {
  $("api").showModal();
  apiText ??= await fetch("api/v1/llms.txt").then(r => (r.ok ? r.text() : null)).catch(() => null);
  $("api-text").textContent = apiText ?? "";
  $("api-text").scrollTop = 0;
};
$("api-copy").onclick = async () => {
  let ok = true;
  try { await navigator.clipboard.writeText(apiText ?? ""); }
  catch (err) { getSelection().selectAllChildren($("api-text")); ok = document.execCommand("copy"); }  // no clipboard access: select the text and copy that
  if (!ok) return;  // the text stays selected, ready to be copied by hand
  $("api-copy").textContent = t().copied;
  setTimeout(() => ($("api-copy").textContent = t().copy), 1600);
};
$("api-close").onclick = () => $("api").close();
$("api").onclick = e => { if (e.target === $("api")) $("api").close(); };

// shareable state (t=actions is the actions view): #y=2023&k=scar12&t=months&m=cells&s=ti&r=<sector id>&v=lat,lng,zoom&l=pt
// (k is the forecast layer when it is not a PRODES year: clear3 or clear6 for the months ahead of clearing,
// or another hazard's layer, such as scar12 for fire)
let leaving = false;
addEventListener("hashchange", e => { leaving = true; location.replace(e.newURL); location.reload(); });
function link() {
  if (leaving) return;
  const c = map.getCenter(), q = new URLSearchParams({ y: S.year });
  if (typeof key() !== "number") q.set("k", key());
  if ((S.hazard !== "clear" && S.scale === "months") || acting()) q.set("t", S.scale);
  if (S.mode !== "sectors") q.set("m", S.mode);
  if (S.mode === "prio" && S.block) q.set("b", S.block);
  if (S.mode === "sectors" && S.rank) q.set("g", 1);
  if (S.line) q.set("c", "line");
  if (S.min) q.set("p", S.min);
  if (S.kind !== "mun") q.set("s", S.kind);
  if (S.sel != null) q.set("r", S.sel);
  q.set("v", `${c.lat.toFixed(3)},${c.lng.toFixed(3)},${+map.getZoom().toFixed(2)}`);
  if (langInLink) q.set("l", lang);
  history.replaceState(null, "", "#" + q.toString().replaceAll("%2C", ","));
}
map.on("moveend", link);

if (S.sel != null) select(S.sel, !H.get("v")); else refresh();
if (H.has("about")) $("about-btn").click();
if (H.has("api")) $("api-btn").click();
