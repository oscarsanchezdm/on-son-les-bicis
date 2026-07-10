import type { MetricMode } from "./data";

export type HeatScaleMode = "percent" | "absolute";

/** Fixed hues for absolute heatmap intensity (alpha scales with count). */
export const METRIC_ABSOLUTE_COLORS: Record<MetricMode, string> = {
  total: "#0d9488",
  mechanical: "#dc2626",
  ebike: "#2563eb",
  docks: "#9333ea",
  out_of_service: "#f97316",
};

/** Red = scarce, green = abundant. Inverted only for fora de servei (high = bad). */
export function pctColor(value: number, invert = false): string {
  const v = invert ? 100 - value : value;
  if (v <= 10) return "#b91c1c";
  if (v <= 25) return "#ea580c";
  if (v <= 40) return "#f59e0b";
  if (v <= 60) return "#84cc16";
  return "#15803d";
}

/** Map/barris/heat colors for the active metric. */
export function metricPctColor(value: number, mode: MetricMode): string {
  if (!Number.isFinite(value)) return "#cbd5e1";
  if (mode === "out_of_service") return pctColor(value, true);
  return pctColor(value, false);
}

export function metricAbsoluteColor(mode: MetricMode): string {
  return METRIC_ABSOLUTE_COLORS[mode];
}

/** Opacity for barri/station fills in absolute mode from metric % (0–100). */
export function metricAbsoluteOpacity(pct: number): number {
  if (!Number.isFinite(pct) || pct <= 0) return 0.06;
  const t = Math.min(100, pct) / 100;
  return 0.1 + 0.48 * Math.pow(t, 0.85);
}

/** Station dot radius in absolute mode: larger when count is higher. */
export function absoluteStationRadius(
  count: number,
  maxCount: number,
  capacity: number
): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const base = Math.min(8, Math.max(4, 3.2 + capacity * 0.07));
  const scale = 0.55 + 0.95 * Math.pow(count / maxCount, 0.7);
  return Math.min(14, base * scale);
}

const PCT_LEGEND_GRADIENT = "linear-gradient(90deg, #b91c1c, #f59e0b, #84cc16, #15803d)";

export function heatLegendGradient(mode: MetricMode, scale: HeatScaleMode): string {
  if (scale === "percent") return PCT_LEGEND_GRADIENT;
  const color = METRIC_ABSOLUTE_COLORS[mode];
  return `linear-gradient(90deg, ${hexWithAlpha(color, 0.15)}, ${color})`;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
