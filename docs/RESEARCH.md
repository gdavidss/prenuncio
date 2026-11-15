# Prenúncio research notes

Written 14 November 2026. This is the discovery behind the first model: what is known about forecasting Amazon deforestation, which variables matter, which forces push the rate up or down, what data exists, and what the first version does with it. Results of the first backtests are in `RESULTS.md`.

## The short version

Forecasting deforestation splits into two questions that behave very differently.

The first is where. Given that some amount of forest will be cleared next year, which square kilometres will it be? This question is very predictable, and almost all of the signal comes from one thing: where clearing happened recently. Every serious system in the literature agrees on this, and so do our own backtests.

The second is how much. Will the Legal Amazon lose 3,000 km² next year or 6,000? This question is hard, and it is where policy lives. The total moves with enforcement, credit rules, commodity prices, elections and drought. Models that extrapolate the trend fail exactly when the regime changes. Imazon's PrevisIA, the best known public forecast, overshot the official number every year from 2022 to 2026, by 14% to 65%.

So the design is two models. A map model allocates risk across the grid. A quantity model sets the total, and it is the quantity model that the legislative and enforcement variables have to drive.

## What existing work achieves

**Imazon PrevisIA** forecasts one PRODES year ahead on 1 km cells from past clearing, official and unofficial roads, rivers, terrain and protected areas. Its published hit rates are stated as the share of later clearing that fell within 4 km of a predicted risk area, between 68% and 80% depending on the year, with a weaker 2025. Totals were 15,391 km² forecast against 11,594 observed in 2022, then 11,805 against 9,064, 8,959 against 6,518, 6,531 against 5,731, and 5,501 against 3,335. No code is public and no naive baseline is reported. ([validation paper](https://imazon.org.br/wp-content/uploads/2024/10/galoa-proceedings-sbsr-2023-164739.pdf), [2024 summary](https://imazon.org.br/wp-content/uploads/2024/10/PrevisIA-2024-resumo.pdf))

**WWF Forest Foresight** predicts six months ahead at 400 m with gradient boosted trees over about 35 features, most of them derived from recent forest-loss alerts. On its June 2023 to May 2024 test in South America the F0.5 score was 61.7 for a deep network, 58.8 for boosted trees, and 56.3 for plain persistence. The naive baseline is only a few points behind the best model. The code and preprocessed data are open. ([paper](https://iopscience.iop.org/article/10.1088/2515-7620/ae1f69), [code](https://github.com/ForestForesight/ForestForesight))

**ForestCast**, from Google in late 2025, works at 30 m one year ahead with vision transformers. Its most useful finding for us is an ablation. Using the history of change as the only input reaches 0.66 correlation where the full model reaches 0.73. Satellite embeddings alone match the full model. Its weakest region is the Americas. ([preprint](https://eartharxiv.org/repository/view/10674/))

**INPE, IBAMA and PUC-Rio** run an operational system on 25 km cells with boosted trees, updated every two weeks, whose most important inputs are all lagged DETER alert areas. ([paper](https://isprs-annals.copernicus.org/articles/X-3-2024/193/2024/))

**Verra's VT0007 benchmark** for carbon projects uses nothing but distance to the forest edge, crossed with administrative units, then rescales to an externally supplied total. It is the standard "you must beat this" baseline. ([method](https://verra.org/documents/vt0007-unplanned-deforestation-allocation-v1-0/))

**The Dinamica EGO family** (SimAmazonia, OTIMIZAGRO, the IPAM and World Bank "Floresta em Risco" study) gets the total from a regional or macroeconomic model and then allocates it with cellular automata. The IPAM regression explains the annual total with last year's value, the real exchange rate, commodity prices and policy step dummies for 2004, 2009 and 2012. Its business-as-usual line still undershot 2022 by 32%. ([technical note](https://ipam.org.br/wp-content/uploads/2024/04/Nota-Tecnica_por_vale_24.04.pdf))

Three lessons carry over directly.

Recent nearby clearing dominates every ranking of predictors. Distance to the forest edge comes second, roads third (unofficial roads above all), tenure and protection fourth, season fifth. Terrain, population and climate add little to placement. Prices and enforcement move totals, not placement.

Deep learning has not been shown to beat boosted trees by much at this resolution. The measured gain is one to five points, and no study compares them head to head at 1 km and one year for the Brazilian Amazon. That makes boosted trees the right first model and makes a deep model an experiment to run once the evaluation harness exists, which it now does.

Validation has known traps. Splits must go forward in time. Features must stop at 31 July, because the PRODES year runs August to July. DETER dates are detection dates and clouds delay them. With fewer than 3% of cells positive, ROC curves saturate and say little, so the useful numbers are precision-recall area and the share of clearing captured at a fixed area budget. Any "share within X km of a predicted area" figure has to be read with care, because scattered flags cover more ground once buffered. Our own first run showed this: a naive map scored higher than the model on a 3 km buffer metric while being much worse at equal area.

## The parameters

Status is either **in** the current models or **next**.

| Family | Variable | Source | Status |
|---|---|---|---|
| Clearing history | Annual clearing per cell 2008 to 2025, forest remaining, cleared share, lags of one to five years | INPE PRODES 10 m raster | in |
| Clearing history | Neighbourhood density of recent and cumulative clearing at 3, 9, 25 and 75 km | derived | in |
| Clearing history | Distance to last year's clearing, to any clearing in three years, to the forest edge | derived | in |
| Clearing history | 2026 increments for INPE's priority scenes | INPE PRODES early release | in |
| Alerts | DETER clearing, degradation and selective logging, and fire scar alerts, trailing 12 and 3 months | INPE DETER-B, daily since Aug 2016 | in |
| Fine disturbance | Forest loss at 30 m by calendar year 2001 to 2025: small openings, logging roads, burned forest | Hansen Global Forest Change v1.13 | in |
| Fine disturbance | Sentinel-2 disturbance alerts at 10 m, trailing 12 and 3 months, from 2019 | GLAD-S2, University of Maryland | in |
| Fine disturbance | Year each 30 m pixel of moist forest was first disturbed, 1982 to 2025: selective logging, fire damage under the canopy, openings that close again | JRC Tropical Moist Forest v1 (Vancutsem et al. 2021), free download in 10 degree tiles | tested, +0.6 points in trees, going into both models |
| Satellite embeddings | 64 numbers per pixel per year from Sentinel-1/2 and Landsat, 2018 to 2025, averaged to 500 m | Google AlphaEarth Foundations, open on GCS and AWS (CC BY 4.0) | in |
| Fire | Reference-satellite fire detections, trailing 12 and 36 months, trend | INPE Queimadas, 2003 on | in |
| Tenure | Indigenous lands, conservation units by group and creation year, distance to protected land | INPE auxiliary layers (FUNAI, MMA) | in |
| Tenure | Undesignated public forests | SFB CNFP 2025 | next |
| Tenure | Rural property registry (CAR), settlements, private titles | SICAR WFS, INCRA | next |
| Enforcement | IBAMA embargoes in force nearby, new embargoes in 12 months | IBAMA open data | in |
| Enforcement | IBAMA flora infraction notices nearby, per municipality relative to clearing | IBAMA open data | in |
| Enforcement | Share of DETER alerts followed by an action, ICMBio notices, federal budget and headcount | derived, ICMBio WFS, Portal da Transparência | next |
| Administrative | State, municipality clearing rate and forest share | IBGE via INPE | in |
| Access | Rivers (distance to large water bodies) | PRODES hydrography | in |
| Access | Federal roads, unofficial roads | DNIT via INDE, Imazon | next |
| Climate | Oceanic Niño Index, tropical North Atlantic index | NOAA | in (short horizons and fire) |
| Climate | Monthly rainfall, vapour pressure deficit, water deficit | CHIRPS v3, TerraClimate | next |
| Economy | Cattle, soy and gold prices, exchange rate, rural credit by municipality | CEPEA, IMF, BCB SGS, BCB SICOR | next |
| Policy regime | Dated legal and political events (see below) | hand coded | next |
| Terrain | Slope, biomass, soil | Copernicus DEM, ESA CCI Biomass, SoilGrids | next, low priority |

Two cautions on inputs that look attractive.

OpenStreetMap roads are a snapshot of today. A road that exists in the 2026 extract may have been built after the clearing it appears to predict, so using it in a backtest leaks the future and inflates skill. Roads need dated sources (Imazon's unofficial road maps by year) or have to be left to the live forecast only.

Enforcement records are endogenous. IBAMA goes where clearing is, so embargoes and fines correlate positively with future clearing in a naive model. They help locate active frontiers, but their coefficient is not the effect of enforcement. Measuring that effect needs the designs the economics literature uses, described below.

## The forces

### Where things stand in November 2026

The official rate fell for four years: 9,064 km² in 2023, 6,518 in 2024, 5,731 in 2025, and an estimate of 3,335 for 2026, the lowest since measurement began in 1988. ([INPE 2025](https://www.gov.br/inpe/pt-br/assuntos/ultimas-noticias/sistema-do-inpe-aponta-5-731-km2-de-desmatamento-na-amazonia-em-2025), [2026 estimate](https://politicaporinteiro.org/2026/10/16/o-menor-desmatamento-da-amazonia/))

The new PRODES year has opened higher. DETER shows 1,084 km² for August to October 2026 against 876 km² a year earlier, up 24%, with October alone up 64%. Fire detections in the biome are up about 70% on 2025. A very strong El Niño is in place (the Oceanic Niño Index for August to October reads +2.46) and drought is expected in the Amazon in early 2027.

Lula was re-elected on 25 October 2026, so federal enforcement is expected to continue. The risk for 2027 onward sits in Congress and the states. The opposition bench grew, and the governors elected in Pará and Rondônia are aligned with it.

### IBAMA

There is no single restructuring decree. The word covers several threads that matter differently for a model.

Staffing has grown: the 2025 public exam filled 460 posts and another 135 followed, against a base of roughly 750 active enforcement agents. A pay and career package moved through Congress during 2026. Each of these raises capacity slowly.

The power that changed the numbers is the remote embargo. Decree 12.189 of 2024 created the preventive embargo, and IBAMA now embargoes areas from satellite evidence without a field visit. The remote route now accounts for about half of roughly 4,000 embargoes a year, at a small fraction of the cost per hectare of a field operation.

That power is under attack. Bill PL 2564/2025, which forbids embargoes based only on remote detection, passed the Chamber of Deputies on 20 May 2026 and is in the Senate. IBAMA says up to 70% of its Amazon actions would be affected. For forecasting, this bill is the largest single binary lever in view. ([O Eco](https://oeco.org.br/noticias/camara-proibe-embargo-remoto-de-area-desmatada-sem-vistoria-previa/), [Senate](https://www25.senado.leg.br/web/atividade/materias/-/materia/174479))

Our own gridding of IBAMA's open data shows the regime in the raw counts. Flora infraction notices in the Legal Amazon ran at about 5,400 a year in 2015 and 2016, fell to 2,028 in 2020, and returned to 5,651 in 2023.

### Other levers that moved in 2025 and 2026

- The general environmental licensing law (Lei 15.190/2025) had 52 presidential vetoes overridden in November 2025, restoring self-declared licences. A challenge is pending at the Supreme Court.
- The Soy Moratorium is effectively off. The large traders left in January 2026. The Supreme Court upheld the pact in August 2026 but also upheld the Mato Grosso and Rondônia laws that withdraw tax benefits from signatories.
- Rural credit rules that require satellite checks against PRODES were approved in December 2025 and then delayed to 2027 and 2028 by a May 2026 resolution.
- The EU deforestation regulation applies from 30 December 2026 for large and medium operators.
- Undesignated public forests held about 20% of clearing from January 2025 to April 2026, and a bill to title occupants inside them advanced in committee.
- BR-319 had its preliminary licence restored and three bridges licensed. The Ferrogrão park reduction was cleared by the Supreme Court. Neither has a construction licence yet.
- The Tropical Forest Forever Facility has 7.8 billion dollars pledged, with first payments expected in 2027 or 2028.

Sources for each item are in the policy research log at the end.

### What history says each lever is worth

| Shift | Measured effect | Source |
|---|---|---|
| PPCDAm from 2004 with the 2008 package | Clearing 56% below the counterfactual in 2005 to 2009 | [Assunção, Gandour, Rocha 2015](https://doi.org/10.1017/S1355770X15000078) |
| Satellite-targeted enforcement (DETER) | More than 22,000 km² a year avoided, 2007 to 2016 | [Assunção, Gandour, Rocha 2023](https://www.aeaweb.org/articles?id=10.1257/app.20200196) |
| Priority municipalities list, 2008 | 35% below counterfactual, 2008 to 2011 | [Assunção, Rocha 2019](https://doi.org/10.1017/S1355770X18000499) |
| Credit restriction, Resolution 3545 of 2008 | About 15% | [Assunção et al. 2020](https://doi.org/10.1093/ej/uez060) |
| Soy Moratorium, 2006 | 18,000 ± 9,000 km² avoided in a decade | [Heilmayr et al. 2020](https://doi.org/10.1038/s43016-020-00194-5) |
| Cattle agreements, 2009 | About 15%, up to 51% with full compliance | [Levy et al. 2023](https://doi.org/10.1016/j.gloenvcha.2023.102671) |
| Protected area expansion | 37% of the 2004 to 2006 fall | [Soares-Filho et al. 2010](https://doi.org/10.1073/pnas.0913048107) |
| Enforcement collapse, 2019 to 2022 | Clearing about 80% above the 2010 to 2018 mean while fines fell 30% to 54% | [Nature 2023](https://www.nature.com/articles/s41586-023-06390-0) |

No peer-reviewed causal estimate exists yet for the 2023 to 2026 decline.

### How these enter the model

They belong in the quantity model, in two forms.

The first is measured intensity. Embargoes, notices, credit volume and prices exist per municipality and month, which gives thousands of observations instead of twenty national ones. A municipality panel with fixed effects, using cloud cover as an instrument for enforcement in the way Assunção and co-authors do, would yield elasticities estimated on Brazilian data that can then scale the forecast.

The second is scenario switches for events that have no history to learn from, such as a ban on remote embargoes. These should be stated as assumptions with a range taken from the table above, not presented as fitted predictions.

Neither is built yet. The current quantity model knows only last year's total and this year's DETER momentum, and its error shows it.

## Fire and weather

Fire and clearing are linked mostly in one direction. Clearing leads to fire within months, because felled vegetation is burned. Fire is a weak predictor of clearing: about 11% of burned forest is cleared within three years. The link has been loosening, and in 2024 fire-driven degradation overtook clearing as a source of carbon emissions. ([CPI](https://www.climatepolicyinitiative.org/publication/the-relationship-between-forest-fires-and-deforestation-in-the-amazon-phenomena-are-more-closely-related-in-rural-settlements-and-in-occupied-public-lands/), [Biogeosciences 2025](https://bg.copernicus.org/articles/22/5247/2025/))

That argues for treating fire as its own hazard with its own model, not as a side input to the clearing model.

Season-ahead fire severity in the southern Amazon is forecastable from sea surface temperatures three to five months ahead (Chen, Randerson, Morton and colleagues, using the Oceanic Niño Index and the Atlantic Multidecadal Oscillation). ECMWF's Probability of Fire product is skilful to about ten days. A global deep model, FireCastNet, is noticeably weaker over South America than elsewhere. For spread, the reference is FISC, a stochastic cellular automaton by Soares-Filho and colleagues in which ignition depends on land use and monthly vapour pressure deficit, and which found fragmentation, not climate, to be the main driver of understory fire. ([Chen et al.](https://escholarship.org/uc/item/669030f9), [FISC](https://csr.ufmg.br/dinamica/fisc/))

The inputs a fire model needs beyond what is already gridded are monthly rainfall and vapour pressure deficit (CHIRPS and TerraClimate, both openly downloadable) and the ocean indices (already downloaded). A spread simulator comes after an ignition model that works.

## Data access notes

Everything in the model today downloads with `scripts/fetch.sh`, without accounts or keys.

- INPE TerraBrasilis publishes a catalogue at `terrabrasilis.dpi.inpe.br/business/api/v1/download/all`. File names carry a release date, so the catalogue is the stable entry point.
- The PRODES raster is at 10 m, 333,161 by 258,977 pixels, and encodes the clearing year in the pixel value. Aggregated to our grid it reproduces INPE's own area report within 0.03% for every class.
- IBAMA moved its open data to Azure storage. The old portal stopped updating in May 2026.
- MapBiomas rasters returned 403 for anonymous download during this survey, including the URL printed on its own collection page. Its municipality tables download fine.
- FUNAI, DNIT, ANEEL and INCRA servers were unreachable or refused requests from a US network. They may need a Brazilian address.
- WWF Forest Foresight publishes a ready feature stack at 0.004° on open Azure storage, with labels at the same 1, 3, 6 and 12 month horizons we want. It is the fastest route to a 400 m model.

The IBAMA files contain the names and tax numbers of the people fined. The pipeline reads only location, date, area and status from them, and nothing from `data/raw` is ever copied into the site.

## Policy research log

Staffing and pay: [strike settlement](https://eixos.com.br/politica/meio-ambiente/servidores-do-ibama-fecham-acordo-com-o-governo-e-devem-por-fim-a-greve/), [Senate PL 5874/2025](https://www12.senado.leg.br/radio/1/noticia/2026/03/10/senado-aprova-reestruturacao-de-carreiras-do-executivo-texto-segue-para-sancao), [PLN 1/2026](https://agenciabrasil.ebc.com.br/politica/noticia/2026-11/congresso-aprova-reestruturacao-de-carreiras-na-receita-ibama-e-inss), [2025 exam](https://folha.qconcursos.com/n/concurso-ibama-2025-nomeacoes-autorizadas), [agent count](https://apublica.org/2026/03/pl-sobre-crimes-ambientais-pode-barrar-ate-70-das-acoes-do-ibama/).
Remote embargo: [cost and volume](https://en.clickpetroleoegas.com.br/the-rural-caucus-is-advancing-in-congress-to-try-to-block-the-use-of-ibama-satellites-in-remote-embargoes-targeting-a-system-that-identifies-caes/), [Supreme Court suspension of suits](https://noticias.stf.jus.br/postsnoticias/stf-suspende-decisoes-que-impediam-bloqueios-de-terras-para-prevenir-desmatamento/).
Licensing: [veto override](https://www12.senado.leg.br/noticias/materias/2025/11/27/congresso-derruba-52-itens-de-veto-a-lei-geral-do-licenciamento-ambiental), [court challenge](https://oc.eco.br/acao-pede-ao-stf-suspensao-imediata-do-novo-licenciamento-ambiental/).
Soy Moratorium: [Supreme Court ruling](https://noticias.stf.jus.br/postsnoticias/stf-reconhece-validade-da-moratoria-da-soja-e-determina-fim-de-acoes-sobre-acordo/).
Credit: [CMN resolutions](https://conjur.com.br/2026-ago-22/legitimacao-de-condicionantes-ambientais-sobre-o-credito-rural/).
Public forests: [share of clearing](https://portalamazonia.com/meio-ambiente/florestas-publicas-alerta-eleicao/), [PL 4745/2025](https://www.canalrural.com.br/politica/projeto-sobre-regularizacao-em-florestas-publicas-avanca-na-camara/).
Infrastructure: [BR-319](https://revistacenarium.com.br/nova-decisao-judicial-destrava-licenciamento-do-trecho-do-meio-da-br-319/), [Ferrogrão](https://noticias.stf.jus.br/postsnoticias/stf-valida-lei-que-reduziu-area-protegida-no-para-para-viabilizar-ferrograo/).
Election: [presidency](https://brasil61.com/n/lula-e-reeleito-presidente-com-vantagem-no-nordeste-flavio-liderou-no-sul-e-centro-oeste-bras2617371), [governors](https://jovempan.com.br/politica/quem-sao-os-27-governadores-eleitos-em-2026-perfis-votacao/).
DETER and fire: [DETER 2026](https://oc.eco.br/alertas-de-desmatamento-em-2026-sao-os-menores-da-historia/), [INPE fire statistics](https://data.inpe.br/queimadas/estatisticas/).

Not confirmed during this survey: the 2026 budget line for IBAMA enforcement, the content of PLN 1/2026 as sanctioned, any ruling on the licensing challenge, and who will run the environment ministry in 2027. Several accuracy figures for Imazon's earlier years were seen only in press summaries.
