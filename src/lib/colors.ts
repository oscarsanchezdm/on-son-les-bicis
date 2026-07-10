import type { MetricMode } from "./data";

/** Red = scarce, green = abundant (for bikes). Inverted for docks / fora de servei. */
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
  if (mode === "out_of_service") return pctColor(value, true);
  return pctColor(value, mode === "docks");
}
