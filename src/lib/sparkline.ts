import { formatPct } from "./format";
import type { ChartPoint } from "./history";

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

const CHART_MARGIN = { top: 8, right: 10, bottom: 20, left: 36 };

function yBounds(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 100 };
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = Math.max((maxV - minV) * 0.12, 2);
  return {
    min: Math.max(0, Math.floor((minV - pad) / 5) * 5),
    max: Math.min(100, Math.ceil((maxV + pad) / 5) * 5) || 100,
  };
}

function yTickValues(min: number, max: number): number[] {
  const start = Math.floor(min / 20) * 20;
  const end = Math.ceil(max / 20) * 20;
  const ticks: number[] = [];
  for (let v = start; v <= end + 0.001; v += 20) ticks.push(v);
  return ticks;
}

function xLabelStep(count: number): number {
  if (count <= 8) return 1;
  if (count <= 16) return 2;
  return Math.max(1, Math.ceil(count / 6));
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Sparkline amb eixos Y (%) i X (hores), per al modal d'estació/barri. */
export function renderSparklineChart(
  points: ChartPoint[],
  width = 280,
  height = 92
): string {
  if (!points.length) return "";

  const values = points.map((p) => p.value);
  const { min, max } = yBounds(values);
  const range = max - min || 1;
  const plotW = width - CHART_MARGIN.left - CHART_MARGIN.right;
  const plotH = height - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const stepX = plotW / Math.max(points.length - 1, 1);
  const ticks = yTickValues(min, max);
  const xStep = xLabelStep(points.length);
  const baselineY = CHART_MARGIN.top + plotH;

  const yAt = (value: number) =>
    CHART_MARGIN.top + plotH - ((value - min) / range) * plotH;

  const grid = ticks
    .map((tick) => {
      const py = yAt(tick);
      return `<line class="sparkline-chart__grid" x1="${CHART_MARGIN.left}" y1="${py}" x2="${width - CHART_MARGIN.right}" y2="${py}" />
        <text class="sparkline-chart__axis" x="${CHART_MARGIN.left - 5}" y="${py + 3}" text-anchor="end">${formatPct(tick)}</text>`;
    })
    .join("");

  const xLabels = points
    .map((p, i) => {
      if (i % xStep !== 0 && i !== points.length - 1) return "";
      const px = CHART_MARGIN.left + i * stepX;
      return `<text class="sparkline-chart__axis sparkline-chart__axis--x" x="${px}" y="${height - 5}" text-anchor="middle">${escapeHtml(p.label)}</text>`;
    })
    .join("");

  const polyline = values
    .map((v, i) => {
      const x = CHART_MARGIN.left + i * stepX;
      const y = yAt(v);
      return `${x},${y}`;
    })
    .join(" ");

  return `<svg class="sparkline-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gràfic de les últimes 24 hores">
    ${grid}
    <line class="sparkline-chart__axis-line" x1="${CHART_MARGIN.left}" y1="${CHART_MARGIN.top}" x2="${CHART_MARGIN.left}" y2="${baselineY}" />
    <line class="sparkline-chart__axis-line" x1="${CHART_MARGIN.left}" y1="${baselineY}" x2="${width - CHART_MARGIN.right}" y2="${baselineY}" />
    ${xLabels}
    <polyline class="sparkline-chart__line" fill="none" points="${polyline}" />
  </svg>`;
}
