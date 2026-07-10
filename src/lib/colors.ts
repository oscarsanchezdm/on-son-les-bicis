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

/** Bicis disponibles: escassetat → normal → abundant → saturació (blau). */
export const PCT_SCALE_STOPS: ReadonlyArray<{ pct: number; color: string }> = [
  { pct: 0, color: "#b91c1c" },
  { pct: 10, color: "#fb923c" },
  { pct: 30, color: "#facc15" },
  { pct: 55, color: "#a3e635" },
  { pct: 82, color: "#22c55e" },
  { pct: 88, color: "#22c55e" },
  { pct: 100, color: "#4f46e5" },
];

/** Fora de servei: verd (cap/poc) → vermell (molt); sense blau. */
export const PCT_OOS_STOPS: ReadonlyArray<{ pct: number; color: string }> = [
  { pct: 0, color: "#22c55e" },
  { pct: 30, color: "#22c55e" },
  { pct: 50, color: "#a3e635" },
  { pct: 75, color: "#fb923c" },
  { pct: 100, color: "#b91c1c" },
];

export const PCT_LEGEND_LABELS = ["Escassetat", "Normal", "Abundant", "Saturat"] as const;
export const PCT_OOS_LEGEND_LABELS = ["Cap", "Baix", "Alt", "Crític"] as const;

type Rgb = [number, number, number];
type ColorStop = { pct: number; color: string };

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function interpolateFromStops(pct: number, stops: ReadonlyArray<ColorStop>): Rgb {
  const v = Math.min(100, Math.max(0, pct));
  if (v <= stops[0]!.pct) return hexToRgb(stops[0]!.color);
  const last = stops[stops.length - 1]!;
  if (v >= last.pct) return hexToRgb(last.color);

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (v >= a.pct && v <= b.pct) {
      const span = b.pct - a.pct || 1;
      const t = (v - a.pct) / span;
      const rgbA = hexToRgb(a.color);
      const rgbB = hexToRgb(b.color);
      return [lerp(rgbA[0], rgbB[0], t), lerp(rgbA[1], rgbB[1], t), lerp(rgbA[2], rgbB[2], t)];
    }
  }
  return hexToRgb(last.color);
}

function stopsToGradientCss(stops: ReadonlyArray<ColorStop>): string {
  return `linear-gradient(90deg, ${stops.map((s) => `${s.color} ${s.pct}%`).join(", ")})`;
}

export function pctColor(value: number, invert = false): string {
  const v = invert ? 100 - value : value;
  if (!Number.isFinite(v)) return "#cbd5e1";
  return rgbToHex(interpolateFromStops(v, PCT_SCALE_STOPS));
}

export function pctColorOos(value: number): string {
  if (!Number.isFinite(value)) return "#cbd5e1";
  return rgbToHex(interpolateFromStops(value, PCT_OOS_STOPS));
}

/** Map/barris/heat colors for the active metric. */
export function metricPctColor(value: number, mode: MetricMode): string {
  if (!Number.isFinite(value)) return "#cbd5e1";
  if (mode === "out_of_service") return pctColorOos(value);
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

export const PCT_LEGEND_GRADIENT_CSS = stopsToGradientCss(PCT_SCALE_STOPS);
export const PCT_OOS_LEGEND_GRADIENT_CSS = stopsToGradientCss(PCT_OOS_STOPS);

export function pctLegendLabels(mode: MetricMode, scale: HeatScaleMode): readonly string[] {
  if (scale === "absolute") return ["Pocs", "Molts"];
  if (mode === "out_of_service") return PCT_OOS_LEGEND_LABELS;
  return PCT_LEGEND_LABELS;
}

export function heatLegendGradient(mode: MetricMode, scale: HeatScaleMode): string {
  if (scale === "percent") {
    return mode === "out_of_service" ? PCT_OOS_LEGEND_GRADIENT_CSS : PCT_LEGEND_GRADIENT_CSS;
  }
  const color = METRIC_ABSOLUTE_COLORS[mode];
  return `linear-gradient(90deg, ${hexWithAlpha(color, 0.15)}, ${color})`;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
