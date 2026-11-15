"""Shared paths and the model grid.

AZ_F is the number of 10 m raster pixels per cell side: 100 (about 1 km, the default) or 50 (500 m).
Each resolution keeps its own data/grid* and data/model* folders.
"""
import json
import os
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
F = int(os.environ.get("AZ_F", 100))
K = 100 // F  # cells per km
_suffix = "" if F == 100 else str(F)
# AZ_TAG keeps an experiment's outputs apart from the published ones; AZ_X switches experimental inputs on
GRID, OUT = ROOT / f"data/grid{_suffix}", ROOT / f"data/model{_suffix}{os.environ.get('AZ_TAG', '')}"
X = set(filter(None, os.environ.get("AZ_X", "").split(",")))


def load_grid():
    """(counts, info). counts is a read-only memmap [class, row, col] of pixel counts per cell;
    info has west, north, cell (degrees), rows, cols, classes."""
    return np.load(GRID / "counts.npy", mmap_mode="r"), json.load(open(GRID / "grid.json"))
