import L from "leaflet";
import "leaflet.heat";
import type { Barri, MetricMode, Station } from "../lib/data";
import { barriMetric, bikesOutOfService, pctOfStations, stationMetric } from "../lib/data";
import {
  HEAT_LAYER_OPTIONS,
  buildHeatContext,
  buildStationHeatPoints,
  stationStress,
} from "../lib/heatmap";
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
          fillOpacity: 0.42,
          color: "#334155",
          weight: 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const codi = String(feature?.properties?.codi_barri ?? "");
        const barri = byCode.get(codi);
        if (!barri) return;
        const oos =
          barri.bikes_out_of_service ??
          bikesOutOfService(
            barri.capacity_total,
            barri.bikes_mechanical,
            barri.bikes_ebike,
            barri.docks_available_total
          );
        layer.bindPopup(
          `<strong>${barri.barri_nom}</strong><br/>
          Bicis: ${formatPct(barri.pct_bikes)} (${barri.bikes_total}/${barri.capacity_total})<br/>
          Elèctriques: ${formatPct(barri.pct_ebike)} · Mecàniques: ${formatPct(barri.pct_mechanical)}<br/>
          Ancoratges lliures: ${formatPct(barri.pct_docks_free)}<br/>
          Bicis fora de servei: <strong>${oos}</strong><br/>
          Sense elèctriques: ${formatPct(pctOfStations(barri.stations_zero_ebike, barri.stations_active))} · Sense mecàniques: ${formatPct(pctOfStations(barri.stations_zero_mechanical ?? 0, barri.stations_active))}`
        );
        layer.bindTooltip(
          `${barri.barri_nom}: ${formatPct(barriMetric(barri, mode))} · fora servei: ${oos}`,
          { sticky: true }
        );
      },
    });

    if (heatLayer) map.removeLayer(heatLayer);
    stationLayer.clearLayers();

    const activeStations = stations.filter((s) => isStationActive(s.status));
    const availabilityValues = activeStations.map((s) => stationMetric(s, mode));
    const heatCtx = buildHeatContext(availabilityValues);
    const heatPoints = buildStationHeatPoints(
      activeStations.map((s) => ({
        lat: s.lat,
        lon: s.lon,
        availability: stationMetric(s, mode),
      })),
      heatCtx
    );

    for (const s of activeStations) {
      const value = stationMetric(s, mode);
      const stress = stationStress(value, heatCtx);
      const oos = bikesOutOfService(s.capacity, s.mechanical, s.ebike, s.docks_available);
      const markerRadius = 4 + (stress / 100) * 4;

      L.circleMarker([s.lat, s.lon], {
        radius: markerRadius,
        fillColor: pctColor(value, invert),
        color: stress >= 60 ? "#7f1d1d" : "#1e293b",
        weight: stress >= 60 ? 2 : 1,
        fillOpacity: 0.95,
      })
        .bindPopup(
          `<strong>${s.name}</strong><br/>
          Barri: ${s.barri_nom || "—"}<br/>
          Mecàniques: ${s.mechanical} · Elèctriques: ${s.ebike}<br/>
          Bicis: ${formatPct(s.pct_bikes)} · Ancoratges lliures: ${formatPct(s.pct_docks_free)}<br/>
          <strong>Bicis fora de servei: ${oos}</strong> · Capacitat: ${s.capacity}`
        )
        .bindTooltip(`${s.name}: ${formatPct(value)} · fora servei: ${oos}`, { sticky: true })
        .addTo(stationLayer);
    }

    if (heatPoints.length) {
      heatLayer = (L as typeof L & {
        heatLayer: (
          points: [number, number, number][],
          opts: Record<string, unknown>
        ) => L.Layer;
      }).heatLayer(heatPoints, { ...HEAT_LAYER_OPTIONS });
      heatLayer.addTo(map);
    }

    barriLayer.addTo(map);
    if (map.hasLayer(stationLayer)) map.removeLayer(stationLayer);
    stationLayer.addTo(map);
  }

  return { map, update };
}
