#!/usr/bin/env python3
"""Download static reference data (barris GeoJSON, superficie CSV)."""

from __future__ import annotations

import csv
import io
import json
import sys
import zipfile
from io import StringIO

import requests

from config import BARRIS_GEOJSON, BARRIS_SOURCE_URL, STATIC_DIR, SUPERFICIE_CSV


def _download_zip_json(url: str) -> dict:
    resp = requests.get(url, timeout=180)
    resp.raise_for_status()
    content = resp.content
    if content[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            polygon_name = next(
                (n for n in zf.namelist() if "POLIGONS" in n.upper()), zf.namelist()[0]
            )
            points_name = next(
                (n for n in zf.namelist() if "PUNTS" in n.upper()), None
            )
            polygons = json.loads(zf.read(polygon_name))
            points = json.loads(zf.read(points_name)) if points_name else {"features": []}
            return {"polygons": polygons, "points": points}
    return {"polygons": json.loads(content.decode("utf-8")), "points": {"features": []}}


def _barri_names(points: dict) -> dict[tuple[str, str], dict]:
    names: dict[tuple[str, str], dict] = {}
    for feature in points.get("features", []):
        props = feature.get("properties", {})
        if props.get("TIPUS_UA") != "BARRI" and props.get("ELEM_DESCR") != "Nom de barri":
            continue
        dist = str(props.get("DISTRICTE", "")).zfill(2)
        barri = str(props.get("BARRI", "")).zfill(2)
        names[(dist, barri)] = {
            "nom_barri": props.get("NOM") or props.get("NDESCR_CA") or "",
            "codi_barri": f"{dist}{barri}",
        }
    return names


def download_barris() -> None:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading barris from {BARRIS_SOURCE_URL}")
    payload = _download_zip_json(BARRIS_SOURCE_URL)
    polygons = payload["polygons"]
    names = _barri_names(payload["points"])

    district_names = {
        str(f["properties"].get("DISTRICTE", "")).zfill(2): ""
        for f in payload["points"].get("features", [])
        if f["properties"].get("TIPUS_UA") == "DISTRICTE"
    }
    for feature in payload["points"].get("features", []):
        props = feature.get("properties", {})
        if props.get("TIPUS_UA") == "DISTRICTE":
            district_names[str(props.get("DISTRICTE", "")).zfill(2)] = props.get("NOM", "")

    features = []
    for feature in polygons.get("features", []):
        props = feature.get("properties", {})
        if props.get("NIVELL") != "ADM_03_PL":
            continue
        dist = str(props.get("DISTRICTE", "")).zfill(2)
        barri = str(props.get("BARRI", "")).zfill(2)
        meta = names.get((dist, barri), {})
        codi = meta.get("codi_barri") or f"{dist}{barri}"
        nom = meta.get("nom_barri") or f"Barri {dist}-{barri}"
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "codi_barri": codi,
                    "nom_barri": nom,
                    "codi_districte": dist,
                    "nom_districte": district_names.get(dist, ""),
                },
                "geometry": feature.get("geometry"),
            }
        )

    simplified = {"type": "FeatureCollection", "features": features}
    BARRIS_GEOJSON.write_text(json.dumps(simplified, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {len(features)} barris to {BARRIS_GEOJSON}")


def download_superficie() -> None:
    """Fetch barri surface area via CKAN API."""
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    package_url = (
        "https://opendata-ajuntament.barcelona.cat/data/api/action/"
        "package_show?id=est-superficie"
    )
    resp = requests.get(package_url, timeout=60)
    resp.raise_for_status()
    resources = resp.json()["result"]["resources"]
    csv_resources = [r for r in resources if r.get("format", "").upper() == "CSV"]
    if not csv_resources:
        print("No CSV resource found for est-superficie, skipping", file=sys.stderr)
        return

    csv_resources.sort(key=lambda r: r.get("name", ""), reverse=True)
    url = csv_resources[0]["url"]
    print(f"Downloading superficie from {url}")
    data_resp = requests.get(url, timeout=60)
    data_resp.raise_for_status()

    reader = csv.DictReader(StringIO(data_resp.text))
    rows = []
    for row in reader:
        keys = {k.lower(): v for k, v in row.items()}
        codi_dist = (keys.get("codi_districte") or keys.get("02.codi_districte") or "").zfill(2)
        codi_barri = (keys.get("codi_barri") or keys.get("04.codi_barri") or "").zfill(2)
        rows.append(
            {
                "codi_barri": f"{codi_dist}{codi_barri}",
                "nom_barri": keys.get("nom_barri") or keys.get("05.nom_barri") or "",
                "superficie_ha": keys.get("superfície (ha)")
                or keys.get("superficie (ha)")
                or keys.get("06.superfície (ha)")
                or "",
            }
        )

    with SUPERFICIE_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["codi_barri", "nom_barri", "superficie_ha"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} rows to {SUPERFICIE_CSV}")


def main() -> None:
    download_barris()
    try:
        download_superficie()
    except Exception as exc:  # noqa: BLE001
        print(f"Warning: could not download superficie: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
