import type { Barri, LatestData } from "../lib/data";
import {
  bikesOutOfService,
  pctBikesOutOfService,
  pctOfStations,
  pctOosOfBikeFleet,
} from "../lib/data";
import type { BarriSparklineSeries, Summary7d } from "../lib/history";
import { currentMadridHour, hourlyAverage, sparklineValues } from "../lib/history";
import { formatDateTime, formatPct, formatRelativeTime } from "../lib/format";
import { renderSparkline } from "../lib/sparkline";
import { kpiIconHtml, metricIconHtml } from "../lib/icons";

/** Build KPI-shaped data for a single barri filter. */
export function latestFromBarri(barri: Barri, lastUpdated: string): LatestData {
  const oos =
    barri.bikes_out_of_service ??
    bikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total
    );
  const pctOos =
    barri.pct_bikes_out_of_service ??
    pctBikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total
    );

  return {
    last_updated: lastUpdated,
    totals: {
      capacity: barri.capacity_total,
      bikes_total: barri.bikes_total,
      bikes_mechanical: barri.bikes_mechanical,
      bikes_ebike: barri.bikes_ebike,
      docks_available: barri.docks_available_total,
      stations_active: barri.stations_active,
      stations_zero_ebike: barri.stations_zero_ebike,
      stations_zero_mechanical: barri.stations_zero_mechanical,
      stations_zero_any: barri.stations_zero_any,
      pct_bikes: barri.pct_bikes,
      pct_docks_free: barri.pct_docks_free,
      pct_mechanical: barri.pct_mechanical,
      pct_ebike: barri.pct_ebike,
      bikes_out_of_service: oos,
      pct_bikes_out_of_service: pctOos,
      worst_barri: null,
    },
    stations: [],
  };
}

function histNote(
  summary: Summary7d | null,
  hour: number,
  key: "pct_bikes" | "pct_mechanical" | "pct_ebike",
  currentPct: number
): string {
  const avg = hourlyAverage(summary, hour, key);
  if (avg === null) return "";
  const delta = currentPct - avg;
  const sign = delta >= 0 ? "+" : "";
  return `Mitjana 7 dies (${String(hour).padStart(2, "0")}:00): ${formatPct(avg)} (${sign}${delta.toFixed(1)} pp)`;
}

export function renderKpis(
  container: HTMLElement,
  data: LatestData,
  summary: Summary7d | null,
  scopeLabel = "ciutat",
  isHistorical = false,
  barriSparklines: BarriSparklineSeries | null = null
): void {
  const t = data.totals;
  const hour = currentMadridHour();
  const pctMechOfBikes = t.bikes_total ? (100 * t.bikes_mechanical) / t.bikes_total : 0;
  const pctEbikeOfBikes = t.bikes_total ? (100 * t.bikes_ebike) / t.bikes_total : 0;
  const pctMech =
    t.pct_mechanical ?? (t.capacity ? (100 * t.bikes_mechanical) / t.capacity : 0);
  const pctEbike = t.pct_ebike ?? (t.capacity ? (100 * t.bikes_ebike) / t.capacity : 0);
  const outOfService =
    t.bikes_out_of_service ??
    bikesOutOfService(t.capacity, t.bikes_mechanical, t.bikes_ebike, t.docks_available);
  const pctOutOfService = pctOosOfBikeFleet(t.bikes_total, outOfService);
  const pctZeroEbike = pctOfStations(t.stations_zero_ebike, t.stations_active);
  const pctZeroMech = pctOfStations(t.stations_zero_mechanical ?? 0, t.stations_active);
  const pctZeroAny = pctOfStations(t.stations_zero_any, t.stations_active);

  const showSpark = !isHistorical;
  const sparkBikes = showSpark
    ? renderSparkline(
        barriSparklines?.pct_bikes ?? sparklineValues(summary?.series ?? [], "pct_bikes")
      )
    : "";
  const sparkMech = showSpark
    ? renderSparkline(
        barriSparklines?.pct_mechanical ??
          sparklineValues(summary?.series ?? [], "pct_mechanical")
      )
    : "";
  const sparkEbike = showSpark
    ? renderSparkline(
        barriSparklines?.pct_ebike ?? sparklineValues(summary?.series ?? [], "pct_ebike")
      )
    : "";
  const sparkOos = showSpark
    ? renderSparkline(
        barriSparklines?.pct_oos_fleet ??
          sparklineValues(summary?.series ?? [], "pct_oos_fleet")
      )
    : "";
  const showCityHist = !isHistorical && scopeLabel === "ciutat";
  const histBikes = showCityHist ? histNote(summary, hour, "pct_bikes", t.pct_bikes) : "";
  const histMech = showCityHist ? histNote(summary, hour, "pct_mechanical", pctMech) : "";
  const histEbike = showCityHist ? histNote(summary, hour, "pct_ebike", pctEbike) : "";

  const zeroMech = t.stations_zero_mechanical ?? 0;
  const zeroEbike = t.stations_zero_ebike;
  const zeroMechNote =
    zeroMech > 0
      ? `<small class="kpi-station-gap kpi-station-gap--warn">${zeroMech} est. sense mecàniques (${formatPct(pctZeroMech)})</small>`
      : "";
  const zeroEbikeNote =
    zeroEbike > 0
      ? `<small class="kpi-station-gap kpi-station-gap--warn">${zeroEbike} est. sense elèctriques (${formatPct(pctZeroEbike)})</small>`
      : "";
  const zeroAnyNote =
    t.stations_zero_any > 0
      ? `<small class="kpi-station-gap kpi-station-gap--warn">${t.stations_zero_any} est. sense cap bici (${formatPct(pctZeroAny)})</small>`
      : "";

  container.innerHTML = `
    <div class="kpi-panel">
      <p class="kpi-update" title="${formatDateTime(data.last_updated)}">
        <span class="kpi-label">Darrera actualització</span>
        <strong>${formatRelativeTime(data.last_updated)}</strong>
        <span class="kpi-update-date">${formatDateTime(data.last_updated)}</span>
      </p>
      <div class="kpi-grid">
      <article class="kpi-card">
        <span class="kpi-label">${kpiIconHtml("total")} Bicis disponibles (${scopeLabel})</span>
        <strong>${t.bikes_total.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(t.pct_bikes)} de ${t.capacity.toLocaleString("ca-ES")} ancoratges</small>
        ${zeroAnyNote}
        ${sparkBikes}
        ${histBikes ? `<small class="kpi-hist">${histBikes}</small>` : ""}
      </article>
      <article class="kpi-card">
        <span class="kpi-label">${kpiIconHtml("mechanical")} Mecàniques</span>
        <strong>${t.bikes_mechanical.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctMechOfBikes)} de les bicis disponibles</small>
        ${zeroMechNote}
        ${sparkMech}
        ${histMech ? `<small class="kpi-hist">${histMech}</small>` : ""}
      </article>
      <article class="kpi-card">
        <span class="kpi-label">${kpiIconHtml("ebike")} Elèctriques</span>
        <strong>${t.bikes_ebike.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctEbikeOfBikes)} de les bicis disponibles</small>
        ${zeroEbikeNote}
        ${sparkEbike}
        ${histEbike ? `<small class="kpi-hist">${histEbike}</small>` : ""}
      </article>
      <article class="kpi-card">
        <span class="kpi-label">${metricIconHtml("out_of_service", "kpi-icon")} Bicicletes fora de servei</span>
        <strong>${outOfService.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctOutOfService)} del parc de bicis (disponibles + FS)</small>
        ${sparkOos}
      </article>
      </div>
    </div>
  `;
}
