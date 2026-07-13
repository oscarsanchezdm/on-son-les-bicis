import type { MetricMode, Station } from "../lib/data";
import { stationCount, stationMetric, stationOosAnchorPct } from "../lib/data";
import type { TimeView } from "../lib/history";
import { metricSortAscending, metricToBarriSortKey } from "../lib/metricSort";
import { metricAbsoluteColor, metricPctColor, type HeatScaleMode } from "../lib/colors";
import { formatPct } from "../lib/format";
import { countIconHtml } from "../lib/icons";

type StationSortKey =
  | "name"
  | "pct_bikes"
  | "pct_mechanical"
  | "pct_ebike"
  | "pct_docks_free"
  | "pct_bikes_out_of_service";

const COLUMN_METRIC: Record<Exclude<StationSortKey, "name">, MetricMode> = {
  pct_bikes: "total",
  pct_mechanical: "mechanical",
  pct_ebike: "ebike",
  pct_docks_free: "docks",
  pct_bikes_out_of_service: "out_of_service",
};

const COLUMN_LABEL: Record<Exclude<StationSortKey, "name">, { percent: string; absolute: string }> = {
  pct_bikes: { percent: "% bicicletes", absolute: "Bicicletes" },
  pct_mechanical: { percent: "% mecàniques", absolute: "Mecàniques" },
  pct_ebike: { percent: "% elèctriques", absolute: "Elèctriques" },
  pct_docks_free: { percent: "% ancoratges lliures", absolute: "Ancoratges lliures" },
  pct_bikes_out_of_service: { percent: "% fora de servei", absolute: "Fora de servei" },
};

let sortState: { key: StationSortKey; asc: boolean } = { key: "pct_bikes", asc: true };
let activeMetricMode: MetricMode = "total";

export function setStationTableMetricMode(mode: MetricMode): void {
  activeMetricMode = mode;
  sortState = {
    key: metricToBarriSortKey(mode) as StationSortKey,
    asc: metricSortAscending(mode),
  };
}

function sortValue(station: Station, key: StationSortKey, heatScale: HeatScaleMode): string | number {
  if (key === "name") return station.name.toLowerCase();
  const metric = COLUMN_METRIC[key];
  if (heatScale === "absolute") return stationCount(station, metric);
  if (key === "pct_bikes_out_of_service") return stationOosAnchorPct(station);
  return stationMetric(station, metric);
}

function sortedStations(stations: Station[], heatScale: HeatScaleMode): Station[] {
  const { key, asc } = sortState;
  return [...stations].sort((a, b) => {
    const av = sortValue(a, key, heatScale);
    const bv = sortValue(b, key, heatScale);
    if (typeof av === "string" && typeof bv === "string") {
      return asc ? av.localeCompare(bv, "ca") : bv.localeCompare(av, "ca");
    }
    return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });
}

function header(label: string, key: StationSortKey, active: boolean): string {
  const arrow = sortState.key === key ? (sortState.asc ? " ↑" : " ↓") : "";
  const cls = active ? "sortable col-active" : "sortable";
  return `<th class="${cls}" data-sort="${key}" scope="col">${label}${arrow}</th>`;
}

function pctCell(pct: number, metric: MetricMode, active = false): string {
  const color = metricPctColor(pct, metric);
  const width = Math.min(100, Math.max(0, pct));
  const cls = active ? "pct-cell col-active" : "pct-cell";
  return `<td class="${cls}">
    <div class="pct-cell-meter" aria-hidden="true"><span style="width:${width}%;background:${color}"></span></div>
    <span class="pct-cell-num">${formatPct(pct)}</span>
  </td>`;
}

function countCell(count: number, max: number, metric: MetricMode, active = false): string {
  const width = max > 0 ? Math.min(100, (100 * count) / max) : 0;
  const color = metricAbsoluteColor(metric);
  const cls = active ? "pct-cell col-active" : "pct-cell";
  return `<td class="${cls}">
    <div class="pct-cell-meter" aria-hidden="true"><span style="width:${width}%;background:${color}"></span></div>
    <span class="pct-cell-num">${count.toLocaleString("ca-ES")}</span>
  </td>`;
}

