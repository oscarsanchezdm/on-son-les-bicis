#!/usr/bin/env python3
"""Export SQLite data to JSON/GeoJSON for GitHub Pages."""

from __future__ import annotations

import gzip
import json
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")

from config import DATA_DIR, DB_PATH, ROOT
from status import is_station_active


def _normalize_ts(ts: str | int | float) -> str:
    """Normalize API timestamp to ISO-8601."""
    if isinstance(ts, (int, float)) or (isinstance(ts, str) and ts.isdigit()):
        val = int(ts)
        # Heuristic: seconds vs milliseconds
        if val > 1_000_000_000_000:
            val //= 1000
        return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
    return str(ts).replace("Z", "+00:00")


def _bikes_out_of_service(
    capacity: int,
    mechanical: int,
    ebike: int,
    docks_available: int,
    bikes_available: int | None = None,
    bikes_disabled: int | None = None,
    docks_disabled: int | None = None,
) -> int:
    """FS bikes: GBFS num_vehicles_disabled when present, else residual inference."""
    if bikes_disabled is not None and bikes_disabled > 0:
        return max(0, bikes_disabled)
    available = bikes_available if bikes_available is not None else mechanical + ebike
    if available <= 0:
        return 0
    disabled_docks = max(0, docks_disabled or 0)
    return max(0, capacity - mechanical - ebike - docks_available - disabled_docks)


def _latest_ts(conn: sqlite3.Connection) -> str | None:
    rows = conn.execute("SELECT DISTINCT ts FROM snapshots").fetchall()
    if not rows:
        return None
    parsed = sorted((_normalize_ts(r[0]), r[0]) for r in rows)
    return parsed[-1][1]


