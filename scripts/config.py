"""Shared configuration for Bicing data pipeline."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
STATIC_DIR = DATA_DIR / "static"
DB_PATH = Path(os.environ.get("DB_PATH", ROOT / "db" / "history.db"))
BARRIS_GEOJSON = STATIC_DIR / "barris.geojson"
SUPERFICIE_CSV = STATIC_DIR / "est-superficie.csv"

STATION_INFO_URL = (
    "https://opendata-ajuntament.barcelona.cat/data/dataset/"
    "bd2462df-6e1e-4e37-8205-a4b8e7313b84/resource/"
    "f60e9291-5aaa-417d-9b91-612a9de800aa/download/recurs.json"
)
STATION_STATUS_URL = (
    "https://opendata-ajuntament.barcelona.cat/data/dataset/"
    "6aa3416d-ce1a-494d-861b-7bd07f069600/resource/"
    "1b215493-9e63-4a12-8980-2d7e0fa19f85/download/recurs.json"
)

BARRIS_SOURCE_URL = (
    "https://opendata-ajuntament.barcelona.cat/data/dataset/"
    "808daafa-d9ce-48c0-925a-fa5afdb1ed41/resource/"
    "cd800462-f326-429f-a67a-c69b7fc4c50a/download"
)

load_dotenv(ROOT / ".env")
BICING_TOKEN = os.environ.get("BICING_TOKEN", "")
