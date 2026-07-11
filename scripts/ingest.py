#!/usr/bin/env python3
"""Fetch Bicing data, store snapshots, compute barri aggregates."""

from __future__ import annotations

import csv
import json
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, shape

from config import BARRIS_GEOJSON, BICING_TOKEN, DB_PATH, SUPERFICIE_CSV
from gbfs import load_gbfs_stations
from init_db import init_db
from opendata import load_opendata_stations
from status import is_station_active

PREPARED = False
BARRI_POLYGONS: list[dict] = []
SUPERFICIE: dict[str, float] = {}
_TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:25831", always_xy=True)


def _normalize_ts(ts: str | int | float) -> str:
    if isinstance(ts, (int, float)) or (isinstance(ts, str) and str(ts).isdigit()):
        val = int(ts)
        if val > 1_000_000_000_000:
            val //= 1000
        return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
    return str(ts).replace("Z", "+00:00")


def _load_source_data() -> tuple[dict[str, dict], list[dict], str, str]:
    try:
        info_by_id, status_list, last_updated = load_gbfs_stations()
        return info_by_id, status_list, last_updated, "GBFS (B:SM)"
    except Exception as gbfs_error:
        if not BICING_TOKEN:
            raise RuntimeError(
                "GBFS feed failed and BICING_TOKEN is not set for Open Data fallback"
            ) from gbfs_error
        print(f"GBFS failed ({gbfs_error}); falling back to Open Data", file=sys.stderr)
        info_by_id, status_list, last_updated = load_opendata_stations()
        return info_by_id, status_list, last_updated, "Open Data BCN"


def _load_barris() -> None:
    global BARRI_POLYGONS
    if not BARRIS_GEOJSON.exists():
        raise FileNotFoundError(f"Missing {BARRIS_GEOJSON}. Run fetch_static_data.py first.")
    data = json.loads(BARRIS_GEOJSON.read_text(encoding="utf-8"))
    BARRI_POLYGONS = []
    for feature in data.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        props = feature.get("properties", {})
        BARRI_POLYGONS.append(
            {
                "codi": props.get("codi_barri", ""),
                "nom": props.get("nom_barri", ""),
                "districte": props.get("nom_districte", ""),
                "polygon": shape(geom),
            }
        )


def _load_superficie() -> None:
    global SUPERFICIE
    SUPERFICIE = {}
    if not SUPERFICIE_CSV.exists():
        return
    with SUPERFICIE_CSV.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            codi = row.get("codi_barri", "").strip()
            try:
                SUPERFICIE[codi] = float(row.get("superficie_ha") or 0)
            except ValueError:
                continue


def _assign_barri(lat: float, lon: float) -> tuple[str, str, str]:
    """Match station to barri polygon (GeoJSON is WGS84; legacy UTM coords still supported)."""
    point_wgs = Point(lon, lat)
    x, y = _TO_UTM.transform(lon, lat)
    point_utm = Point(x, y)
    for barri in BARRI_POLYGONS:
        polygon = barri["polygon"]
        if polygon.bounds[0] > 180:
            if polygon.contains(point_utm):
                return barri["codi"], barri["nom"], barri["districte"]
        elif polygon.contains(point_wgs):
            return barri["codi"], barri["nom"], barri["districte"]
    return "", "Desconegut", ""


