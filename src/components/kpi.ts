import type { Barri, LatestData, Station } from "../lib/data";
import {
  bikesOutOfService,
  pctBikesOutOfService,
  pctOfStations,
  pctOosOfAnchors,
  pctOosOfBikeFleet,
  stationOosCount,
} from "../lib/data";
import type { BarriSparklineSeries, SparklineMetricKey, Summary7d } from "../lib/history";
import {
  currentMadridHour,
  filterChartPointsLast24h,
  hourlyAverage,
  labeledChartPoints,
  sparklineChartPoints,
  sparklineValuesLast24h,
} from "../lib/history";
import { formatCount, formatPct, formatRelativeDeltaPct } from "../lib/format";
import { asyncLoadingHtml } from "../lib/asyncLoading";
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

/** Build KPI-shaped data for a single station filter. */
export function latestFromStation(station: Station, lastUpdated: string): LatestData {
  const oos = stationOosCount(station);
  const pctOos = station.capacity > 0 ? (100 * oos) / station.capacity : 0;
  const pctMech = station.capacity > 0 ? (100 * station.mechanical) / station.capacity : 0;
  const pctEbike = station.capacity > 0 ? (100 * station.ebike) / station.capacity : 0;

  return {
    last_updated: lastUpdated,
    totals: {
      capacity: station.capacity,
      bikes_total: station.total,
      bikes_mechanical: station.mechanical,
      bikes_ebike: station.ebike,
      docks_available: station.docks_available,
      stations_active: station.status === "IN_SERVICE" || station.status === "ACTIVE" ? 1 : 0,
      stations_zero_ebike: station.ebike === 0 ? 1 : 0,
      stations_zero_mechanical: station.mechanical === 0 ? 1 : 0,
      stations_zero_any: station.total === 0 ? 1 : 0,
      pct_bikes: station.pct_bikes,
      pct_docks_free: station.pct_docks_free,
      pct_mechanical: pctMech,
      pct_ebike: pctEbike,
      bikes_out_of_service: oos,
      pct_bikes_out_of_service: pctOos,
      worst_barri: null,
    },
    stations: [],
  };
}

function histNoteCount(
  summary: Summary7d | null,
  hour: number,
  key: Extract<SparklineMetricKey, "bikes_total" | "bikes_mechanical" | "bikes_ebike">,
  current: number,
  capacity: number,
  histAvg?: Partial<Record<SparklineMetricKey, number>> | null
): string {
  const avg = histAvg?.[key] ?? hourlyAverage(summary, hour, key, capacity);
  if (avg === null || avg === undefined) return "";
  const avgShown = Math.round(avg);
  const currentShown = Math.round(current);
  const delta = formatRelativeDeltaPct(currentShown, avgShown);
  return `Mitjana 7 dies (${String(hour).padStart(2, "0")}:00): ${formatCount(avgShown)} (${delta})`;
}

