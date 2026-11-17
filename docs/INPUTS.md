# Inputs: what has been tried, what is next, how to propose one

The forecast gives every forest cell a chance of being cleared. What moves that chance is information, so this file is the ledger of inputs. Each row says what was tested, how, and what it was worth. A result that did not help stays in the table.

## Tested

Scores are cap5 (share of the year's clearing in the 5% of cells ranked highest), means of 2022 to 2025, from the lab notebook, [LAB.md](LAB.md).

| Input | Where it enters | Test | Result |
|---|---|---|---|
| PRODES clearing history, neighbourhood, distance to the edge | trees, U-Net | first version | about 62% at 1 km; the base of everything |
| 500 m grid in place of 1 km | trees | same inputs, finer grid | +2 to 3 points |
| Hansen forest loss, 30 m | trees, U-Net | ablation | removing it costs 1.5 points |
| GLAD Sentinel-2 alerts, 10 m | trees, U-Net | ablation | removing it costs 2.2 points |
| AlphaEarth satellite embeddings | trees, U-Net | added | +1.5 points in the trees |
| JRC Tropical Moist Forest first-disturbance year | trees, U-Net | added | +1.2 points in the trees, +2.0 in the U-Net |
| DETER fire-scar planes at 100 m | U-Net | branch from the same checkpoint | +0.5 alone, +0.2 blended; not adopted |
| DETER alert planes and wide context | U-Net | added | no gain |
| Public-forest tenure (CNFP 2025 snapshot) | trees | added | no gain for placement |
| INPE fire detections, IBAMA notices and embargoes near the cell | trees | added to the first version | no gain for placement |
| IBAMA notices and embargoed area per km2 alerted, by municipality | amount, by semester | `pipeline/panel.py`, fixed effects by municipality and semester | followed by 4% to 9% less clearing; an association, biased toward zero because inspectors go where clearing is |
| State-level trend, notices, embargoes, fire | yearly total | fourteen combinations over 2014 to 2025 | none beats repeating last year (17%) |
| Clearing permits (SINAFLOR ASV), valid on the forecast date | screen, `pipeline/permits.py` | cells inside the authorised area, forecast against outcome | the forecast expected 357 to 574 of those cells to lose a hectare each year and 1,061 to 1,454 did |
| Clearing permits, as seven features | trees | lab, against the same trees without them | +1.3 points (71.5% to 72.8%), better in all four years; adopted in prenuncio-3 |
| Embargoes split by kind: remote, collective, field | amount, by semester | `pipeline/panel2.py`, same design | remote embargoes of the last six months carry about three times the coefficient of field embargoes and notices (-0.048 against -0.016 and -0.015) |
| Rural credit (SICOR), cattle and crops, by municipality and month | amount, by semester | `pipeline/credit.py`, same design | cattle working capital +0.035 (interval +0.001 to +0.069); investment and crop credit indistinguishable from zero |
| Enforcement, credit and permits together | amount, next six months by municipality | `pipeline/amount.py`, 16 rolling origins from May 2022 | median error of the Amazon total 28.3% with clearing history alone, 23.6% with all three groups, 37.5% for the same months a year before; each group alone moves it by one to three points, inside the noise of 16 origins |
| Commodity prices in reais (central bank farm and metal indices), the dollar, with each municipality's cattle herd and soy area of 2020 | amount, next six months by municipality | `pipeline/amount.py`, same 16 origins | worse: 34.5% against 28.3% with clearing history alone. A national series seen at a few dozen dates is fitted by accident; not adopted |
| Clearing permits as planes at 100 m | U-Net | branch from the same checkpoint, then the blend with the trees that read permits | the network alone gains 1.2 points on 2022 to 2025 (74.0% against 72.8%) and catches 46% of far clearing against 42%; the blend gains 0.3 on those years (75.4% against 75.1%) and loses 0.2 on 2026 (74.0% against 74.3%). Inside the noise, not published |

## How to propose an input

1. It must be public and dated. A file that is a snapshot of today leaks the future into a backtest; say how you rebuilt what was known on each 31 July.
2. Say what it measures and why it should move clearing, and whether it should move where (the ranking of cells) or how much (the amount in a municipality or the whole Amazon).
3. Test it against the same model without it, on the benchmark years, and report the difference with its noise (`pipeline/lab.py noise`). A null result is a contribution; add the row.
4. Never commit personal data. Several official files carry names and tax numbers; read place, date, area and status only.

## Candidates, screened on 15 November 2026

The notes below screen inputs that are not satellite products: regulation and enforcement, credit, markets, land registries. All requests were made on 15 November 2026 with curl, anonymous and without keys. "Verified" means the request was made and the response seen that day. "Unverified" means the host refused, timed out or had no file. Effect sizes marked (memory) were not re-checked and should be confirmed against the paper before being quoted. The forecast date convention is 31 July of year Y.

These hosts failed that day, so everything on them is unverified. `app.anm.gov.br` reset the connection, `certificacao.incra.gov.br` and `acervofundiario.incra.gov.br` did not resolve, `servicos.dnit.gov.br/dnitgeo` and `monitoramento.sema.mt.gov.br` timed out, `www.fundoamazonia.gov.br` and `dadosabertos.bndes.gov.br` refused the connection. They may be geoblocked outside Brazil and are worth retrying from a Brazilian IP.

---

## 1. Clearing permits, SINAFLOR ASV and UAS (includes SEMA-MT)

- **Measures.** Each vegetation suppression authorisation (ASV) and alternative land use authorisation (UAS) registered in SINAFLOR, with issue date, validity date, authorised area, property centroid, CAR number and status. A permit is a stated intention to clear a known area inside a known property within 1 to 5 years, which is exactly the "large planned block on private land" case.
- **Level and coverage.** Point (property centroid) plus CAR code and municipality name. ASV issue dates run 2018-05-07 to 2026-11-13, UAS 2017-02-22 to 2026-11-13. Mato Grosso is in the ASV file through the SEMA-MT integration (`COMPETENCIA_DA_AVALIACAO = Autorizacao Integrada`) with 3,434 distinct authorisations, 1.06 Mha, 3,406 of them carrying a CAR number, median 213 ha, p90 770 ha and a hard cap at 2,000 ha. MT counts ramp from 38 (2018) and 79 (2019) to 329 (2020), 511 (2024), 554 (2025) and 721 (2026 to date), so the series is only usable from about 2020. UAS is dominated by TO (5,444) and MA (1,962), mostly Cerrado.
- **Lag.** Files are regenerated daily (Last-Modified 16 Nov 2026 UTC, latest issue date 13 Nov). At 31 July Y everything issued through late July Y is public.
- **Verified access.**
  - `https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SINAFLOR/AutSuprVegetacao/sinaflor-autorizacao-de-supressao-de-vegetacao.csv` returned 200, 13.5 MB, 33,806 rows, 31,506 distinct authorisations, 4,915 in the nine Legal Amazon states. Columns `NRO_REGISTRO;DATA_DE_EMISSAO;NRO_AUTORIZACAO;NRO_AUTORIZACAO_ORIGINAL;DATA_DE_VALIDADE;UF;MUNICIPIO;NOME_DETENTOR;CPF_CNPJ_DETENTOR;IMOVEL_RURAL_VINCULADO;NRO_CAR_IMOVEL_RURAL;NOME_EMPREENDIMENTO_VINC;LATITUDE_PONTO_CENTR_EMPREEND;LONGITUDE_PONTO_CENTR_EMPREEND;...;COMPETENCIA_DA_AVALIACAO;ORGAO_AMBIENTAL_RESP_ANALISE;BIOMA;FINALIDADE_SUPRESSAO;AREA_TOTAL_PROJ;SITUACAO;DATA_DA_SITUACAO;ULTIMO_TRAMITE;DATA_DO_TRAMITE`.
  - `.../SINAFLOR/usoAlternativoDoSolo/uso-alternativo-do-solo.csv` returned 200, 127 MB, 251,303 rows (one per species line), 43,272 distinct authorisations, 8,723 in the nine states.
  - By HEAD only, all 200. `.../SINAFLOR/usoAlternativoDoSoloAgriculturaFamiliar/uso-alternativo-do-solo-agricultura-familiar.csv` (0.6 MB), `.../DOF/DOFAutorizacoes/DOFAutorizacoes_csv.zip` (13.5 MB, logging authorisations since 2007), `.../SINAFLOR/pmfs/AmazoniaLegal/pmfsAmazoniaLegal.csv` (5.9 MB).
  - The catalogue entry is `https://dadosabertos.ibama.gov.br/api/3/action/package_show?id=sinaflor-autorizacao-de-supressao-de-vegetacao` (200).
  - The permit to polygon join works. `CQL_FILTER=cod_imovel='MT-5103502-8881868B3B0F471BA8109DA576B64A8A'` on the CAR WFS (entry 6) returned the property record for a 1,756 ha ASV issued on 04/11/2026.
  - SEMA-MT's own geoserver `https://geo.sema.mt.gov.br/geoserver/ows` answers 200, but the anonymous WFS FeatureTypeList is empty and WMS exposes only image mosaics. I found no public layer of clearing polygons.
- **Licence and size.** "Outra (Aberta)" per the IBAMA catalogue. About 140 MB in total.
- **Leakage.** The file is today's snapshot. `SITUACAO` (Vencida, Cancelada, Suspensa) reflects today, so use only `DATA_DE_EMISSAO` and `DATA_DE_VALIDADE`. Rectified permits replace the original (`NRO_AUTORIZACAO_ORIGINAL`). The MT biome field is blank, so Amazon versus Cerrado must be decided from coordinates. Authorised area per year in MT (117 to 208 kha) is several times what ICV reports as executed authorised clearing (269 km2 for August 2023 to July 2024), so the feature is an upper bound on intent. Absence before 2020 is missing data, not zero.
- **Evidence.** ICV technical notes cross PRODES with SEMA-MT authorisations. The unauthorised share they report for MT sits between 73% and about 90% depending on year and biome, with authorised clearing rising sharply in 2023 (`https://www.icv.org.br/wp-content/uploads/2024/12/icv-nota-tecnica-2024-1.pdf`, found by search, not fetched). Valdiones et al. 2021 (ICV, Imaflora, Lagesa), "Desmatamento ilegal na Amazônia e no Matopiba", found no authorisation for 94% of clearing (memory). There is no causal paper. The value here is mechanical.

## 2. Rural credit, BCB SICOR

- **Measures.** Every rural credit contract since 2013 with date, value, purpose (custeio, investimento, comercialização), activity (1 agrícola, 2 pecuária), product (BOVINOS, "ABERTURA DE GLEBAS RURAIS", pasture formation), programme, funding source, lender and financed area. Credit relaxes the liquidity constraint on pasture and cropland expansion. Resolution 3.545/2008 (in force 1 July 2008) cut this channel in the Amazon biome.
- **Level and coverage.** Municipality by month from January 2013 to the present. Contract level with issue date. Financed plot polygons (WKT) from 2013 but thin before 2017 (17 KB in 2013, 4 MB in 2015, 67 MB in 2017, 281 MB in 2024). `SICOR_PROPRIEDADES` carries the CAR code of the financed property. The 2012 files return 404. For 2008 to 2012 the only source is the Anuário Estatístico do Crédito Rural (annual by municipality, 1999 to 2012). Its page `https://www.bcb.gov.br/estabilidadefinanceira/anuario_estat_credrural` answers 200 but is a JavaScript shell and I did not reach the files (unverified).
- **Lag.** Files are rebuilt nightly. At 31 July Y, contracts through June Y are complete and July is partial. The Plano Safra for Y/Y+1 (volumes and rates) is announced in late June or early July, so it is known at forecast time.
- **Verified access.**
  - `https://www.bcb.gov.br/htms/sicor/DadosBrutos/SICOR_CONTRATOS_MUNICIPIO_2013.gz` and `..._2024.gz` returned 200 (12 and 19 MB), and the 2013 header is `#cdEstado;nomeUF;cdMunicipio;codMunicIbge;Municipio;MesEmissao;AnoEmissao;cdPrograma;cdSubPrograma;cdFonteRecurso;Atividade;QtdCusteio;VlCusteio;QtdInvestimento;VlInvestimento;QtdComercializacao;VlComercializacao;QtdIndustrializacao;VlIndustrializacao;AreaInvestimento;AreaCusteio;cnpjIF;nomeIF`. I did not request the years in between.
  - `.../SICOR_OPERACAO_BASICA_ESTADO_{2013,2025,2026}.gz` returned 200 (52 to 65 MB), 47 columns including `DT_EMISSAO;DT_VENCIMENTO;CD_EMPREENDIMENTO;CD_PROGRAMA;VL_PARC_CREDITO;VL_AREA_FINANC;PC_BONUS_CAR`.
  - `.../SICOR_GLEBAS_WKT_{2013,2015..2020,2024,2026}.gz` returned 200, header `#REF_BACEN;NU_ORDEM;NU_INDICE;GT_GEOMETRIA`. The 2024 file is 281 MB, over the 200 MB limit, so I read only the first 60 KB of the 2026 file by range request.
  - `.../SICOR_PROPRIEDADES.gz` 200, 500 MB, header `#REF_BACEN;NU_ORDEM;CD_CNPJ_CPF;CD_SNCR;CD_CIB;CD_CAR` (read by range). `.../SICOR_COMPLEMENTO_OPERACAO_BASICA.gz` 200, 453 MB, has `CD_IBGE_MUNICIPIO`.
  - OData works for small pulls. `https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2/odata/CusteioMunicipioProduto?$format=json&$top=3&$filter=codIbge eq '1500602' and AnoEmissao eq '2013'` returned 200 with `Municipio, nomeProduto, MesEmissao, AnoEmissao, cdPrograma, cdFonteRecurso, VlCusteio, AreaCusteio, codIbge`. `InvestMunicipioProduto` has only the BCB municipality code (`cdMunicipio`), not IBGE. `/$count` returns 403.
- **Licence and size.** BCB open data (I did not read the licence text). The municipal panel is about 220 MB compressed for all years, contract level about 800 MB, plots about 1.5 GB.
- **Leakage.** The files are a snapshot of the current database, and contracts can be amended or excluded after the fact (small). Credit for pasture reform can follow clearing as well as precede it, so use lagged windows. Since CMN 5.081/2023 and the PRODES check of CMN 5.193/2024 (start postponed by 5.268/2025 and again by 5.303/2026, with sources disagreeing on the exact dates), credit is itself conditioned on past deforestation, which makes recent credit partly an outcome of the target.
- **Evidence.** Assunção, Gandour, Rocha and Rocha 2020, Economic Journal 130(626):290-330, doi 10.1093/ej/uez060. Resolution 3.545 led to a substantial fall in deforestation, concentrated in cattle municipalities. The CPI working paper version put it at R$2.9 billion less credit in 2008 to 2011 and about 2,700 km2 avoided, roughly 15%.

## 3. Markets (cattle, soy, gold, exchange rate)

- **Measures.** Output prices and the real. Higher expected returns to pasture and soy raise clearing, a weaker real raises local-currency export prices, and gold drives garimpo.
- **Level and coverage.** National or world, monthly or daily. There is no spatial detail, so these must be interacted with municipal exposure (herd, soy area, mining titles).
- **Lag.** All are public within days. At 31 July Y the June Y monthly values are final and July is nearly complete.
- **Verified access.**
  - World Bank Pink Sheet monthly, `https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx`, 200, 588 KB, sheet "Monthly Prices", 1960M01 to 2026M10, "Updated on November 03, 2026". It has Soybeans, Meat beef and Gold. The hash in the path changes each year (the 2021 path still answers 200 but stops at 2024M12), so scrape the link from `https://www.worldbank.org/en/research/commodity-markets`.
  - CEPEA boi gordo, `https://www.cepea.org.br/br/indicador/series/boi-gordo.aspx?id=2`, 200, XLS 541 KB, 7,273 daily rows from 23/07/1997 to 13/11/2026 in R$ per arroba. CEPEA soy, `.../series/soja.aspx?id=92`, 200, XLS 383 KB (HEAD only). Both sit behind Cloudflare but plain curl worked.
  - BCB SGS, `https://api.bcb.gov.br/dados/serie/bcdata.sgs.3698/dados?formato=json&dataInicial=01/01/2000&dataFinal=31/03/2000` and `.../ultimos/3`, 200, monthly average USD sell rate from 2000-01 to 2026-10. Series 27574 and 27575 (BCB commodity indices, names from memory) 200 through 2026-10. Series 4390 (Selic monthly) 200. Series 4 (BM&F gold) stops in September 2019, so use the Pink Sheet for gold.
  - IPEADATA OData `http://www.ipeadata.gov.br/api/odata4/Metadados`, 200, 7.9 MB, 4,141 series, including `DERAL12_PRBGO12` (boi gordo, PR, monthly).
- **Licence and size.** World Bank CC BY 4.0. CEPEA CC BY-NC 4.0 (memory, check before redistributing). BCB open. Under 2 MB in total.
- **Leakage.** None from revisions. The danger is statistical. With about 18 annual observations a national price can fit the PRODES series by accident, so use these as interaction terms and hold out whole years.
- **Evidence.** Assunção, Gandour and Rocha 2015, Environment and Development Economics 20(6):697-722, doi 10.1017/S1355770X15000078, find that prices matter but policies explain about half of the 2005 to 2009 slowdown (memory). Hargrave and Kis-Katos 2013, Environmental and Resource Economics 54:471-494, doi 10.1007/s10640-012-9610-2. Harding, Herzberg and Kuralbayeva 2021, JEEM 108:102452, doi 10.1016/j.jeem.2021.102452, find the priority list weakened the link from prices to deforestation (memory). Richards et al. 2012 on the exchange rate, doi 10.1016/j.gloenvcha.2012.01.004.

## 4. IBAMA enforcement effort beyond counts

- **Measures.** Operations (named operations and fiscal action ids on each notice), embargo lifts with dates, the dated status history of every embargo, fine payments with dates, seizures and equipment destruction. These measure whether enforcement bites, not only whether a notice was written.
- **Level and coverage.** Point or polygon plus IBGE municipality code, daily. Notices go back to 1977.
- **Lag.** Daily refresh. At 31 July Y, records through July Y, but late entry is common (compare `DT_LANCAMENTO` with the notice date).
- **Verified access** (all 200, large files read by range request only).
  - Notices, `https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip`, 124 MB, one CSV per year. Beyond what the project already uses it has `SEQ_ACAO_FISCALIZATORIA;CD_ACAO_FISCALIZATORIA;TIPO_ACAO;OPERACAO;SEQ_ORDEM_FISCALIZACAO;ORDEM_FISCALIZACAO;UNID_ORDENADORA;OPERACAO_SOL_RECURSO;DT_LANCAMENTO;DT_FATO_INFRACIONAL;DES_STATUS_FORMULARIO;WKT_GE_AREA_AUTUADA;CD_TERMOS_EMBARGOS`. Distinct action ids per municipality and month are a usable proxy for field presence.
  - Embargoes, `.../TERMOS_DE_EMBARGO/TERMO_EMBARGO/termo_de_embargo.csv`, 214 MB, with `SIT_DESEMBARGO;TIPO_DESEMBARGO;DAT_DESEMBARGO;DES_DESEMBARGO;GEOM_AREA_EMBARGADA;OPERACAO`.
  - Embargo history, `.../TERMOS_DE_EMBARGO/TERMO_EMBARGO_HISTORICO/termo_embargo_historico.csv`, 736 MB, one row per change with `DT_ALTERACAO`. This is what allows reconstructing which embargoes were in force on any past date.
  - Court-ordered lifts, `.../TERMOS_DE_EMBARGO/TERMO_EMBARGO_DECISAO/termo_embargo_decisao.csv`, 127 KB, `DAT_DECISAO_EMBARGO;TIPO_DECISAO`.
  - Fine payments, `.../ARRECADACAO_DE_MULTAS_AMBIENTAIS_POR_BENS_TUTELADOS/arrecadacao_de_multas_ambientais_por_bens_tutelados_csv.zip`, 28 MB, one CSV per UF, `Nº AI;UF;Município;Status Débito;Tipo Infração;Data Auto;Valor do Auto;Valor Pago;Data Pagamento`.
  - Equipment destruction (`.../TERMOS/TERMO_DESTRUICAO/termo_destruicao_inutilizacao.csv`) and seizures (`https://dadosabertos.ibama.gov.br/dados/SIFISC/termo_apreensao/apreensao/apreensao_csv.zip`) are listed in the catalogue. I did not request them.
- **Licence and size.** "Outra (Aberta)". About 1.1 GB.
- **Leakage.** The highest of all candidates. A notice or embargo is created after the clearing it punishes and often cites the PRODES or DETER polygon (`DETER_PRODES`, `ID_POLIGONO`), so a notice dated before 31 July can still describe clearing that the next PRODES year will count. The main files show today's status (cancelled, lifted, paid), so use the history file and payment dates. Two date typos appeared in the first rows I read (years 2925 and 2090).
- **Evidence.** Assunção, Gandour and Rocha 2023, AEJ Applied 15(2):125-156, doi 10.1257/app.20200196, instrumented by cloud cover. A working paper version estimates more than 22,000 km2 avoided per sample year. Börner et al. 2015, PLoS ONE 10(4):e0121544, find field inspections reduce subsequent clearing (memory). Gatti et al. 2023, Nature, doi 10.1038/s41586-023-06390-0, link the 2019 to 2020 rise to the fall in enforcement (memory).

## 5. Priority municipalities list (Decreto 6.321/2007)

- **Measures.** Which municipalities were on the federal list, and which had moved to "monitored and under control", by year. Listing concentrates inspections, tightens credit and licensing, and carries reputational cost.
- **Level and coverage.** Municipality by year, 2008 to 2022 in the compiled file, with the portaria and its date in each row.
- **Lag.** Portarias are published in the DOU and effective that day. Dates vary (24 Jan 2008, 31 Oct 2022, 9 Nov 2023), so at 31 July Y use the list in force, usually the one issued in year Y-1.
- **Verified access.** `https://zenodo.org/api/records/8412144/files/priority_list.csv/content`, 200, 108 KB, 1,414 rows, columns `biome,uf,name_muni,code_muni,year,priority,monitored,portaria`. 831 Amazon rows, 36 municipalities in 2008 rising to 130 rows in 2022. Compiled from the DOU by H. T. Seixas, doi 10.5281/zenodo.8412144. The MMA table that search engines still index (`.../pdf/Listagemmunicpiosprioritriosparaaesdepreveno2021.pdf`) now redirects to a login page. 2023 onward must be coded by hand from Portaria MMA 834/2023 and Portaria GM/MMA 1.202/2024 (found by search on lex.com.br, not fetched). The MMA programme page links only a 2025 folder PDF.
- **Licence and size.** MIT. 108 KB.
- **Leakage.** Entry is decided from past PRODES values, so the list is a function of the lagged target. That is legitimate for forecasting, but the variable mostly re-encodes history unless entry and exit events are used.
- **Evidence.** Assunção and Rocha 2019, Environment and Development Economics 24(2):115-137, doi 10.1017/S1355770X18000499, attribute a large reduction to listing (memory). Cisneros, Zhou and Börner 2015, PLoS ONE 10(9):e0136402, estimate a 13 to 36% reduction for 2008 to 2012 (memory). Arima et al. 2014, Land Use Policy 41:465-473, doi 10.1016/j.landusepol.2014.06.026, estimate on the order of 10,000 km2 avoided in 2009 to 2011 (memory).

## 6. Rural property registry, CAR

- **Measures.** Self-declared property polygons with registration date, status and size class. Useful as the join key for permits and credit, and for cell features such as "inside a property registered in the last N months" or "inside a cancelled or suspended CAR".
- **Level and coverage.** Polygon, with `dat_criacao` from 2014. Verified counts are MT 221,568, PA 392,562, MA 419,259, RO 198,173, TO 112,618, AM 99,016, AC 63,262, RR 30,305 and AP 17,825.
- **Lag.** Live service.
- **Verified access.** Bulk download without captcha works through the Serviço Florestal geoserver. `https://geoserver.car.gov.br/geoserver/sicar/wfs?service=WFS&version=2.0.0&request=GetCapabilities` returned 200 with one layer per state (`sicar:sicar_imoveis_mt` and so on). Fields are `cod_imovel, status_imovel, dat_criacao, data_atualizacao, area, condicao, uf, municipio, cod_municipio_ibge, m_fiscal, tipo_imovel, geo_area_imovel`. A paged, filtered request returned 200 in 1.9 s with 200 MultiPolygons in EPSG:4674, namely `...&request=GetFeature&typeNames=sicar:sicar_imoveis_mt&count=200&startIndex=200&sortBy=cod_imovel&outputFormat=application/json&CQL_FILTER=cod_municipio_ibge=5104526`. The official download page `https://consultapublica.car.gov.br/publico/estados/downloads` redirects to the consultation app, which uses a captcha.
- **Licence and size.** Public, no explicit licence found. About 1.55 million features for the nine states, several GB as GeoJSON.
- **Leakage.** Geometry and status are today's. Only `dat_criacao` and `data_atualizacao` are dated and there is no geometry history. In MT `dat_criacao` can be the date of a re-sync from SIMCAR, not first registration (the sample property with a November 2026 permit shows `dat_criacao` 2026-07-08). Registration often follows clearing, to claim the land, so recent registration predicts past clearing as much as future clearing.
- **Evidence.** Azevedo et al. 2017, PNAS, doi 10.1073/pnas.1604768114, find CAR enrolment alone did not reduce clearing. Alix-Garcia et al. 2018, Conservation Letters, doi 10.1111/conl.12414, find some avoided deforestation in MT and PA (memory). Azevedo-Ramos et al. 2020, Land Use Policy, doi 10.1016/j.landusepol.2020.104863, report 11.6 Mha of undesignated public forest under CAR claims (memory).

## 7. IBGE municipal panels through SIDRA

- **Measures.** Cattle herd (PPM), soy and crop area (PAM), population. Stocks of the activities that consume forest.
- **Level and coverage.** Municipality by year. PPM table 3939 and PAM tables 5457 and 1612 run 1974 to 2025. Population estimates table 6579 runs 2001 to 2026. Two faster state-level series are LSPA table 6588 (monthly, September 2006 to October 2026) and quarterly slaughter table 1092 (1997 Q1 to 2026 Q2).
- **Lag.** PPM and PAM for year Y-1 come out in September of Y (2025 is already there). At 31 July Y the newest municipal value is Y-2. LSPA for June Y is public by mid July Y. Population is available for Y-1.
- **Verified access.**
  - Herd for every municipality of the nine states in one call, `https://apisidra.ibge.gov.br/values/t/3939/n6/in%20n3%2011,12,13,14,15,16,17,21,51/v/105/p/2024/c79/2670`, 200, 247 KB, 809 rows (all of MA included, filter to the Legal Amazon afterwards).
  - Soy planted area, `https://apisidra.ibge.gov.br/values/t/5457/n6/in%20n3%2051/v/8331/p/last%201/c782/40124`, 200, 142 MT rows for 2025.
  - Population, `https://apisidra.ibge.gov.br/values/t/6579/n6/1500602/v/9324/p/last%203`, 200.
  - `servicodados.ibge.gov.br/api/v3/agregados/...` timed out. Use `apisidra`.
- **Licence and size.** IBGE open use with citation. A few MB.
- **Leakage.** PPM and PAM are revised when the next year is published and after each census. The two-year lag must be respected, because a careless join on calendar year leaks.
- **Evidence.** Arima et al. 2011, Environmental Research Letters 6:024010, doi 10.1088/1748-9326/6/2/024010, show soy expansion on old pasture displaces cattle to the frontier. Bowman et al. 2012, Land Use Policy, doi 10.1016/j.landusepol.2011.09.009.

## 8. Dated legal and political regime events

- **Measures.** Step variables for rule changes. These are national or state level only, so about 18 annual observations.
- **Coding list** (dates from memory unless noted, confirm in the DOU before use). PPCDAm phases 2004-2008, 2009-2011, 2012-2015, 2016-2020, relaunch 5 June 2023. Soy Moratorium 24 July 2006, cut-off moved to 22 July 2008 in 2014, made indefinite in 2016, under legal and antitrust challenge since 2025. Decreto 6.321 on 21 Dec 2007. BCB Resolution 3.545 in force 1 July 2008. Decreto 6.514 on 22 July 2008. Amazon Fund created August 2008, frozen 2019, reactivated January 2023. Lei 11.952 (Terra Legal) on 25 June 2009. TAC da Carne in Pará in July 2009 and the G4 agreement in October 2009. Lei Complementar 140 on 8 Dec 2011. Forest Code, Lei 12.651, on 25 May 2012. Lei 13.465 on 11 July 2017. Federal government changes on 1 Jan 2011, 31 Aug 2016, 1 Jan 2019 and 1 Jan 2023. Decreto 9.760 (fine conciliation) on 11 April 2019, revoked 1 Jan 2023. CMN 5.081 in June 2023. CMN 5.193 in December 2024, with its start postponed by 5.268/2025 and 5.303/2026 (confirmed by search).
- **Verified access.** None needed beyond the legal texts. Fundo Amazônia project data by municipality is unverified (site unreachable).
- **Leakage.** None in the data, but a dummy that starts in 2019 or 2023 will absorb everything else that changed that year.
- **Evidence.** Heilmayr, Rausch, Munger and Gibbs 2020, Nature Food 1:801-810, doi 10.1038/s43016-020-00194-5, put deforestation in soy-suitable Amazon areas about 35% below the counterfactual, roughly 18,000 km2 over 2006 to 2016 (confirmed by search). Alix-Garcia and Gibbs 2017, Global Environmental Change, doi 10.1016/j.gloenvcha.2017.08.009, find the cattle agreements undermined by leakage. Levy et al. 2023, Global Environmental Change, doi 10.1016/j.gloenvcha.2023.102671, find the G4 agreement cut cattle-driven clearing by about 15% (memory). Brito et al. 2019, Environmental Research Letters 14:064018, doi 10.1088/1748-9326/ab1e24, on Lei 13.465. Burgess, Costa and Olken, "The Brazilian Amazon's Double Reversal of Fortune" (working paper), show a border discontinuity that appears and disappears with federal regimes.

## 9. MapBiomas annual land use and cover

- **Measures.** Pasture, soy, other cropland and mining area around forest, per year.
- **Level and coverage.** 30 m raster and municipal tables, 1985 to 2025 in collection 11 (released August 2026).
- **Lag.** A collection released in August of Y covers through Y-1. At 31 July Y the newest public map year is Y-2, from the collection released in August of Y-1.
- **Verified access.**
  - Rasters do not work anonymously. The URL printed on the official page `https://brasil.mapbiomas.org/iniciativas-e-produtos/cobertura-e-uso-da-terra/` is `https://storage.googleapis.com/mapbiomas-public/initiatives/brasil/collection11/lulc/coverage/brazil_coverage/brazil_coverage-col11_2025.tif`, and it returns 403 AccessDenied ("Anonymous caller does not have storage.objects.get access"). So do the collection 9 and 10 paths I tried and the virtual-host and JSON API forms. A control object in another public bucket returned 200, so the cause is the bucket, not the network. The remaining route is the Earth Engine asset `projects/mapbiomas-public/assets/brazil/lulc/collection11/mapbiomas_brazil_collection11_coverage_v3`, which needs a Google account.
  - Municipal tables work. `https://data.mapbiomas.org/api/access/datafile/535` returned 200, 78.7 MB, `MAPBIOMAS_BRAZIL-COVERAGE_STATISTICS-COL.10.1-MUNICIPALITIES_STATES_BIOMES.xlsx` (doi 10.58053/MapBiomas/SJZOLT). Collection 11 files on the statistics page answer 200, for example `https://brasil.mapbiomas.org/wp-content/uploads/sites/3/2026/10/MAPBIOMAS-BRAZIL-DEFORESTATION-ANNUAL-MUNICIPALITY-COLLECTION_11.xlsx` (31.8 MB). I did not find a collection 11 municipal coverage file on that page, only biome and state.
- **Licence and size.** CC BY 4.0 (Dataverse). Rasters are about 1 GB per year for Brazil (memory).
- **Leakage.** Each collection reclassifies the whole series with temporal filters that look forward, so the map for year t in a recent collection has seen t+1 and t+2. For honest backtests use the collection that existed at the time, or lag by at least two years. This product is satellite-derived, so it adds less new information than the other entries.
- **Evidence.** Souza et al. 2020, Remote Sensing 12(17):2735, doi 10.3390/rs12172735 (the product). Arima et al. 2011, as above, for the pasture and soy frontier mechanism.

## 10. Election cycles and municipal politics

- **Measures.** Municipal election years, whether the incumbent mayor runs again, mayor occupation (farmer), party alignment with state and federal government.
- **Level and coverage.** Municipality, every four years (2008, 2012, 2016, 2020, 2024).
- **Lag.** Candidate registrations are public by August of the election year and results in October. At 31 July of an election year the candidate list is not final, but whether the incumbent may run again is known.
- **Verified access.** `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2020.zip`, 200, 57.8 MB. `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip`, 200, 64.7 MB. HEAD only, contents not opened. TSE uses its own municipality code, so a TSE to IBGE crosswalk is needed.
- **Licence and size.** Open. About 60 MB per election.
- **Leakage.** None.
- **Evidence.** Pailler 2018, JEEM 88:345-365, doi 10.1016/j.jeem.2018.01.008, finds clearing 8 to 10% higher in election years when the incumbent runs (confirmed by search). Bragança and Dahis 2022, Journal of Public Economics 215:104753, doi 10.1016/j.jpubeco.2022.104753, find farmer mayors raised clearing before PPCDAm and not after.

## 11. Undesignated public forest, CNFP yearly editions

- **Measures.** Public forest polygons by category, with "SEM DESTINACAO, TIPO B" marking undesignated land, the main target of land grabbing.
- **Level and coverage.** Polygon. Editions 2009 to 2020, 2022, 2024 and 2025 (no 2021 or 2023).
- **Lag.** Irregular, 6 to 12 months. The 2025 edition files are dated June 2026. At 31 July Y assume the edition for Y-2.
- **Verified access.** Catalogue `https://dados.florestal.gov.br/api/3/action/package_show?id=cadastro-nacional-de-florestas-publicas-cnfp`, 200. Shapefiles come through the ArcGIS portal, for example `https://mapas.florestal.gov.br/portal/sharing/rest/content/items/2b752dfbf9254920bf8990ce363918af/data`, 200, `CNFP_2025.zip`, 229 MB (over the limit, HEAD only). The 2010 edition item `194c4460c07a4e2ba0deae0fc30b5167` is 60.6 MB and the 2022 item `7d477c1d52eb41028a9f0e04036206b8` is 179 MB (both 200, HEAD only). The 2025 attribute CSV returned 200, 2.9 MB, columns `nome;categoria;protecao;tipo;governo;classe;orgao;atolegal;anocriacao;estagio;uf;bioma;municipio;geocodigo;area_ha`.
- **Licence and size.** CC BY. 60 to 230 MB per edition.
- **Leakage.** These are real dated vintages, which is rare and valuable. Later editions lose area that was deforested or titled, so always use the edition that existed at forecast time.
- **Evidence.** Azevedo-Ramos et al. 2020, as above (49.8 Mha undesignated, 2.6 Mha already cleared, memory). Carrero et al. 2022, Land Use Policy, doi 10.1016/j.landusepol.2022.106133.

## 12. Federal budget, staff and travel (Portal da Transparência)

- **Measures.** IBAMA and ICMBio monthly spending by budget action (for example 214N, environmental control and inspection), headcount by unit and state, and paid trips. A supply-side measure of enforcement capacity that is not caused by local clearing.
- **Level and coverage.** National and state by month. Spending from January 2014 (2013 and earlier return 403). Staff from January 2013. Travel files for 2011 to 2013 exist but are about 3 KB, so real content starts later.
- **Lag.** One to two months (October 2026 was available on 15 November). At 31 July Y, through May or June Y.
- **Verified access.** `https://portaldatransparencia.gov.br/download-de-dados/despesas-execucao/202406` redirects to `https://dadosabertos-download.cgu.gov.br/PortalDaTransparencia/saida/despesas-execucao/202406_Despesas.zip`, 200, 7.7 MB, with columns including `Ano e mês do lançamento;Nome Órgão Subordinado;Nome Unidade Gestora;Código Ação;Nome Ação;UF;Município;Valor Empenhado;Valor Liquidado;Valor Pago`. `.../download-de-dados/servidores/202406_Servidores_SIAPE`, 200, 81 MB (HEAD only). `.../download-de-dados/viagens/2024`, 200, 148 MB (first file header read). SIOP is an interactive panel and I verified no file URL there. The Portal API needs a key, the bulk files do not.
- **Licence and size.** Open. About 90 MB per month if staff files are included.
- **Leakage.** Monthly files are rewritten (the June 2024 file was last modified in September 2026). Small.
- **Evidence.** Mostly institutional (TCU audits, INESC budget reports). I know of no municipal-level causal estimate.

## 13. Mining titles, ANM SIGMINE

- **Measures.** Mining process polygons with phase, substance, protocol year and last event.
- **Level and coverage.** Polygon. 270,577 active processes nationally, 13,550 in MT.
- **Lag.** Live.
- **Verified access.** `https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query?where=UF='PA' AND SUBS LIKE '%OURO%'&outFields=*&returnGeometry=false&resultRecordCount=2&f=json` returned 200. Fields are `PROCESSO, NUMERO, ANO, FASE, NOME, SUBS, USO, AREA_HA, UF, ULT_EVENTO`. 2,000 records per page, pagination supported, GeoJSON available. The bulk shapefile and the SCM event microdata on `app.anm.gov.br/dadosabertos` (the only source of grant dates) reset the connection, unverified.
- **Licence and size.** Open government data. Under 500 MB (estimate).
- **Leakage.** The layer is "active processes" today. Lapsed titles are gone and `FASE` is current. Only `ANO` (year of request) is safely dated. Grant dates need the SCM events file.
- **Evidence.** Sonter et al. 2017, Nature Communications 8:1013, doi 10.1038/s41467-017-00557-w, attribute about 9% of Amazon forest loss in 2005 to 2015 to mining, reaching 70 km beyond leases (memory).

## 14. Roads with dates

- **Measures.** Distance to official and unofficial roads, and new road length.
- **Verified access.** DNIT SNV yearly geometries (a search result describes "SNV Bases Geométricas 2013-Atual" on DNIT Cloud and a WFS at `https://servicos.dnit.gov.br/dnitgeo/geoserver/ows`) timed out, unverified. Imazon's road maps (Botelho et al. 2022, Remote Sensing 14(15):3625, doi 10.3390/rs14153625, a 2020 Sentinel-2 map, and the 2008 to 2016 Amazon Road Dataset) have no open download that I could find, unverified. What does work is OpenStreetMap history. `https://api.ohsome.org/v1/elements/length?bboxes=-55.5,-7.5,-54.5,-6.5&time=2012-01-01/2024-01-01/P4Y&filter=highway=* and type:way` returned 200 with dated lengths (177 km in 2012, 2,090 km in 2024 for that box). The IBAMA "vias-despavimentadas" dataset is a 2006 to 2013 reporting form, not a road map.
- **Leakage.** OSM dates are when a mapper drew the road, often from imagery taken after the clearing. Growth in OSM length mostly measures mapping effort. Treat it as static distance only.
- **Evidence.** Barber et al. 2014, Biological Conservation 177:203-209, doi 10.1016/j.biocon.2014.07.004, find about 95% of clearing within 5.5 km of a road or 1 km of a river (memory).

## 15. Not obtained

- **INCRA SIGEF certified parcels.** `sigef.incra.gov.br` answers 200 but the bulk export hosts do not resolve. A gov.br service page describes a per-state shapefile export. Unverified. On titling, Probst et al. 2020, Nature Sustainability, doi 10.1038/s41893-020-0537-2, find Terra Legal titles raised clearing among small and medium holders (memory).
- **ICMBio notices and embargoes.** The ICMBio pages link only Power BI dashboards. No file found.
- **Fundo Amazônia disbursements.** Site and BNDES open data portal unreachable. Evidence for a local effect is weak anyway (Correa et al. 2019, Forests 10(3):272, doi 10.3390/f10030272).
- **SEMA-MT clearing polygons.** Not exposed anonymously, see entry 1.
- **Pre-2013 municipal credit.** See entry 2.

---

## Ranking by expected predictive value times ease of getting dated data

1. SINAFLOR ASV and UAS permits (entry 1)
2. SICOR rural credit (entry 2)
3. Prices and exchange rate interacted with exposure (entries 3 and 7)
4. IBAMA enforcement dynamics, meaning operations, embargo history and payments (entry 4)
5. Priority municipalities list (entry 5)
6. CAR polygons (entry 6), mainly as the join key for 1 and 2
7. IBGE herd and soy panels (entry 7)
8. CNFP undesignated forest vintages (entry 11)
9. Election cycle (entry 10)
10. Regime dummies (entry 8)
11. MapBiomas municipal tables (entry 9)
12. Federal budget, staff, travel (entry 12)
13. Mining titles with gold price (entry 13)
14. Roads (entry 14)
15. SIGEF, ICMBio, Fundo Amazônia (entry 15)

## The three to add first

**Permits.** They address the largest known miss directly, they are dated to the day, public within days, and each one links to a property polygon through the CAR code (join verified). Mato Grosso alone has 3,434 authorisations covering 1.06 Mha. The limits are that the series only starts around 2020 for MT, that the authorised area overstates what gets cleared, and that the location is a property, not the block. Build "authorised area still valid at 31 July, by property and municipality" and let the model learn the execution rate.

**SICOR credit.** It is the only finance variable with a causal estimate for the Amazon, it is monthly by municipality with product detail (cattle, land opening), it is complete through June at forecast time, and since 2017 it has plot polygons and CAR links that give cell-level features. It moves with the amount of clearing, which is where the model is weak. It starts in 2013, so the 2008 to 2012 part of the panel needs the annual yearbook or must be left missing.

**Prices and exchange rate, interacted with municipal exposure.** The cost is close to zero (three small files, all verified, all current to the month before the forecast) and they carry the year-to-year signal that purely spatial inputs cannot. On their own they are national series with 18 points, so they should enter only as interactions (cattle price times herd, soy price in reais times soy area, gold price times mining titles) and be validated on held-out years.

IBAMA enforcement dynamics come next. The data are rich and verified, but they are the most exposed to leakage of anything here and need the embargo history file to be handled correctly.
