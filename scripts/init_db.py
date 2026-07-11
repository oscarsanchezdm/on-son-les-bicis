#!/usr/bin/env python3
"""Create SQLite schema for Bicing history."""

from __future__ import annotations

import sqlite3

from config import DB_PATH


SCHEMA = """
CREATE TABLE IF NOT EXISTS stations (
    station_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    config TEXT,
    barri_codi TEXT,
    barri_nom TEXT,
    district TEXT,
    status TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    station_id TEXT NOT NULL,
    mechanical INTEGER NOT NULL DEFAULT 0,
    ebike INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    docks_available INTEGER NOT NULL DEFAULT 0,
    capacity INTEGER NOT NULL DEFAULT 0,
    pct_bikes REAL NOT NULL DEFAULT 0,
    pct_docks_free REAL NOT NULL DEFAULT 0,
    status TEXT,
    FOREIGN KEY (station_id) REFERENCES stations(station_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);
CREATE INDEX IF NOT EXISTS idx_snapshots_station_ts ON snapshots(station_id, ts);

CREATE TABLE IF NOT EXISTS barri_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    barri_codi TEXT NOT NULL,
    barri_nom TEXT NOT NULL,
    stations_count INTEGER NOT NULL DEFAULT 0,
    stations_active INTEGER NOT NULL DEFAULT 0,
    capacity_total INTEGER NOT NULL DEFAULT 0,
    docks_available_total INTEGER NOT NULL DEFAULT 0,
    bikes_mechanical INTEGER NOT NULL DEFAULT 0,
    bikes_ebike INTEGER NOT NULL DEFAULT 0,
    bikes_total INTEGER NOT NULL DEFAULT 0,
    pct_bikes REAL NOT NULL DEFAULT 0,
    pct_docks_free REAL NOT NULL DEFAULT 0,
    pct_mechanical REAL NOT NULL DEFAULT 0,
    pct_ebike REAL NOT NULL DEFAULT 0,
    stations_zero_ebike INTEGER NOT NULL DEFAULT 0,
    stations_zero_mechanical INTEGER NOT NULL DEFAULT 0,
    stations_zero_any INTEGER NOT NULL DEFAULT 0,
    superficie_ha REAL
);

CREATE INDEX IF NOT EXISTS idx_barri_snapshots_ts ON barri_snapshots(ts);
CREATE INDEX IF NOT EXISTS idx_barri_snapshots_codi_ts ON barri_snapshots(barri_codi, ts);
"""


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)
        # Deduplicate snapshots before unique index (migration)
        conn.execute(
            """
            DELETE FROM snapshots
            WHERE id NOT IN (
                SELECT MAX(id) FROM snapshots GROUP BY ts, station_id
            )
            """
        )
        try:
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_unique ON snapshots(ts, station_id)"
            )
        except sqlite3.IntegrityError:
            pass
        for col in ("stations_zero_mechanical",):
            try:
                conn.execute(
                    f"ALTER TABLE barri_snapshots ADD COLUMN {col} INTEGER NOT NULL DEFAULT 0"
                )
            except sqlite3.OperationalError:
                pass
        try:
            conn.execute(
                "ALTER TABLE snapshots ADD COLUMN bikes_disabled INTEGER NOT NULL DEFAULT 0"
            )
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute(
                "ALTER TABLE snapshots ADD COLUMN docks_disabled INTEGER NOT NULL DEFAULT 0"
            )
        except sqlite3.OperationalError:
            pass
        conn.commit()
    print(f"Database initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