function histNotePct(
  summary: Summary7d | null,
  hour: number,
  key: Extract<SparklineMetricKey, "pct_oos_fleet">,
  currentPct: number,
  histAvg?: Partial<Record<SparklineMetricKey, number>> | null
): string {
  const avg = histAvg?.[key] ?? hourlyAverage(summary, hour, key);
  if (avg === null || avg === undefined) return "";
  const avgShown = Math.round(avg * 10) / 10;
  const currentShown = Math.round(currentPct * 10) / 10;
  const delta = formatRelativeDeltaPct(currentShown, avgShown);
  return `Mitjana 7 dies (${String(hour).padStart(2, "0")}:00): ${formatPct(avgShown)} (${delta})`;
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

export type KpiRenderOptions = {
  sampleCount?: number;
  barriHistAverages?: Partial<Record<SparklineMetricKey, number>> | null;
  /** Sparklines o mitjana 7d encara no disponibles (càrrega diferida). */
  statsPending?: boolean;
};

function sparklineSlot(values: number[], pending: boolean): string {
  if (values.length) return renderSparkline(values);
  if (pending) return asyncLoadingHtml("kpi-async-loading");
  return "";
}

export function renderKpis(
  container: HTMLElement,
  data: LatestData,
  summary: Summary7d | null,
  scopeLabel = "ciutat",
  isHistorical = false,
  sparklines: BarriSparklineSeries | null = null,
  options: KpiRenderOptions = {}
): void {
  const t = data.totals;
  const hour = currentMadridHour();
  const pctMechOfBikes = t.bikes_total ? (100 * t.bikes_mechanical) / t.bikes_total : 0;
  const pctEbikeOfBikes = t.bikes_total ? (100 * t.bikes_ebike) / t.bikes_total : 0;
  const pctMech = t.capacity ? (100 * t.bikes_mechanical) / t.capacity : 0;
  const pctEbike = t.capacity ? (100 * t.bikes_ebike) / t.capacity : 0;
  const outOfService =
    t.bikes_out_of_service ??
    bikesOutOfService(t.capacity, t.bikes_mechanical, t.bikes_ebike, t.docks_available, t.bikes_total);
  const pctOosFleet = pctOosOfBikeFleet(t.bikes_total, outOfService);
  const pctOosAnchors =
    t.pct_bikes_out_of_service ?? pctOosOfAnchors(t.capacity, outOfService);
  const pctZeroEbike = pctOfStations(t.stations_zero_ebike, t.stations_active);
  const pctZeroMech = pctOfStations(t.stations_zero_mechanical ?? 0, t.stations_active);
  const pctZeroAny = pctOfStations(t.stations_zero_any, t.stations_active);

  const showSpark = !isHistorical;
  const histAvg = options.barriHistAverages ?? null;
  const statsPending = showSpark && (options.statsPending ?? false);

  const bikesValues = showSpark
    ? sparklines?.bikes_total ??
      sparklineValuesLast24h(summary?.series ?? [], "bikes_total")
    : [];
  const mechValues = showSpark
    ? sparklines?.bikes_mechanical ??
      sparklineValuesLast24h(summary?.series ?? [], "bikes_mechanical")
    : [];
  const ebikeValues = showSpark
    ? sparklines?.bikes_ebike ??
      sparklineValuesLast24h(summary?.series ?? [], "bikes_ebike")
    : [];
  const oosValues = showSpark
    ? sparklines?.pct_oos_fleet ??
      sparklineValuesLast24h(summary?.series ?? [], "pct_oos_fleet")
    : [];

  const bikesPoints = showSpark ? chartPoints("bikes_total", sparklines, summary) : [];
  const mechPoints = showSpark ? chartPoints("bikes_mechanical", sparklines, summary) : [];
  const ebikePoints = showSpark ? chartPoints("bikes_ebike", sparklines, summary) : [];
  const oosPoints = showSpark ? chartPoints("pct_oos_fleet", sparklines, summary) : [];

  const chartSubtitle = `Últimes 24 h · ${scopeLabel}`;
  const charts: Record<string, KpiChartSpec | undefined> = showSpark
    ? {
        bikes: bikesPoints.length
          ? {
              title: "Bicicletes disponibles",
              subtitle: chartSubtitle,
              points: bikesPoints,
              valueFormat: "count",
            }
          : undefined,
        mechanical: mechPoints.length
          ? {
              title: "Mecàniques",
              subtitle: chartSubtitle,
              points: mechPoints,
              valueFormat: "count",
            }
          : undefined,
        ebike: ebikePoints.length
          ? {
              title: "Elèctriques",
              subtitle: chartSubtitle,
              points: ebikePoints,
              valueFormat: "count",
            }
          : undefined,
        oos: oosPoints.length
          ? {
              title: "Fora de servei (% bicicletes aparcades)",
              subtitle: chartSubtitle,
              points: oosPoints,
              valueFormat: "pct",
            }
          : undefined,
      }
    : {};

  const showHist = !isHistorical && (!!histAvg || !!summary);
  const histBikes = showHist
    ? histNoteCount(summary, hour, "bikes_total", t.bikes_total, t.capacity, histAvg)
    : "";
  const histMech = showHist
    ? histNoteCount(summary, hour, "bikes_mechanical", t.bikes_mechanical, t.capacity, histAvg)
    : "";
  const histEbike = showHist
    ? histNoteCount(summary, hour, "bikes_ebike", t.bikes_ebike, t.capacity, histAvg)
    : "";
  const histOos = showHist
    ? histNotePct(summary, hour, "pct_oos_fleet", pctOosFleet, histAvg)
    : "";

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
    ? `<small class="kpi-chart-hint">Prem per veure el detall</small>`
    : "";

  const bikesLabelScope =
    !isHistorical && scopeLabel !== "ciutat" ? ` (${scopeLabel})` : "";
  const fleetMixNote =
    t.bikes_total > 0
      ? `<small class="kpi-fleet-mix">${formatPct(pctMechOfBikes)} mecà. · ${formatPct(pctEbikeOfBikes)} elè.</small>`
      : "";

  container.innerHTML = `
    <div class="kpi-panel">
      <div class="kpi-grid">
      ${kpiCard(
        "bikes",
        bikesPoints.length > 1,
        `
        <span class="kpi-label">${kpiIconHtml("total")} Bicicletes disponibles${bikesLabelScope}</span>
        <strong>${t.bikes_total.toLocaleString("ca-ES")}</strong>
        <small>${formatPct(t.pct_bikes)} de ${t.capacity.toLocaleString("ca-ES")} ancoratges</small>
        ${fleetMixNote}
        ${zeroAnyNote}
        ${sparklineSlot(bikesValues, statsPending)}
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
        <small>${formatPct(pctMech)} dels ancoratges</small>
        ${zeroMechNote}
        ${sparklineSlot(mechValues, statsPending)}
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
        <small>${formatPct(pctEbike)} dels ancoratges</small>
        ${zeroEbikeNote}
        ${sparklineSlot(ebikeValues, statsPending)}
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
        <small>${formatPct(pctOosFleet)} de bicicletes aparcades · ${formatPct(pctOosAnchors)} dels ancoratges</small>
        ${sparklineSlot(oosValues, statsPending)}
        ${oosPoints.length > 1 ? sparkHint : ""}
        ${histOos ? `<small class="kpi-hist">${histOos}</small>` : ""}
      `
      )}
      </div>
    </div>
  `;

  if (showSpark) bindKpiCharts(container, charts);
}
