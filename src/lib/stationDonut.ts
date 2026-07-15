import type { Barri, MetricMode, Station } from "./data";
import { bikesOutOfService, stationDocksDisabled, stationOosCount } from "./data";
import { METRIC_ABSOLUTE_COLORS } from "./colors";
import { formatPct } from "./format";
import { asyncLoadingHtml } from "./asyncLoading";
import { countIconHtml } from "./icons";
import type { ChartPoint } from "./history";
import { renderSparklineChart } from "./sparkline";

export type StationBreakdown = {
  name: string;
  station_id?: string;
  barri_codi?: string;
  capacity: number;
  mechanical: number;
  ebike: number;
  docks: number;
  oos: number;
  docks_disabled: number;
  barri_nom?: string;
  district?: string;
  status?: string;
  historical?: boolean;
  historicalLabel?: string;
};

export type StationPopupContext = {
  historical?: boolean;
  historicalLabel?: string;
};

type SegmentKey = "ebike" | "mechanical" | "docks" | "oos" | "docks_disabled";

type SegmentDef = {
  key: SegmentKey;
  label: string;
  short: string;
  popupLabel: string;
  color: string;
  icon: "ebike" | "mechanical" | "dock" | "maintenance";
  value: (b: StationBreakdown) => number;
};

const DOCKS_DISABLED_COLOR = "#64748b";

