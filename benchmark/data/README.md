# Benchmark data

`grid.json` and `manifest.json` are in git. The truth files are release assets of this repository, and `python benchmark/score.py --fetch` downloads them here and checks each sha256 against `manifest.json`.

| File | Content |
|---|---|
| `grid.json` | west, north, cell (degrees), rows, cols of the 500 m grid. Row 0 is north. |
| `truth_<year>.npz` | for 2022 to 2026: `cleared`, `forest`, `inside`, `near3`, described in [docs/BENCHMARK.md](../../docs/BENCHMARK.md) |
| `manifest.json` | benchmark version, where the files are, their sha256 and size |

`pipeline/benchdata.py` writes the truth files from the PRODES raster of INPE (Legal Amazon, 2025 release) and, for 2026, from the PRODES 2026 polygons of INPE's priority scenes.

## Licence

The truth files are derived from PRODES, © INPE, distributed through [TerraBrasilis](https://terrabrasilis.dpi.inpe.br) under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). They carry the same licence. If you redistribute them or build on them, credit INPE PRODES and keep the licence.
