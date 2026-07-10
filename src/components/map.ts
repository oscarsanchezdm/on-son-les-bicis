import L from "leaflet";
import "leaflet.heat";
import type { Barri, MetricMode, Station } from "../lib/data";
import { barriMetric, stationMetric } from "../lib/data";
import { isStationActive } from "../lib/status";
import { pctColor } from "../lib/colors";
import { formatPct } from "../lib/format";

export type MapView = {
  map: L.Map;
  update: (mode: MetricMode, barris: Barri[], stations: Station[]) => void;
};

export function createMap(container: HTMLElement, geo: GeoJSON.FeatureCollection): MapView {
  const map = L.map(container, { scrollWheelZoom: true }).setView([41.387, 2.17], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    maxZoom: 19,
  }).addTo(map);

  const stationLayer = L.layerGroup().addTo(map);
  let barriLayer: L.GeoJSON | null = null;
  let heatLayer: L.Layer | null = null;

  function update(mode: MetricMode, barris: Barri[], stations: Station[]) {
    const byCode = new Map(barris.map((b) => [b.barri_codi, b]));
    const invert = mode === "docks";

    if (barriLayer) map.removeLayer(barriLayer);
    barriLayer = L.geoJSON(geo, {
      style: (feature) => {
        const codi = String(feature?.properties?.codi_barri ?? "");
        const barri = byCode.get(codi);
        const value = barri ? barriMetric(barri, mode) : 0;
        return {
          fillColor: pctColor(value, invert),
          fillOpacity: 0.45,
          color: "#334155",
          weight: 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const codi = String(feature?.properties?.codi_barri ?? "");
        const barri = byCode.get(codi);
        if (!barri) return;
        layer.bindPopup(
          `<strong>${barri.barri_nom}</strong><br/>
          Bicis: ${formatPct(barri.pct_bikes)} (${barri.bikes_total}/${barri.capacity_total})<br/>
          Elèctriques: ${formatPct(barri.pct_ebike)}<br/>
          Mecàniques: ${formatPct(barri.pct_mechanical)}<br/>
          Ancoratges lliures: ${formatPct(barri.pct_docks_free)}<br/>
          Sense elèctriques: ${barri.stations_zero_ebike} · Sense mecàniques: ${barri.stations_zero_mechanical ?? 0}`
        );
        layer.bindTooltip(`${barri.barri_nom}: ${formatPct(barriMetric(barri, mode))}`, {
          sticky: true,
        });
      },
    }).addTo(map);

    if (heatLayer) map.removeLayer(heatLayer);
    const heatPoints: [number, number, number][] = [];
    stationLayer.clearLayers();

    for (const s of stations) {
      if (!isStationActive(s.status)) continue;
      const value = stationMetric(s, mode);
      const intensity = Math.max(0.15, value / 100);
      heatPoints.push([s.lat, s.lon, intensity]);

      L.circleMarker([s.lat, s.lon], {
        radius: 5,
        fillColor: pctColor(value, invert),
        color: "#1e293b",
        weight: 1,
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<strong>${s.name}</strong><br/>
          Barri: ${s.barri_nom || "—"}<br/>
          Mecàniques: ${s.mechanical} · Elèctriques: ${s.ebike}<br/>
          Bicis: ${formatPct(s.pct_bikes)} · Ancoratges lliures: ${formatPct(s.pct_docks_free)}<br/>
          Capacitat: ${s.capacity}`
        )
        .addTo(stationLayer);
    }

    if (heatPoints.length) {
      heatLayer = (L as typeof L & {
        heatLayer: (
          points: [number, number, number][],
          opts: Record<string, unknown>
        ) => L.Layer;
      }).heatLayer(heatPoints, {
        radius: 28,
        blur: 22,
        maxZoom: 14,
        minOpacity: 0.35,
        gradient: invert
          ? { 0.2: "#b91c1c", 0.5: "#f59e0b", 0.8: "#84cc16", 1: "#15803d" }
          : { 0.2: "#b91c1c", 0.5: "#f59e0b", 0.8: "#84cc16", 1: "#15803d" },
      });
      heatLayer.addTo(map);
      stationLayer.bringToFront();
    }
  }

  return { map, update };
}
