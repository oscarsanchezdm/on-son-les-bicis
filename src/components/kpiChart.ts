import { formatCount, formatPct } from "../lib/format";

export type ChartPoint = { label: string; value: number };

export type KpiChartSpec = {
  title: string;
  subtitle?: string;
  points: ChartPoint[];
  valueFormat?: "pct" | "count";
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 280;
const MARGIN = { top: 20, right: 16, bottom: 52, left: 48 };

function plotSize() {
  return {
    w: CHART_WIDTH - MARGIN.left - MARGIN.right,
    h: CHART_HEIGHT - MARGIN.top - MARGIN.bottom,
  };
}

function yScale(min: number, max: number, height: number) {
  const range = max - min || 1;
  return (value: number) => MARGIN.top + height - ((value - min) / range) * height;
}

function xScale(count: number, width: number) {
  return (index: number) => MARGIN.left + (count <= 1 ? width / 2 : (index / (count - 1)) * width);
}

function yBoundsPct(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 100 };
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = Math.max((maxV - minV) * 0.12, 2);
  return {
    min: Math.max(0, Math.floor((minV - pad) / 5) * 5),
    max: Math.min(100, Math.ceil((maxV + pad) / 5) * 5) || 100,
  };
}

function yBoundsCount(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 1 };
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = Math.max((maxV - minV) * 0.12, 1);
  return {
    min: Math.max(0, Math.floor(minV - pad)),
    max: Math.ceil(maxV + pad),
  };
}

function yTickValuesPct(min: number, max: number): number[] {
  const span = max - min;
  const step = span <= 10 ? 2 : span <= 25 ? 5 : 10;
  const ticks: number[] = [];
  for (let v = min; v <= max + 0.001; v += step) ticks.push(Math.round(v * 10) / 10);
  return ticks;
}

function yTickValuesCount(min: number, max: number): number[] {
  const span = max - min || 1;
  const rough = span / 3;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = Math.max(1, Math.ceil(rough / magnitude) * magnitude);
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 0.001; v += step) ticks.push(v);
  while (ticks.length > 4) {
    const center = (min + max) / 2;
    if (ticks[ticks.length - 1] - center > center - ticks[0]) ticks.pop();
    else ticks.shift();
  }
  return ticks.length ? ticks : [lo, hi];
}

function formatValue(value: number, format: "pct" | "count"): string {
  return format === "pct" ? formatPct(value) : formatCount(value);
}

function labelStep(count: number): number {
  if (count <= 8) return 1;
  if (count <= 16) return 2;
  if (count <= 32) return 4;
  return Math.ceil(count / 8);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderChartSvg(points: ChartPoint[], valueFormat: "pct" | "count"): string {
  const { w, h } = plotSize();
  const values = points.map((p) => p.value);
  const { min, max } =
    valueFormat === "pct" ? yBoundsPct(values) : yBoundsCount(values);
  const y = yScale(min, max, h);
  const x = xScale(points.length, w);
  const ticks =
    valueFormat === "pct" ? yTickValuesPct(min, max) : yTickValuesCount(min, max);
  const step = labelStep(points.length);

  const grid = ticks
    .map((tick) => {
      const py = y(tick);
      return `<line class="kpi-chart-grid" x1="${MARGIN.left}" y1="${py}" x2="${MARGIN.left + w}" y2="${py}" />
        <text class="kpi-chart-axis" x="${MARGIN.left - 8}" y="${py + 4}" text-anchor="end">${formatValue(tick, valueFormat)}</text>`;
    })
    .join("");

  const polyline = points
    .map((p, i) => `${x(i)},${y(p.value)}`)
    .join(" ");

  const dots = points
    .map(
      (p, i) =>
        `<circle class="kpi-chart-dot" cx="${x(i)}" cy="${y(p.value)}" r="3.5">
          <title>${escapeHtml(p.label)}: ${formatValue(p.value, valueFormat)}</title>
        </circle>`
    )
    .join("");

  const xLabels = points
    .map((p, i) => {
      if (i % step !== 0 && i !== points.length - 1) return "";
      const px = x(i);
      return `<text class="kpi-chart-axis kpi-chart-axis--x" x="${px}" y="${CHART_HEIGHT - 14}" text-anchor="middle" transform="rotate(-32 ${px} ${CHART_HEIGHT - 14})">${escapeHtml(p.label)}</text>`;
    })
    .join("");

  return `<svg class="kpi-chart-svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml(points[0]?.label ?? "")} – ${escapeHtml(points.at(-1)?.label ?? "")}">
    ${grid}
    <line class="kpi-chart-axis-line" x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + h}" />
    <line class="kpi-chart-axis-line" x1="${MARGIN.left}" y1="${MARGIN.top + h}" x2="${MARGIN.left + w}" y2="${MARGIN.top + h}" />
    <polyline class="kpi-chart-line" fill="none" points="${polyline}" />
    ${dots}
    ${xLabels}
  </svg>`;
}

let modalRoot: HTMLElement | null = null;

function ensureModal(): HTMLElement {
  if (modalRoot) return modalRoot;
  modalRoot = document.createElement("div");
  modalRoot.className = "kpi-chart-modal";
  modalRoot.hidden = true;
  modalRoot.innerHTML = `
    <div class="kpi-chart-backdrop" data-close="1"></div>
    <div class="kpi-chart-dialog" role="dialog" aria-modal="true" aria-labelledby="kpi-chart-title">
      <header class="kpi-chart-header">
        <div>
          <h2 id="kpi-chart-title"></h2>
          <p class="kpi-chart-subtitle"></p>
        </div>
        <button type="button" class="kpi-chart-close" aria-label="Tancar">×</button>
      </header>
      <div class="kpi-chart-body"></div>
    </div>
  `;
  document.body.appendChild(modalRoot);

  const close = () => closeKpiChart();
  modalRoot.querySelector(".kpi-chart-backdrop")?.addEventListener("click", close);
  modalRoot.querySelector(".kpi-chart-close")?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalRoot && !modalRoot.hidden) close();
  });

  return modalRoot;
}

