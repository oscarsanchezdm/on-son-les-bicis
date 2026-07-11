import type { Barri, Station } from "./data";
import { bikesOutOfService, stationDocksDisabled, stationOosCount } from "./data";
import { METRIC_ABSOLUTE_COLORS } from "./colors";
import { formatPct } from "./format";
import { countIconHtml } from "./icons";
import { renderSparkline } from "./sparkline";

export type StationBreakdown = {
  name: string;
  station_id?: string;
  capacity: number;
  mechanical: number;
  ebike: number;
  docks: number;
  oos: number;
  docks_disabled: number;
  barri_nom?: string;
  district?: string;
  status?: string;
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

export function breakdownFromStation(station: Station): StationBreakdown {
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
  };
}

export function breakdownFromBarri(barri: Barri): StationBreakdown {
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
    capacity: barri.capacity_total,
    mechanical: barri.bikes_mechanical,
    ebike: barri.bikes_ebike,
    docks: barri.docks_available_total,
    oos,
    docks_disabled: 0,
  };
}

function renderDonutSvg(b: StationBreakdown, size: number, className = "station-donut"): string {
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

  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${paths.join("")}<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="station-donut__total">${b.capacity}</text><text x="${cx}" y="${cy + 10}" text-anchor="middle" class="station-donut__unit">anc.</text></svg>`;
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

export function renderStationPopupContent(
  b: StationBreakdown,
  options: { historical?: boolean } = {}
): string {
  const hist = options.historical
    ? `<p class="station-popup__note">Mitjana històrica a aquesta franja</p>`
    : "";
  const payload = encodeBreakdown(b);
  return `<div class="station-popup">
    <p class="station-popup__title"><strong>${b.name}</strong></p>
    ${metaLine(b)}
    ${hist}
    <div class="station-popup__chart">
      <button type="button" class="station-donut-trigger" data-station-breakdown="${payload}" aria-label="Amplia el gràfic de distribució d'ancoratges">
        ${renderDonutSvg(b, 76)}
        <span class="station-donut-trigger__hint">Amplia</span>
      </button>
      ${renderLegend(b, true)}
    </div>
  </div>`;
}

function renderModalPanel(b: StationBreakdown, sparklineHtml = ""): string {
  return `<div class="station-donut-modal__panel" role="dialog" aria-modal="true" aria-label="Distribució d'ancoratges: ${b.name}">
    <button type="button" class="station-donut-modal__close" aria-label="Tanca">×</button>
    <p class="station-donut-modal__title"><strong>${b.name}</strong></p>
    ${metaLine(b)}
    <p class="station-donut-modal__subtitle">${b.capacity.toLocaleString("ca-ES")} ancoratges totals</p>
    <div class="station-donut-modal__chart">${renderDonutSvg(b, 200, "station-donut station-donut--large")}</div>
    ${renderLegend(b, false)}
    ${sparklineHtml}
  </div>`;
}

let modalRoot: HTMLElement | null = null;
let sparklineLoader: ((b: StationBreakdown) => Promise<number[]>) | null = null;

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

  if (sparklineLoader) {
    void sparklineLoader(b).then((values) => {
      if (root.hidden) return;
      const spark =
        values.length > 1
          ? `<div class="station-donut-modal__spark"><p class="station-donut-modal__spark-label">Bicicletes (% ancoratges) · últimes 24 h</p>${renderSparkline(values, 280, 56)}</div>`
          : "";
      host.innerHTML = renderModalPanel(b, spark);
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
  popupEl.querySelectorAll<HTMLButtonElement>("[data-station-breakdown]").forEach((btn) => {
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
