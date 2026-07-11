import { formatCount } from "../lib/format";

export type KpiBarItem = {
  key: string;
  label: string;
  count: number;
  color: string;
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 168;
const MARGIN = { top: 22, right: 12, bottom: 36, left: 40 };

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function yBounds(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 1 };
  const maxV = Math.max(...values);
  const pad = Math.max(maxV * 0.15, 1);
  return { min: 0, max: Math.ceil(maxV + pad) };
}

function yTickValues(max: number): number[] {
  if (max <= 4) return [0, max];
  const rough = max / 3;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = Math.max(1, Math.ceil(rough / magnitude) * magnitude);
  const ticks: number[] = [];
  for (let v = 0; v <= max + 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(Math.ceil(max / step) * step);
  while (ticks.length > 4) ticks.splice(1, 1);
  return ticks;
}

/** Vertical bar chart for KPI snapshot (4 metrics). */
export function renderKpiBarChart(items: KpiBarItem[]): string {
  if (!items.length) return "";

  const plotW = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const { max } = yBounds(items.map((item) => item.count));
  const yMax = max || 1;
  const yAt = (value: number) => MARGIN.top + plotH - (value / yMax) * plotH;
  const barGap = 14;
  const barWidth = Math.max(18, (plotW - barGap * (items.length - 1)) / items.length);
  const ticks = yTickValues(yMax);

  const grid = ticks
    .map((tick) => {
      const py = yAt(tick);
      return `<line class="kpi-bar-chart__grid" x1="${MARGIN.left}" y1="${py}" x2="${MARGIN.left + plotW}" y2="${py}" />
        <text class="kpi-bar-chart__axis" x="${MARGIN.left - 6}" y="${py + 4}" text-anchor="end">${formatCount(tick)}</text>`;
    })
    .join("");

  const bars = items
    .map((item, i) => {
      const x = MARGIN.left + i * (barWidth + barGap);
      const baseline = MARGIN.top + plotH;
      const height = item.count > 0 ? baseline - yAt(item.count) : 0;
      const y = baseline - height;
      const valueY = Math.max(MARGIN.top + 4, y - 6);
      return `<g class="kpi-bar-chart__bar-group">
        <rect class="kpi-bar-chart__bar" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(height, item.count > 0 ? 2 : 0)}" rx="4" fill="${item.color}">
          <title>${escapeHtml(item.label)}: ${formatCount(item.count)}</title>
        </rect>
        <text class="kpi-bar-chart__value" x="${x + barWidth / 2}" y="${valueY}" text-anchor="middle">${formatCount(item.count)}</text>
        <text class="kpi-bar-chart__label" x="${x + barWidth / 2}" y="${CHART_HEIGHT - 10}" text-anchor="middle">${escapeHtml(item.label)}</text>
      </g>`;
    })
    .join("");

  return `<svg class="kpi-bar-chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="Resum de bicicletes per tipus">
    ${grid}
    <line class="kpi-bar-chart__axis-line" x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + plotH}" />
    <line class="kpi-bar-chart__axis-line" x1="${MARGIN.left}" y1="${MARGIN.top + plotH}" x2="${MARGIN.left + plotW}" y2="${MARGIN.top + plotH}" />
    ${bars}
  </svg>`;
}
