import type { LatestData } from "../lib/data";
import { formatPct, formatRelativeTime } from "../lib/format";

export function renderKpis(container: HTMLElement, data: LatestData): void {
  const t = data.totals;
  const worst = t.worst_barri;
  container.innerHTML = `
    <div class="kpi-grid">
      <article class="kpi-card">
        <span class="kpi-label">Darrera actualització</span>
        <strong>${formatRelativeTime(data.last_updated)}</strong>
        <small>${new Date(data.last_updated).toLocaleString("ca-ES")}</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Bicis disponibles (ciutat)</span>
        <strong>${t.bikes_total.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(t.pct_bikes)} de ${t.capacity.toLocaleString("ca-ES")} ancoratges</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Elèctriques</span>
        <strong>${t.bikes_ebike.toLocaleString("ca-ES")}</strong>
        <small>${formatPct((100 * t.bikes_ebike) / (t.capacity || 1))} del total d'ancoratges</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Estacions sense ebike</span>
        <strong>${t.stations_zero_ebike}</strong>
        <small>de ${t.stations_active} actives</small>
      </article>
      <article class="kpi-card kpi-card--alert">
        <span class="kpi-label">Pitjor barri (bicis)</span>
        <strong>${worst?.barri_nom ?? "—"}</strong>
        <small>${worst ? formatPct(worst.pct_bikes) : ""}</small>
      </article>
    </div>
  `;
}
