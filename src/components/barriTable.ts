import type { Barri, MetricMode } from "../lib/data";
import { barriMetric, barriMetricCount, barriOosAnchorPct } from "../lib/data";
import type { TimeView } from "../lib/history";
import { metricSortAscending, metricToBarriSortKey } from "../lib/metricSort";
import { metricAbsoluteColor, metricPctColor, type HeatScaleMode } from "../lib/colors";
import { formatPct } from "../lib/format";

export type BarriSortKey =
  | "barri_nom"
  | "pct_bikes"
  | "pct_mechanical"
  | "pct_ebike"
  | "pct_docks_free"
  | "pct_bikes_out_of_service"
  | "stations_active"
  | "stations_zero_any";

const COLUMN_METRIC: Partial<Record<BarriSortKey, MetricMode>> = {
  pct_bikes: "total",
  pct_mechanical: "mechanical",
  pct_ebike: "ebike",
  pct_docks_free: "docks",
  pct_bikes_out_of_service: "out_of_service",
};

const COLUMN_LABEL: Record<Exclude<BarriSortKey, "barri_nom">, { percent: string; absolute: string }> = {
  pct_bikes: { percent: "% bicicletes", absolute: "Bicicletes" },
  pct_mechanical: { percent: "% mecàniques", absolute: "Mecàniques" },
  pct_ebike: { percent: "% elèctriques", absolute: "Elèctriques" },
  pct_docks_free: { percent: "% ancoratges lliures", absolute: "Ancoratges lliures" },
  pct_bikes_out_of_service: { percent: "% fora de servei", absolute: "Fora de servei" },
  stations_active: { percent: "Estacions", absolute: "Estacions" },
  stations_zero_any: { percent: "Sense bicis", absolute: "Sense bicis" },
};

type SortState = { key: BarriSortKey; asc: boolean };

let sortState: SortState = { key: "pct_bikes", asc: true };
let activeMetricMode: MetricMode = "total";

export function setBarriTableMetricMode(mode: MetricMode): void {
  activeMetricMode = mode;
  sortState = {
    key: metricToBarriSortKey(mode),
    asc: metricSortAscending(mode),
  };
}

function activeColumnKey(): BarriSortKey {
  return metricToBarriSortKey(activeMetricMode);
}

function sortValue(barri: Barri, key: BarriSortKey, heatScale: HeatScaleMode): string | number {
  if (key === "barri_nom") return barri.barri_nom.toLowerCase();
  if (key === "stations_active") return barri.stations_active;
  if (key === "stations_zero_any") return barri.stations_zero_any;
  const metric = COLUMN_METRIC[key]!;
  if (heatScale === "absolute") return barriMetricCount(barri, metric);
  switch (key) {
    case "pct_bikes":
      return barri.pct_bikes;
    case "pct_mechanical":
      return barri.pct_mechanical;
    case "pct_ebike":
      return barri.pct_ebike;
    case "pct_docks_free":
      return barri.pct_docks_free;
    case "pct_bikes_out_of_service":
      return barriOosAnchorPct(barri);
  }
  return 0;
}

function sortedBarris(barris: Barri[], heatScale: HeatScaleMode): Barri[] {
  const { key, asc } = sortState;
  return [...barris].sort((a, b) => {
    const av = sortValue(a, key, heatScale);
    const bv = sortValue(b, key, heatScale);
    if (typeof av === "string" && typeof bv === "string") {
      return asc ? av.localeCompare(bv, "ca") : bv.localeCompare(av, "ca");
    }
    return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });
}

