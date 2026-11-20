"""Point-in-polygon helpers without compiled deps (Python 3.9+ stdlib)."""

from __future__ import annotations

from typing import Any, Sequence


def _ring_contains(lon: float, lat: float, ring: Sequence[Sequence[float]]) -> bool:
    """Ray casting; ring is [[lon, lat], ...] (first==last optional)."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = float(ring[i][0]), float(ring[i][1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi + 0.0) + xi
        ):
            inside = not inside
        j = i
    return inside


def _polygon_contains(lon: float, lat: float, coords: Sequence[Any]) -> bool:
    if not coords:
        return False
    exterior = coords[0]
    if not _ring_contains(lon, lat, exterior):
        return False
    for hole in coords[1:]:
        if _ring_contains(lon, lat, hole):
            return False
    return True


def geometry_contains(lon: float, lat: float, geometry: dict[str, Any]) -> bool:
    """True if WGS84 point is inside a GeoJSON Polygon or MultiPolygon."""
    gtype = geometry.get("type")
    coords = geometry.get("coordinates") or []
    if gtype == "Polygon":
        return _polygon_contains(lon, lat, coords)
    if gtype == "MultiPolygon":
        return any(_polygon_contains(lon, lat, poly) for poly in coords)
    return False


def load_barri_features(geojson: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalize FeatureCollection into lightweight barri records."""
    features: list[dict[str, Any]] = []
    for feature in geojson.get("features", []):
        geom = feature.get("geometry")
        if not geom:
            continue
        props = feature.get("properties", {})
        features.append(
            {
                "codi": props.get("codi_barri", ""),
                "nom": props.get("nom_barri", ""),
                "districte": props.get("nom_districte", ""),
                "geometry": geom,
            }
        )
    return features


def assign_barri(
    lat: float, lon: float, barris: Sequence[dict[str, Any]]
) -> tuple[str, str, str]:
    for barri in barris:
        if geometry_contains(lon, lat, barri["geometry"]):
            return barri["codi"], barri["nom"], barri["districte"]
    return "", "Desconegut", ""