def _export_latest(conn: sqlite3.Connection, ts: str, ts_iso: str) -> None:
    stations = conn.execute(
        """
        SELECT s.station_id, s.name, s.lat, s.lon, s.capacity, s.config,
               s.barri_codi, s.barri_nom, s.district, s.status,
               sn.mechanical, sn.ebike, sn.total, sn.docks_available,
               COALESCE(sn.bikes_disabled, 0), COALESCE(sn.docks_disabled, 0),
               sn.pct_bikes, sn.pct_docks_free
        FROM stations s
        JOIN snapshots sn ON sn.station_id = s.station_id AND sn.ts = ?
        ORDER BY s.station_id
        """,
        (ts,),
    ).fetchall()

    station_list = []
    features = []
    barri_oos: dict[str, int] = defaultdict(int)
    barri_docks_disabled: dict[str, int] = defaultdict(int)
    total_oos = 0
    totals = {
        "capacity": 0,
        "bikes_total": 0,
        "bikes_mechanical": 0,
        "bikes_ebike": 0,
        "docks_available": 0,
        "stations_active": 0,
        "stations_zero_ebike": 0,
        "stations_zero_mechanical": 0,
        "stations_zero_any": 0,
    }

    for row in stations:
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
            status,
            mechanical,
            ebike,
            total,
            docks,
            bikes_disabled,
            docks_disabled,
            pct_bikes,
            pct_docks,
        ) = row
        item = {
            "station_id": sid,
            "name": name,
            "lat": lat,
            "lon": lon,
            "capacity": capacity,
            "config": config,
            "barri_codi": barri_codi,
            "barri_nom": barri_nom,
            "district": district,
            "status": status,
            "mechanical": mechanical,
            "ebike": ebike,
            "total": total,
            "docks_available": docks,
            "bikes_disabled": bikes_disabled,
            "docks_disabled": docks_disabled,
            "pct_bikes": pct_bikes,
            "pct_docks_free": pct_docks,
        }
        station_list.append(item)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {k: v for k, v in item.items() if k not in {"lat", "lon"}},
            }
        )
        if is_station_active(status):
            station_oos = _bikes_out_of_service(
                capacity, mechanical, ebike, docks, total, bikes_disabled, docks_disabled
            )
            total_oos += station_oos
            if barri_codi:
                barri_oos[barri_codi] += station_oos
                barri_docks_disabled[barri_codi] += max(0, docks_disabled or 0)
            totals["capacity"] += capacity
            totals["bikes_total"] += total
            totals["bikes_mechanical"] += mechanical
            totals["bikes_ebike"] += ebike
            totals["docks_available"] += docks
            totals["stations_active"] += 1
            if ebike == 0:
                totals["stations_zero_ebike"] += 1
            if mechanical == 0:
                totals["stations_zero_mechanical"] += 1
            if total == 0:
                totals["stations_zero_any"] += 1

    barris = conn.execute(
        """
        SELECT barri_codi, barri_nom, stations_count, stations_active,
               capacity_total, docks_available_total, bikes_mechanical, bikes_ebike,
               bikes_total, pct_bikes, pct_docks_free, pct_mechanical, pct_ebike,
               stations_zero_ebike, stations_zero_mechanical, stations_zero_any, superficie_ha
        FROM barri_snapshots WHERE ts = ?
        ORDER BY pct_bikes ASC
        """,
        (ts,),
    ).fetchall()

    barri_list = []
    worst_barri = None
    for row in barris:
        item = {
            "barri_codi": row[0],
            "barri_nom": row[1],
            "stations_count": row[2],
            "stations_active": row[3],
            "capacity_total": row[4],
            "docks_available_total": row[5],
            "bikes_mechanical": row[6],
            "bikes_ebike": row[7],
            "bikes_total": row[8],
            "pct_bikes": row[9],
            "pct_docks_free": row[10],
            "pct_mechanical": row[11],
            "pct_ebike": row[12],
            "stations_zero_ebike": row[13],
            "stations_zero_mechanical": row[14],
            "stations_zero_any": row[15],
            "superficie_ha": row[16],
        }
        oos = barri_oos.get(item["barri_codi"], 0)
        cap = item["capacity_total"]
        item["bikes_out_of_service"] = oos
        item["pct_bikes_out_of_service"] = (
            round(100 * oos / cap, 2) if cap else 0
        )
        item["docks_disabled_total"] = barri_docks_disabled.get(item["barri_codi"], 0)
        barri_list.append(item)
        if worst_barri is None or item["pct_bikes"] < worst_barri["pct_bikes"]:
            worst_barri = item

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "latest.json").write_text(
        json.dumps(
            {
                "last_updated": ts_iso,
                "totals": {
                    **totals,
                    "pct_bikes": round(
                        100 * totals["bikes_total"] / totals["capacity"], 2
                    )
                    if totals["capacity"]
                    else 0,
                    "pct_docks_free": round(
                        100 * totals["docks_available"] / totals["capacity"], 2
                    )
                    if totals["capacity"]
                    else 0,
                    "pct_mechanical": round(
                        100 * totals["bikes_mechanical"] / totals["capacity"], 2
                    )
                    if totals["capacity"]
                    else 0,
                    "pct_ebike": round(
                        100 * totals["bikes_ebike"] / totals["capacity"], 2
                    )
                    if totals["capacity"]
                    else 0,
                    "bikes_out_of_service": total_oos,
                    "pct_bikes_out_of_service": round(
                        100 * total_oos / totals["capacity"],
                        2,
                    )
                    if totals["capacity"]
                    else 0,
                    "worst_barri": worst_barri,
                },
                "stations": station_list,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    (DATA_DIR / "barris-latest.json").write_text(
        json.dumps({"last_updated": ts_iso, "barris": barri_list}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (DATA_DIR / "stations-latest.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False),
        encoding="utf-8",
    )
    station_ids = [row[0] for row in conn.execute("SELECT station_id FROM stations ORDER BY station_id").fetchall()]
    (DATA_DIR / "station-ids.json").write_text(
        json.dumps(
            {"generated_at": ts_iso, "ids": station_ids},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    (DATA_DIR / "meta.json").write_text(
        json.dumps(
            {
                "last_updated": ts_iso,
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "source": "Bicing (GBFS — B:SM)",
                "station_count": len(station_list),
                "barri_count": len(barri_list),
                "disclaimer": "Dades amb retard d'uns minuts. Només estacions en servei entren als percentatges agregats.",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _export_history(conn: sqlite3.Connection, ts: str, ts_iso: str) -> None:
    """Export hourly snapshot for history averages."""
    dt = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
    hour_key = dt.strftime("%Y-%m-%d-%H")

    hourly_dir = DATA_DIR / "history" / "hourly"
    hourly_dir.mkdir(parents=True, exist_ok=True)

    barri_rows = conn.execute(
        """
        SELECT barri_codi, barri_nom, bikes_total, bikes_mechanical, bikes_ebike,
               capacity_total, docks_available_total, pct_bikes, pct_docks_free,
               pct_ebike, stations_active, stations_zero_ebike, stations_zero_mechanical
        FROM barri_snapshots WHERE ts = ?
        """,
        (ts,),
    ).fetchall()

    station_ids = [row[0] for row in conn.execute("SELECT station_id FROM stations ORDER BY station_id").fetchall()]
    snapshot_by_id = {
        row[0]: row[1:]
        for row in conn.execute(
            """
            SELECT station_id, mechanical, ebike, total, docks_available,
                   COALESCE(bikes_disabled, 0), COALESCE(docks_disabled, 0)
            FROM snapshots WHERE ts = ?
            """,
            (ts,),
        ).fetchall()
    }
    station_values = [
        list(snapshot_by_id.get(sid, (0, 0, 0, 0, 0, 0)))
        for sid in station_ids
    ]

    hourly_payload = {
        "ts": ts_iso,
        "barris": [
            {
                "barri_codi": r[0],
                "barri_nom": r[1],
                "bikes_total": r[2],
                "bikes_mechanical": r[3],
                "bikes_ebike": r[4],
                "capacity_total": r[5],
                "docks_available_total": r[6],
                "pct_bikes": r[7],
                "pct_docks_free": r[8],
                "pct_ebike": r[9],
                "stations_active": r[10],
                "stations_zero_ebike": r[11],
                "stations_zero_mechanical": r[12],
            }
            for r in barri_rows
        ],
        "v": station_values,
    }

    hourly_path = hourly_dir / f"{hour_key}.json.gz"
    with gzip.open(hourly_path, "wt", encoding="utf-8") as f:
        json.dump(hourly_payload, f, ensure_ascii=False)

    # Prune old hourly files (keep 30 days)
    cutoff = dt.timestamp() - 30 * 86400
    for path in hourly_dir.glob("*.json.gz"):
        try:
            file_dt = datetime.strptime(_hourly_file_key(path), "%Y-%m-%d-%H")
            if file_dt.timestamp() < cutoff:
                path.unlink()
        except ValueError:
            continue

    _export_history_index(hourly_dir, ts_iso)


def _day_type_from_dt(dt: datetime) -> str:
    dow = dt.weekday()  # Monday=0 … Sunday=6
    if dow == 4:
        return "friday"
    if dow == 5:
        return "saturday"
    if dow == 6:
        return "sunday"
    return "weekday"


def _hourly_file_key(path: Path) -> str:
    name = path.name
    if name.endswith(".json.gz"):
        return name[: -len(".json.gz")]
    return path.stem


def _export_history_index(hourly_dir: Path, ts_iso: str) -> None:
    files: list[dict] = []
    hours_by_day_type: dict[str, set[int]] = {
        "weekday": set(),
        "friday": set(),
        "saturday": set(),
        "sunday": set(),
    }

    for path in sorted(hourly_dir.glob("*.json.gz")):
        key = _hourly_file_key(path)
        try:
            dt_utc = datetime.strptime(key, "%Y-%m-%d-%H").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        dt = dt_utc.astimezone(MADRID)
        day_type = _day_type_from_dt(dt)
        local_hour = dt.hour
        files.append(
            {
                "key": key,
                "localDate": dt.strftime("%Y-%m-%d"),
                "localHour": local_hour,
                "dayType": day_type,
            }
        )
        hours_by_day_type[day_type].add(local_hour)

    history_dir = DATA_DIR / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    (history_dir / "history-index.json").write_text(
        json.dumps(
            {
                "generated_at": ts_iso,
                "timezone": "Europe/Madrid",
                "hoursByDayType": {
                    k: sorted(v) for k, v in hours_by_day_type.items()
                },
                "files": files,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _load_existing_summary_series() -> list[dict]:
    """Keep 7d history across ephemeral CI runs (SQLite is not committed)."""
    summary_path = DATA_DIR / "history" / "summary-7d.json"
    if not summary_path.exists():
        return []
    try:
        payload = json.loads(summary_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    return payload.get("series", []) if isinstance(payload, dict) else []


def _export_summary_7d(conn: sqlite3.Connection, ts_iso: str) -> None:
    """City-level time series and per-hour averages for the last 7 days."""
    dt_now = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
    cutoff_dt = dt_now - timedelta(days=7)

    rows = conn.execute(
        """
        SELECT ts,
               SUM(bikes_total), SUM(capacity_total),
               SUM(bikes_mechanical), SUM(bikes_ebike),
               SUM(docks_available_total)
        FROM barri_snapshots
        GROUP BY ts
        ORDER BY ts
        """,
    ).fetchall()

    series_by_ts: dict[str, dict] = {
        entry["ts"]: entry
        for entry in _load_existing_summary_series()
        if isinstance(entry, dict) and entry.get("ts")
    }

    for raw_ts, bikes, cap, mech, ebike, docks in rows:
        ts = _normalize_ts(raw_ts)
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(MADRID)
        if dt < cutoff_dt.astimezone(MADRID):
            continue
        cap = cap or 0
        bikes = bikes or 0
        docks = docks or 0
        mech = mech or 0
        ebike = ebike or 0
        oos = _bikes_out_of_service(cap, mech, ebike, docks, bikes)
        fleet = bikes + oos
        series_by_ts[ts] = {
            "ts": ts,
            "date": dt.strftime("%d/%m"),
            "hour": dt.hour,
            "pct_bikes": round(100 * bikes / cap, 2) if cap else 0,
            "pct_mechanical": round(100 * mech / cap, 2) if cap else 0,
            "pct_ebike": round(100 * ebike / cap, 2) if cap else 0,
            "pct_oos_anchors": round(100 * oos / cap, 2) if cap else 0,
            "pct_oos_fleet": round(100 * oos / fleet, 2) if fleet else 0,
            "bikes_total": bikes,
            "bikes_mechanical": mech,
            "bikes_ebike": ebike,
            "bikes_out_of_service": oos,
        }

    series = sorted(series_by_ts.values(), key=lambda entry: entry["ts"])
    by_hour: dict[int, list[dict]] = defaultdict(list)
    for entry in series:
        by_hour[entry["hour"]].append(entry)

    hourly: list[dict] = []
    for hour in range(24):
        samples = by_hour.get(hour, [])
        if not samples:
            continue
        hourly.append(
            {
                "hour": hour,
                "avg_pct_bikes": round(sum(s["pct_bikes"] for s in samples) / len(samples), 2),
                "avg_pct_mechanical": round(
                    sum(s["pct_mechanical"] for s in samples) / len(samples), 2
                ),
                "avg_pct_ebike": round(sum(s["pct_ebike"] for s in samples) / len(samples), 2),
                "avg_bikes_total": round(
                    sum(s.get("bikes_total", 0) for s in samples) / len(samples)
                ),
                "avg_bikes_mechanical": round(
                    sum(s.get("bikes_mechanical", 0) for s in samples) / len(samples)
                ),
                "avg_bikes_ebike": round(
                    sum(s.get("bikes_ebike", 0) for s in samples) / len(samples)
                ),
                "samples": samples,
            }
        )

    history_dir = DATA_DIR / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    (history_dir / "summary-7d.json").write_text(
        json.dumps(
            {
                "generated_at": ts_iso,
                "series": series,
                "hourly": hourly,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def export() -> None:
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database not found: {DB_PATH}")

    with sqlite3.connect(DB_PATH) as conn:
        ts = _latest_ts(conn)
        if not ts:
            raise RuntimeError("No snapshots in database")
        ts_iso = _normalize_ts(ts)
        _export_latest(conn, ts, ts_iso)
        _export_history(conn, ts, ts_iso)
        _export_summary_7d(conn, ts_iso)

    print(f"Exported data for {ts}")


if __name__ == "__main__":
    try:
        export()
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
