"""Fetch Bicing data via the public GBFS feed (no token required)."""

from __future__ import annotations

import json
import time
from typing import Any

import requests

GBFS_STATION_INFO_URL = (
    "https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/station_information"
)
GBFS_STATION_STATUS_URL = (
    "https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/station_status"
)
GBFS_VEHICLE_TYPES_URL = (
    "https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/vehicle_types"
)

_HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "on-son-les-bicis/1.0",
}

# Fallback if vehicle_types cannot be loaded.
MECHANICAL_TYPES = frozenset({"ICONIC", "FIT"})
EBIKE_TYPES = frozenset({"BOOST", "EFIT"})


def _fetch_json(url: str, retries: int = 3) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(url, headers=_HTTP_HEADERS, timeout=30)
            if not resp.ok:
                raise RuntimeError(
                    f"HTTP {resp.status_code} from {url}: {resp.text[:300]}"
                )
            return resp.json()
        except (requests.RequestException, json.JSONDecodeError, RuntimeError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(
        f"Failed to fetch {url} after {retries} attempts: {last_error}"
    ) from last_error


def _localized_name(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and item.get("language") == "ca":
                return str(item.get("text", ""))
        if value and isinstance(value[0], dict):
            return str(value[0].get("text", ""))
    return ""


def _vehicle_type_sets() -> tuple[frozenset[str], frozenset[str]]:
    try:
        payload = _fetch_json(GBFS_VEHICLE_TYPES_URL, retries=2)
        mechanical: set[str] = set()
        electric: set[str] = set()
        for vehicle in payload.get("data", {}).get("vehicle_types", []):
            type_id = vehicle.get("vehicle_type_id")
            if not type_id:
                continue
            propulsion = vehicle.get("propulsion_type", "")
            if propulsion == "human":
                mechanical.add(type_id)
            elif "electric" in propulsion:
                electric.add(type_id)
        if mechanical and electric:
            return frozenset(mechanical), frozenset(electric)
    except Exception:
        pass
    return MECHANICAL_TYPES, EBIKE_TYPES


def _gbfs_status(station: dict[str, Any]) -> str:
    if not station.get("is_installed", True):
        return "OUT_OF_SERVICE"
    if not station.get("is_renting", True) or not station.get("is_returning", True):
        return "TEMPORARILY_OFFLINE"
    return "IN_SERVICE"


def _count_by_type(
    available: list[dict[str, Any]] | None, type_ids: frozenset[str]
) -> int:
    total = 0
    for item in available or []:
        if item.get("vehicle_type_id") in type_ids:
            total += int(item.get("count") or 0)
    return total


def load_gbfs_stations() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], str]:
    """Return station metadata, normalized status rows, and last_updated."""
    mechanical_types, ebike_types = _vehicle_type_sets()
    info_payload = _fetch_json(GBFS_STATION_INFO_URL)
    status_payload = _fetch_json(GBFS_STATION_STATUS_URL)

    info_by_id: dict[str, dict[str, Any]] = {}
    for station in info_payload.get("data", {}).get("stations", []):
        sid = str(station.get("station_id", ""))
        if not sid:
            continue
        info_by_id[sid] = {
            "station_id": sid,
            "name": _localized_name(station.get("name")) or f"Estació {sid}",
            "lat": float(station.get("lat") or 0),
            "lon": float(station.get("lon") or 0),
            "capacity": int(station.get("capacity") or 0),
            "physical_configuration": (
                "ELECTRICBIKESTATION"
                if station.get("is_charging_station")
                else "BIKESTATION"
            ),
            "status": "IN_SERVICE",
        }

    status_list: list[dict[str, Any]] = []
    for station in status_payload.get("data", {}).get("stations", []):
        sid = str(station.get("station_id", ""))
        available = station.get("vehicle_types_available")
        mechanical = _count_by_type(available, mechanical_types)
        ebike = _count_by_type(available, ebike_types)
        total = int(station.get("num_vehicles_available") or mechanical + ebike)
        bikes_disabled = int(station.get("num_vehicles_disabled") or 0)
        status_list.append(
            {
                "station_id": sid,
                "num_bikes_available": total,
                "num_docks_available": int(station.get("num_docks_available") or 0),
                "num_vehicles_disabled": bikes_disabled,
                "num_bikes_available_types": {
                    "mechanical": mechanical,
                    "ebike": ebike,
                },
                "status": _gbfs_status(station),
            }
        )

    last_updated = (
        status_payload.get("last_updated")
        or info_payload.get("last_updated")
        or ""
    )
    return info_by_id, status_list, str(last_updated)
