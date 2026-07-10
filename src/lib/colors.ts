/** Red = scarce, green = abundant (for bikes). Inverted for docks if needed. */

export function pctColor(value: number, invert = false): string {
  const v = invert ? 100 - value : value;
  if (v <= 10) return "#b91c1c";
  if (v <= 25) return "#ea580c";
  if (v <= 40) return "#f59e0b";
  if (v <= 60) return "#84cc16";
  return "#15803d";
}

/** How scarce is the metric (0 = abundant, 100 = empty). */
export function scarcityScore(availabilityPct: number): number {
  return Math.max(0, Math.min(100, 100 - availabilityPct));
}

const HEAT_GRADIENT_SCARCITY: Record<number, string> = {
  0.05: "rgba(0,0,0,0)",
  0.2: "#fef08a",
  0.45: "#fb923c",
  0.7: "#ef4444",
  1: "#7f1d1d",
};

/** Map scarcity 0–100 to heat intensity, normalized against the worst station. */
export function heatIntensity(scarcity: number, maxScarcity: number): number {
  if (maxScarcity <= 0) return 0;
  const normalized = scarcity / maxScarcity;
  return 0.06 + 0.94 * Math.pow(normalized, 0.45);
}

export function heatGradient(): Record<number, string> {
  return HEAT_GRADIENT_SCARCITY;
}
