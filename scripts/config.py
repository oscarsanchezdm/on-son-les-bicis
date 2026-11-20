"""Shared configuration for Bicing data pipeline."""

from __future__ import annotations

import os
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """Load KEY=VALUE pairs without requiring python-dotenv."""
    try:
        from dotenv import load_dotenv

        load_dotenv(path)
        return
    except ImportError:
        pass

    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


ROOT = Path(__file__).resolve().parents[1]
_load_dotenv(ROOT / ".env")

DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "public" / "data"))
STATIC_DIR = DATA_DIR / "static"
DB_PATH = Path(os.environ.get("DB_PATH", ROOT / "db" / "history.db"))
BARRIS_GEOJSON = STATIC_DIR / "barris.geojson"
SUPERFICIE_CSV = STATIC_DIR / "est-superficie.csv"
# Optional: after export, copy JSON/GeoJSON here (e.g. ~/public_html/data)
WEB_DATA_DIR = os.environ.get("WEB_DATA_DIR", "").strip()

# SQLite retention (snapshots + barri_snapshots). 0 = no prune. Default ~6 months.
try:
    DB_RETENTION_DAYS = int(os.environ.get("DB_RETENTION_DAYS", "180").strip() or "180")
except ValueError:
    DB_RETENTION_DAYS = 180

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

_raw_token = os.environ.get("BICING_TOKEN", "").strip()
if _raw_token.startswith("BICING_TOKEN="):
    _raw_token = _raw_token.split("=", 1)[1].strip()
BICING_TOKEN = _raw_token
