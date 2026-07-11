import type { Barri, MetricMode, Station } from "./data";
import { bikesOutOfService, stationDocksDisabled, stationOosCount } from "./data";
import { METRIC_ABSOLUTE_COLORS } from "./colors";
import { formatPct } from "./format";
import { countIconHtml } from "./icons";
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
    color: METRIC_ABSOLUTE_COLORS.ebike,
    icon: "ebike",
    value: (b) => b.ebike,
  },
  {
    key: "mechanical",
    label: "Mecàniques",
    short: "Mec.",
    color: METRIC_ABSOLUTE_COLORS.mechanical,
    icon: "mechanical",
    value: (b) => b.mechanical,
  },
  {
    key: "docks",
    label: "Ancoratges lliures",
    short: "Anc.",
    color: METRIC_ABSOLUTE_COLORS.docks,
    icon: "dock",
    value: (b) => b.docks,
  },
  {
    key: "oos",
    label: "Fora de servei",
    short: "FS",
    color: METRIC_ABSOLUTE_COLORS.out_of_service,
    icon: "maintenance",
    value: (b) => b.oos,
  },
  {
    key: "docks_disabled",
    label: "Ancoratges avariats",
    short: "Avar.",
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

export function breakdownFromBarri(barri: Barri, context: StationPopupContext = {}): StationBreakdown {
  const oos =
    barri.bikes_out_of_service ??
    bikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total,
      barri.bikes_total
    );
  return {
    name: barri.barri_nom,
    barri_codi: barri.barri_codi,
    capacity: barri.capacity_total,
    mechanical: barri.bikes_mechanical,
    ebike: barri.bikes_ebike,
    docks: barri.docks_available_total,
    oos,
    docks_disabled: 0,
    historical: context.historical,
    historicalLabel: context.historicalLabel,
  };
}

function renderDonutSvg(
  b: StationBreakdown,
  size: number,
  className = "station-donut",
  showUnit = true
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

  const unitText = showUnit
    ? `<text x="${cx}" y="${cy + 10}" text-anchor="middle" class="station-donut__unit">anc.</text>`
    : "";
  const totalY = showUnit ? cy - 2 : cy + 4;

  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${paths.join("")}<text x="${cx}" y="${totalY}" text-anchor="middle" class="station-donut__total">${b.capacity}</text>${unitText}</svg>`;
}

function legendRow(
  seg: SegmentDef & { count: number; pct: number },
  compact: boolean
): string {
  const count = seg.count.toLocaleString("ca-ES");
  const pct = formatPct(seg.pct);
  const icon =
    seg.key === "docks_disabled" ? countIconHtml("dock") : countIconHtml(seg.icon);
  if (compact) {
    return `<li class="station-donut-legend__item"><span class="station-donut-legend__swatch" style="background:${seg.color}"></span>${icon}<span class="station-donut-legend__label">${seg.short}</span><span class="station-donut-legend__vals"><strong>${count}</strong> · ${pct}</span></li>`;
  }
  return `<li class="station-donut-legend__item station-donut-legend__item--full"><span class="station-donut-legend__swatch" style="background:${seg.color}"></span>${icon}<span class="station-donut-legend__label">${seg.label}</span><span class="station-donut-legend__vals"><strong>${count}</strong><span>${pct}</span></span></li>`;
}

function renderLegend(b: StationBreakdown, compact: boolean): string {
  const items = activeSegments(b);
  if (!items.length) {
    return `<p class="station-donut-empty">Sense dades d'ocupació.</p>`;
  }
  const cls = compact ? "station-donut-legend station-donut-legend--compact" : "station-donut-legend";
  return `<ul class="${cls}">${items.map((s) => legendRow(s, compact)).join("")}</ul>`;
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

function historicalNote(b: StationBreakdown): string {
  if (!b.historical) return "";
  const label = b.historicalLabel ?? "aquesta franja horària";
  return `<p class="station-popup__note">Dades mitjana històrica: ${label} (30 dies)</p>`;
}

