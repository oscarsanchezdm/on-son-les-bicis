/** Red = scarce, green = abundant (for bikes). Inverted for docks if needed. */

/** 0–1 position on the red→green scale (matches pctColor thresholds). */
export function availabilityNorm(value: number, invert = false): number {
  const v = Math.min(100, Math.max(0, invert ? 100 - value : value));
  if (v <= 10) return 0.08;
  if (v <= 25) return 0.22;
  if (v <= 40) return 0.38;
  if (v <= 60) return 0.58;
  return 0.78 + ((v - 60) / 40) * 0.22;
}

export function pctColor(value: number, invert = false): string {
  const v = invert ? 100 - value : value;
  if (v <= 10) return "#b91c1c";
  if (v <= 25) return "#ea580c";
  if (v <= 40) return "#f59e0b";
  if (v <= 60) return "#84cc16";
  return "#15803d";
}
