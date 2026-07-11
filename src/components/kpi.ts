import type { Barri, LatestData, Station } from "../lib/data";
import {
  bikesOutOfService,
  pctBikesOutOfService,
  pctOfStations,
  pctOosOfAnchors,
  pctOosOfBikeFleet,
  stationOosAnchorPct,
  stationOosCount,
} from "../lib/data";
import { METRIC_ABSOLUTE_COLORS } from "../lib/colors";
import type { BarriSparklineSeries, SparklineMetricKey, Summary7d } from "../lib/history";
import {
  currentMadridHour,
  filterChartPointsLast24h,
  hourlyAverage,
  labeledChartPoints,
  sparklineChartPoints,
} from "../lib/history";
import { formatCount, formatPct, formatRelativeDeltaPct } from "../lib/format";
import { asyncLoadingHtml } from "../lib/asyncLoading";
import { kpiIconHtml, metricIconHtml } from "../lib/icons";
import { bindKpiSummary, type KpiChartSpec } from "./kpiChart";

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

/** Build KPI-shaped data for a single station. */
export function latestFromStation(station: Station, lastUpdated: string): LatestData {
  const oos = stationOosCount(station);
  const pctOos = stationOosAnchorPct(station);
  const zeroMech = station.mechanical <= 0 ? 1 : 0;
  const zeroEbike = station.ebike <= 0 ? 1 : 0;
  const zeroAny = station.total <= 0 ? 1 : 0;

  return {
    last_updated: lastUpdated,
    totals: {
      capacity: station.capacity,
      bikes_total: station.total,
      bikes_mechanical: station.mechanical,
      bikes_ebike: station.ebike,
      docks_available: station.docks_available,
      stations_active: 1,
      stations_zero_ebike: zeroEbike,
      stations_zero_mechanical: zeroMech,
      stations_zero_any: zeroAny,
      pct_bikes: station.pct_bikes,
      pct_docks_free: station.pct_docks_free,
      pct_mechanical: station.capacity ? (100 * station.mechanical) / station.capacity : 0,
      pct_ebike: station.capacity ? (100 * station.ebike) / station.capacity : 0,
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

export type KpiRenderOptions = {
  sampleCount?: number;
  barriHistAverages?: Partial<Record<SparklineMetricKey, number>> | null;
  /** Sparklines o mitjana 7d encara no disponibles (càrrega diferida). */
  statsPending?: boolean;
  /** Vista d'una sola estació: amaga notes agregades d'estacions sense bicis. */
  stationScope?: boolean;
};

type MetricRow = {
  chartKey: string;
  icon: string;
  label: string;
  count: number;
  detail: string;
  notes: string[];
  hist?: string;
  color: string;
};

function metricRowHtml(row: MetricRow): string {
  const attrs = ` data-kpi-chart="${row.chartKey}"`;
  const notes = row.notes.map((n) => `<small class="kpi-summary__note">${n}</small>`).join("");
  const hist = row.hist ? `<small class="kpi-hist">${row.hist}</small>` : "";
  return `<li class="kpi-summary__metric"${attrs}>
    <span class="kpi-summary__swatch" style="background:${row.color}"></span>
    <div class="kpi-summary__metric-body">
      <p class="kpi-summary__metric-head">
        <span class="kpi-summary__metric-label">${row.icon}${row.label}</span>
        <strong class="kpi-summary__metric-value">${formatCount(row.count)}</strong>
      </p>
      <small class="kpi-summary__metric-detail">${row.detail}</small>
      ${notes}
      ${hist}
    </div>
  </li>`;
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
  const showHist = !isHistorical && !options.stationScope && (!!histAvg || !!summary);

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

  const zeroMech = t.stations_zero_mechanical ?? 0;
  const zeroEbike = t.stations_zero_ebike;

  const bikesNotes: string[] = [];
  if (t.bikes_total > 0) {
    bikesNotes.push(`${formatPct(pctMechOfBikes)} mecà. · ${formatPct(pctEbikeOfBikes)} elè.`);
  }
  if (!options.stationScope && t.stations_zero_any > 0) {
    bikesNotes.push(
      `${t.stations_zero_any} est. sense bicicletes (${formatPct(pctZeroAny)})`
    );
  }

  const mechNotes: string[] = [];
  if (!options.stationScope && zeroMech > 0) {
    mechNotes.push(`${zeroMech} est. sense mecàniques (${formatPct(pctZeroMech)})`);
  }

  const ebikeNotes: string[] = [];
  if (!options.stationScope && zeroEbike > 0) {
    ebikeNotes.push(`${zeroEbike} est. sense elèctriques (${formatPct(pctZeroEbike)})`);
  }

  const scopeTitle =
    scopeLabel === "ciutat" && !isHistorical
      ? "Barcelona"
      : scopeLabel;

  const rows: MetricRow[] = [
    {
      chartKey: "bikes",
      icon: kpiIconHtml("total"),
      label: "Bicicletes disponibles",
      count: t.bikes_total,
      detail: `${formatPct(t.pct_bikes)} de ${formatCount(t.capacity)} ancoratges`,
      notes: bikesNotes,
      hist: showHist
        ? histNoteCount(summary, hour, "bikes_total", t.bikes_total, t.capacity, histAvg)
        : undefined,
      color: METRIC_ABSOLUTE_COLORS.total,
    },
    {
      chartKey: "mechanical",
      icon: kpiIconHtml("mechanical"),
      label: "Mecàniques",
      count: t.bikes_mechanical,
      detail: `${formatPct(pctMech)} dels ancoratges`,
      notes: mechNotes,
      hist: showHist
        ? histNoteCount(summary, hour, "bikes_mechanical", t.bikes_mechanical, t.capacity, histAvg)
        : undefined,
      color: METRIC_ABSOLUTE_COLORS.mechanical,
    },
    {
      chartKey: "ebike",
      icon: kpiIconHtml("ebike"),
      label: "Elèctriques",
      count: t.bikes_ebike,
      detail: `${formatPct(pctEbike)} dels ancoratges`,
      notes: ebikeNotes,
      hist: showHist
        ? histNoteCount(summary, hour, "bikes_ebike", t.bikes_ebike, t.capacity, histAvg)
        : undefined,
      color: METRIC_ABSOLUTE_COLORS.ebike,
    },
    {
      chartKey: "oos",
      icon: metricIconHtml("out_of_service", "kpi-icon"),
      label: "Fora de servei",
      count: outOfService,
      detail: `${formatPct(pctOosFleet)} de bicicletes aparcades · ${formatPct(pctOosAnchors)} dels ancoratges`,
      notes: [],
      hist: showHist ? histNotePct(summary, hour, "pct_oos_fleet", pctOosFleet, histAvg) : undefined,
      color: METRIC_ABSOLUTE_COLORS.out_of_service,
    },
  ];

  const chartInner = statsPending
    ? asyncLoadingHtml("kpi-async-loading kpi-summary__chart-loading")
    : "";

  const hint = showSpark
    ? `<small class="kpi-chart-hint">Clica una mètrica per canviar la gràfica · clica la gràfica per ampliar</small>`
    : "";

  const chartBlock = showSpark
    ? `<div class="kpi-summary__chart-head">
        <p class="kpi-summary__chart-label">Últimes 24 h</p>
        <p class="kpi-summary__chart-subtitle"></p>
      </div>
      <button type="button" class="kpi-summary__chart-btn" disabled>
        <span class="kpi-summary__chart-inner">${chartInner}</span>
      </button>`
    : `<p class="kpi-summary__chart-empty">Dades mitjana històrica (sense tendència 24 h).</p>`;

  container.innerHTML = `
    <article class="kpi-summary-card">
      <header class="kpi-summary__head">
        <p class="kpi-summary__title">${scopeTitle}</p>
        <p class="kpi-summary__meta"><strong>${formatCount(t.capacity)}</strong> ancoratges totals · ${formatPct(t.pct_bikes)} amb bicicletes</p>
      </header>
      <div class="kpi-summary__row">
        <div class="kpi-summary__chart">${chartBlock}</div>
        <ul class="kpi-summary__metrics">${rows.map(metricRowHtml).join("")}</ul>
      </div>
      ${hint}
    </article>
  `;

  if (showSpark && !statsPending) bindKpiSummary(container, charts);
}
