"""Helpers for Bicing station status values."""

from __future__ import annotations

ACTIVE_STATUSES = frozenset(
    {"ACTIVE", "IN_SERVICE", "TEMPORARILY_OFFLINE", "OUT_OF_SERVICE"}
)


def is_station_active(status: str | None) -> bool:
    return (status or "").upper() in {"ACTIVE", "IN_SERVICE"}
