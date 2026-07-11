import type { Barri, LatestData } from "../lib/data";
import {
  bikesOutOfService,
  pctBikesOutOfService,
  pctOfStations,
  pctOosOfAnchors,
  pctOosOfAvailableBikes,
} from "../lib/data";
import type { BarriSparklineSeries, SparklineMetricKey, Summary7d } from "../lib/history";
import {
  currentMadridHour,
  filterChartPointsLast24h,
  hourlyAverage,
  labeledChartPoints,
  sparklineChartPoints,
  sparklineValues,
} from "../lib/history";
import { formatDateTime, formatPct, formatRelativeTime } from "../lib/format";
import { renderSparkline } from "../lib/sparkline";
import { kpiIconHtml, metricIconHtml } from "../lib/icons";
import { bindKpiCharts, type KpiChartSpec } from "./kpiChart";

/** Build KPI-shaped data for a single barri filter. */
export function latestFromBarri(barri: Barri, lastUpdated: string): LatestData {
  const oos =
    barri.bikes_out_of_service ??
    bikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total,
      barri.bikes_total
    );
  const pctOos =
    barri.pct_bikes_out_of_service ??
    pctBikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total,
      barri.bikes_total
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

function chartPoints(
  metric: SparklineMetricKey,
  sparklines: BarriSparklineSeries | null,
  summary: Summary7d | null
) {
  let points: ReturnType<typeof sparklineChartPoints> = [];
  if (sparklines?.labels.length) {
    points = labeledChartPoints(sparklines.labels, sparklines[metric], sparklines.keys);
  } else if (summary?.series.length) {
    points = sparklineChartPoints(summary.series, metric);
  }
  return filterChartPointsLast24h(points);
}

function kpiCard(
  chartKey: string,
  chartable: boolean,
  inner: string
): string {
  const attrs = chartable ? ` data-kpi-chart="${chartKey}"` : "";
  return `<article class="kpi-card${chartable ? " kpi-card--chartable" : ""}"${attrs}>${inner}</article>`;
}