const SEGMENTS: SegmentDef[] = [
  {
    key: "ebike",
    label: "Elèctriques",
    short: "El.",
    popupLabel: "Elèctriques",
    color: METRIC_ABSOLUTE_COLORS.ebike,
    icon: "ebike",
    value: (b) => b.ebike,
  },
  {
    key: "mechanical",
    label: "Mecàniques",
    short: "Mec.",
    popupLabel: "Mecàniques",
    color: METRIC_ABSOLUTE_COLORS.mechanical,
    icon: "mechanical",
    value: (b) => b.mechanical,
  },
  {
    key: "docks",
    label: "Ancoratges lliures",
    short: "Ancoratges",
    popupLabel: "Ancoratges lliures",
    color: METRIC_ABSOLUTE_COLORS.docks,
    icon: "dock",
    value: (b) => b.docks,
  },
  {
    key: "oos",
    label: "Bicicletes fora de servei",
    short: "FS",
    popupLabel: "Fora de servei",
    color: METRIC_ABSOLUTE_COLORS.out_of_service,
    icon: "maintenance",
    value: (b) => b.oos,
  },
  {
    key: "docks_disabled",
    label: "Ancoratges avariats",
    short: "Avar.",
    popupLabel: "Ancoratges avariats",
    color: DOCKS_DISABLED_COLOR,
    icon: "dock",
    value: (b) => b.docks_disabled,
  },
];

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function ringSegment(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number
): string {
  if (end - start >= 359.99) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}`,
      `L ${cx - 0.01} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner}`,
      "Z",
    ].join(" ");
  }
  const large = end - start > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, rOuter, start);
  const [x2, y2] = polar(cx, cy, rOuter, end);
  const [x3, y3] = polar(cx, cy, rInner, end);
  const [x4, y4] = polar(cx, cy, rInner, start);
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
}

function segmentPct(value: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return (100 * value) / capacity;
}

function activeSegments(b: StationBreakdown) {
  return SEGMENTS.map((seg) => ({
    ...seg,
    count: seg.value(b),
    pct: segmentPct(seg.value(b), b.capacity),
  })).filter((s) => s.count > 0);
}

export function breakdownFromStation(
  station: Station,
  context: StationPopupContext = {}
): StationBreakdown {
  return {
    name: station.name,
    station_id: station.station_id,
    capacity: station.capacity,
    mechanical: station.mechanical,
    ebike: station.ebike,
    docks: station.docks_available,
    oos: stationOosCount(station),
    docks_disabled: stationDocksDisabled(station),
    barri_nom: station.barri_nom,
    district: station.district,
    status: station.status,
    historical: context.historical,
    historicalLabel: context.historicalLabel,
  };
}

export function breakdownFromBarri(
  barri: Barri,
  context: StationPopupContext = {},
  stationsInBarri: Station[] = []
): StationBreakdown {
  const scoped = stationsInBarri.filter((s) => s.barri_codi === barri.barri_codi);
  const oos = scoped.length
    ? scoped.reduce((sum, s) => sum + stationOosCount(s), 0)
    : (barri.bikes_out_of_service ??
        bikesOutOfService(
          barri.capacity_total,
          barri.bikes_mechanical,
          barri.bikes_ebike,
          barri.docks_available_total,
          barri.bikes_total
        ));
  const docks_disabled = scoped.length
    ? scoped.reduce((sum, s) => sum + stationDocksDisabled(s), 0)
    : (barri.docks_disabled_total ?? 0);
  return {
    name: barri.barri_nom,
    barri_codi: barri.barri_codi,
    capacity: barri.capacity_total,
    mechanical: barri.bikes_mechanical,
    ebike: barri.bikes_ebike,
    docks: barri.docks_available_total,
    oos,
    docks_disabled,
    historical: context.historical,
    historicalLabel: context.historicalLabel,
  };
}

/** City-wide anchor composition from station snapshots. */
export function breakdownFromCity(
  stations: Station[],
  context: StationPopupContext = {}
): StationBreakdown {
  let capacity = 0;
  let mechanical = 0;
  let ebike = 0;
  let docks = 0;
  let oos = 0;
  let docks_disabled = 0;
  for (const s of stations) {
    capacity += s.capacity;
    mechanical += s.mechanical;
    ebike += s.ebike;
    docks += s.docks_available;
    oos += stationOosCount(s);
    docks_disabled += stationDocksDisabled(s);
  }
  return {
    name: "Barcelona",
    capacity,
    mechanical,
    ebike,
    docks,
    oos,
    docks_disabled,
    historical: context.historical,
    historicalLabel: context.historicalLabel,
  };
}

function renderDonutSvg(
  b: StationBreakdown,
  size: number,
  className = "station-donut",
  options: { showCenterTotal?: boolean; showUnit?: boolean } = {}
): string {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = rOuter * 0.58;
  const slices = activeSegments(b);
  let angle = 0;
  const paths: string[] = [];

  if (b.capacity <= 0 || !slices.length) {
    paths.push(
      `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="none" stroke="#e2e8f0" stroke-width="${rOuter - rInner}" />`
    );
  } else {
    for (const slice of slices) {
      const sweep = (360 * slice.count) / b.capacity;
      if (sweep <= 0) continue;
      const end = angle + sweep;
      paths.push(
        `<path d="${ringSegment(cx, cy, rOuter, rInner, angle, end)}" fill="${slice.color}" />`
      );
      angle = end;
    }
  }

  const showCenterTotal =
    options.showCenterTotal ?? (b.capacity > 0 && b.capacity < 1000);
  const showUnit = options.showUnit ?? showCenterTotal;
  let centerText = "";
  if (showCenterTotal) {
    const unitText = showUnit
      ? `<text x="${cx}" y="${cy + 10}" text-anchor="middle" class="station-donut__unit">anc.</text>`
      : "";
    const totalY = showUnit ? cy - 2 : cy + 4;
    centerText = `<text x="${cx}" y="${totalY}" text-anchor="middle" class="station-donut__total">${b.capacity.toLocaleString("ca-ES")}</text>${unitText}`;
  }

  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${paths.join("")}${centerText}</svg>`;
}

function legendRow(
  seg: SegmentDef & { count: number; pct: number },
  compact: boolean,
  fullLabels = false
): string {
  const count = seg.count.toLocaleString("ca-ES");
  const pct = formatPct(seg.pct);
  const icon =
    seg.key === "docks_disabled" ? countIconHtml("dock") : countIconHtml(seg.icon);
  const label = fullLabels ? seg.popupLabel : compact ? seg.short : seg.label;
  if (compact) {
    return `<li class="station-donut-legend__item"><span class="station-donut-legend__swatch" style="background:${seg.color}"></span>${icon}<span class="station-donut-legend__label">${label}</span><span class="station-donut-legend__vals"><strong>${count}</strong> · ${pct}</span></li>`;
  }
  return `<li class="station-donut-legend__item station-donut-legend__item--full"><span class="station-donut-legend__swatch" style="background:${seg.color}"></span>${icon}<span class="station-donut-legend__label">${label}</span><span class="station-donut-legend__vals"><strong>${count}</strong><span>${pct}</span></span></li>`;
}