export function renderKpiChartSvg(
  points: ChartPoint[],
  valueFormat: "pct" | "count" = "count"
): string {
  return renderChartSvg(points, valueFormat);
}

export type HourlyChartPoint = { hour: number; value: number };

function renderHourlyPolyline(
  points: HourlyChartPoint[],
  y: (v: number) => number,
  xForHour: (h: number) => number,
  className: string
): string {
  if (!points.length) return "";
  const sorted = [...points].sort((a, b) => a.hour - b.hour);
  const polyline = sorted.map((p) => `${xForHour(p.hour)},${y(p.value)}`).join(" ");
  return `<polyline class="${className}" fill="none" points="${polyline}" />`;
}

/** Gràfic horari amb dues sèries alineades (0–23 h). */
export function renderDualKpiChartSvg(
  today: HourlyChartPoint[],
  avg: HourlyChartPoint[],
  valueFormat: "count" = "count"
): string {
  const { w, h } = plotSize();
  const allValues = [...today, ...avg].map((p) => p.value);
  const { min, max } = valueFormat === "pct" ? yBoundsPct(allValues) : yBoundsCount(allValues);
  const y = yScale(min, max, h);
  const xForHour = (hour: number) => MARGIN.left + (hour / 23) * w;
  const ticks =
    valueFormat === "pct" ? yTickValuesPct(min, max) : yTickValuesCount(min, max);

  const grid = ticks
    .map((tick) => {
      const py = y(tick);
      return `<line class="kpi-chart-grid" x1="${MARGIN.left}" y1="${py}" x2="${MARGIN.left + w}" y2="${py}" />
        <text class="kpi-chart-axis" x="${MARGIN.left - 8}" y="${py + 4}" text-anchor="end">${formatValue(tick, valueFormat)}</text>`;
    })
    .join("");

  const xLabels = [0, 6, 12, 18, 23]
    .map((hour) => {
      const px = xForHour(hour);
      const label = `${String(hour).padStart(2, "0")}:00`;
      return `<text class="kpi-chart-axis kpi-chart-axis--x" x="${px}" y="${CHART_HEIGHT - 14}" text-anchor="middle">${label}</text>`;
    })
    .join("");

  const avgLine = renderHourlyPolyline(avg, y, xForHour, "kpi-chart-line kpi-chart-line--muted");
  const todayLine = renderHourlyPolyline(today, y, xForHour, "kpi-chart-line");

  return `<svg class="kpi-chart-svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="Ús estimat per hora">
    ${grid}
    <line class="kpi-chart-axis-line" x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + h}" />
    <line class="kpi-chart-axis-line" x1="${MARGIN.left}" y1="${MARGIN.top + h}" x2="${MARGIN.left + w}" y2="${MARGIN.top + h}" />
    ${avgLine}
    ${todayLine}
    ${xLabels}
  </svg>`;
}

export function openKpiChart(spec: KpiChartSpec): void {
  if (!spec.points.length) return;
  const modal = ensureModal();
  const title = modal.querySelector("#kpi-chart-title")!;
  const subtitle = modal.querySelector(".kpi-chart-subtitle") as HTMLElement;
  const body = modal.querySelector(".kpi-chart-body")!;

  title.textContent = spec.title;
  if (spec.subtitle) {
    subtitle.textContent = spec.subtitle;
    subtitle.hidden = false;
  } else {
    subtitle.textContent = "";
    subtitle.hidden = true;
  }
  body.innerHTML = renderChartSvg(spec.points, spec.valueFormat ?? "pct");
  modal.hidden = false;
  document.body.classList.add("kpi-chart-open");
  (modal.querySelector(".kpi-chart-close") as HTMLButtonElement)?.focus();
}

export function closeKpiChart(): void {
  if (!modalRoot) return;
  modalRoot.hidden = true;
  document.body.classList.remove("kpi-chart-open");
}

export function bindKpiCharts(
  container: HTMLElement,
  charts: Record<string, KpiChartSpec | undefined>
): void {
  container.querySelectorAll<HTMLElement>("[data-kpi-chart]").forEach((card) => {
    const key = card.dataset.kpiChart;
    if (!key) return;
    const spec = charts[key];
    if (!spec?.points.length) return;

    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `${spec.title}: obrir gràfic detallat`);

    const open = () => openKpiChart(spec);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}
