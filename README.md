# Prenúncio

Prenúncio forecasts where the Brazilian Legal Amazon will be cleared in the next PRODES year, on a 500 m grid. The forecast and its replay over past years are at [prenuncio.com](https://prenuncio.com), next to maps and month-by-month forecasts for four hazards: clearing, fire, degradation and mining. Prenúncio is Portuguese for the sign that comes before the event.

The code, the data pipeline and the benchmark are open. Anyone can propose a better model.

## Results

The published model blends gradient boosted trees with a U-Net. Flag the 5% of forest cells it ranks highest, and they hold 72.5% of the clearing that follows, on average over PRODES years 2022 to 2025. The top 1% hold 35.1% and the top 10% hold 87.2%. On 2026, which the model never saw and which INPE has mapped for its priority scenes only, the top 5% hold 72.7%.

For scale, ranking cells by last year's clearing nearby catches about 50% at the same budget, and the first version of this model caught about 62%.

The yearly total is the weak part: the model misses it by about a quarter. [docs/RESULTS.md](docs/RESULTS.md) has every number, including the ones that look bad, and [docs/RESEARCH.md](docs/RESEARCH.md) has the prior work and the policy context.

## The open benchmark

[benchmark/](benchmark/README.md) holds a public test with fixed truth files, a standalone scorer and a [leaderboard](benchmark/LEADERBOARD.md) that a script builds from the submissions.

- **Backtest.** Forecast 2022 to 2025, each from information up to 31 July of the year before.
- **Live.** Register a forecast for PRODES year 2027 before 31 December 2026. We score it when INPE publishes the map. Nobody can leak an outcome that does not exist yet, so this is the test that counts.

A submission is a pull request with the scores, a link to open code, and a written report of the method, the inputs and what failed. [CONTRIBUTING.md](CONTRIBUTING.md) has the steps and [GOVERNANCE.md](GOVERNANCE.md) says how we review and who decides.

**To researchers.** If you work on deforestation, land-use change or spatial forecasting, your model belongs on this table next to ours, with your name on it. A model that beats the published one and that someone else reproduces can become the forecast on the site. A reproduction of an existing row, or a report of a leak in ours, is as useful as a new model.

**To people who work with AI agents.** Point a coding agent at this repository. [AGENTS.md](AGENTS.md) gives it the fast path, the rules and what to write down. The lab scores a new idea in minutes, which suits an agent that runs many experiments. Agent-built submissions are welcome and ranked like any other. The one condition is that you say which agent you used and how.

## Run it

Score a set of maps on the benchmark. This needs numpy and scikit-learn only:

```sh
python benchmark/score.py --selftest
python benchmark/score.py my_maps/          # downloads the truth files on first use
```

Rebuild the forecast and the site. This needs Python 3.13 with numpy, pandas, pyarrow, lightgbm, scikit-learn, rasterio, geopandas, pyogrio, shapely and scipy, plus PyTorch and a GPU for the U-Net:

```sh
scripts/fetch.sh                        # about 4 GB of INPE, IBAMA and NOAA data into data/raw
python pipeline/grid.py                 # PRODES 10 m raster to the 1 km grid
python pipeline/layers.py               # tenure, DETER, fire, IBAMA records onto the grid
python pipeline/quantity.py             # how much: the yearly total, with its backtest
python pipeline/model.py eval           # where: rolling-origin backtest
python pipeline/model.py forecast       # final model, the 2026 check, the 2027 map
python pipeline/horizons.py eval        # 3 and 6 month clearing, 12 month fire scars
python pipeline/horizons.py forecast
python pipeline/export.py               # writes web/data
python pipeline/regions.py              # sector shapes and numbers; run after every export
python pipeline/monthly.py              # how much, month by month: the next 12 months of each hazard, with its backtest
python3 -m http.server 8878 -d web      # open http://localhost:8878
node test/sectors.mjs                   # drives the site with real mouse events
```

`AZ_F=50` in front of a pipeline step runs it on the 500 m grid, with its own folders `data/grid50` and `data/model50`. `AZ_X=hansen,glad,aef` adds the finer inputs. The published model is the 500 m trees with those inputs, blended with the U-Net by `pipeline/blendmaps.py`. The 500 m steps and the U-Net ran on a cloud GPU machine.

On the site, links carry state: `#y=2023` replays a year, `#k=clear3` or `clear6` is the monthly clearing view with that window ahead, `#k=scar12` is fire and any other hazard uses its own layer name (add `t=months` for the monthly view), `#m=cells` paints cells instead of sectors (500 m for the yearly clearing forecast and its replay, 1 km for the rest), `#s=uf` (or `mun`, `ti`, `uc`) picks the kind of sector, `#r=<id>` selects one, `#l=pt` sets the language and `#about` opens the About text.

## What is where

- `benchmark/` is the open benchmark: rules, scorer, submissions, leaderboard.
- `pipeline/` is the tree models and everything that feeds the site: the yearly map (`model.py`), the yearly total (`quantity.py`), the shorter windows and the other hazards (`horizons.py`), and the monthly totals for the four hazards (`monthly.py`). `pipeline/lab.py` is the model lab: it scores a model on cached feature tables in minutes (see [docs/BENCH.md](docs/BENCH.md)). `pipeline/extras.py` and `pipeline/tenure.py` build candidate inputs for it. `pipeline/benchdata.py` writes the benchmark's truth files.
- `unet/` is the convolutional model, and the scripts that grid Hansen forest loss, GLAD alerts, AlphaEarth embeddings and DETER for both models.
- `web/` is the site, static, with no build step. It paints the yearly clearing forecast at 500 m, the resolution it is scored at. `web/data` is generated and not in git. Only this folder is ever deployed.
- `docs/` has the results, the research notes, the internal benchmark history and the brand.
- `scripts/fetch.sh` downloads the raw inputs. No account or key is needed.

`data/` is not in git. `data/raw` holds IBAMA files with the names and tax numbers of people fined. The pipeline reads place, date, area and status from them and nothing else. Never commit or upload that folder.

## Data, licences and credit

The code is under the [MIT licence](LICENSE). The data belongs to its producers, and anything you build from it must credit them:

- **PRODES and DETER**, INPE, through [TerraBrasilis](https://terrabrasilis.dpi.inpe.br), CC BY-SA 4.0. The benchmark's truth files are derived from PRODES and carry the same licence.
- **Active fire detections**, INPE Programa Queimadas.
- **Global Forest Change**, Hansen, Potapov, Moore, Hancher et al., University of Maryland, Google, USGS and NASA, CC BY 4.0. Hansen et al. 2013, Science 342, 850 to 853.
- **GLAD Sentinel-2 forest disturbance alerts**, GLAD laboratory, University of Maryland.
- **AlphaEarth Foundations Satellite Embedding**, CC BY 4.0. The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.
- **Embargoes and infraction notices**, IBAMA open data.
- **Oceanic Niño Index and tropical North Atlantic index**, NOAA.
- **Indigenous lands, conservation units, municipalities and states**, FUNAI, MMA and IBGE, as distributed by INPE.
- **Satellite imagery on the site**, Esri World Imagery (Esri, Maxar, Earthstar Geographics), under Esri's terms of use.

Submission folders under `benchmark/submissions` are published under CC BY 4.0.

Prenúncio is an independent project. It does not replace INPE's official figures and has no tie to the institutions above.

## Em português

O Prenúncio prevê onde a Amazônia Legal vai ser desmatada no próximo ano PRODES, numa grade de 500 m. A previsão e a reprise dos anos passados estão em [prenuncio.com](https://prenuncio.com). O código, o pipeline de dados e o benchmark são abertos, e qualquer pessoa pode propor um modelo melhor.

O modelo publicado combina árvores de gradient boosting com uma U-Net. Os 5% de células de floresta que ele aponta como mais arriscadas concentram 72,5% do desmate que acontece em seguida, na média dos anos PRODES de 2022 a 2025. Um mapa ingênuo, que repete o desmate recente da vizinhança, pega cerca de 50% com a mesma área. O total anual ainda é a parte fraca, com erro de cerca de um quarto.

O benchmark aberto fica em [benchmark/](benchmark/README.md) e tem duas trilhas. Na retrospectiva, você prevê 2022 a 2025 usando só o que existia em 31 de julho do ano anterior. Na trilha ao vivo, você registra até 31 de dezembro de 2026 uma previsão para o ano PRODES 2027, e nós calculamos a nota quando o INPE publicar o mapa. Como esse resultado ainda não existe, ninguém consegue vazá-lo, e por isso essa é a prova que vale.

Para participar, abra um pull request com as notas, o link do código aberto e um relatório escrito que conte o método, os dados usados, as datas de cada um e o que não funcionou. O passo a passo está em [CONTRIBUTING.md](CONTRIBUTING.md), e a forma como revisamos e decidimos está em [GOVERNANCE.md](GOVERNANCE.md). Um script gera o placar a partir das submissões e ninguém o edita à mão.

Convidamos pesquisadoras e pesquisadores de desmatamento, uso da terra e previsão espacial a colocar seus modelos nesse placar, com seus nomes. Um modelo que supere o publicado e que outra pessoa consiga reproduzir pode virar a previsão do site. Reproduzir uma linha do placar ou apontar um vazamento na nossa vale tanto quanto um modelo novo.

Usar agentes de IA é bem-vindo e incentivado. Aponte um agente de programação para este repositório e ele encontra em [AGENTS.md](AGENTS.md) o caminho rápido, as regras e o que precisa anotar. A única condição é dizer no relatório qual agente você usou e como.

O código está sob a licença MIT. Os dados são do INPE (PRODES e DETER, pelo TerraBrasilis, CC BY-SA 4.0), da Universidade de Maryland, do Google, do IBAMA e da NOAA, e a lista completa com os créditos obrigatórios está na seção em inglês acima. O Prenúncio é um projeto independente e não substitui os números oficiais do INPE.
