/** Heatmap helpers: highlight stations worse than the city baseline, not the whole map. */

export type HeatPoint = [lat: number, lon: number, intensity: number];

export type HeatContext = {
  median: number;
  p25: number;
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
  return {
    median: median(availabilityValues),
    p25: percentile(availabilityValues, 25),
  };
}

/**
 * Intensity 0–1 for leaflet.heat.
 * availabilityPct: share of capacity that is available (higher = better).
 * Only stations below the city median produce meaningful heat.
 */
export function stationHeatWeight(availabilityPct: number, ctx: HeatContext): number {
  const gap = Math.max(0, ctx.median - availabilityPct);
  if (gap <= 0) return 0;

  const spread = Math.max(ctx.median - ctx.p25, 8);
  const relative = Math.min(1, gap / spread);
  let weight = Math.pow(relative, 1.05) * 0.55;

  if (availabilityPct <= 0) weight = Math.max(weight, 0.62);
  else if (availabilityPct < 5) weight = Math.max(weight, 0.48);
  else if (availabilityPct < 10) weight = Math.max(weight, 0.28);

  return Math.min(0.85, weight);
}

/** Stress 0–100 for marker emphasis (vs city median). */
export function stationStress(availabilityPct: number, ctx: HeatContext): number {
  const gap = Math.max(0, ctx.median - availabilityPct);
  const spread = Math.max(ctx.median - ctx.p25, 8);
  return Math.min(100, (gap / spread) * 70 + (availabilityPct < 10 ? 30 : 0));
}

export function buildStationHeatPoints(
  stations: Array<{ lat: number; lon: number; availability: number }>,
  ctx: HeatContext
): HeatPoint[] {
  return stations
    .map((s) => {
      const intensity = stationHeatWeight(s.availability, ctx);
      if (intensity <= 0) return null;
      return [s.lat, s.lon, intensity] as HeatPoint;
    })
    .filter((p): p is HeatPoint => p !== null);
}

export const HEAT_LAYER_OPTIONS = {
  radius: 24,
  blur: 18,
  maxZoom: 18,
  max: 0.7,
  minOpacity: 0.38,
  pane: "heatPane",
  gradient: {
    0.05: "rgba(254, 240, 138, 0.35)",
    0.25: "rgba(251, 191, 36, 0.55)",
    0.45: "rgba(249, 115, 22, 0.65)",
    0.65: "rgba(239, 68, 68, 0.75)",
    0.85: "rgba(185, 28, 28, 0.85)",
    1.0: "rgba(127, 29, 29, 0.95)",
  },
} as const;

/** Marker radius from station capacity (not availability stress). */
export function stationMarkerRadius(capacity: number): number {
  return Math.min(8, Math.max(4, 3.2 + capacity * 0.07));
}
