"""Fetch Bicing data from Open Data BCN (requires BICING_TOKEN)."""

from __future__ import annotations

import json
import time
from typing import Any

import requests

from config import BICING_TOKEN, STATION_INFO_URL, STATION_STATUS_URL


def _headers() -> dict[str, str]:
    if not BICING_TOKEN:
        raise RuntimeError("BICING_TOKEN is not set")
    return {
        "Authorization": BICING_TOKEN,
        "Accept": "application/json",
        "User-Agent": "on-son-les-bicis/1.0",
    }


def _fetch_json(url: str, retries: int = 3) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(
                url,
                headers=_headers(),
                timeout=30,
                allow_redirects=False,
            )
            if resp.status_code in {301, 302, 303, 307, 308}:
                location = resp.headers.get("Location", "")
                raise RuntimeError(
                    f"Redirected to {location or 'unknown'} — token invàlid o bot detection"
                )
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


def load_opendata_stations() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], str]:
    info_data = _fetch_json(STATION_INFO_URL)
    status_data = _fetch_json(STATION_STATUS_URL)
    info_by_id = {
        str(station["station_id"]): station
        for station in info_data["data"]["stations"]
    }
    status_list = status_data["data"]["stations"]
    last_updated = status_data.get("last_updated") or info_data.get("last_updated") or ""
    return info_by_id, status_list, str(last_updated)