export function renderStationPopupContent(
  b: StationBreakdown,
  _options: StationPopupContext = {}
): string {
  const canSparkline = !b.historical && (b.station_id || b.barri_codi);
  const sparkSlot = canSparkline
    ? `<div class="station-popup__spark" data-sparkline-slot hidden></div>`
    : "";
  const payload = encodeBreakdown(b);
  const hint = canSparkline
    ? `<span class="station-donut-trigger__hint"><span class="station-donut-trigger__chevron" aria-hidden="true">›</span> Gràfic 24 h</span>`
    : "";
  return `<div class="station-popup">
    <p class="station-popup__title"><strong>${b.name}</strong></p>
    ${metaLine(b)}
    ${historicalNote(b)}
    <div class="station-popup__chart">
      <div class="station-donut-col">
        <button type="button" class="station-donut-trigger" data-station-breakdown="${payload}" data-sparkline-toggle${canSparkline ? "" : " disabled"} aria-expanded="false" aria-label="Mostra el gràfic de les últimes 24 hores">
          ${renderDonutSvg(b, 76, "station-donut", false)}
        </button>
        <p class="station-donut-caption">${b.capacity.toLocaleString("ca-ES")} ancoratges</p>
        ${hint}
      </div>
      ${renderLegend(b, true)}
    </div>
    ${sparkSlot}
  </div>`;
}

function sparklineLabel(b: StationBreakdown): string {
  const scope = b.barri_codi && !b.station_id ? "barri" : "estació";
  const metric = SPARKLINE_METRIC_LABEL[sparklineMetricMode];
  return `${metric} (% ancoratges) · últimes 24 h · ${scope}`;
}

function renderSparklineBlock(b: StationBreakdown, values: number[], compact = false): string {
  if (values.length <= 1) return "";
  const width = compact ? 248 : 280;
  const height = compact ? 72 : 80;
  return `<div class="station-donut-modal__spark${compact ? " station-popup__spark-inner" : ""}"><p class="station-donut-modal__spark-label">${sparklineLabel(b)}</p>${renderSparklineChart(values, width, height)}</div>`;
}

function renderModalPanel(b: StationBreakdown, sparklineHtml = ""): string {
  return `<div class="station-donut-modal__panel" role="dialog" aria-modal="true" aria-label="Distribució d'ancoratges: ${b.name}">
    <button type="button" class="station-donut-modal__close" aria-label="Tanca">×</button>
    <p class="station-donut-modal__title"><strong>${b.name}</strong></p>
    ${metaLine(b)}
    ${historicalNote(b)}
    <p class="station-donut-modal__subtitle">${b.capacity.toLocaleString("ca-ES")} ancoratges totals</p>
    <div class="station-donut-modal__chart">${renderDonutSvg(b, 200, "station-donut station-donut--large")}</div>
    ${renderLegend(b, false)}
    ${sparklineHtml}
  </div>`;
}

let modalRoot: HTMLElement | null = null;
let sparklineLoader: ((b: StationBreakdown) => Promise<number[]>) | null = null;
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
  loader: (b: StationBreakdown) => Promise<number[]>
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
  host.innerHTML = renderModalPanel(b);
  root.hidden = false;
  document.body.classList.add("station-donut-modal-open");
  const closeBtn = host.querySelector<HTMLButtonElement>(".station-donut-modal__close");
  closeBtn?.focus();

  if (sparklineLoader && !b.historical) {
    void sparklineLoader(b).then((values) => {
      if (root.hidden) return;
      host.innerHTML = renderModalPanel(b, renderSparklineBlock(b, values));
      host.querySelector<HTMLButtonElement>(".station-donut-modal__close")?.focus();
    });
  }
}

export function closeStationDonutModal(): void {
  if (!modalRoot) return;
  modalRoot.hidden = true;
  document.body.classList.remove("station-donut-modal-open");
}

export function bindStationDonutInPopup(popupEl: HTMLElement | null | undefined): void {
  if (!popupEl) return;
  popupEl.querySelectorAll<HTMLButtonElement>("[data-sparkline-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void togglePopupSparkline(popupEl, btn);
    });
  });
}

async function togglePopupSparkline(
  popupEl: HTMLElement,
  btn: HTMLButtonElement
): Promise<void> {
  const raw = btn.getAttribute("data-station-breakdown");
  if (!raw) return;

  let breakdown: StationBreakdown;
  try {
    breakdown = JSON.parse(decodeURIComponent(raw)) as StationBreakdown;
  } catch {
    return;
  }

  if (breakdown.historical || (!breakdown.station_id && !breakdown.barri_codi)) return;

  const slot = popupEl.querySelector<HTMLElement>("[data-sparkline-slot]");
  if (!slot) return;

  const isOpen = !slot.hidden;
  if (isOpen) {
    slot.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    return;
  }

  if (!slot.dataset.loaded) {
    if (!sparklineLoader) return;
    const values = await sparklineLoader(breakdown);
    if (!popupEl.isConnected) return;
    slot.innerHTML = renderSparklineBlock(breakdown, values, true);
    slot.dataset.loaded = "1";
  }

  slot.hidden = false;
  btn.setAttribute("aria-expanded", "true");
}
