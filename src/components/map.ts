import L from "leaflet";
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
          fillOpacity: 0.55,
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
          Ancoratges lliures: ${formatPct(barri.pct_docks_free)}<br/>
          Estacions sense ebike: ${barri.stations_zero_ebike}`
        );
        layer.bindTooltip(`${barri.barri_nom}: ${formatPct(barriMetric(barri, mode))}`, {
          sticky: true,
        });
      },
    }).addTo(map);

    stationLayer.clearLayers();
    for (const s of stations) {
      if (!isStationActive(s.status)) continue;
      const value = stationMetric(s, mode);
      L.circleMarker([s.lat, s.lon], {
        radius: 5,
        fillColor: pctColor(value, invert),
        color: "#1e293b",
        weight: 1,
        fillOpacity: 0.9,
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
  }

  return { map, update };
}
