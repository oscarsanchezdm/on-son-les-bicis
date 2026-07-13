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
  return (
    renderStationPopupContent(breakdownFromStation(s, ctx), ctx) +
    `<button type="button" class="station-popup__filter" data-station-filter="${s.station_id}">Filtrar per estació</button>`
  );
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

export function createMap(
  container: HTMLElement,
  geo: GeoJSON.FeatureCollection,
  options?: {
    onBarriFilter?: (barri: Barri) => void;
    onStationFilter?: (station: Station) => void;
  }
): MapView {
  const map = L.map(container, {
    scrollWheelZoom: true,
    // Ratolins amb scroll suau envien molts esdeveniments wheel; ampliar el debounce
    // i els píxels per nivell redueix zoomends consecutius i redibuixos del heatmap.
    wheelDebounceTime: 80,
    wheelPxPerZoomLevel: 90,
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
  const onBarriFilter = options?.onBarriFilter ?? null;
  const onStationFilter = options?.onStationFilter ?? null;
  let stationsById = new Map<string, Station>();
  let barrisByCode = new Map<string, Barri>();
  type UpdateArgs = [
    MetricMode,
    Barri[],
    Station[] | null,
    TimeView,
    string | null | undefined,
    HeatScaleMode | undefined,
  ];
  let lastUpdateArgs: UpdateArgs | null = null;

  type MarkerTooltip = { html: string; options: L.TooltipOptions };
  const markerTooltips = new WeakMap<L.CircleMarker, MarkerTooltip>();

  type StationMarkerMeta = {
    station: Station;
    offline: boolean;
    isAbsolute: boolean;
    maxCount: number;
    visualMarker?: L.CircleMarker;
  };
  const markerMeta = new WeakMap<L.CircleMarker, StationMarkerMeta>();

  function bindMarkerTooltip(marker: L.CircleMarker, html: string, options: L.TooltipOptions): void {
    markerTooltips.set(marker, { html, options });
    marker.bindTooltip(html, options);
  }

  function closeAllStationTooltips(): void {
    for (const layer of [stationLayer, offlineStationLayer]) {
      layer.eachLayer((l) => {
        (l as L.CircleMarker).closeTooltip();
      });
    }
    // Capsetes orfes (Leaflet sticky) després de zoom amb el ratolí a sobre
    map.getContainer().querySelectorAll(".leaflet-tooltip.station-tooltip").forEach((el) => {
      el.remove();
    });
  }

  let zoomScaleTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleMarkerZoomScale(): void {
    if (zoomScaleTimer !== null) clearTimeout(zoomScaleTimer);
    zoomScaleTimer = setTimeout(() => {
      zoomScaleTimer = null;
      applyMarkerZoomScale();
    }, 120);
  }

  map.on("zoomstart", closeAllStationTooltips);
  map.on("zoomend", () => {
    closeAllStationTooltips();
    scheduleMarkerZoomScale();
  });

  function restoreAllStationTooltips(): void {
    for (const layer of [stationLayer, offlineStationLayer]) {
      layer.eachLayer((l) => {
        const marker = l as L.CircleMarker;
        const stored = markerTooltips.get(marker);
        if (!stored) return;
        if (marker.getTooltip()) return;
        marker.bindTooltip(stored.html, stored.options);
      });
    }
  }

  map.on("popupopen", (e) => {
    for (const layer of [stationLayer, offlineStationLayer]) {
      layer.eachLayer((l) => {
        const marker = l as L.CircleMarker;
        marker.closeTooltip();
        marker.unbindTooltip();
      });
    }
    const source = e.popup._source as L.CircleMarker | undefined;
    source?.closeTooltip();
    source?.unbindTooltip();
    bindStationDonutInPopup(e.popup.getElement() ?? undefined);
    bindBarriFilterInPopup(e.popup.getElement() ?? undefined);
    bindStationFilterInPopup(e.popup.getElement() ?? undefined);
  });

  map.on("popupclose", () => {
    restoreAllStationTooltips();
  });

  function bindBarriFilterInPopup(popupEl: HTMLElement | undefined): void {
    if (!popupEl || !onBarriFilter) return;
    const btn = popupEl.querySelector<HTMLButtonElement>("[data-barri-filter]");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const codi = btn.dataset.barriFilter;
      if (!codi) return;
      const barri = barrisByCode.get(codi);
      if (!barri) return;
      onBarriFilter(barri);
      map.closePopup();
    });
  }

  function bindStationFilterInPopup(popupEl: HTMLElement | undefined): void {
    if (!popupEl || !onStationFilter) return;
    const btn = popupEl.querySelector<HTMLButtonElement>("[data-station-filter]");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.stationFilter;
      if (!id) return;
      const station = stationsById.get(id);
      if (!station) return;
      onStationFilter(station);
      map.closePopup();
    });
  }

  function barriPopupHtml(
    barri: Barri,
    barriCtx: StationPopupContext,
    barriStations: Station[]
  ): string {
    return (
      renderStationPopupContent(breakdownFromBarri(barri, barriCtx, barriStations), barriCtx) +
      `<button type="button" class="station-popup__filter" data-barri-filter="${barri.barri_codi}">Filtrar per barri</button>` +
      `<p class="station-popup__extra">Estacions sense elèctriques: ${formatPct(pctOfStations(barri.stations_zero_ebike, barri.stations_active))} · Sense mecàniques: ${formatPct(pctOfStations(barri.stations_zero_mechanical ?? 0, barri.stations_active))}</p>`
    );
  }

  function barriLayerStyle(feature: GeoJSON.Feature | undefined): L.PathOptions {
    if (!lastUpdateArgs) {
      return { fillColor: "#e2e8f0", fillOpacity: 0.08, color: "#cbd5e1", weight: 1 };
    }
    const [mode, , stations, , selectedBarriCodi, heatScale = "percent"] = lastUpdateArgs;
    const showStations = stations !== null;
    const codi = String(feature?.properties?.codi_barri ?? "");
    const barri = barrisByCode.get(codi);
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
  }

  function refreshBarriPopups(
    timeView: TimeView,
    stationsByBarri: Map<string, Station[]>
  ): void {
    if (!barriLayer) return;
    const barriCtx = popupContext(timeView);
    barriLayer.eachLayer((layer) => {
      const feature = (layer as L.GeoJSON).feature;
      const codi = String(feature?.properties?.codi_barri ?? "");
      const barri = barrisByCode.get(codi);
      if (!barri) return;
      const popup = barriPopupHtml(barri, barriCtx, stationsByBarri.get(codi) ?? []);
      if (layer.getPopup()) layer.setPopupContent(popup);
      else layer.bindPopup(popup);
    });
  }

  function applyMarkerZoomScale(): void {
    if (!lastUpdateArgs) return;
    const [mode, , stations, , , heatScale = "percent"] = lastUpdateArgs;
    if (!stations) return;
    const zoom = map.getZoom();
    const zoomScale = mapZoomVisualScale(zoom);
    const isAbsolute = heatScale === "absolute";
    const activeStations = stations.filter((s) => isStationMappable(s));
    const maxCount = isAbsolute
      ? Math.max(1, ...activeStations.map((s) => stationCount(s, mode)))
      : 1;

    const resizeMarker = (marker: L.CircleMarker) => {
      const meta = markerMeta.get(marker);
      if (!meta) return;
      const { station: s, offline, isAbsolute: abs, maxCount: max, visualMarker } = meta;
      if (offline) {
        marker.setRadius(Math.max(3, 4 * zoomScale));
        return;
      }
      const count = stationCount(s, mode);
        const visualRadius = abs
          ? Math.max(3, absoluteStationRadius(count, max, s.capacity, mode) * zoomScale)
          : stationMarkerRadius(s.capacity, zoom);
      if (visualMarker) {
        marker.setRadius(stationHitRadius(visualRadius));
        visualMarker.setRadius(visualRadius);
      } else {
        marker.setRadius(visualRadius);
      }
    };

    stationLayer.eachLayer((layer) => resizeMarker(layer as L.CircleMarker));
    offlineStationLayer.eachLayer((layer) => resizeMarker(layer as L.CircleMarker));
    heatLayer?.redraw();
  }

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
    barrisByCode = byCode;
    stationsById = new Map((stations ?? []).map((s) => [s.station_id, s]));
    const showStations = stations !== null;
    const stationsByBarri = new Map<string, Station[]>();
    if (stations) {
      for (const s of stations) {
        const list = stationsByBarri.get(s.barri_codi) ?? [];
        list.push(s);
        stationsByBarri.set(s.barri_codi, list);
      }
    }

    if (!barriLayer) {
      barriLayer = L.geoJSON(geo, {
        pane: "barriPane",
        style: barriLayerStyle,
        onEachFeature: (feature, layer) => {
          const codi = String(feature?.properties?.codi_barri ?? "");
          const barri = byCode.get(codi);
          if (!barri) return;
          const barriCtx = popupContext(timeView);
          layer.bindPopup(
            barriPopupHtml(barri, barriCtx, stationsByBarri.get(codi) ?? [])
          );
        },
      });
    } else {
      barriLayer.setStyle(barriLayerStyle);
      refreshBarriPopups(timeView, stationsByBarri);
    }

    closeAllStationTooltips();
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
      const tooltipOptions = { sticky: true, className: "station-tooltip" };

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
          .bindPopup(popup);
        bindMarkerTooltip(marker, tooltip, tooltipOptions);
        markerMeta.set(marker, { station: s, offline: true, isAbsolute, maxCount });
        marker.addTo(offlineStationLayer);
        stationMarkers.set(s.station_id, marker);
      }

      for (const s of activeStations) {
        const value = stationMetric(s, mode);
        const count = stationCount(s, mode);
        if (isAbsolute && count <= 0) continue;

        const visualRadius = isAbsolute
          ? Math.max(3, absoluteStationRadius(count, maxCount, s.capacity, mode) * zoomScale)
          : stationMarkerRadius(s.capacity, zoom);
        if (visualRadius <= 0) continue;

        const fillColor = isAbsolute ? metricAbsoluteColor(mode) : metricPctColor(value, mode);
        const fillOpacity = isAbsolute ? 0.55 + 0.4 * Math.pow(count / maxCount, 0.65) : 0.92;
        const popup = stationPopupHtml(s, timeView);
        const tooltip = stationTooltipHtml(s);

        const bindStationUi = (layer: L.CircleMarker, visualMarker?: L.CircleMarker) => {
          stationMarkers.set(s.station_id, layer);
          markerMeta.set(layer, { station: s, offline: false, isAbsolute, maxCount, visualMarker });
          return layer.bindPopup(popup);
        };

        if (expandedHit) {
          const visualMarker = L.circleMarker([s.lat, s.lon], {
            pane: "stationPane",
            radius: visualRadius,
            fillColor,
            color: "#334155",
            weight: 1,
            fillOpacity,
            interactive: false,
            className: "station-dot",
          });
          const hitMarker = bindStationUi(
            L.circleMarker([s.lat, s.lon], {
              pane: "stationPane",
              radius: stationHitRadius(visualRadius),
              fillColor: "#000",
              fillOpacity: 0,
              color: "transparent",
              weight: 0,
              className: "station-hit",
            }),
            visualMarker
          );
          bindMarkerTooltip(hitMarker, tooltip, tooltipOptions);
          hitMarker.addTo(stationLayer);
          visualMarker.addTo(stationLayer);
        } else {
          const marker = bindStationUi(
            L.circleMarker([s.lat, s.lon], {
              pane: "stationPane",
              radius: visualRadius,
              fillColor,
              color: "#334155",
              weight: 1,
              fillOpacity,
            })
          );
          bindMarkerTooltip(marker, tooltip, tooltipOptions);
          marker.addTo(stationLayer);
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
