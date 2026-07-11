import { formatCount, formatPct } from "../lib/format";

export type ChartPoint = { label: string; value: number };

export type KpiChartSpec = {
  title: string;
  subtitle?: string;
  points: ChartPoint[];
  valueFormat?: "pct" | "count";
};

type ChartSize = {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  dotRadius: number;
};

const CHART_SIZES = {
  full: {
    width: 640,
    height: 280,
    margin: { top: 20, right: 16, bottom: 52, left: 48 },
    dotRadius: 3.5,
  },
  compact: {
    width: 320,
    height: 168,
    margin: { top: 14, right: 10, bottom: 34, left: 38 },
    dotRadius: 2.5,
  },
} as const satisfies Record<string, ChartSize>;

function plotSize(size: ChartSize) {
  const { margin, width, height } = size;
  return {
    w: width - margin.left - margin.right,
    h: height - margin.top - margin.bottom,
  };
}

function yScale(min: number, max: number, height: number, marginTop: number) {
  const range = max - min || 1;
  return (value: number) => marginTop + height - ((value - min) / range) * height;
}

function xScale(count: number, width: number, marginLeft: number) {
  return (index: number) =>
    marginLeft + (count <= 1 ? width / 2 : (index / (count - 1)) * width);
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
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
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

function labelStep(count: number, compact: boolean): number {
  if (compact) {
    if (count <= 6) return 1;
    if (count <= 12) return 2;
    return Math.max(1, Math.ceil(count / 4));
  }
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

function renderChartSvg(
  points: ChartPoint[],
  valueFormat: "pct" | "count",
  sizeKey: keyof typeof CHART_SIZES = "full"
): string {
  const size = CHART_SIZES[sizeKey];
  const compact = sizeKey === "compact";
  const { w, h } = plotSize(size);
  const { margin, width, height, dotRadius } = size;
  const values = points.map((p) => p.value);
  const { min, max } =
    valueFormat === "pct" ? yBoundsPct(values) : yBoundsCount(values);
  const y = yScale(min, max, h, margin.top);
  const x = xScale(points.length, w, margin.left);
  const ticks =
    valueFormat === "pct" ? yTickValuesPct(min, max) : yTickValuesCount(min, max);
  const step = labelStep(points.length, compact);
  const xLabelY = height - (compact ? 10 : 14);
  const xRotate = compact ? -28 : -32;

  const grid = ticks
    .map((tick) => {
      const py = y(tick);
      return `<line class="kpi-chart-grid" x1="${margin.left}" y1="${py}" x2="${margin.left + w}" y2="${py}" />
        <text class="kpi-chart-axis" x="${margin.left - (compact ? 6 : 8)}" y="${py + 4}" text-anchor="end">${formatValue(tick, valueFormat)}</text>`;
    })
    .join("");

  const polyline = points
    .map((p, i) => `${x(i)},${y(p.value)}`)
    .join(" ");

  const dots = points
    .map(
      (p, i) =>
        `<circle class="kpi-chart-dot" cx="${x(i)}" cy="${y(p.value)}" r="${dotRadius}">
          <title>${escapeHtml(p.label)}: ${formatValue(p.value, valueFormat)}</title>
        </circle>`
    )
    .join("");

  const xLabels = points
    .map((p, i) => {
      if (i % step !== 0 && i !== points.length - 1) return "";
      const px = x(i);
      return `<text class="kpi-chart-axis kpi-chart-axis--x" x="${px}" y="${xLabelY}" text-anchor="middle" transform="rotate(${xRotate} ${px} ${xLabelY})">${escapeHtml(p.label)}</text>`;
    })
    .join("");

  const svgClass = compact ? "kpi-chart-svg kpi-chart-svg--compact" : "kpi-chart-svg";

  return `<svg class="${svgClass}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(points[0]?.label ?? "")} – ${escapeHtml(points.at(-1)?.label ?? "")}">
    ${grid}
    <line class="kpi-chart-axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + h}" />
    <line class="kpi-chart-axis-line" x1="${margin.left}" y1="${margin.top + h}" x2="${margin.left + w}" y2="${margin.top + h}" />
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
  valueFormat: "pct" | "count" = "count",
  compact = false
): string {
  return renderChartSvg(points, valueFormat, compact ? "compact" : "full");
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
  body.innerHTML = renderChartSvg(spec.points, spec.valueFormat ?? "pct", "full");
  modal.hidden = false;
  document.body.classList.add("kpi-chart-open");
  (modal.querySelector(".kpi-chart-close") as HTMLButtonElement)?.focus();
}

export function closeKpiChart(): void {
  if (!modalRoot) return;
  modalRoot.hidden = true;
  document.body.classList.remove("kpi-chart-open");
}

const KPI_CHART_ORDER = ["bikes", "mechanical", "ebike", "oos"] as const;

function defaultChartKey(charts: Record<string, KpiChartSpec | undefined>): string {
  for (const key of KPI_CHART_ORDER) {
    if (charts[key]?.points.length) return key;
  }
  return "bikes";
}

/** Bind metric selection + embedded line chart + modal expand. */
export function bindKpiSummary(
  container: HTMLElement,
  charts: Record<string, KpiChartSpec | undefined>
): void {
  const chartHost = container.querySelector<HTMLElement>(".kpi-summary__chart-inner");
  const chartBtn = container.querySelector<HTMLButtonElement>(".kpi-summary__chart-btn");
  const chartLabel = container.querySelector<HTMLElement>(".kpi-summary__chart-label");
  const chartSubtitle = container.querySelector<HTMLElement>(".kpi-summary__chart-subtitle");
  if (!chartHost) return;

  let activeKey = defaultChartKey(charts);

  const renderActiveChart = () => {
    const spec = charts[activeKey];
    container.querySelectorAll<HTMLElement>("[data-kpi-chart]").forEach((row) => {
      const key = row.dataset.kpiChart;
      const selectable = Boolean(key && charts[key]?.points.length);
      row.classList.toggle("kpi-summary__metric--active", key === activeKey);
      row.classList.toggle("kpi-summary__metric--selectable", selectable);
      if (selectable) {
        row.setAttribute("role", "button");
        row.setAttribute("tabindex", "0");
        row.setAttribute("aria-pressed", key === activeKey ? "true" : "false");
      } else {
        row.removeAttribute("role");
        row.removeAttribute("tabindex");
        row.removeAttribute("aria-pressed");
      }
    });

    if (!spec?.points.length) {
      chartHost.innerHTML = `<p class="kpi-summary__chart-empty">Sense prou dades recents.</p>`;
      if (chartLabel) chartLabel.textContent = "Últimes 24 h";
      if (chartSubtitle) chartSubtitle.textContent = "";
      if (chartBtn) {
        chartBtn.disabled = true;
        chartBtn.removeAttribute("aria-label");
      }
      return;
    }

    chartHost.innerHTML = renderKpiChartSvg(
      spec.points,
      spec.valueFormat ?? "count",
      true
    );
    if (chartLabel) chartLabel.textContent = spec.title;
    if (chartSubtitle) chartSubtitle.textContent = spec.subtitle ?? "";
    if (chartBtn) {
      chartBtn.disabled = false;
      chartBtn.setAttribute("aria-label", `${spec.title}: ampliar gràfic`);
    }
  };

  container.querySelectorAll<HTMLElement>("[data-kpi-chart]").forEach((row) => {
    const key = row.dataset.kpiChart;
    if (!key) return;

    const select = () => {
      if (!charts[key]?.points.length) return;
      activeKey = key;
      renderActiveChart();
    };

    row.addEventListener("click", select);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });
  });

  if (chartBtn) {
    const open = () => {
      const spec = charts[activeKey];
      if (spec?.points.length) openKpiChart(spec);
    };
    chartBtn.addEventListener("click", open);
  }

  renderActiveChart();
}
