import {
  computeUsageMetrics,
  usageFromLiveTotals,
  usageFromSummarySeries,
  type UsageMetrics,
} from "../lib/bikeUsage";
import { bikesOutOfService, type LatestData } from "../lib/data";
import {
  dayTypeLabel,
  isHistoricalView,
  loadCityUsageSnapshots,
  type HistoryIndex,
  type Summary7d,
  type TimeView,
} from "../lib/history";
import { renderKpiChartSvg } from "./kpiChart";

export type UsageCardOptions = {
  timeView: TimeView;
  historyIndex: HistoryIndex | null;
  summary: Summary7d | null;
  liveData: LatestData | null;
};

let loadRequest = 0;

function scopeNote(timeView: TimeView): string {
  if (timeView.kind === "latest") return "Últims 7 dies · ciutat";
  return `Mitjana ${dayTypeLabel(timeView.dayType)} · 30 dies · ciutat`;
}

function liveHeadline(
  liveData: LatestData,
  snapshots: Awaited<ReturnType<typeof loadCityUsageSnapshots>>
): number {
  const t = liveData.totals;
  const oos =
    t.bikes_out_of_service ??
    bikesOutOfService(
      t.capacity,
      t.bikes_mechanical,
      t.bikes_ebike,
      t.docks_available,
      t.bikes_total
    );
  return usageFromLiveTotals(t.bikes_total, oos, snapshots);
}

function renderCharts(metrics: UsageMetrics): string {
  const hourChart =
    metrics.byHour.length > 1
      ? renderKpiChartSvg(metrics.byHour, "count")
      : `<p class="usage-empty">Sense prou dades per hora</p>`;
  const dayChart =
    metrics.byDay.length > 1
      ? renderKpiChartSvg(metrics.byDay, "count")
      : `<p class="usage-empty">Sense prou dades per dia</p>`;

  return `
    <div class="usage-charts">
      <div class="usage-chart-block">
        <h3>Per hora</h3>
        <p class="usage-chart-note">Mitjana d'ús estimat</p>
        <div class="usage-chart-body">${hourChart}</div>
      </div>
      <div class="usage-chart-block">
        <h3>Per dia</h3>
        <p class="usage-chart-note">Màxim d'ús estimat del dia</p>
        <div class="usage-chart-body">${dayChart}</div>
      </div>
    </div>
  `;
}

function renderContent(metrics: UsageMetrics, scope: string): string {
  return `
    <section class="usage-section">
      <div class="usage-head">
        <div>
          <h2>Bicicletes en ús (aprox.)</h2>
          <p class="section-note usage-note">
            Ciutat · màxim aparcades del dia − bicis a estacions. Dia en curs: referència del dia anterior.
          </p>
        </div>
        <div class="usage-headline">
          <span class="usage-headline-label">${metrics.headlineLabel}</span>
          <strong>${metrics.headline.toLocaleString("ca-ES")}</strong>
        </div>
      </div>
      <p class="usage-scope">${scope}</p>
      ${renderCharts(metrics)}
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

  container.hidden = false;
  container.innerHTML = `<section class="usage-section usage-section--loading"><p>Calculant ús estimat…</p></section>`;

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
      const snapshots = await loadCityUsageSnapshots(historyIndex, { days: 7 });
      if (requestId !== loadRequest) return;
      metrics = snapshots.length
        ? computeUsageMetrics(snapshots, {})
        : summary?.series?.length
          ? usageFromSummarySeries(summary.series)
          : null;
      if (metrics && liveData) {
        metrics.headline = liveHeadline(liveData, snapshots);
        metrics.headlineLabel = "Ara (aprox.)";
      }
    }

    if (requestId !== loadRequest) return;

    if (!metrics || (!metrics.byHour.length && !metrics.byDay.length)) {
      container.innerHTML = `<section class="usage-section usage-section--empty"><h2>Bicicletes en ús (aprox.)</h2><p class="section-note">Encara no hi ha prou històric per estimar l'ús.</p></section>`;
      return;
    }

    container.innerHTML = renderContent(metrics, scope);
  } catch {
    if (requestId !== loadRequest) return;
    container.innerHTML = `<section class="usage-section usage-section--empty"><h2>Bicicletes en ús (aprox.)</h2><p class="section-note">No s'ha pogut calcular l'ús estimat.</p></section>`;
  }
}

export function hideUsageCard(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = "";
}
