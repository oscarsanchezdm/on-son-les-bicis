/** Heatmap helpers: same color scale as station dots, intensity scales with bike count. */

import type { MetricMode } from "./data";
import { stationCount, stationMetric } from "./data";
import type { Station } from "./data";

export type HeatPoint = [lat: number, lon: number, intensity: number];

/** 0 = scarce (red), 1 = abundant (green) — mirrors pctColor thresholds. */
export function availabilityToHeatNorm(pct: number, invert: boolean): number {
  const v = Math.min(100, Math.max(0, invert ? 100 - pct : pct));
  return v / 100;
}

/**
 * Heat intensity: color position (pct) × volume (absolute bikes for the metric).
 * One bike at a small station stays faint; twenty bikes glow stronger.
 */
export function stationHeatIntensity(
  availabilityPct: number,
  count: number,
  capacity: number,
  invert: boolean,
  maxCount: number
): number {
  const colorNorm = availabilityToHeatNorm(availabilityPct, invert);
  if (colorNorm <= 0 || count <= 0) return 0;

  const capRatio = capacity > 0 ? count / capacity : 0;
  const absRatio = maxCount > 0 ? count / maxCount : 0;
  const volume = 0.15 + 0.85 * (0.5 * capRatio + 0.5 * absRatio);

  return Math.min(1, colorNorm * volume);
}

export function buildStationHeatPoints(
  stations: Station[],
  mode: MetricMode
): HeatPoint[] {
  const invert = mode === "docks";
  const active = stations.filter((s) => s.capacity > 0);
  const counts = active.map((s) => stationCount(s, mode));
  const maxCount = counts.length ? Math.max(...counts) : 1;

  return active
    .map((s) => {
      const availability = stationMetric(s, mode);
      const count = stationCount(s, mode);
      const intensity = stationHeatIntensity(
        availability,
        count,
        s.capacity,
        invert,
        maxCount
      );
      if (intensity <= 0) return null;
      return [s.lat, s.lon, intensity] as HeatPoint;
    })
    .filter((p): p is HeatPoint => p !== null);
}

/** Same red→green scale as pctColor, for leaflet.heat gradient. */
export const HEAT_LAYER_OPTIONS = {
  radius: 28,
  blur: 22,
  maxZoom: 18,
  max: 1,
  minOpacity: 0.35,
  pane: "heatPane",
  gradient: {
    0.0: "rgba(185, 28, 28, 0.85)",
    0.25: "rgba(234, 88, 12, 0.8)",
    0.4: "rgba(245, 158, 11, 0.75)",
    0.6: "rgba(132, 204, 22, 0.7)",
    1.0: "rgba(21, 128, 61, 0.85)",
  },
} as const;

export function stationMarkerRadius(capacity: number): number {
  return Math.min(8, Math.max(4, 3.2 + capacity * 0.07));
}
