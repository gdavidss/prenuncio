#!/bin/sh
# Downloads the raw inputs. Idempotent: skips files already present. Usage: scripts/fetch.sh
set -eu
RAW="$(cd "$(dirname "$0")/.." && pwd)/data/raw"
TB=https://terrabrasilis.dpi.inpe.br

get() { # get <subdir> <filename> <url>
  mkdir -p "$RAW/$1"
  [ -s "$RAW/$1/$2" ] && return 0
  echo "fetch $1/$2"
  curl -fL --retry 5 --retry-delay 10 -C - -o "$RAW/$1/$2.part" "$3"
  mv "$RAW/$1/$2.part" "$RAW/$1/$2"
  case "$2" in *.zip) (cd "$RAW/$1" && unzip -oq "$2") ;; esac
}

# INPE PRODES: 30 m raster with forest / non-forest / water / deforestation year, Legal Amazon
get prodes_raster prodes.zip "$TB/download/dataset/legal-amz-prodes/raster/prodes_amazonia_legal_2025_v20261019.zip"
# PRODES 2026 increments for the priority scenes (the freshest ground truth, Aug 2025 to Jul 2026)
get prodes_2026_pri pri.zip "$TB/download/dataset/legal-amz-prodes/vector/prodes_amazonia_legal_2026_pri_v20261016.zip"
# INPE DETER-B alerts, full history, daily dates
get deter deter.zip "$TB/file-delivery/download/deter-amz/shape"
# boundaries and tenure, as distributed by INPE
get aux_ti ti.zip "$TB/download/dataset/legal-amz-aux/vector/indigenous_area_legal_amazon.zip"
get aux_uc uc.zip "$TB/download/dataset/legal-amz-aux/vector/conservation_units_legal_amazon.zip"
get aux_mun mun.zip "$TB/download/dataset/legal-amz-aux/vector/municipalities_legal_amazon.zip"
get aux_uf uf.zip "$TB/download/dataset/legal-amz-aux/vector/states_legal_amazon.zip"
get aux_border border.zip "$TB/download/dataset/legal-amz-aux/vector/brazilian_legal_amazon.zip"

# INPE active fires, reference satellite (AQUA afternoon pass), one zip per calendar year
FIRE=https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv
for y in $(seq 2003 2025); do get fire "focos_br_ref_$y.zip" "$FIRE/anual/Brasil_sat_ref/focos_br_ref_$y.zip"; done
# current year: monthly all-satellite files are 150 MB each, keep only the reference satellite rows
mkdir -p "$RAW/fire_2026"
for m in 01 02 03 04 05 06 07 08 09 10; do
  f="$RAW/fire_2026/aqua_2026$m.csv"
  [ -s "$f" ] || { echo "fetch fire_2026/$m"; curl -fsL --retry 5 "$FIRE/mensal/Brasil/focos_mensal_br_2026$m.csv" | awk 'NR==1 || /AQUA_M-T/' > "$f.part" && mv "$f.part" "$f"; }
done
# IBAMA enforcement: embargoes (with dates and areas) and infraction notices with coordinates.
# These files carry names and CPF/CNPJ of the people fined. Only place, date and area are ever
# read out of them (pipeline/layers.py); never copy the raw files into anything that gets deployed.
IB=https://stibamadadosabertosprd.blob.core.windows.net/dados-abertos/dados
get ibama_embargo termo_de_embargo.csv "$IB/TERMOS_DE_EMBARGO/TERMO_EMBARGO/termo_de_embargo.csv"
get ibama_autos autos.zip "$IB/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip"
get ibama_autos_coord coordenada.csv "$IB/SIFISC/auto_infracao/coordenada/coordenada.csv"
# ENSO and tropical Atlantic indices
get climate oni.txt https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt
get climate tna.txt https://psl.noaa.gov/data/correlation/tna.data
echo done
