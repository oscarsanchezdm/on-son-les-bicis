import type { Barri, MetricMode } from "../lib/data";
import { barriMetric } from "../lib/data";
import { pctColor } from "../lib/colors";
import { formatPct } from "../lib/format";

export function renderBarriTable(
  container: HTMLElement,
  barris: Barri[],
  mode: MetricMode,
  onSelect?: (barri: Barri) => void
): void {
  const sorted = [...barris].sort((a, b) => barriMetric(a, mode) - barriMetric(b, mode));

  container.innerHTML = `
    <div class="table-wrap">
      <table class="barri-table">
        <thead>
          <tr>
            <th>Barri</th>
            <th>% bicis</th>
            <th>% ebike</th>
            <th>Bicis</th>
            <th>Ancoratges</th>
            <th>0 ebike</th>
          </tr>
        </thead>
        <tbody>
          ${sorted
            .map((b) => {
              const desert = b.pct_ebike < 10 ? "row-desert" : "";
              return `<tr class="${desert}" data-codi="${b.barri_codi}">
                <td>${b.barri_nom}</td>
                <td><span class="pct-badge" style="background:${pctColor(b.pct_bikes)}">${formatPct(b.pct_bikes)}</span></td>
                <td><span class="pct-badge" style="background:${pctColor(b.pct_ebike)}">${formatPct(b.pct_ebike)}</span></td>
                <td>${b.bikes_total} / ${b.capacity_total}</td>
                <td>${formatPct(b.pct_docks_free)}</td>
                <td>${b.stations_zero_ebike}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;

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
