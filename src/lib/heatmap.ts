/** Heatmap: scarcity (below city median) in red–orange; intensity scales with bike count. */

import type { MetricMode, Station } from "./data";
import { stationCount, stationMetric } from "./data";

export type HeatPoint = [lat: number, lon: number, intensity: number];

export type HeatContext = {
  median: number;
  spread: number;
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

export function buildHeatContext(availabilityValues: number[]): HeatContext {
  const med = median(availabilityValues);
  const p25 = percentile(availabilityValues, 25);
  return {
    median: med,
    spread: Math.max(med - p25, 8),
  };
}

/**
 * Heat only where availability is below the city median (scarcity).
 * Intensity grows with how far below median and with absolute bike/dock count.
 */
export function stationHeatIntensity(
  availabilityPct: number,
  count: number,
  capacity: number,
  maxCount: number,
  ctx: HeatContext
): number {
  const gap = ctx.median - availabilityPct;
  if (gap <= 0) return 0;

  const capRatio = capacity > 0 ? count / capacity : 0;
  const absRatio = maxCount > 0 ? count / maxCount : 0;
  const volume = 0.2 + 0.8 * (0.45 * capRatio + 0.55 * absRatio);

  const scarcityNorm = Math.min(1, gap / ctx.spread);
  let intensity = scarcityNorm * volume * 0.65;

  if (availabilityPct <= 0) intensity = Math.max(intensity, 0.5);
  else if (availabilityPct < 5) intensity = Math.max(intensity, 0.38);
  else if (availabilityPct < 10) intensity = Math.max(intensity, 0.22);

  return Math.min(0.6, intensity);
}

export function buildStationHeatPoints(
  stations: Station[],
  mode: MetricMode
): HeatPoint[] {
  const active = stations.filter((s) => s.capacity > 0);
  const availabilityValues = active.map((s) => stationMetric(s, mode));
  const ctx = buildHeatContext(availabilityValues);
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
        maxCount,
        ctx
      );
      if (intensity <= 0) return null;
      return [s.lat, s.lon, intensity] as HeatPoint;
    })
    .filter((p): p is HeatPoint => p !== null);
}

/** Red → orange: scarcity only (aligned with low end of dot scale). */
export const HEAT_LAYER_OPTIONS = {
  radius: 26,
  blur: 20,
  maxZoom: 18,
  max: 0.6,
  minOpacity: 0.4,
  pane: "heatPane",
  gradient: {
    0.05: "rgba(185, 28, 28, 0.9)",
    0.25: "rgba(234, 88, 12, 0.85)",
    0.45: "rgba(245, 158, 11, 0.75)",
    0.6: "rgba(251, 191, 36, 0.65)",
  },
} as const;

export function stationMarkerRadius(capacity: number): number {
  return Math.min(8, Math.max(4, 3.2 + capacity * 0.07));
}
