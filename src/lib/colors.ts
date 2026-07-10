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

/** Option B: escassetat → normal → abundant → saturació. Vermell només <10%. */
export const PCT_SCALE_BREAKS = {
  red: 10,
  orange: 30,
  amber: 55,
  green: 70,
} as const;

export const PCT_SCALE_COLORS = {
  red: "#b91c1c",
  orange: "#ea580c",
  amber: "#f59e0b",
  green: "#22c55e",
  saturation: "#4f46e5",
} as const;

export function pctColor(value: number, invert = false): string {
  const v = invert ? 100 - value : value;
  if (v < PCT_SCALE_BREAKS.red) return PCT_SCALE_COLORS.red;
  if (v < PCT_SCALE_BREAKS.orange) return PCT_SCALE_COLORS.orange;
  if (v < PCT_SCALE_BREAKS.amber) return PCT_SCALE_COLORS.amber;
  if (v < PCT_SCALE_BREAKS.green) return PCT_SCALE_COLORS.green;
  return PCT_SCALE_COLORS.saturation;
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

const PCT_LEGEND_GRADIENT = [
  `${PCT_SCALE_COLORS.red} 0%`,
  `${PCT_SCALE_COLORS.red} ${PCT_SCALE_BREAKS.red}%`,
  `${PCT_SCALE_COLORS.orange} ${PCT_SCALE_BREAKS.red}%`,
  `${PCT_SCALE_COLORS.orange} ${PCT_SCALE_BREAKS.orange}%`,
  `${PCT_SCALE_COLORS.amber} ${PCT_SCALE_BREAKS.orange}%`,
  `${PCT_SCALE_COLORS.amber} ${PCT_SCALE_BREAKS.amber}%`,
  `${PCT_SCALE_COLORS.green} ${PCT_SCALE_BREAKS.amber}%`,
  `${PCT_SCALE_COLORS.green} ${PCT_SCALE_BREAKS.green}%`,
  `${PCT_SCALE_COLORS.saturation} ${PCT_SCALE_BREAKS.green}%`,
  `${PCT_SCALE_COLORS.saturation} 100%`,
].join(", ");

export const PCT_LEGEND_GRADIENT_CSS = `linear-gradient(90deg, ${PCT_LEGEND_GRADIENT})`;

export const PCT_LEGEND_LABELS = ["Escassetat", "Normal", "Abundant", "Saturat"] as const;

export function heatLegendGradient(mode: MetricMode, scale: HeatScaleMode): string {
  if (scale === "percent") return PCT_LEGEND_GRADIENT_CSS;
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
