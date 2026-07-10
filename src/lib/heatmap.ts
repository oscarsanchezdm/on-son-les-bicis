/**
 * Heatmap: same red→green scale as station dots.
 * Larger stations (more capacity) contribute more visual weight.
 */

import { availabilityNorm } from "./colors";
import type { MetricMode, Station } from "./data";
import { stationMetric } from "./data";

export type HeatPoint = [lat: number, lon: number, intensity: number];

/**
 * Gradient position from availability (hue) × capacity weight (strength).
 * A 45-dock station at 50% paints stronger than a 10-dock station at 50%.
 */
export function stationHeatIntensity(
  availabilityPct: number,
  capacity: number,
  maxCapacity: number,
  invert: boolean
): number {
  if (capacity <= 0) return 0;

  const colorPos = availabilityNorm(availabilityPct, invert);
  const capWeight =
    maxCapacity > 0 ? 0.12 + 0.88 * Math.pow(capacity / maxCapacity, 0.75) : 0.5;

  return Math.min(1, colorPos * capWeight);
}

export function buildStationHeatPoints(
  stations: Station[],
  mode: MetricMode
): HeatPoint[] {
  const invert = mode === "docks";
  const active = stations.filter((s) => s.capacity > 0);
  const maxCapacity = active.length
    ? Math.max(...active.map((s) => s.capacity))
    : 1;

  return active
    .map((s) => {
      const availability = stationMetric(s, mode);
      const intensity = stationHeatIntensity(
        availability,
        s.capacity,
        maxCapacity,
        invert
      );
      if (intensity < 0.04) return null;
      return [s.lat, s.lon, intensity] as HeatPoint;
    })
    .filter((p): p is HeatPoint => p !== null);
}

/** Same red→green scale as pctColor / station dots. */
export const HEAT_LAYER_OPTIONS = {
  radius: 30,
  blur: 24,
  maxZoom: 17,
  max: 1,
  minOpacity: 0.32,
  pane: "heatPane",
  gradient: {
    0.08: "rgba(185, 28, 28, 0.85)",
    0.22: "rgba(234, 88, 12, 0.82)",
    0.38: "rgba(245, 158, 11, 0.78)",
    0.58: "rgba(132, 204, 22, 0.72)",
    0.78: "rgba(34, 139, 34, 0.7)",
    1.0: "rgba(21, 128, 61, 0.8)",
  },
} as const;

export function stationMarkerRadius(capacity: number): number {
  return Math.min(8, Math.max(4, 3.2 + capacity * 0.07));
}
