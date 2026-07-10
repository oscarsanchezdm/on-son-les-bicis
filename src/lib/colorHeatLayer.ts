/**
 * Color heatmap: paints each station's dot color with weight ∝ capacity.
 * Extends L.Renderer so leaflet-rotate keeps it aligned with the map.
 */

import L from "leaflet";
import type { MetricMode, Station } from "./data";
import { stationMetric } from "./data";
import { metricPctColor } from "./colors";

export function stationMarkerRadius(capacity: number): number {
  return Math.min(8, Math.max(4, 3.2 + capacity * 0.07));
}

/** ~44px touch target on coarse pointers; unchanged on mouse/trackpad. */
export function stationHitRadius(visualRadius: number): number {
  if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) {
    return visualRadius;
  }
  return Math.max(visualRadius + 12, 22);
}

export function stationNeedsExpandedHitTarget(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function capacityWeight(capacity: number, maxCapacity: number): number {
  if (maxCapacity <= 0) return 0.5;
  return 0.15 + 0.85 * Math.pow(capacity / maxCapacity, 0.75);
}

function splatRadius(zoom: number): number {
  if (zoom >= 15) return 22;
  if (zoom >= 13) return 28;
  if (zoom >= 11) return 36;
  return 44;
}

export type ColorHeatLayer = L.Renderer & {
  setStations: (stations: Station[], mode: MetricMode) => ColorHeatLayer;
  redraw: () => ColorHeatLayer;
};

const ColorHeatLayerImpl = L.Renderer.extend({
  options: {
    pane: "heatPane",
    padding: 0.12,
  },

  initialize(stations: Station[], mode: MetricMode) {
    this._stations = stations;
    this._mode = mode;
  },

  onAdd(map: L.Map) {
    L.Renderer.prototype.onAdd.call(this, map);
    this._redraw();
  },

  _initContainer() {
    const container = (this._container = L.DomUtil.create(
      "canvas",
      "leaflet-color-heat"
    ) as HTMLCanvasElement);
    container.style.pointerEvents = "none";
    this._ctx = container.getContext("2d")!;
  },

  _destroyContainer() {
    L.DomUtil.remove(this._container);
    this._container = undefined;
    this._ctx = undefined;
  },

  setStations(stations: Station[], mode: MetricMode) {
    this._stations = stations;
    this._mode = mode;
    if (this._map) L.Renderer.prototype._update.call(this);
    return this;
  },

  redraw() {
    if (this._map) L.Renderer.prototype._update.call(this);
    return this;
  },

  _update() {
    if (this._map._animatingZoom && this._bounds) return;

    L.Renderer.prototype._update.call(this);

    const bounds = this._bounds;
    const container = this._container as HTMLCanvasElement;
    const ctx = this._ctx as CanvasRenderingContext2D;
    if (!bounds || !container || !ctx) return;

    const size = bounds.getSize();
    L.DomUtil.setPosition(container, bounds.min);
    container.width = size.x;
    container.height = size.y;
    container.style.width = `${size.x}px`;
    container.style.height = `${size.y}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(-bounds.min.x, -bounds.min.y);
    this._redraw();
  },

  _redraw() {
    const map = this._map;
    const ctx = this._ctx as CanvasRenderingContext2D | undefined;
    const bounds = this._bounds as L.Bounds | undefined;
    if (!map || !ctx || !bounds) return;

    const size = bounds.getSize();
    ctx.clearRect(0, 0, size.x, size.y);

    const active = (this._stations as Station[]).filter((s) => s.capacity > 0);
    if (!active.length) return;

    const maxCapacity = Math.max(...active.map((s) => s.capacity));
    const radius = splatRadius(map.getZoom());

    for (const s of active) {
      const point = map.latLngToLayerPoint([s.lat, s.lon]);
      if (
        point.x < bounds.min.x - radius ||
        point.y < bounds.min.y - radius ||
        point.x > bounds.max.x + radius ||
        point.y > bounds.max.y + radius
      ) {
        continue;
      }

      const availability = stationMetric(s, this._mode as MetricMode);
      const [r, g, b] = hexToRgb(metricPctColor(availability, this._mode as MetricMode));
      const weight = capacityWeight(s.capacity, maxCapacity);
      const alpha = 0.1 + 0.32 * weight;

      const grad = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.45, `rgba(${r},${g},${b},${alpha * 0.45})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  },
});

export function createColorHeatLayer(stations: Station[], mode: MetricMode): ColorHeatLayer {
  return new ColorHeatLayerImpl(stations, mode) as ColorHeatLayer;
}
