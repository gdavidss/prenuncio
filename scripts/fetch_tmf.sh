#!/bin/bash
# JRC Tropical Moist Forest v1: first degradation year and first deforestation year, 30 m, 10 degree
# tiles over the Amazon, about 3 GB, into data/tmf. unet/tmf.py grids them.
set -u
cd "$(dirname "$0")/.." && mkdir -p data/tmf && cd data/tmf
one() { f=$1_$2_$3.tif; [ -s $f ] || curl -sf -m 3600 -o $f.part "https://ies-ows.jrc.ec.europa.eu/iforce/tmf_v1/download.py?type=tile&dataset=$1&lat=$2&lon=$3" && mv $f.part $f || echo "FAILED $f"; }
export -f one
for ds in DegradationYear DeforestationYear; do for la in N10 N0 S10; do for lo in W80 W70 W60 W50; do echo $ds $la $lo; done; done; done | xargs -P 8 -L 1 bash -c 'one $0 $1 $2'
ls *.tif | wc -l
