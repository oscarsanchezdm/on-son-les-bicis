/**
 * Color heatmap: paints each station's dot color with weight ∝ capacity.
 * Overlapping areas blend real colors instead of summing intensity toward green.
 */

import L from "leaflet";
import type { MetricMode, Station } from "./data";
import { metricColorInvert, stationMetric } from "./data";
import { pctColor } from "./colors";

export function stationMarkerRadius(capacity: number): number {
  return Math.min(8, Math.max(4, 3.2 + capacity * 0.07));
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

export type ColorHeatLayer = L.Layer & {
  setStations: (stations: Station[], mode: MetricMode) => void;
};

const ColorHeatLayerImpl = L.Layer.extend({
  options: {
    pane: "heatPane",
  },

  initialize(stations: Station[], mode: MetricMode) {
    this._stations = stations;
    this._mode = mode;
  },

  setStations(stations: Station[], mode: MetricMode) {
    this._stations = stations;
    this._mode = mode;
    return this.redraw();
  },

  onAdd(map: L.Map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas", "leaflet-color-heat") as HTMLCanvasElement;
    this._canvas.style.pointerEvents = "none";

    const pane = map.getPane(this.options.pane) ?? map.getPanes().overlayPane;
    pane.appendChild(this._canvas);

    map.on("moveend zoomend", this._reset, this);
    if (map.options.zoomAnimation && L.Browser.any3d) {
      map.on("zoomanim", this._animateZoom, this);
    }
    this._reset();
  },

  onRemove(map: L.Map) {
    map.off("moveend zoomend", this._reset, this);
    if (map.options.zoomAnimation) {
      map.off("zoomanim", this._animateZoom, this);
    }
    this._canvas?.remove();
    this._canvas = undefined;
  },

  redraw() {
    if (this._map && !this._frame) {
      this._frame = L.Util.requestAnimFrame(() => {
        this._frame = null;
        this._redraw();
      });
    }
    return this;
  },

  _reset() {
    if (!this._map || !this._canvas) return;
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    const size = this._map.getSize();
    if (this._canvas.width !== size.x) this._canvas.width = size.x;
    if (this._canvas.height !== size.y) this._canvas.height = size.y;
    this._redraw();
  },

  _animateZoom(e: L.ZoomAnimEvent) {
    if (!this._map || !this._canvas) return;
    const scale = this._map.getZoomScale(e.zoom);
    const offset = this._map
      ._getCenterOffset(e.center)
      .multiplyBy(-scale)
      .subtract(this._map._getMapPanePos());
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },

  _redraw() {
    if (!this._map || !this._canvas) return;
    const ctx = this._canvas.getContext("2d");
    if (!ctx) return;

    const size = this._map.getSize();
    ctx.clearRect(0, 0, size.x, size.y);

      const invert = metricColorInvert(this._mode as MetricMode);
    const active = (this._stations as Station[]).filter((s) => s.capacity > 0);
    if (!active.length) return;

    const maxCapacity = Math.max(...active.map((s) => s.capacity));
    const radius = splatRadius(this._map.getZoom());

    for (const s of active) {
      const point = this._map.latLngToContainerPoint([s.lat, s.lon]);
      if (
        point.x < -radius ||
        point.y < -radius ||
        point.x > size.x + radius ||
        point.y > size.y + radius
      ) {
        continue;
      }

      const availability = stationMetric(s, this._mode as MetricMode);
      const [r, g, b] = hexToRgb(pctColor(availability, invert));
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