function renderLegend(b: StationBreakdown, compact: boolean, fullLabels = false): string {
  const items = activeSegments(b);
  if (!items.length) {
    return `<p class="station-donut-empty">Sense dades d'ocupació.</p>`;
  }
  const cls = compact ? "station-donut-legend station-donut-legend--compact" : "station-donut-legend";
  return `<ul class="${cls}">${items.map((s) => legendRow(s, compact, fullLabels)).join("")}</ul>`;
}

function encodeBreakdown(b: StationBreakdown): string {
  return encodeURIComponent(JSON.stringify(b));
}

function metaLine(b: StationBreakdown): string {
  const parts: string[] = [];
  if (b.barri_nom) parts.push(b.barri_nom);
  if (b.district) parts.push(b.district);
  if (!parts.length) return "";
  const offline =
    b.status && b.status !== "IN_SERVICE" && b.status !== "ACTIVE"
      ? ' · <span class="station-offline-badge">fora de servei</span>'
      : "";
  return `<p class="station-popup__meta">${parts.join(" · ")}${offline}</p>`;
}

function compositionHistoricalNote(b: StationBreakdown): string {
  if (!b.historical) return "";
  const label = b.historicalLabel ?? "aquesta franja horària";
  return `<p class="composition-card__note">Dades mitjana històrica: ${label} (30 dies)</p>`;
}

export type CompositionPanelOptions = {
  scopeLabel: string;
  clickable?: boolean;
};

/** Donut + legend for the composition card. */
export function renderCompositionPanel(
  b: StationBreakdown,
  options: CompositionPanelOptions
): string {
  const clickable = options.clickable !== false && !b.historical;
  const payload = clickable ? encodeBreakdown(b) : "";
  const donutInner = renderDonutSvg(b, 72, "station-donut station-donut--card", {
    showCenterTotal: false,
  });
  const chartHtml = clickable
    ? `<button type="button" class="composition-card__donut-btn" data-station-breakdown="${payload}" aria-label="Composició detallada: ${b.name}">${donutInner}</button>`
    : `<div class="composition-card__donut" aria-hidden="true">${donutInner}</div>`;

  return `<div class="composition-card__inner">
    <div class="composition-card__head">
      <p class="composition-card__title"><span class="composition-card__scope">${options.scopeLabel}</span></p>
      <p class="composition-card__total"><strong>${b.capacity.toLocaleString("ca-ES")}</strong> ancoratges totals</p>
      ${compositionHistoricalNote(b)}
    </div>
    <div class="composition-card__row">
      <div class="composition-card__chart">${chartHtml}</div>
      <div class="composition-card__legend">${renderLegend(b, true, true)}</div>
    </div>
  </div>`;
}

function popupStatsLine(b: StationBreakdown): string {
  const items = activeSegments(b);
  if (!items.length) return "";
  return items
    .map((seg) => {
      const icon =
        seg.key === "docks_disabled" ? countIconHtml("dock") : countIconHtml(seg.icon);
      return `<span class="station-popup__stat">${icon}${seg.short}: <strong>${seg.count.toLocaleString("ca-ES")}</strong></span>`;
    })
    .join("");
}

function popupSparklineSlot(b: StationBreakdown): string {
  if (b.historical || (!b.station_id && !b.barri_codi)) return "";
  return `<div class="station-popup__spark-host" data-sparkline-breakdown="${encodeBreakdown(b)}">${renderSparklineLoading(b, true)}</div>`;
}

