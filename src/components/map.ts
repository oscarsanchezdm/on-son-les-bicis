import L from "leaflet";
import "leaflet.heat";
import type { Barri, MetricMode, Station } from "../lib/data";
import { barriMetric, bikesOutOfService, pctOfStations, stationMetric } from "../lib/data";
import { HEAT_LAYER_OPTIONS, buildStationHeatPoints, stationMarkerRadius } from "../lib/heatmap";
import type { TimeView } from "../lib/history";
import { isStationActive } from "../lib/status";
import { pctColor } from "../lib/colors";
import { formatPct } from "../lib/format";

function stationCountsLine(s: Station): string {
  const fs = bikesOutOfService(s.capacity, s.mechanical, s.ebike, s.docks_available);
  return `${s.ebike} E, ${s.mechanical} M, ${s.docks_available} A, ${fs} FS`;
}

function stationPopupHtml(s: Station): string {
  return `${s.name}<br/>${stationCountsLine(s)}`;
}

export type MapView = {
  map: L.Map;
  update: (
    mode: MetricMode,
    barris: Barri[],
    stations: Station[] | null,
    timeView: TimeView
  ) => void;
};

export function createMap(container: HTMLElement, geo: GeoJSON.FeatureCollection): MapView {
  const map = L.map(container, { scrollWheelZoom: true }).setView([41.387, 2.17], 12);

  const barriPane = map.createPane("barriPane");
  barriPane.style.zIndex = "410";
  const heatPane = map.createPane("heatPane");
  heatPane.style.zIndex = "430";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  const stationLayer = L.layerGroup().addTo(map);
  let barriLayer: L.GeoJSON | null = null;
  let heatLayer: (L.Layer & { setLatLngs?: (pts: [number, number, number][]) => void }) | null =
    null;

  function update(
    mode: MetricMode,
    barris: Barri[],
    stations: Station[] | null,
    timeView: TimeView
  ) {
    const byCode = new Map(barris.map((b) => [b.barri_codi, b]));
    const invert = mode === "docks";
    const showStations = timeView.kind === "latest" && stations !== null;

    if (barriLayer) {
      map.removeLayer(barriLayer);
      barriLayer = null;
    }

    barriLayer = L.geoJSON(geo, {
      pane: "barriPane",
      style: (feature) => {
        const codi = String(feature?.properties?.codi_barri ?? "");
        const barri = byCode.get(codi);
        const value = barri ? barriMetric(barri, mode) : 0;
        return {
          fillColor: pctColor(value, invert),
          fillOpacity: showStations ? 0.32 : 0.45,
          color: "#64748b",
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
        const suffix =
          timeView.kind === "hour"
            ? "<br/><em>Mitjana 7 dies a aquesta hora</em>"
            : "";
        layer.bindPopup(
          `<strong>${barri.barri_nom}</strong>${suffix}<br/>
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

    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
    }
    stationLayer.clearLayers();

    if (showStations && stations) {
      const activeStations = stations.filter((s) => isStationActive(s.status));
      const heatPoints = buildStationHeatPoints(activeStations, mode);

      for (const s of activeStations) {
        const value = stationMetric(s, mode);

        L.circleMarker([s.lat, s.lon], {
          radius: stationMarkerRadius(s.capacity),
          fillColor: pctColor(value, invert),
          color: "#334155",
          weight: 1,
          fillOpacity: 0.92,
        })
          .bindPopup(stationPopupHtml(s))
          .bindTooltip(`${s.name}<br/>${stationCountsLine(s)}`, { sticky: true })
          .addTo(stationLayer);
      }

      if (heatPoints.length) {
        heatLayer = (
          L as typeof L & {
            heatLayer: (
              points: [number, number, number][],
              opts: Record<string, unknown>
            ) => L.Layer;
          }
        ).heatLayer(heatPoints, { ...HEAT_LAYER_OPTIONS });
        heatLayer.addTo(map);
      }

      if (!map.hasLayer(stationLayer)) stationLayer.addTo(map);
    } else if (map.hasLayer(stationLayer)) {
      map.removeLayer(stationLayer);
    }

    barriLayer.addTo(map);
  }

  return { map, update };
}