def _pct(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(100.0 * numerator / denominator, 2)


def ingest() -> str:
    init_db()
    _load_barris()
    _load_superficie()

    info_by_id, status_list, last_updated, source = _load_source_data()
    ts = _normalize_ts(last_updated or datetime.now(timezone.utc).isoformat())
    print(f"Data source: {source}")

    station_rows = []
    snapshot_rows = []
    barri_agg: dict[str, dict] = defaultdict(
        lambda: {
            "barri_nom": "",
            "stations_count": 0,
            "stations_active": 0,
            "capacity_total": 0,
            "docks_available_total": 0,
            "bikes_mechanical": 0,
            "bikes_ebike": 0,
            "bikes_total": 0,
            "stations_zero_ebike": 0,
            "stations_zero_mechanical": 0,
            "stations_zero_any": 0,
        }
    )

    for status in status_list:
        sid = str(status["station_id"])
        info = info_by_id.get(sid, {})
        lat = float(info.get("lat") or 0)
        lon = float(info.get("lon") or 0)
        capacity = int(info.get("capacity") or 0)
        name = info.get("name") or f"Estació {sid}"
        config = info.get("physical_configuration") or info.get("config") or ""
        st_status = status.get("status") or info.get("status") or "IN_SERVICE"

        barri_codi, barri_nom, district = _assign_barri(lat, lon)

        mechanical = int(status.get("num_bikes_available_types", {}).get("mechanical") or 0)
        ebike = int(status.get("num_bikes_available_types", {}).get("ebike") or 0)
        total = int(status.get("num_bikes_available") or mechanical + ebike)
        docks = int(status.get("num_docks_available") or 0)
        bikes_disabled = int(
            status.get("num_vehicles_disabled")
            or status.get("num_bikes_disabled")
            or 0
        )
        docks_disabled = int(status.get("num_docks_disabled") or 0)

        station_rows.append(
            (
                sid,
                name,
                lat,
                lon,
                capacity,
                config,
                barri_codi,
                barri_nom,
                district,
                st_status,
                ts,
            )
        )
        snapshot_rows.append(
            (
                ts,
                sid,
                mechanical,
                ebike,
                total,
                docks,
                bikes_disabled,
                docks_disabled,
                capacity,
                _pct(total, capacity),
                _pct(docks, capacity),
                st_status,
            )
        )

        if not barri_codi:
            continue

        agg = barri_agg[barri_codi]
        agg["barri_nom"] = barri_nom
        agg["stations_count"] += 1
        if is_station_active(st_status):
            agg["stations_active"] += 1
            agg["capacity_total"] += capacity
            agg["docks_available_total"] += docks
            agg["bikes_mechanical"] += mechanical
            agg["bikes_ebike"] += ebike
            agg["bikes_total"] += total
        if ebike == 0 and is_station_active(st_status):
            agg["stations_zero_ebike"] += 1
        if mechanical == 0 and is_station_active(st_status):
            agg["stations_zero_mechanical"] += 1
        if total == 0 and is_station_active(st_status):
            agg["stations_zero_any"] += 1

    barri_rows = []
    for codi, agg in barri_agg.items():
        cap = agg["capacity_total"]
        barri_rows.append(
            (
                ts,
                codi,
                agg["barri_nom"],
                agg["stations_count"],
                agg["stations_active"],
                cap,
                agg["docks_available_total"],
                agg["bikes_mechanical"],
                agg["bikes_ebike"],
                agg["bikes_total"],
                _pct(agg["bikes_total"], cap),
                _pct(agg["docks_available_total"], cap),
                _pct(agg["bikes_mechanical"], cap),
                _pct(agg["bikes_ebike"], cap),
                agg["stations_zero_ebike"],
                agg["stations_zero_mechanical"],
                agg["stations_zero_any"],
                SUPERFICIE.get(codi),
            )
        )

    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            """
            INSERT INTO stations (
                station_id, name, lat, lon, capacity, config,
                barri_codi, barri_nom, district, status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(station_id) DO UPDATE SET
                name=excluded.name, lat=excluded.lat, lon=excluded.lon,
                capacity=excluded.capacity, config=excluded.config,
                barri_codi=excluded.barri_codi, barri_nom=excluded.barri_nom,
                district=excluded.district, status=excluded.status,
                updated_at=excluded.updated_at
            """,
            station_rows,
        )
        conn.executemany(
            """
            INSERT INTO snapshots (
                ts, station_id, mechanical, ebike, total, docks_available,
                bikes_disabled, docks_disabled, capacity, pct_bikes, pct_docks_free, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            snapshot_rows,
        )
        conn.executemany(
            """
            INSERT INTO barri_snapshots (
                ts, barri_codi, barri_nom, stations_count, stations_active,
                capacity_total, docks_available_total, bikes_mechanical, bikes_ebike,
                bikes_total, pct_bikes, pct_docks_free,                 pct_mechanical, pct_ebike,
                stations_zero_ebike, stations_zero_mechanical, stations_zero_any, superficie_ha
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            barri_rows,
        )
        conn.commit()

    print(f"Ingested {len(snapshot_rows)} stations at {ts}")
    return ts


if __name__ == "__main__":
    try:
        ingest()
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