function header(label: string, key: BarriSortKey, active: boolean): string {
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

function plainCountCell(count: number, max: number, active = false): string {
  const width = max > 0 ? Math.min(100, (100 * count) / max) : 0;
  const cls = active ? "pct-cell col-active" : "pct-cell";
  return `<td class="${cls}">
    <div class="pct-cell-meter" aria-hidden="true"><span style="width:${width}%;background:#94a3b8"></span></div>
    <span class="pct-cell-num">${count.toLocaleString("ca-ES")}</span>
  </td>`;
}

function columnMax(barris: Barri[], key: Exclude<BarriSortKey, "barri_nom">): number {
  if (key === "stations_active") {
    return Math.max(1, ...barris.map((b) => b.stations_active));
  }
  if (key === "stations_zero_any") {
    return Math.max(1, ...barris.map((b) => b.stations_zero_any));
  }
  const metric = COLUMN_METRIC[key]!;
  return Math.max(1, ...barris.map((b) => barriMetricCount(b, metric)));
}

const METRIC_KEYS = Object.keys(COLUMN_METRIC) as Exclude<BarriSortKey, "barri_nom" | "stations_active" | "stations_zero_any">[];
const EXTRA_KEYS: BarriSortKey[] = ["stations_active", "stations_zero_any"];

export function renderBarriTable(
  container: HTMLElement,
  barris: Barri[],
  mode: MetricMode,
  timeView: TimeView = { kind: "latest" },
  options?: {
    selectedCodi?: string | null;
    onSelect?: (barri: Barri) => void;
    heatScale?: HeatScaleMode;
  }
): void {
  if (mode !== activeMetricMode) setBarriTableMetricMode(mode);

  const selectedCodi = options?.selectedCodi ?? null;
  const onSelect = options?.onSelect;
  const heatScale = options?.heatScale ?? "percent";
  const sorted = sortedBarris(barris, heatScale);
  const prevWrap = container.querySelector<HTMLElement>(".table-wrap");
  const scrollLeft = prevWrap?.scrollLeft ?? 0;
  const scrollTop = prevWrap?.scrollTop ?? 0;
  const focusKey = activeColumnKey();

  const allKeys = [...METRIC_KEYS, ...EXTRA_KEYS] as BarriSortKey[];
  const maxByColumn = Object.fromEntries(
    allKeys.map((key) => [key, columnMax(barris, key as Exclude<BarriSortKey, "barri_nom">)])
  ) as Record<BarriSortKey, number>;

  const colHeaders = allKeys
    .map((key) => header(COLUMN_LABEL[key as Exclude<BarriSortKey, "barri_nom">][heatScale], key, key === focusKey))
    .join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table class="barri-table">
        <thead>
          <tr>
            ${header("Barri", "barri_nom", false)}
            ${colHeaders}
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((b) => {
              const cells = allKeys
                .map((key) => {
                  const active = key === focusKey;
                  if (key === "stations_active") {
                    return plainCountCell(b.stations_active, maxByColumn[key], active);
                  }
                  if (key === "stations_zero_any") {
                    return plainCountCell(b.stations_zero_any, maxByColumn[key], active);
                  }
                  const metric = COLUMN_METRIC[key]!;
                  if (heatScale === "absolute") {
                    return countCell(barriMetricCount(b, metric), maxByColumn[key], metric, active);
                  }
                  if (key === "pct_bikes_out_of_service") {
                    return pctCell(barriOosAnchorPct(b), "out_of_service", active);
                  }
                  const pct =
                    key === "pct_bikes"
                      ? b.pct_bikes
                      : key === "pct_mechanical"
                        ? b.pct_mechanical
                        : key === "pct_ebike"
                          ? b.pct_ebike
                          : b.pct_docks_free;
                  return pctCell(pct, metric, active);
                })
                .join("");
              return `<tr data-codi="${b.barri_codi}" class="${b.barri_codi === selectedCodi ? "selected" : ""}">
                <td class="barri-name">${b.barri_nom}</td>
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
      const key = th.dataset.sort as BarriSortKey;
      if (sortState.key === key) {
        sortState = { key, asc: !sortState.asc };
      } else {
        sortState = { key, asc: key === "barri_nom" };
      }
      renderBarriTable(container, barris, mode, timeView, options);
    });
  });

  if (onSelect) {
    container.querySelectorAll("tbody tr").forEach((row) => {
      row.addEventListener("click", () => {
        const codi = (row as HTMLElement).dataset.codi;
        const barri = barris.find((b) => b.barri_codi === codi);
        if (barri) onSelect(barri);
      });
    });
  }
}
