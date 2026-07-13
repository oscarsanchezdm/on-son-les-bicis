"""Fetch Bicing data from Open Data BCN (requires BICING_TOKEN).

Compatible with the bicing-hassio integration (same endpoints and Authorization header).
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any

import requests

from config import BICING_TOKEN, DATA_DIR, STATION_INFO_URL, STATION_STATUS_URL


def _mask_token(token: str, prefix: int = 4, suffix: int = 4) -> str:
    """Mostra com comença i acaba el token, sense exposar-lo sencer."""
    token = token.strip()
    if not token:
        return "(buit)"
    if len(token) <= prefix + suffix:
        if len(token) <= 2:
            return "*" * len(token)
        return f"{token[0]}***{token[-1]}"
    middle = max(3, len(token) - prefix - suffix)
    return f"{token[:prefix]}{'*' * middle}{token[-suffix:]}"


def _log_opendata_failure(url: str, error: Exception) -> None:
    headers = _headers()
    masked_auth = _mask_token(headers["Authorization"])
    print(
        "\n".join(
            [
                "Open Data BCN — petició fallida (xivato)",
                f"  GET {url}",
                f"  Authorization: {masked_auth} (len={len(BICING_TOKEN or '')})",
                f"  Accept: {headers['Accept']}",
                "  User-Agent: (no personalitzat; mateix patró que bicing-hassio)",
                "  allow_redirects: false",
                "  timeout: 30s",
                f"  Error: {error}",
            ]
        ),
        file=sys.stderr,
    )


def _headers() -> dict[str, str]:
    if not BICING_TOKEN:
        raise RuntimeError("BICING_TOKEN is not set")
    return {
        "Authorization": BICING_TOKEN,
        "Accept": "application/json",
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
            try:
                return resp.json()
            except json.JSONDecodeError as exc:
                snippet = resp.text[:300].replace("\n", " ")
                raise RuntimeError(
                    f"Non-JSON response from {url} (HTTP {resp.status_code}): {snippet}"
                ) from exc
        except (requests.RequestException, RuntimeError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(2 * attempt)
    _log_opendata_failure(url, last_error or RuntimeError("unknown error"))
    raise RuntimeError(
        f"Failed to fetch {url} after {retries} attempts: {last_error}"
    ) from last_error


def _load_cached_station_info() -> dict[str, dict[str, Any]]:
    """Reuse committed station metadata; only live status needs the API."""
    latest_path = DATA_DIR / "latest.json"
    if not latest_path.exists():
        return {}
    try:
        payload = json.loads(latest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}

    info_by_id: dict[str, dict[str, Any]] = {}
    for station in payload.get("stations", []):
        sid = str(station.get("station_id", ""))
        if not sid:
            continue
        info_by_id[sid] = {
            "station_id": sid,
            "name": station.get("name", ""),
            "lat": station.get("lat", 0),
            "lon": station.get("lon", 0),
            "capacity": station.get("capacity", 0),
            "physical_configuration": station.get("config", ""),
            "status": station.get("status", "IN_SERVICE"),
        }
    return info_by_id


def load_opendata_stations() -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]], str]:
    """Return station metadata, normalized status rows, and last_updated."""
    info_by_id = _load_cached_station_info()
    info_last_updated = ""
    if not info_by_id:
        try:
            info_data = _fetch_json(STATION_INFO_URL)
        except Exception as exc:
            print(
                f"Open Data BCN: falla info d'estacions ({STATION_INFO_URL})",
                file=sys.stderr,
            )
            raise exc
        info_by_id = {
            str(station["station_id"]): station
            for station in info_data["data"]["stations"]
        }
        info_last_updated = str(info_data.get("last_updated") or "")

    try:
        status_data = _fetch_json(STATION_STATUS_URL)
    except Exception as exc:
        print(
            f"Open Data BCN: falla estat d'estacions ({STATION_STATUS_URL})",
            file=sys.stderr,
        )
        raise exc
    status_list = status_data["data"]["stations"]
    last_updated = (
        status_data.get("last_updated")
        or info_last_updated
        or ""
    )
    return info_by_id, status_list, str(last_updated)
