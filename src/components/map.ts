import L from "leaflet";
import "leaflet-rotate";
import type { Barri, MetricMode, Station } from "../lib/data";
import { barriMetric, bikesOutOfService, pctOfStations, pctOosOfBikeFleet, stationCount, stationOosCount, stationMetric } from "../lib/data";
import {
  createColorHeatLayer,
  stationHitRadius,
  stationMarkerRadius,
  stationNeedsExpandedHitTarget,
  type ColorHeatLayer,
} from "../lib/colorHeatLayer";
import type { TimeView } from "../lib/history";
import { isStationMappable } from "../lib/status";
import {
  absoluteStationRadius,
  metricAbsoluteColor,
  metricAbsoluteOpacity,
  metricPctColor,
  type HeatScaleMode,
} from "../lib/colors";
import { formatPct } from "../lib/format";
import { countIconHtml } from "../lib/icons";

function stationCountsShort(s: Station): string {
  const fs = stationOosCount(s);
  return `${countIconHtml("ebike")} ${s.ebike} ${countIconHtml("mechanical")} ${s.mechanical} ${countIconHtml("dock")} ${s.docks_available} ${countIconHtml("maintenance")} ${fs}`;
}

function stationPopupHtml(s: Station, historical = false): string {
  const fs = stationOosCount(s);
  const suffix = historical ? "<br/><em>Mitjana històrica a aquesta franja</em>" : "";
  return `<strong>${s.name}</strong>${suffix}<br/>
${countIconHtml("dock")} ${s.capacity} ancoratges totals<br/>
${countIconHtml("ebike")} ${s.ebike} elèctriques<br/>
${countIconHtml("mechanical")} ${s.mechanical} mecàniques<br/>
${countIconHtml("dock")} ${s.docks_available} ancoratges lliures<br/>
${countIconHtml("maintenance")} ${fs} fora de servei`;
}

function stationTooltipHtml(s: Station): string {
  return `<strong>${s.name}</strong><br/>${stationCountsShort(s)}`;
}

export type MapView = {
  map: L.Map;
  update: (
    mode: MetricMode,
    barris: Barri[],
    stations: Station[] | null,
    timeView: TimeView,
    selectedBarriCodi?: string | null,
    heatScale?: HeatScaleMode
  ) => void;
  focusBarri: (codi: string | null, stations: Station[] | null) => void;
};

const CITY_CENTER: L.LatLngExpression = [41.387, 2.17];
const CITY_ZOOM = 12;
/** Inclinació horària (sentit horari) per alinear la Gran Via. */
const MAP_BEARING = 45;

