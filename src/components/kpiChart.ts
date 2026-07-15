import { formatCount, formatPct } from "../lib/format";

export type ChartPoint = { label: string; value: number };

export type KpiChartSeries = {
  label: string;
  points: ChartPoint[];
  valueFormat: "pct" | "count";
};

export type KpiChartSpec = {
  title: string;
  subtitle?: string;
  /** Primary series (left axis when dual). */
  points: ChartPoint[];
  valueFormat?: "pct" | "count";
  /** Optional second series on the right axis (different unit). */
  secondary?: KpiChartSeries;
};

const CHART_WIDTH = 640;
const CHART_HEIGHT = 280;
const MARGIN = { top: 20, right: 16, bottom: 52, left: 48 };
const MARGIN_DUAL = { top: 28, right: 52, bottom: 52, left: 48 };

function plotSize(dual: boolean) {
  const m = dual ? MARGIN_DUAL : MARGIN;
  return {
    m,
    w: CHART_WIDTH - m.left - m.right,
    h: CHART_HEIGHT - m.top - m.bottom,
  };
}

function yScale(min: number, max: number, height: number, top: number) {
  const range = max - min || 1;
  return (value: number) => top + height - ((value - min) / range) * height;
}

function xScale(count: number, width: number, left: number) {
  return (index: number) => left + (count <= 1 ? width / 2 : (index / (count - 1)) * width);
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

function yBounds(values: number[], format: "pct" | "count") {
  return format === "pct" ? yBoundsPct(values) : yBoundsCount(values);
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

function yTicks(min: number, max: number, format: "pct" | "count"): number[] {
  return format === "pct" ? yTickValuesPct(min, max) : yTickValuesCount(min, max);
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

function alignSecondaryPoints(
  primary: ChartPoint[],
  secondary: ChartPoint[]
): ChartPoint[] {
  if (secondary.length === primary.length) return secondary;
  if (!primary.length || !secondary.length) return [];
  // Prefer label alignment when lengths differ.
  const byLabel = new Map(secondary.map((p) => [p.label, p.value]));
  if (primary.every((p) => byLabel.has(p.label))) {
    return primary.map((p) => ({ label: p.label, value: byLabel.get(p.label)! }));
  }
  // Fallback: resample secondary onto primary length.
  return primary.map((p, i) => {
    const idx = Math.round((i * (secondary.length - 1)) / Math.max(primary.length - 1, 1));
    return { label: p.label, value: secondary[idx]!.value };
  });
}

function renderChartSvg(
  points: ChartPoint[],
  valueFormat: "pct" | "count",
  secondary?: KpiChartSeries
): string {
  const dual = Boolean(secondary?.points.length);
  const { m, w, h } = plotSize(dual);
  const primaryFormat = valueFormat;
  const primaryBounds = yBounds(
    points.map((p) => p.value),
    primaryFormat
  );
  const yPrimary = yScale(primaryBounds.min, primaryBounds.max, h, m.top);
  const x = xScale(points.length, w, m.left);
  const primaryTicks = yTicks(primaryBounds.min, primaryBounds.max, primaryFormat);
  const step = labelStep(points.length);

  const grid = primaryTicks
    .map((tick) => {
      const py = yPrimary(tick);
      return `<line class="kpi-chart-grid" x1="${m.left}" y1="${py}" x2="${m.left + w}" y2="${py}" />
        <text class="kpi-chart-axis kpi-chart-axis--left" x="${m.left - 8}" y="${py + 4}" text-anchor="end">${formatValue(tick, primaryFormat)}</text>`;
    })
    .join("");

  let secondarySvg = "";
  let secondaryPoints: ChartPoint[] = [];
  if (dual && secondary) {
    secondaryPoints = alignSecondaryPoints(points, secondary.points);
    const secBounds = yBounds(
      secondaryPoints.map((p) => p.value),
      secondary.valueFormat
    );
    const ySec = yScale(secBounds.min, secBounds.max, h, m.top);
    const secTicks = yTicks(secBounds.min, secBounds.max, secondary.valueFormat);
    const secAxis = secTicks
      .map((tick) => {
        const py = ySec(tick);
        return `<text class="kpi-chart-axis kpi-chart-axis--right" x="${m.left + w + 8}" y="${py + 4}" text-anchor="start">${formatValue(tick, secondary.valueFormat)}</text>`;
      })
      .join("");
    const secPoly = secondaryPoints.map((p, i) => `${x(i)},${ySec(p.value)}`).join(" ");
    const secDots = secondaryPoints
      .map(
        (p, i) =>
          `<circle class="kpi-chart-dot kpi-chart-dot--secondary" cx="${x(i)}" cy="${ySec(p.value)}" r="3">
            <title>${escapeHtml(p.label)}: ${formatValue(p.value, secondary.valueFormat)} (${escapeHtml(secondary.label)})</title>
          </circle>`
      )
      .join("");
    secondarySvg = `
      ${secAxis}
      <polyline class="kpi-chart-line kpi-chart-line--secondary" fill="none" points="${secPoly}" />
      ${secDots}
    `;
  }

  const polyline = points.map((p, i) => `${x(i)},${yPrimary(p.value)}`).join(" ");
  const dots = points
    .map(
      (p, i) =>
        `<circle class="kpi-chart-dot" cx="${x(i)}" cy="${yPrimary(p.value)}" r="3.5">
          <title>${escapeHtml(p.label)}: ${formatValue(p.value, primaryFormat)}</title>
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

  const legend = dual && secondary
    ? `<g class="kpi-chart-legend" transform="translate(${m.left}, 14)">
        <line class="kpi-chart-line" x1="0" y1="0" x2="18" y2="0" />
        <text class="kpi-chart-legend-label" x="22" y="4">Total</text>
        <line class="kpi-chart-line kpi-chart-line--secondary" x1="78" y1="0" x2="96" y2="0" />
        <text class="kpi-chart-legend-label kpi-chart-legend-label--secondary" x="100" y="4">${escapeHtml(secondary.label)}</text>
      </g>`
    : "";

  return `<svg class="kpi-chart-svg" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml(points[0]?.label ?? "")} – ${escapeHtml(points.at(-1)?.label ?? "")}">
    ${legend}
    ${grid}
    <line class="kpi-chart-axis-line" x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + h}" />
    ${dual ? `<line class="kpi-chart-axis-line" x1="${m.left + w}" y1="${m.top}" x2="${m.left + w}" y2="${m.top + h}" />` : ""}
    <line class="kpi-chart-axis-line" x1="${m.left}" y1="${m.top + h}" x2="${m.left + w}" y2="${m.top + h}" />
    <polyline class="kpi-chart-line" fill="none" points="${polyline}" />
    ${dots}
    ${secondarySvg}
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
  valueFormat: "pct" | "count" = "count",
  secondary?: KpiChartSeries
): string {
  return renderChartSvg(points, valueFormat, secondary);
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
  body.innerHTML = renderChartSvg(spec.points, spec.valueFormat ?? "pct", spec.secondary);
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
