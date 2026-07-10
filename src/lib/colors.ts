/** Red = scarce, green = abundant (for bikes). Inverted for docks if needed. */

export function pctColor(value: number, invert = false): string {
  const v = invert ? 100 - value : value;
  if (v <= 10) return "#b91c1c";
  if (v <= 25) return "#ea580c";
  if (v <= 40) return "#f59e0b";
  if (v <= 60) return "#84cc16";
  return "#15803d";
}

export function pctColorCss(value: number, invert = false): string {
  return pctColor(value, invert);
}