export function createMap(container: HTMLElement, geo: GeoJSON.FeatureCollection): MapView {
  const map = L.map(container, {
    scrollWheelZoom: true,
    rotate: true,
    bearing: MAP_BEARING,
    rotateControl: false,
  }).setView(CITY_CENTER, CITY_ZOOM);

  const rotatePane = map.getPane("overlayPane") ?? map.getPane("mapPane")!;
  const barriPane = map.createPane("barriPane", rotatePane);
  barriPane.style.zIndex = "410";
  const heatPane = map.createPane("heatPane", rotatePane);
  heatPane.style.zIndex = "420";
  const stationPane = map.createPane("stationPane", rotatePane);
  stationPane.style.zIndex = "450";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  const stationLayer = L.layerGroup().addTo(map);
  let barriLayer: L.GeoJSON | null = null;
  let heatLayer: ColorHeatLayer | null = null;
  let heatMode: MetricMode | null = null;
  let heatScaleMode: HeatScaleMode = "percent";

  map.on("popupopen", () => {
    stationLayer.eachLayer((layer) => {
      (layer as L.CircleMarker).closeTooltip();
    });
  });

  function update(
    mode: MetricMode,
    barris: Barri[],
    stations: Station[] | null,
    timeView: TimeView,
    selectedBarriCodi: string | null = null,
    heatScale: HeatScaleMode = "percent"
  ) {
    const byCode = new Map(barris.map((b) => [b.barri_codi, b]));
    const showStations = stations !== null;
    const isHistorical = timeView.kind === "hour";

    if (barriLayer) {
      map.removeLayer(barriLayer);
      barriLayer = null;
    }

    barriLayer = L.geoJSON(geo, {
      pane: "barriPane",
      style: (feature) => {
        const codi = String(feature?.properties?.codi_barri ?? "");
        const barri = byCode.get(codi);
        const dimmed = selectedBarriCodi && codi !== selectedBarriCodi;
        if (!barri || dimmed) {
          return {
            fillColor: "#e2e8f0",
            fillOpacity: dimmed ? 0.2 : 0.08,
            color: "#cbd5e1",
            weight: 1,
          };
        }
        const value = barriMetric(barri, mode);
        if (heatScale === "absolute") {
          const fillOpacity = metricAbsoluteOpacity(value);
          return {
            fillColor: metricAbsoluteColor(mode),
            fillOpacity: showStations ? fillOpacity * 0.85 : fillOpacity,
            color: selectedBarriCodi === codi ? "#0f766e" : "#64748b",
            weight: selectedBarriCodi === codi ? 2 : 1,
          };
        }
        return {
          fillColor: metricPctColor(value, mode),
          fillOpacity: showStations ? 0.14 : 0.45,
          color: selectedBarriCodi === codi ? "#0f766e" : "#64748b",
          weight: selectedBarriCodi === codi ? 2 : 1,
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
            barri.docks_available_total,
            barri.bikes_total
          );
        const pctOos = pctOosOfBikeFleet(barri.bikes_total, oos);
        const suffix =
          timeView.kind === "hour"
            ? "<br/><em>Mitjana històrica a aquesta franja</em>"
            : "";
        layer.bindPopup(
          `<strong>${barri.barri_nom}</strong>${suffix}<br/>
          ${barri.capacity_total.toLocaleString("ca-ES")} ancoratges totals<br/>
          Bicicletes: ${formatPct(barri.pct_bikes)} (${barri.bikes_total}/${barri.capacity_total})<br/>
          Elèctriques: ${formatPct(barri.pct_ebike)} · Mecàniques: ${formatPct(barri.pct_mechanical)}<br/>
          Ancoratges lliures: ${formatPct(barri.pct_docks_free)}<br/>
          Fora de servei: ${formatPct(pctOos)}<br/>
          Estacions sense elèctriques: ${formatPct(pctOfStations(barri.stations_zero_ebike, barri.stations_active))} · Sense mecàniques: ${formatPct(pctOfStations(barri.stations_zero_mechanical ?? 0, barri.stations_active))}`
        );
      },
    });

    stationLayer.clearLayers();

    if (showStations && stations) {
      const activeStations = stations.filter((s) => isStationMappable(s));
      const isAbsolute = heatScale === "absolute";
      const maxCount = isAbsolute
        ? Math.max(1, ...activeStations.map((s) => stationCount(s, mode)))
        : 1;

      const expandedHit = stationNeedsExpandedHitTarget();

      for (const s of activeStations) {
        const value = stationMetric(s, mode);
        const count = stationCount(s, mode);
        if (isAbsolute && count <= 0) continue;

        const visualRadius = isAbsolute
          ? absoluteStationRadius(count, maxCount, s.capacity)
          : stationMarkerRadius(s.capacity);
        if (visualRadius <= 0) continue;

        const fillColor = isAbsolute ? metricAbsoluteColor(mode) : metricPctColor(value, mode);
        const fillOpacity = isAbsolute ? 0.55 + 0.4 * Math.pow(count / maxCount, 0.65) : 0.92;
        const popup = stationPopupHtml(s, isHistorical);
        const tooltip = stationTooltipHtml(s);

        const bindStationUi = (layer: L.CircleMarker) => {
          const tooltipOptions = { sticky: true, className: "station-tooltip" };
          return layer
            .bindPopup(popup)
            .bindTooltip(tooltip, tooltipOptions)
            .on("popupopen", () => {
              layer.closeTooltip();
              layer.unbindTooltip();
            })
            .on("popupclose", () => {
              layer.bindTooltip(tooltip, tooltipOptions);
            });
        };

        if (expandedHit) {
          const hitMarker = bindStationUi(
            L.circleMarker([s.lat, s.lon], {
              pane: "stationPane",
              radius: stationHitRadius(visualRadius),
              fillColor: "#000",
              fillOpacity: 0,
              color: "transparent",
              weight: 0,
              className: "station-hit",
            })
          );
          hitMarker.addTo(stationLayer);

          L.circleMarker([s.lat, s.lon], {
            pane: "stationPane",
            radius: visualRadius,
            fillColor,
            color: "#334155",
            weight: 1,
            fillOpacity,
            interactive: false,
            className: "station-dot",
          }).addTo(stationLayer);
        } else {
          bindStationUi(
            L.circleMarker([s.lat, s.lon], {
              pane: "stationPane",
              radius: visualRadius,
              fillColor,
              color: "#334155",
              weight: 1,
              fillOpacity,
            })
          ).addTo(stationLayer);
        }
      }

      if (heatLayer && (heatMode !== mode || heatScaleMode !== heatScale)) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      heatMode = mode;
      heatScaleMode = heatScale;

      if (!heatLayer) {
        heatLayer = createColorHeatLayer(activeStations, mode, heatScale);
        heatLayer.addTo(map);
      } else {
        heatLayer.setStations(activeStations, mode, heatScale);
        if (!map.hasLayer(heatLayer)) heatLayer.addTo(map);
      }

      if (!map.hasLayer(stationLayer)) stationLayer.addTo(map);
    } else {
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      heatMode = null;
      heatScaleMode = "percent";
      if (map.hasLayer(stationLayer)) map.removeLayer(stationLayer);
    }

    barriLayer.addTo(map);
  }

  function focusBarri(codi: string | null, stations: Station[] | null) {
    if (!codi) {
      map.flyTo(CITY_CENTER, CITY_ZOOM, { duration: 0.7 });
      return;
    }

    const barriStations = stations?.filter((s) => s.barri_codi === codi) ?? [];
    if (!barriStations.length) return;

    const bounds = L.latLngBounds(barriStations.map((s) => [s.lat, s.lon] as L.LatLngTuple));
    if (!bounds.isValid()) return;

    map.flyToBounds(bounds, { padding: [56, 56], maxZoom: 16, duration: 0.7 });
  }

  return { map, update, focusBarri };
}
