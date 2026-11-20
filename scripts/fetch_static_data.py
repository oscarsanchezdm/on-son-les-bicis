#!/usr/bin/env python3
"""Download static reference data (barris GeoJSON, superficie CSV).

Needs pyproj only when regenerating barris from the Ajuntament UTM source.
On shared hosting, keep the committed public/data/static/ files and skip this.
"""

from __future__ import annotations

import csv
import io
import json
import sys
import urllib.request
import zipfile
from io import StringIO

from config import BARRIS_GEOJSON, BARRIS_SOURCE_URL, STATIC_DIR, SUPERFICIE_CSV
from http_json import fetch_json


def _download_bytes(url: str, timeout: float = 180) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "on-son-les-bicis/1.0", "Accept": "*/*"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _download_zip_json(url: str) -> dict:
    content = _download_bytes(url)
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


def _get_transformer():
    try:
        from pyproj import Transformer
    except ImportError as exc:
        raise RuntimeError(
            "pyproj is required to regenerate barris.geojson from UTM source. "
            "On shared hosting, use the committed public/data/static/barris.geojson "
            "instead of running this script."
        ) from exc
    return Transformer.from_crs("EPSG:25831", "EPSG:4326", always_xy=True)


def _reproject_coords(coords, transformer):
    if isinstance(coords[0], (int, float)):
        lon, lat = transformer.transform(coords[0], coords[1])
        return [lon, lat]
    return [_reproject_coords(c, transformer) for c in coords]


def _reproject_geometry(geometry: dict, transformer) -> dict:
    geom = dict(geometry)
    if geom.get("coordinates"):
        geom["coordinates"] = _reproject_coords(geom["coordinates"], transformer)
    return geom


def download_barris() -> None:
    transformer = _get_transformer()
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
                "geometry": _reproject_geometry(feature.get("geometry") or {}, transformer),
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
    payload = fetch_json(package_url, timeout=60, retries=2)
    resources = payload["result"]["resources"]
    csv_resources = [r for r in resources if r.get("format", "").upper() == "CSV"]
    if not csv_resources:
        print("No CSV resource found for est-superficie, skipping", file=sys.stderr)
        return

    csv_resources.sort(key=lambda r: r.get("name", ""), reverse=True)
    url = csv_resources[0]["url"]
    print(f"Downloading superficie from {url}")
    text = _download_bytes(url, timeout=60).decode("utf-8", errors="replace")

    reader = csv.DictReader(StringIO(text))
    rows = []
    for row in reader:
        keys = {k.lower(): v for k, v in row.items()}
        codi_dist = (keys.get("codi_districte") or keys.get("02.codi_districte") or "").zfill(2)
        codi_barri = (keys.get("codi_barri") or keys.get("04.codi_barri") or "").zfill(2)
        superficie_raw = (
            keys.get("superfície (ha)")
            or keys.get("superficie (ha)")
            or keys.get("06.superfície (ha)")
            or keys.get("06.superficie (ha)")
            or keys.get("superficie_ha")
            or ""
        )
        rows.append(
            {
                "codi_barri": f"{codi_dist}{codi_barri}",
                "nom_barri": keys.get("nom_barri") or keys.get("05.nom_barri") or "",
                "superficie_ha": str(superficie_raw).strip().replace(",", "."),
            }
        )

    with SUPERFICIE_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["codi_barri", "nom_barri", "superficie_ha"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Saved {len(rows)} rows to {SUPERFICIE_CSV}")


def main() -> None:
    force = "--force" in sys.argv
    if BARRIS_GEOJSON.exists() and not force:
        print(f"Keeping existing {BARRIS_GEOJSON} (pass --force to regenerate)")
    else:
        download_barris()
    try:
        if SUPERFICIE_CSV.exists() and not force:
            print(f"Keeping existing {SUPERFICIE_CSV} (pass --force to regenerate)")
        else:
            download_superficie()
    except Exception as exc:  # noqa: BLE001
        print(f"Warning: could not download superficie: {exc}", file=sys.stderr)


if __name__ == "__main__":
    main()
