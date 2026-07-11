import {
  computeUsageHourlyLatest,
  computeUsageMetrics,
  mergeLiveSnapshot,
  MIN_IN_USE_AT_PEAK,
  usageFromLive,
  usageFromSummarySeries,
  type HourlyUsagePoint,
  type UsageMetrics,
} from "../lib/bikeUsage";
import type { LatestData } from "../lib/data";
import {
  dayTypeLabel,
  isHistoricalView,
  loadCityUsageSnapshots,
  madridDayType,
  type HistoryIndex,
  type Summary7d,
  type TimeView,
} from "../lib/history";
import { formatHour } from "../lib/format";
import { renderDualKpiChartSvg, renderKpiChartSvg } from "./kpiChart";

export type UsageCardOptions = {
  timeView: TimeView;
  historyIndex: HistoryIndex | null;
  summary: Summary7d | null;
  liveData: LatestData | null;
};

let loadRequest = 0;

function scopeNote(timeView: TimeView): string {
  if (timeView.kind === "latest") return "Avui comparat amb la mitjana del mateix tipus de dia";
  return `Mitjana ${dayTypeLabel(timeView.dayType)} · 30 dies`;
}

function liveHeadline(
  liveData: LatestData,
  snapshots: Awaited<ReturnType<typeof loadCityUsageSnapshots>>
): number {
  return usageFromLive(liveData, snapshots);
}

function toChartPoints(points: HourlyUsagePoint[]) {
  return points.map((p) => ({ label: formatHour(p.hour), value: p.value }));
}

function renderHourChart(metrics: UsageMetrics, isLatest: boolean): string {
  if (isLatest && metrics.hourlyDual) {
    const { avgByHour, todayByHour, avgLegend, todayLegend } = metrics.hourlyDual;
    if (avgByHour.length < 2 && todayByHour.length < 2) {
      return `<p class="usage-empty">Sense prou dades per hora</p>`;
    }
    const chart = renderDualKpiChartSvg(todayByHour, avgByHour, "count");
    return `
      <div class="usage-chart-legend">
        <span class="usage-legend-item usage-legend-item--today"><span class="usage-legend-swatch"></span>${todayLegend}</span>
        <span class="usage-legend-item usage-legend-item--avg"><span class="usage-legend-swatch"></span>${avgLegend}</span>
      </div>
      <div class="usage-chart-body">${chart}</div>
    `;
  }

  if (metrics.byHour.length > 1) {
    return `<div class="usage-chart-body">${renderKpiChartSvg(toChartPoints(metrics.byHour), "count")}</div>`;
  }
  return `<p class="usage-empty">Sense prou dades per hora</p>`;
}

function renderContent(metrics: UsageMetrics, scope: string, isLatest: boolean): string {
  const hourNote = isLatest
    ? "Estimació horària puntual"
    : "Mitjana d'ús estimat per hora";

  return `
    <section class="usage-section">
      <div class="usage-head">
        <div>
          <h2>Estimació d'ús de bicicletes</h2>
          <p class="section-note usage-note">
            Estimació a escala de ciutat: màxim de bicicletes aparcades observat menys les presents a les estacions en cada moment.
            En el moment de màxima ocupació s'assumeixen ${MIN_IN_USE_AT_PEAK} bicis en circulació. No és un recompte real de viatges.
          </p>
        </div>
        <div class="usage-headline">
          <span class="usage-headline-label">${metrics.headlineLabel}</span>
          <strong>${metrics.headline.toLocaleString("ca-ES")}</strong>
        </div>
      </div>
      <p class="usage-scope">${scope}</p>
      <div class="usage-charts">
        <div class="usage-chart-block usage-chart-block--full">
          <h3>Per hora</h3>
          <p class="usage-chart-note">${hourNote}</p>
          ${renderHourChart(metrics, isLatest)}
        </div>
      </div>
    </section>
  `;
}

export async function renderUsageCard(
  container: HTMLElement,
  options: UsageCardOptions
): Promise<void> {
  const requestId = ++loadRequest;
  const { timeView, historyIndex, summary, liveData } = options;
  const isHistorical = isHistoricalView(timeView);
  const isLatest = timeView.kind === "latest";

  container.hidden = false;
  container.innerHTML = `<section class="usage-section usage-section--loading"><p>Calculant estimació d'ús…</p></section>`;

  try {
    let metrics: UsageMetrics | null = null;
    const scope = scopeNote(timeView);

    if (isHistorical && timeView.kind === "hour") {
      const snapshots = await loadCityUsageSnapshots(historyIndex, {
        days: 30,
        dayType: timeView.dayType,
      });
      if (requestId !== loadRequest) return;
      metrics = computeUsageMetrics(snapshots, { highlightHour: timeView.hour });
    } else {
      const fleetScope = await loadCityUsageSnapshots(historyIndex, { days: 7 });
      if (requestId !== loadRequest) return;

      const sameDayHist = await loadCityUsageSnapshots(historyIndex, {
        days: 30,
        dayType: madridDayType(),
      });
      if (requestId !== loadRequest) return;

      const scopedFleet = mergeLiveSnapshot(fleetScope, isLatest ? liveData : null);

      metrics = scopedFleet.length
        ? computeUsageMetrics(scopedFleet, {})
        : summary?.series?.length
          ? usageFromSummarySeries(summary.series)
          : null;

      if (metrics && isLatest) {
        metrics.hourlyDual = computeUsageHourlyLatest(scopedFleet, sameDayHist) ?? undefined;
      }

      if (metrics && liveData && isLatest) {
        metrics.headline = liveHeadline(liveData, fleetScope);
        metrics.headlineLabel = "Ara";
      }
    }

    if (requestId !== loadRequest) return;

    const hasHourData =
      (metrics?.byHour.length ?? 0) > 1 ||
      (metrics?.hourlyDual?.todayByHour.length ?? 0) > 0 ||
      (metrics?.hourlyDual?.avgByHour.length ?? 0) > 0;

    if (!metrics || !hasHourData) {
      container.innerHTML = `<section class="usage-section usage-section--empty"><h2>Estimació d'ús de bicicletes</h2><p class="section-note">Encara no hi ha prou històric per estimar l'ús.</p></section>`;
      return;
    }

    container.innerHTML = renderContent(metrics, scope, isLatest);
  } catch {
    if (requestId !== loadRequest) return;
    container.innerHTML = `<section class="usage-section usage-section--empty"><h2>Estimació d'ús de bicicletes</h2><p class="section-note">No s'ha pogut calcular l'estimació d'ús.</p></section>`;
  }
}

export function hideUsageCard(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = "";
}