export function renderKpis(
  container: HTMLElement,
  data: LatestData,
  summary: Summary7d | null,
  scopeLabel = "ciutat",
  isHistorical = false,
  sparklines: BarriSparklineSeries | null = null
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
    bikesOutOfService(t.capacity, t.bikes_mechanical, t.bikes_ebike, t.docks_available, t.bikes_total);
  const pctOosAnchors =
    t.pct_bikes_out_of_service ?? pctOosOfAnchors(t.capacity, outOfService);
  const pctOosAvailable = pctOosOfAvailableBikes(t.bikes_total, outOfService);
  const pctZeroEbike = pctOfStations(t.stations_zero_ebike, t.stations_active);
  const pctZeroMech = pctOfStations(t.stations_zero_mechanical ?? 0, t.stations_active);
  const pctZeroAny = pctOfStations(t.stations_zero_any, t.stations_active);

  const showSpark = !isHistorical;
  const bikesValues = showSpark
    ? sparklines?.pct_bikes ?? sparklineValues(summary?.series ?? [], "pct_bikes")
    : [];
  const mechValues = showSpark
    ? sparklines?.pct_mechanical ?? sparklineValues(summary?.series ?? [], "pct_mechanical")
    : [];
  const ebikeValues = showSpark
    ? sparklines?.pct_ebike ?? sparklineValues(summary?.series ?? [], "pct_ebike")
    : [];
  const oosValues = showSpark
    ? sparklines?.pct_oos_anchors ?? sparklineValues(summary?.series ?? [], "pct_oos_anchors")
    : [];

  const bikesPoints = showSpark ? chartPoints("pct_bikes", sparklines, summary) : [];
  const mechPoints = showSpark ? chartPoints("pct_mechanical", sparklines, summary) : [];
  const ebikePoints = showSpark ? chartPoints("pct_ebike", sparklines, summary) : [];
  const oosPoints = showSpark ? chartPoints("pct_oos_anchors", sparklines, summary) : [];

  const chartSubtitle = `Últimes 24 h · ${scopeLabel}`;
  const charts: Record<string, KpiChartSpec | undefined> = showSpark
    ? {
        bikes: bikesPoints.length
          ? { title: "Bicicletes disponibles (% ancoratges)", subtitle: chartSubtitle, points: bikesPoints }
          : undefined,
        mechanical: mechPoints.length
          ? { title: "Mecàniques (% ancoratges)", subtitle: chartSubtitle, points: mechPoints }
          : undefined,
        ebike: ebikePoints.length
          ? { title: "Elèctriques (% ancoratges)", subtitle: chartSubtitle, points: ebikePoints }
          : undefined,
        oos: oosPoints.length
          ? { title: "Fora de servei (% ancoratges)", subtitle: chartSubtitle, points: oosPoints }
          : undefined,
      }
    : {};

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
      ? `<small class="kpi-station-gap kpi-station-gap--warn">${t.stations_zero_any} est. sense bicicletes (${formatPct(pctZeroAny)})</small>`
      : "";

  const sparkHint = showSpark
    ? `<small class="kpi-chart-hint">Clica per veure el detall</small>`
    : "";

  container.innerHTML = `
    <div class="kpi-panel">
      <p class="kpi-update" title="${formatDateTime(data.last_updated)}">
        <span class="kpi-label">Darrera actualització</span>
        <strong>${formatRelativeTime(data.last_updated)}</strong>
        <span class="kpi-update-date">${formatDateTime(data.last_updated)}</span>
      </p>
      <div class="kpi-grid">
      ${kpiCard(
        "bikes",
        bikesPoints.length > 1,
        `
        <span class="kpi-label">${kpiIconHtml("total")} Bicicletes disponibles (${scopeLabel})</span>
        <strong>${t.bikes_total.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(t.pct_bikes)} de ${t.capacity.toLocaleString("ca-ES")} ancoratges</small>
        ${zeroAnyNote}
        ${bikesValues.length ? renderSparkline(bikesValues) : ""}
        ${bikesPoints.length > 1 ? sparkHint : ""}
        ${histBikes ? `<small class="kpi-hist">${histBikes}</small>` : ""}
      `
      )}
      ${kpiCard(
        "mechanical",
        mechPoints.length > 1,
        `
        <span class="kpi-label">${kpiIconHtml("mechanical")} Mecàniques</span>
        <strong>${t.bikes_mechanical.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctMechOfBikes)} de les bicicletes disponibles</small>
        ${zeroMechNote}
        ${mechValues.length ? renderSparkline(mechValues) : ""}
        ${mechPoints.length > 1 ? sparkHint : ""}
        ${histMech ? `<small class="kpi-hist">${histMech}</small>` : ""}
      `
      )}
      ${kpiCard(
        "ebike",
        ebikePoints.length > 1,
        `
        <span class="kpi-label">${kpiIconHtml("ebike")} Elèctriques</span>
        <strong>${t.bikes_ebike.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctEbikeOfBikes)} de les bicicletes disponibles</small>
        ${zeroEbikeNote}
        ${ebikeValues.length ? renderSparkline(ebikeValues) : ""}
        ${ebikePoints.length > 1 ? sparkHint : ""}
        ${histEbike ? `<small class="kpi-hist">${histEbike}</small>` : ""}
      `
      )}
      ${kpiCard(
        "oos",
        oosPoints.length > 1,
        `
        <span class="kpi-label">${metricIconHtml("out_of_service", "kpi-icon")} Bicicletes fora de servei</span>
        <strong>${outOfService.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(pctOosAnchors)} dels ancoratges · ${formatPct(pctOosAvailable)} de les bicis disponibles</small>
        ${oosValues.length ? renderSparkline(oosValues) : ""}
        ${oosPoints.length > 1 ? sparkHint : ""}
      `
      )}
      </div>
    </div>
  `;

  if (showSpark) bindKpiCharts(container, charts);
}