function historicalNotePopup(b: StationBreakdown): string {
  if (!b.historical) return "";
  const label = b.historicalLabel ?? "aquesta franja horària";
  return `<p class="station-popup__note">Dades mitjana històrica: ${label} (30 dies)</p>`;
}

export function renderStationPopupContent(
  b: StationBreakdown,
  _options: StationPopupContext = {}
): string {
  const canExpand = !b.historical && (b.station_id || b.barri_codi);
  const payload = encodeBreakdown(b);
  const hint = canExpand
    ? `<span class="station-donut-trigger__hint"><span class="station-donut-trigger__chevron" aria-hidden="true">›</span> Prem per més info</span>`
    : "";
  return `<div class="station-popup">
    <p class="station-popup__title"><strong>${b.name}</strong></p>
    ${metaLine(b)}
    ${historicalNotePopup(b)}
    <div class="station-popup__chart">
      <div class="station-donut-col">
        <button type="button" class="station-donut-trigger" data-station-breakdown="${payload}" aria-label="Prem per més info: distribució i gràfic de 24 hores">
          ${renderDonutSvg(b, 76, "station-donut", { showCenterTotal: false, showUnit: false })}
          <span class="station-donut-caption">${b.capacity.toLocaleString("ca-ES")} ancoratges</span>
          ${hint}
        </button>
      </div>
      ${renderLegend(b, true, true)}
    </div>
  </div>`;
}

const POPUP_SPARKLINE_WIDTH = 200;
const POPUP_SPARKLINE_HEIGHT = 56;

function renderSparklineLoading(b: StationBreakdown, compact = false): string {
  return `<div class="station-donut-modal__spark station-donut-modal__spark--pending${compact ? " station-popup__spark-inner" : ""}"><p class="station-donut-modal__spark-label">${sparklineLabel(b, compact)}</p>${asyncLoadingHtml("station-donut-modal__spark-status")}</div>`;
}

function renderSparklineEmpty(b: StationBreakdown, compact = false): string {
  return `<div class="station-donut-modal__spark station-donut-modal__spark--empty${compact ? " station-popup__spark-inner" : ""}"><p class="station-donut-modal__spark-label">${sparklineLabel(b, compact)}</p><p class="station-donut-empty">Sense prou dades recents.</p></div>`;
}

function sparklineLabel(b: StationBreakdown, compact = false): string {
  const metric = SPARKLINE_METRIC_LABEL[sparklineMetricMode];
  if (compact) return `${metric} · 24 h`;
  const scope = b.barri_codi && !b.station_id ? "barri" : "estació";
  return `${metric} (% ancoratges) · últimes 24 h · ${scope}`;
}

function renderSparklineBlock(b: StationBreakdown, points: ChartPoint[], compact = false): string {
  if (points.length <= 1) return "";
  const width = compact ? POPUP_SPARKLINE_WIDTH : 280;
  const height = compact ? POPUP_SPARKLINE_HEIGHT : 92;
  return `<div class="station-donut-modal__spark${compact ? " station-popup__spark-inner" : ""}"><p class="station-donut-modal__spark-label">${sparklineLabel(b, compact)}</p>${renderSparklineChart(points, width, height)}</div>`;
}

function renderModalPanel(b: StationBreakdown, sparklineHtml = ""): string {
  return `<div class="station-donut-modal__panel" role="dialog" aria-modal="true" aria-label="Distribució d'ancoratges: ${b.name}">
    <button type="button" class="station-donut-modal__close" aria-label="Tanca">×</button>
    <p class="station-donut-modal__title"><strong>${b.name}</strong></p>
    ${metaLine(b)}
    ${historicalNotePopup(b)}
    <p class="station-donut-modal__subtitle">${b.capacity.toLocaleString("ca-ES")} ancoratges totals</p>
    <div class="station-donut-modal__chart">${renderDonutSvg(b, 200, "station-donut station-donut--large", { showCenterTotal: b.capacity < 1000 })}</div>
    ${renderLegend(b, false)}
    ${sparklineHtml}
  </div>`;
}