function columnMax(stations: Station[], key: Exclude<StationSortKey, "name">): number {
  const metric = COLUMN_METRIC[key];
  return Math.max(1, ...stations.map((s) => stationCount(s, metric)));
}

function stationNameCell(s: Station, offline: boolean): string {
  const dockBadge = `<span class="barri-stations-badge barri-docks-badge" title="${s.capacity} ancoratges">${countIconHtml("dock")}<span class="barri-stations-badge__count">${s.capacity}</span></span>`;
  const offlineBadge = offline ? ' <span class="station-offline-badge">fora de servei</span>' : "";
  return `<td class="barri-name"><span class="barri-name__text">${s.name}</span><span class="barri-name__badges">${dockBadge}</span>${offlineBadge}</td>`;
}

function activeColumnKey(): StationSortKey {
  return metricToBarriSortKey(activeMetricMode) as StationSortKey;
}

export function renderStationTable(
  container: HTMLElement,
  stations: Station[],
  mode: MetricMode,
  timeView: TimeView = { kind: "latest" },
  options?: {
    selectedId?: string | null;
    onSelect?: (station: Station) => void;
    heatScale?: HeatScaleMode;
  }
): void {
  if (mode !== activeMetricMode) setStationTableMetricMode(mode);

  const selectedId = options?.selectedId ?? null;
  const onSelect = options?.onSelect;
  const heatScale = options?.heatScale ?? "percent";
  const sorted = sortedStations(stations, heatScale);
  const prevWrap = container.querySelector<HTMLElement>(".table-wrap");
  const scrollLeft = prevWrap?.scrollLeft ?? 0;
  const scrollTop = prevWrap?.scrollTop ?? 0;
  const focusKey = activeColumnKey();

  const metricKeys = Object.keys(COLUMN_METRIC) as Exclude<StationSortKey, "name">[];
  const maxByColumn = Object.fromEntries(
    metricKeys.map((key) => [key, columnMax(stations, key)])
  ) as Record<Exclude<StationSortKey, "name">, number>;

  const colHeaders = metricKeys
    .map((key) => header(COLUMN_LABEL[key][heatScale], key, key === focusKey))
    .join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table class="barri-table station-table">
        <thead>
          <tr>
            ${header("Estació", "name", false)}
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((s) => {
              const offline = s.status !== "IN_SERVICE" && s.status !== "ACTIVE";
              const cells = metricKeys
                .map((key) => {
                  const metric = COLUMN_METRIC[key];
                  const active = key === focusKey;
                  if (heatScale === "absolute") {
                    return countCell(stationCount(s, metric), maxByColumn[key], metric, active);
                  }
                  const pct =
                    key === "pct_bikes_out_of_service"
                      ? stationOosAnchorPct(s)
                      : stationMetric(s, metric);
                  return pctCell(pct, metric, active);
                })
                .join("");
              return `<tr data-station-id="${s.station_id}" class="${s.station_id === selectedId ? "selected" : ""}${offline ? " station-row--offline" : ""}">
                ${stationNameCell(s, offline)}
                ${cells}
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  const tableWrap = container.querySelector<HTMLElement>(".table-wrap");
  if (tableWrap) {
    tableWrap.scrollLeft = scrollLeft;
    tableWrap.scrollTop = scrollTop;
  }

  container.querySelectorAll<HTMLTableCellElement>("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort as StationSortKey;
      if (sortState.key === key) {
        sortState = { key, asc: !sortState.asc };
      } else {
        sortState = { key, asc: key === "name" };
      }
      renderStationTable(container, stations, mode, timeView, options);
    });
  });

  if (onSelect) {
    container.querySelectorAll("tbody tr").forEach((row) => {
      row.addEventListener("click", () => {
        const id = (row as HTMLElement).dataset.stationId;
        const station = stations.find((s) => s.station_id === id);
        if (station) onSelect(station);
      });
    });
  }
}
