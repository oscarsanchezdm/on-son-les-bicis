import type { Barri, MetricMode } from "../lib/data";
import { bikesOutOfService, pctBikesOutOfService, pctOfStations } from "../lib/data";
import type { TimeView } from "../lib/history";
import { pctColor } from "../lib/colors";
import { formatPct } from "../lib/format";

export type BarriSortKey =
  | "barri_nom"
  | "pct_bikes"
  | "pct_mechanical"
  | "pct_ebike"
  | "pct_docks_free"
  | "pct_bikes_out_of_service"
  | "bikes_total"
  | "stations_zero_ebike"
  | "stations_zero_mechanical";

type SortState = { key: BarriSortKey; asc: boolean };

let sortState: SortState = { key: "pct_bikes", asc: true };

function barriOosPct(barri: Barri): number {
  return (
    barri.pct_bikes_out_of_service ??
    pctBikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total
    )
  );
}

function sortValue(barri: Barri, key: BarriSortKey): string | number {
  switch (key) {
    case "barri_nom":
      return barri.barri_nom.toLowerCase();
    case "pct_bikes":
      return barri.pct_bikes;
    case "pct_mechanical":
      return barri.pct_mechanical;
    case "pct_ebike":
      return barri.pct_ebike;
    case "pct_docks_free":
      return barri.pct_docks_free;
    case "pct_bikes_out_of_service":
      return barriOosPct(barri);
    case "bikes_total":
      return barri.bikes_total;
    case "stations_zero_ebike":
      return pctOfStations(barri.stations_zero_ebike, barri.stations_active);
    case "stations_zero_mechanical":
      return pctOfStations(barri.stations_zero_mechanical ?? 0, barri.stations_active);
  }
}

function sortedBarris(barris: Barri[]): Barri[] {
  const { key, asc } = sortState;
  return [...barris].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === "string" && typeof bv === "string") {
      return asc ? av.localeCompare(bv, "ca") : bv.localeCompare(av, "ca");
    }
    return asc ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });
}

function header(label: string, key: BarriSortKey): string {
  const arrow = sortState.key === key ? (sortState.asc ? " ↑" : " ↓") : "";
  return `<th class="sortable" data-sort="${key}" scope="col">${label}${arrow}</th>`;
}

/** Unified % cell: mini bar + value. `invert` when higher % is worse (fora de servei). */
function pctCell(pct: number, invert = false): string {
  const color = invert ? pctColor(100 - pct) : pctColor(pct);
  const width = Math.min(100, Math.max(0, pct));
  return `<td class="pct-cell">
    <div class="pct-cell-meter" aria-hidden="true"><span style="width:${width}%;background:${color}"></span></div>
    <span class="pct-cell-num">${formatPct(pct)}</span>
  </td>`;
}

function mutedPctCell(pct: number, sublabel: string): string {
  return `<td class="pct-cell pct-cell--muted">
    <span class="pct-cell-num">${formatPct(pct)}</span>
    <small class="pct-cell-sub">${sublabel}</small>
  </td>`;
}

export function renderBarriTable(
  container: HTMLElement,
  barris: Barri[],
  _mode: MetricMode,
  timeView: TimeView = { kind: "latest" },
  onSelect?: (barri: Barri) => void
): void {
  const isHistorical = timeView.kind === "hour";
  const sorted = sortedBarris(barris);

  container.innerHTML = `
    <div class="table-wrap">
      <table class="barri-table">
        <thead>
          <tr>
            ${header("Barri", "barri_nom")}
            ${header("% bicis", "pct_bikes")}
            ${header("% mecàniques", "pct_mechanical")}
            ${header("% elèctriques", "pct_ebike")}
            ${header("% ancoratges lliures", "pct_docks_free")}
            ${header("% fora de servei", "pct_bikes_out_of_service")}
            ${header("Bicis", "bikes_total")}
            ${header("% est. sense elèctriques", "stations_zero_ebike")}
            ${header("% est. sense mecàniques", "stations_zero_mechanical")}
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((b) => {
              const oosPct = barriOosPct(b);
              const zeroEbikePct = b.stations_active
                ? pctOfStations(b.stations_zero_ebike, b.stations_active)
                : 0;
              const zeroMechPct = b.stations_active
                ? pctOfStations(b.stations_zero_mechanical ?? 0, b.stations_active)
                : 0;
              const zeroEbikeCell = isHistorical
                ? `<td class="pct-cell pct-cell--muted"><span class="pct-cell-num">—</span></td>`
                : mutedPctCell(zeroEbikePct, `${b.stations_zero_ebike}/${b.stations_active}`);
              const zeroMechCell = isHistorical
                ? `<td class="pct-cell pct-cell--muted"><span class="pct-cell-num">—</span></td>`
                : mutedPctCell(zeroMechPct, `${b.stations_zero_mechanical ?? 0}/${b.stations_active}`);
              return `<tr data-codi="${b.barri_codi}">
                <td class="barri-name">${b.barri_nom}</td>
                ${pctCell(b.pct_bikes)}
                ${pctCell(b.pct_mechanical)}
                ${pctCell(b.pct_ebike)}
                ${pctCell(b.pct_docks_free)}
                ${pctCell(oosPct, true)}
                <td class="count-cell">${b.bikes_total}<span class="count-cap"> / ${b.capacity_total}</span></td>
                ${zeroEbikeCell}
                ${zeroMechCell}
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll<HTMLTableCellElement>("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort as BarriSortKey;
      if (sortState.key === key) {
        sortState = { key, asc: !sortState.asc };
      } else {
        sortState = { key, asc: key === "barri_nom" };
      }
      renderBarriTable(container, barris, _mode, timeView, onSelect);
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
