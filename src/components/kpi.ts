import type { LatestData } from "../lib/data";
import { bikesOutOfService, pctBikesOutOfService, pctOfStations } from "../lib/data";
import type { Summary7d } from "../lib/history";
import { hourlyAverage, sparklineValues } from "../lib/history";
import { formatDateTime, formatPct, formatRelativeTime } from "../lib/format";
import { renderSparkline } from "../lib/sparkline";

function histNote(
  summary: Summary7d | null,
  hour: number,
  key: "pct_bikes" | "pct_mechanical" | "pct_ebike",
  currentPct: number
): string {
  const avg = hourlyAverage(summary, hour, key);
  if (avg === null) return "Sense històric per aquesta hora";
  const delta = currentPct - avg;
  const sign = delta >= 0 ? "+" : "";
  return `Mitjana 7 dies (${String(hour).padStart(2, "0")}:00): ${formatPct(avg)} (${sign}${delta.toFixed(1)} pp)`;
}

export function renderKpis(
  container: HTMLElement,
  data: LatestData,
  summary: Summary7d | null
): void {
  const t = data.totals;
  const worst = t.worst_barri;
  const hour = new Date(data.last_updated).getHours();
  const pctMech =
    t.pct_mechanical ?? (t.capacity ? (100 * t.bikes_mechanical) / t.capacity : 0);
  const pctEbike = t.pct_ebike ?? (t.capacity ? (100 * t.bikes_ebike) / t.capacity : 0);
  const outOfService =
    t.bikes_out_of_service ??
    bikesOutOfService(t.capacity, t.bikes_mechanical, t.bikes_ebike, t.docks_available);
  const pctOutOfService =
    t.pct_bikes_out_of_service ??
    pctBikesOutOfService(t.capacity, t.bikes_mechanical, t.bikes_ebike, t.docks_available);
  const pctMechOfFleet = t.bikes_total ? (100 * t.bikes_mechanical) / t.bikes_total : 0;
  const pctZeroEbike = pctOfStations(t.stations_zero_ebike, t.stations_active);
  const pctZeroMech = pctOfStations(t.stations_zero_mechanical ?? 0, t.stations_active);

  const sparkBikes = renderSparkline(sparklineValues(summary?.series ?? [], "pct_bikes"));
  const sparkMech = renderSparkline(sparklineValues(summary?.series ?? [], "pct_mechanical"));
  const sparkEbike = renderSparkline(sparklineValues(summary?.series ?? [], "pct_ebike"));

  container.innerHTML = `
    <div class="kpi-grid">
      <article class="kpi-card">
        <span class="kpi-label">Darrera actualització</span>
        <strong>${formatRelativeTime(data.last_updated)}</strong>
        <small>${formatDateTime(data.last_updated)}</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Bicis disponibles (ciutat)</span>
        <strong>${t.bikes_total.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(t.pct_bikes)} de ${t.capacity.toLocaleString("ca-ES")} ancoratges</small>
        ${sparkBikes}
        <small class="kpi-hist">${histNote(summary, hour, "pct_bikes", t.pct_bikes)}</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Mecàniques</span>
        <strong>${formatPct(pctMech)}</strong>
        <small>${t.bikes_mechanical.toLocaleString("ca-ES")} bicis · ${formatPct(pctMechOfFleet)} del parc disponible</small>
        ${sparkMech}
        <small class="kpi-hist">${histNote(summary, hour, "pct_mechanical", pctMech)}</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Elèctriques</span>
        <strong>${t.bikes_ebike.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctEbike)} del total d'ancoratges</small>
        ${sparkEbike}
        <small class="kpi-hist">${histNote(summary, hour, "pct_ebike", pctEbike)}</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Estacions sense elèctriques</span>
        <strong>${formatPct(pctZeroEbike)}</strong>
        <small>${t.stations_zero_ebike} de ${t.stations_active} estacions</small>
      </article>
      <article class="kpi-card">
        <span class="kpi-label">Estacions sense mecàniques</span>
        <strong>${formatPct(pctZeroMech)}</strong>
        <small>${t.stations_zero_mechanical ?? 0} de ${t.stations_active} estacions</small>
      </article>
      <article class="kpi-card kpi-card--alert">
        <span class="kpi-label">Bicicletes fora de servei</span>
        <strong>${outOfService.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctOutOfService)} de ${t.capacity.toLocaleString("ca-ES")} ancoratges</small>
        <div class="kpi-meter" aria-hidden="true">
          <span style="width:${Math.min(100, pctOutOfService)}%"></span>
        </div>
      </article>
      <article class="kpi-card kpi-card--alert">
        <span class="kpi-label">Pitjor barri (bicis)</span>
        <strong>${worst?.barri_nom ?? "—"}</strong>
        <small>${worst ? formatPct(worst.pct_bikes) : ""}</small>
      </article>
    </div>
  `;
}
