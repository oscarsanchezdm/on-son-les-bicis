import L from "leaflet";
import "leaflet-rotate";
import type { Barri, MetricMode, Station } from "../lib/data";
import { barriMetric, pctOfStations, stationCount, stationMetric, stationOosCount } from "../lib/data";
import {
  createColorHeatLayer,
  mapZoomVisualScale,
  stationHitRadius,
  stationMarkerRadius,
  stationNeedsExpandedHitTarget,
  type ColorHeatLayer,
} from "../lib/colorHeatLayer";
import type { TimeView } from "../lib/history";
import { hourViewScopeLabel } from "../lib/history";
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
import {
  bindStationDonutInPopup,
  breakdownFromBarri,
  breakdownFromStation,
  renderStationPopupContent,
  type StationPopupContext,
} from "../lib/stationDonut";

function stationCountsShort(s: Station): string {
  const fs = stationOosCount(s);
  return `${countIconHtml("ebike")} ${s.ebike} ${countIconHtml("mechanical")} ${s.mechanical} ${countIconHtml("dock")} ${s.docks_available} ${countIconHtml("maintenance")} ${fs}`;
}

function popupContext(timeView: TimeView): StationPopupContext {
  if (timeView.kind === "hour") {
    return {
      historical: true,
      historicalLabel: hourViewScopeLabel(timeView.hour, timeView.dayType),
    };
  }
  return {};
}

