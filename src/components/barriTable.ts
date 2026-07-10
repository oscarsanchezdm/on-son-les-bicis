import type { Barri, MetricMode } from "../lib/data";
import { barriMetric, bikesOutOfService, pctBikesOutOfService, pctOfStations } from "../lib/data";
import { pctColor } from "../lib/colors";
import { formatPct } from "../lib/format";

export type BarriSortKey =
  | "barri_nom"
  | "pct_bikes"
  | "pct_ebike"
  | "bikes_total"
  | "pct_docks_free"
  | "bikes_out_of_service"
  | "stations_zero_ebike"
  | "stations_zero_mechanical";

type SortState = { key: BarriSortKey; asc: boolean };

let sortState: SortState = { key: "pct_bikes", asc: true };

function barriOos(barri: Barri): number {
  return (
    barri.bikes_out_of_service ??
    bikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total
    )
  );
}

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
    case "pct_ebike":
      return barri.pct_ebike;
    case "bikes_total":
      return barri.bikes_total;
    case "pct_docks_free":
      return barri.pct_docks_free;
    case "bikes_out_of_service":
      return barriOos(barri);
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

function oosCell(barri: Barri): string {
  const count = barriOos(barri);
  const pct = barriOosPct(barri);
  const level = pct >= 20 ? "oos-high" : pct >= 10 ? "oos-mid" : "oos-low";
  return `<td class="oos-cell ${level}">
    <span class="oos-count">${count}</span>
    <span class="oos-meter" title="${formatPct(pct)}"><span style="width:${Math.min(100, pct)}%"></span></span>
    <small>${formatPct(pct)}</small>
  </td>`;
}

function zeroStationsCell(count: number, active: number): string {
  const pct = pctOfStations(count, active);
  const scarcity = Math.min(100, pct);
  return `<td class="zero-stations-cell">
    <span class="pct-badge" style="background:${pctColor(100 - scarcity)}">${formatPct(pct)}</span>
    <small>${count} de ${active}</small>
  </td>`;
}

export function renderBarriTable(
  container: HTMLElement,
  barris: Barri[],
  mode: MetricMode,
  onSelect?: (barri: Barri) => void
): void {
  const sorted = sortedBarris(barris);

  container.innerHTML = `
    <div class="table-wrap">
      <table class="barri-table">
        <thead>
          <tr>
            ${header("Barri", "barri_nom")}
            ${header("% bicis", "pct_bikes")}
            ${header("% elèctriques", "pct_ebike")}
            ${header("Bicis", "bikes_total")}
            ${header("Ancoratges lliures", "pct_docks_free")}
            ${header("Bicis fora de servei", "bikes_out_of_service")}
            ${header("% est. sense elèctriques", "stations_zero_ebike")}
            ${header("% est. sense mecàniques", "stations_zero_mechanical")}
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((b) => {
              const desert = b.pct_ebike < 10 ? "row-desert" : "";
              const oosPct = barriOosPct(b);
              const oosRow = oosPct >= 15 ? "row-oos" : "";
              return `<tr class="${desert} ${oosRow}" data-codi="${b.barri_codi}">
                <td>${b.barri_nom}</td>
                <td><span class="pct-badge" style="background:${pctColor(b.pct_bikes)}">${formatPct(b.pct_bikes)}</span></td>
                <td><span class="pct-badge" style="background:${pctColor(b.pct_ebike)}">${formatPct(b.pct_ebike)}</span></td>
                <td>${b.bikes_total} / ${b.capacity_total}</td>
                <td><span class="pct-badge" style="background:${pctColor(b.pct_docks_free, true)}">${formatPct(b.pct_docks_free)}</span></td>
                ${oosCell(b)}
                ${zeroStationsCell(b.stations_zero_ebike, b.stations_active)}
                ${zeroStationsCell(b.stations_zero_mechanical ?? 0, b.stations_active)}
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
      renderBarriTable(container, barris, mode, onSelect);
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
