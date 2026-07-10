export const SPARKLINE_WIDTH = 240;
export const SPARKLINE_HEIGHT = 48;

export function renderSparkline(
  values: number[],
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT
): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");
  return `<svg class="kpi-sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${points}" /></svg>`;
}