function stationPopupHtml(s: Station, timeView: TimeView): string {
  const ctx = popupContext(timeView);
  return renderStationPopupContent(breakdownFromStation(s, ctx), ctx);
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
  focusStation: (stationId: string | null) => void;
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
  const stationOfflinePane = map.createPane("stationOfflinePane", rotatePane);
  stationOfflinePane.style.zIndex = "430";
  const stationPane = map.createPane("stationPane", rotatePane);
  stationPane.style.zIndex = "450";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);

  const stationLayer = L.layerGroup().addTo(map);
  const offlineStationLayer = L.layerGroup().addTo(map);
  const stationMarkers = new Map<string, L.CircleMarker>();
  let barriLayer: L.GeoJSON | null = null;
  let heatLayer: ColorHeatLayer | null = null;
  let heatMode: MetricMode | null = null;
  let heatScaleMode: HeatScaleMode = "percent";
  type UpdateArgs = [
    MetricMode,
    Barri[],
    Station[] | null,
    TimeView,
    string | null | undefined,
    HeatScaleMode | undefined,
  ];
  let lastUpdateArgs: UpdateArgs | null = null;

  map.on("zoomend", () => {
    if (!lastUpdateArgs) return;
    update(...lastUpdateArgs);
  });

  map.on("popupopen", (e) => {
    for (const layer of [stationLayer, offlineStationLayer]) {
      layer.eachLayer((l) => {
        (l as L.CircleMarker).closeTooltip();
      });
    }
    bindStationDonutInPopup(e.popup.getElement() ?? undefined);
  });

  function update(
    mode: MetricMode,
    barris: Barri[],
    stations: Station[] | null,
    timeView: TimeView,
    selectedBarriCodi: string | null = null,
    heatScale: HeatScaleMode = "percent"
  ) {
    lastUpdateArgs = [mode, barris, stations, timeView, selectedBarriCodi, heatScale];
    const zoom = map.getZoom();
    const zoomScale = mapZoomVisualScale(zoom);
    const byCode = new Map(barris.map((b) => [b.barri_codi, b]));
    const showStations = stations !== null;

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
            fillOpacity: showStations ? fillOpacity * 0.55 : fillOpacity,
            color: selectedBarriCodi === codi ? "#0f766e" : "#64748b",
            weight: selectedBarriCodi === codi ? 2 : 1,
          };
        }
        return {
          fillColor: metricPctColor(value, mode),
          fillOpacity: showStations ? 0.08 : 0.45,
          color: selectedBarriCodi === codi ? "#0f766e" : "#64748b",
          weight: selectedBarriCodi === codi ? 2 : 1,
        };
      },
      onEachFeature: (feature, layer) => {
        const codi = String(feature?.properties?.codi_barri ?? "");
        const barri = byCode.get(codi);
        if (!barri) return;
        const barriCtx = popupContext(timeView);
        layer.bindPopup(
          renderStationPopupContent(breakdownFromBarri(barri, barriCtx), barriCtx) +
            `<p class="station-popup__extra">Estacions sense elèctriques: ${formatPct(pctOfStations(barri.stations_zero_ebike, barri.stations_active))} · Sense mecàniques: ${formatPct(pctOfStations(barri.stations_zero_mechanical ?? 0, barri.stations_active))}</p>`
        );
      },
    });

    stationLayer.clearLayers();
    offlineStationLayer.clearLayers();
    stationMarkers.clear();

    if (showStations && stations) {
      const activeStations = stations.filter((s) => isStationMappable(s));
      const offlineStations = stations.filter((s) => !isStationMappable(s));
      const isAbsolute = heatScale === "absolute";
      const maxCount = isAbsolute
        ? Math.max(1, ...activeStations.map((s) => stationCount(s, mode)))
        : 1;

      const expandedHit = stationNeedsExpandedHitTarget();

      for (const s of offlineStations) {
        if (!s.lat || !s.lon) continue;
        const popup = stationPopupHtml(s, timeView);
        const tooltip = stationTooltipHtml(s);
        const marker = L.circleMarker([s.lat, s.lon], {
          pane: "stationOfflinePane",
          radius: Math.max(3, 4 * zoomScale),
          fillColor: "#94a3b8",
          fillOpacity: 0.55,
          color: "#94a3b8",
          weight: 1,
          className: "station-dot station-dot--offline",
        })
          .bindPopup(popup)
          .bindTooltip(tooltip, { sticky: true, className: "station-tooltip" })
          .on("popupopen", function (this: L.CircleMarker) {
            this.closeTooltip();
            this.unbindTooltip();
          })
          .on("popupclose", function (this: L.CircleMarker) {
            this.bindTooltip(tooltip, { sticky: true, className: "station-tooltip" });
          });
        marker.addTo(offlineStationLayer);
        stationMarkers.set(s.station_id, marker);
      }

      for (const s of activeStations) {
        const value = stationMetric(s, mode);
        const count = stationCount(s, mode);
        if (isAbsolute && count <= 0) continue;

        const visualRadius = isAbsolute
          ? Math.max(3, absoluteStationRadius(count, maxCount, s.capacity) * zoomScale)
          : stationMarkerRadius(s.capacity, zoom);
        if (visualRadius <= 0) continue;

        const fillColor = isAbsolute ? metricAbsoluteColor(mode) : metricPctColor(value, mode);
        const fillOpacity = isAbsolute ? 0.55 + 0.4 * Math.pow(count / maxCount, 0.65) : 0.92;
        const popup = stationPopupHtml(s, timeView);
        const tooltip = stationTooltipHtml(s);

        const bindStationUi = (layer: L.CircleMarker) => {
          stationMarkers.set(s.station_id, layer);
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
      if (!map.hasLayer(offlineStationLayer)) offlineStationLayer.addTo(map);
    } else {
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      heatMode = null;
      heatScaleMode = "percent";
      if (map.hasLayer(stationLayer)) map.removeLayer(stationLayer);
      if (map.hasLayer(offlineStationLayer)) map.removeLayer(offlineStationLayer);
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

  function focusStation(stationId: string | null) {
    if (!stationId) return;
    const marker = stationMarkers.get(stationId);
    if (!marker) return;
    const latlng = marker.getLatLng();
    map.flyTo(latlng, Math.max(map.getZoom(), 15), { duration: 0.5 });
    window.setTimeout(() => marker.openPopup(), 400);
  }

  return { map, update, focusBarri, focusStation };
}