let modalSparklineRequest = 0;
let popupSparklineRequest = 0;
let modalRoot: HTMLElement | null = null;
let sparklineLoader: ((b: StationBreakdown) => Promise<ChartPoint[]>) | null = null;
let sparklineMetricMode: MetricMode = "total";

const SPARKLINE_METRIC_LABEL: Record<MetricMode, string> = {
  total: "Bicicletes",
  mechanical: "Mecàniques",
  ebike: "Elèctriques",
  docks: "Ancoratges lliures",
  out_of_service: "Fora de servei",
};

export function setStationDonutMetricMode(mode: MetricMode): void {
  sparklineMetricMode = mode;
}

export function setStationDonutSparklineLoader(
  loader: (b: StationBreakdown) => Promise<ChartPoint[]>
): void {
  sparklineLoader = loader;
}

function ensureModal(): HTMLElement {
  if (modalRoot) return modalRoot;
  modalRoot = document.createElement("div");
  modalRoot.className = "station-donut-modal";
  modalRoot.hidden = true;
  modalRoot.innerHTML = `<div class="station-donut-modal__backdrop" data-close-donut></div><div class="station-donut-modal__host"></div>`;
  document.body.appendChild(modalRoot);

  modalRoot.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-close-donut]") || t.closest(".station-donut-modal__close")) {
      closeStationDonutModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalRoot && !modalRoot.hidden) closeStationDonutModal();
  });
  return modalRoot;
}

export function openStationDonutModal(b: StationBreakdown): void {
  const root = ensureModal();
  const host = root.querySelector(".station-donut-modal__host")!;
  const requestId = ++modalSparklineRequest;
  const showSparkline = Boolean(sparklineLoader && !b.historical);
  host.innerHTML = renderModalPanel(
    b,
    showSparkline ? renderSparklineLoading(b) : ""
  );
  root.hidden = false;
  document.body.classList.add("station-donut-modal-open");
  host.querySelector<HTMLButtonElement>(".station-donut-modal__close")?.focus();

  if (showSparkline && sparklineLoader) {
    void sparklineLoader(b).then((points) => {
      if (root.hidden || requestId !== modalSparklineRequest) return;
      const sparkHtml =
        points.length > 1 ? renderSparklineBlock(b, points) : renderSparklineEmpty(b);
      host.innerHTML = renderModalPanel(b, sparkHtml);
      host.querySelector<HTMLButtonElement>(".station-donut-modal__close")?.focus();
    });
  }
}

export function closeStationDonutModal(): void {
  if (!modalRoot) return;
  modalSparklineRequest++;
  modalRoot.hidden = true;
  document.body.classList.remove("station-donut-modal-open");
}

export function bindStationDonutInPopup(popupEl: HTMLElement | null | undefined): void {
  if (!popupEl) return;
  popupEl.querySelectorAll<HTMLButtonElement>("[data-station-breakdown]").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const raw = btn.getAttribute("data-station-breakdown");
      if (!raw) return;
      try {
        openStationDonutModal(JSON.parse(decodeURIComponent(raw)) as StationBreakdown);
      } catch {
        /* ignore malformed payload */
      }
    });
  });
}

/** Load 24h sparkline into map popup when slot is present. */
export function hydratePopupSparkline(popupEl: HTMLElement | null | undefined): void {
  if (!popupEl || !sparklineLoader) return;
  const host = popupEl.querySelector<HTMLElement>("[data-sparkline-breakdown]");
  if (!host) return;
  const raw = host.getAttribute("data-sparkline-breakdown");
  if (!raw) return;
  let breakdown: StationBreakdown;
  try {
    breakdown = JSON.parse(decodeURIComponent(raw)) as StationBreakdown;
  } catch {
    return;
  }
  const requestId = ++popupSparklineRequest;
  host.innerHTML = renderSparklineLoading(breakdown);
  void sparklineLoader(breakdown).then((points) => {
    if (requestId !== popupSparklineRequest) return;
    if (!host.isConnected) return;
    host.innerHTML =
      points.length > 1
        ? renderSparklineBlock(breakdown, points, true)
        : renderSparklineEmpty(breakdown, true);
  });
}
