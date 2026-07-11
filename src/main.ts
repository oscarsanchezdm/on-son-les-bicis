import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { latestFromBarri, renderKpis } from "./components/kpi";
import { createMap } from "./components/map";
import { renderStationTable } from "./components/stationTable";
import { renderTimeSelector, setTimelineStatus, timeViewLabel, updateTimeSelector } from "./components/timeline";
import type { Barri, MetricMode, Station } from "./lib/data";
import {
  enrichBarrisWithFleetOos,
  cityOosFromStations,
  loadBarris,
  loadBarrisGeo,
  loadLatest,
  loadMeta,
} from "./lib/data";
import {
  barrisToLatestData,
  barriHistAveragesAtHour,
  currentMadridHour,
  dailyTrendValues,
  hourViewScopeLabel,
  isHistoricalView,
  loadBarriSparklineSeries,
  loadCitySparklineSeries,
  loadHistoryIndex,
  loadHourlyViewData,
  loadStationIds,
  loadStationSparklinePct,
  loadSummary7d,
  sampleCountForView,
  type HistoryIndex,
  type SparklineMetricKey,
  type TimeView,
} from "./lib/history";
import { heatLegendGradient, pctLegendLabels, type HeatScaleMode } from "./lib/colors";
import { formatRelativeTime } from "./lib/format";
import { metricIconHtml } from "./lib/icons";
import { setStationDonutSparklineLoader } from "./lib/stationDonut";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="site-header site-header--sticky">
    <div class="site-header__inner">
      <div class="site-header__row">
        <div class="site-header__brand">
          <p class="eyebrow">Dades obertes · Bicing Barcelona</p>
          <h1>On són les bicis?</h1>
        </div>
        <div id="barri-filter-bar" class="barri-filter-bar hidden" hidden>
          <span id="barri-filter-label"></span>
          <button type="button" id="barri-filter-reset">Tornar a la ciutat</button>
        </div>
      </div>
      <div class="mode-toggle" role="group" aria-label="Mètrica del mapa">
        <button type="button" data-mode="total" class="active">${metricIconHtml("total")} Totals</button>
        <button type="button" data-mode="mechanical">${metricIconHtml("mechanical")} Mecàniques</button>
        <button type="button" data-mode="ebike">${metricIconHtml("ebike")} Elèctriques</button>
        <button type="button" data-mode="docks">${metricIconHtml("docks")} Ancoratges</button>
        <button type="button" data-mode="out_of_service">${metricIconHtml("out_of_service")} Fora de servei</button>
      </div>
    </div>
  </header>
  <main>
    <section id="timeline"></section>
    <section id="kpis"></section>
    <section class="map-section">
      <div id="map"></div>
      <aside class="legend">
        <h2>Llegenda</h2>
        <div class="heat-scale-toggle" role="group" aria-label="Tipus d'escala">
          <button type="button" data-heat-scale="percent" class="active">Percentatge</button>
          <button type="button" data-heat-scale="absolute">Quantitat</button>
        </div>
        <div class="legend-bar" id="legend-bar"></div>
        <p class="legend-scale-labels legend-scale-labels--quad" id="legend-labels">
          <span>Escassetat</span><span>Normal</span><span>Abundant</span><span>Saturat</span>
        </p>
        <p class="legend-note" id="legend-note">Escala compartida entre mapa, barris, estacions i taula.</p>
      </aside>
    </section>
    <section class="barri-section">
      <h2 id="table-title">Barris</h2>
      <p class="section-note" id="table-note">Ordeneu per columna o seleccioneu un barri per filtrar.</p>
      <div id="barri-table"></div>
    </section>
  </main>
  <footer class="site-footer">
    <p id="footer-meta">Font: <a href="https://opendata-ajuntament.barcelona.cat/" target="_blank" rel="noopener">Open Data BCN</a> · Bicing (B:SM)</p>
  </footer>
`;

let mode: MetricMode = "total";
let heatScale: HeatScaleMode = "percent";
let timeView: TimeView = { kind: "latest" };
let selectedBarri: Barri | null = null;
let latestData: Awaited<ReturnType<typeof loadLatest>> | null = null;
let barrisData: Awaited<ReturnType<typeof loadBarris>> | null = null;
let summaryData: Awaited<ReturnType<typeof loadSummary7d>> | null = null;
let historyIndex: HistoryIndex | null = null;
let stationIdOrder: string[] | null = null;
let mapView: ReturnType<typeof createMap> | null = null;
let displayBarris: Barri[] = [];
let displayStations: Station[] | null = null;

function metricLabel(): string {
  switch (mode) {
    case "docks":
      return "ancoratges";
    case "ebike":
      return "elèctriques";
    case "mechanical":
      return "mecàniques";
    case "out_of_service":
      return "fora de servei";
    default:
      return "bicicletes";
  }
}

function legendText(): string {
  const scope = selectedBarri
    ? ` Àmbit: ${selectedBarri.barri_nom}.`
    : isHistoricalView(timeView)
      ? ` Dades mitjana històrica (${timeViewLabel(timeView, historyIndex)}).`
      : "";

  if (heatScale === "absolute") {
    const base =
      mode === "out_of_service"
        ? "Nombre de bicicletes fora de servei."
        : mode === "docks"
          ? "Nombre d'ancoratges lliures."
          : `Nombre de bicicletes ${metricLabel()}.`;
    return `${base} Les estacions amb zero no es mostren.${scope}`;
  }

  if (mode === "out_of_service") {
    return `Percentatge de bicicletes fora de servei sobre el total d'ancoratges. Mapa, barris, estacions i taula.${scope}`;
  }
  if (mode === "docks") {
    return `Percentatge d'ancoratges lliures sobre el total d'ancoratges.${scope}`;
  }
  return `Percentatge de bicicletes ${metricLabel()} sobre el total d'ancoratges.${scope}`;
}

function updateLegend(): void {
  const bar = document.getElementById("legend-bar");
  const labels = document.getElementById("legend-labels");

  if (bar) bar.style.background = heatLegendGradient(mode, heatScale);
  if (labels) {
    const legendLabels = pctLegendLabels(mode, heatScale);
    if (heatScale === "absolute") {
      labels.className = "legend-scale-labels";
      labels.innerHTML = legendLabels.map((l) => `<span>${l}</span>`).join("");
    } else {
      labels.className = "legend-scale-labels legend-scale-labels--quad";
      labels.innerHTML = legendLabels.map((l) => `<span>${l}</span>`).join("");
    }
  }
  document.querySelectorAll<HTMLButtonElement>(".heat-scale-toggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.heatScale === heatScale);
  });
}

function tableNote(): string {
  if (selectedBarri) {
    return `Estacions de ${selectedBarri.barri_nom}. Clica una fila per centrar-la al mapa.`;
  }
  if (isHistoricalView(timeView)) {
    return `Mitjana per barri · ${timeViewLabel(timeView, historyIndex)}${heatScale === "absolute" ? " · valors en nombre" : ""}.`;
  }
  return heatScale === "absolute"
    ? "Ordeneu per columna o seleccioneu un barri. Valors en nombre de bicis/ancoratges."
    : "Ordeneu per columna o seleccioneu un barri per filtrar.";
}

function mapStations(): Station[] | null {
  if (!displayStations) return null;
  if (!selectedBarri) return displayStations;
  return displayStations.filter((s) => s.barri_codi === selectedBarri!.barri_codi);
}

function barriStations(): Station[] {
  if (!displayStations || !selectedBarri) return [];
  return displayStations.filter((s) => s.barri_codi === selectedBarri!.barri_codi);
}

function kpiScopeLabel(): string {
  if (selectedBarri) return selectedBarri.barri_nom;
  if (isHistoricalView(timeView)) {
    return timeViewLabel(timeView, historyIndex);
  }
  return "ciutat";
}

function buildKpiData() {
  if (!latestData) return null;
  const isHistorical = isHistoricalView(timeView);

  if (!isHistorical) {
    return selectedBarri
      ? latestFromBarri(selectedBarri, latestData.last_updated)
      : latestData;
  }

  if (selectedBarri) {
    const barri = displayBarris.find((b) => b.barri_codi === selectedBarri!.barri_codi);
    if (barri) return latestFromBarri(barri, latestData.last_updated);
  }

  return barrisToLatestData(displayBarris, latestData.last_updated);
}

function updateBarriFilterBar() {
  const bar = document.getElementById("barri-filter-bar")!;
  const label = document.getElementById("barri-filter-label")!;
  if (!selectedBarri) {
    bar.hidden = true;
    bar.classList.add("hidden");
    return;
  }
  bar.hidden = false;
  bar.classList.remove("hidden");
  label.textContent = `Filtrat: ${selectedBarri.barri_nom}`;
}

function updateTimelineStatus() {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl) return;

  if (timeView.kind === "latest") {
    setTimelineStatus(timelineEl, "Dades en temps real.");
    return;
  }

  const label = timeViewLabel(timeView, historyIndex);
  if (!displayBarris.length) {
    const n = sampleCountForView(historyIndex, timeView);
    setTimelineStatus(
      timelineEl,
      n
        ? `${label}: sense dades per a aquesta franja.`
        : `${hourViewScopeLabel(timeView.hour, timeView.dayType)}: dades insuficients (30 dies).`
    );
    return;
  }

  const n = sampleCountForView(historyIndex, timeView);
  const agg = barrisToLatestData(displayBarris, latestData!.last_updated).totals;
  const pctOos = agg.pct_bikes_out_of_service ?? 0;
  setTimelineStatus(
    timelineEl,
    `${label}: ${agg.pct_bikes.toFixed(1)}% bicicletes · ${agg.pct_mechanical.toFixed(1)}% mecàniques · ${agg.pct_ebike.toFixed(1)}% elèctriques · ${pctOos.toFixed(1)}% FS · ${n} mostra${n === 1 ? "" : "es"}.`
  );
}

function renderTableSection() {
  const tableContainer = document.getElementById("barri-table")!;
  const tableTitle = document.getElementById("table-title")!;

  if (selectedBarri && displayStations) {
    tableTitle.textContent = `Estacions · ${selectedBarri.barri_nom}`;
    renderStationTable(tableContainer, barriStations(), mode, timeView, {
      onSelect: (station) => mapView?.focusStation(station.station_id),
      heatScale,
    });
    return;
  }

  tableTitle.textContent = "Barris";
  renderBarriTable(tableContainer, displayBarris, mode, timeView, {
    selectedCodi: selectedBarri?.barri_codi ?? null,
    onSelect: selectBarri,
    heatScale,
  });
}

async function refresh() {
  if (!mapView || !latestData) return;

  const kpiData = buildKpiData();
  if (!kpiData) return;

  const isHistorical = isHistoricalView(timeView);
  const hour = isHistorical && timeView.kind === "hour" ? timeView.hour : currentMadridHour();

  const sparklines =
    !isHistorical && historyIndex
      ? selectedBarri
        ? await loadBarriSparklineSeries(historyIndex, selectedBarri.barri_codi)
        : await loadCitySparklineSeries(historyIndex)
      : null;

  const barriHistAverages =
    !isHistorical && selectedBarri && historyIndex
      ? await barriHistAveragesAtHour(historyIndex, selectedBarri.barri_codi, hour)
      : null;

  const weeklyTrendKeys: SparklineMetricKey[] = [
    "pct_bikes",
    "pct_mechanical",
    "pct_ebike",
    "pct_oos_anchors",
  ];
  const weeklyTrend = isHistorical
    ? Object.fromEntries(
        await Promise.all(
          weeklyTrendKeys.map(async (key) => [key, await dailyTrendValues(key)] as const)
        )
      )
    : undefined;

  const sampleCount =
    isHistorical && timeView.kind === "hour"
      ? sampleCountForView(historyIndex, timeView)
      : 0;

  renderKpis(
    document.getElementById("kpis")!,
    kpiData,
    summaryData,
    kpiScopeLabel(),
    isHistorical,
    sparklines,
    {
      sampleCount,
      weeklyTrend,
      barriHistAverages,
    }
  );
  mapView.update(
    mode,
    displayBarris,
    mapStations(),
    timeView,
    selectedBarri?.barri_codi ?? null,
    heatScale
  );
  renderTableSection();

  updateBarriFilterBar();
  updateLegend();
  const note = document.getElementById("legend-note")!;
  note.textContent = legendText();
  const tnote = document.getElementById("table-note")!;
  tnote.textContent = tableNote();
  updateTimelineStatus();
}

function selectBarri(barri: Barri) {
  selectedBarri = selectedBarri?.barri_codi === barri.barri_codi ? null : barri;
  void refresh();
  mapView?.focusBarri(selectedBarri?.barri_codi ?? null, displayStations);
}

function resetBarriFilter() {
  selectedBarri = null;
  void refresh();
  mapView?.focusBarri(null, null);
}

let timeViewRequest = 0;

async function applyTimeView(view: TimeView) {
  timeView = view;
  if (!barrisData || !latestData) return;

  const requestId = ++timeViewRequest;
  const timelineEl = document.getElementById("timeline")!;

  if (view.kind === "latest") {
    displayBarris = enrichBarrisWithFleetOos(barrisData.barris, latestData.stations);
    displayStations = latestData.stations;
  } else {
    setTimelineStatus(timelineEl, `${timeViewLabel(view, historyIndex)}: carregant…`);
    const { barris, stations } = await loadHourlyViewData(
      historyIndex,
      view.hour,
      view.dayType,
      latestData.stations,
      stationIdOrder
    );
    if (requestId !== timeViewRequest) return;
    displayBarris = barris;
    displayStations = stations;
  }

  updateTimeSelector(timelineEl, {
    index: historyIndex,
    timeView,
    onChange: (v) => {
      void applyTimeView(v);
    },
  });
  void refresh();
}

async function init() {
  try {
    const [latest, barris, geo, summary, index, stationIds, meta] = await Promise.all([
      loadLatest(),
      loadBarris(),
      loadBarrisGeo(),
      loadSummary7d(),
      loadHistoryIndex(),
      loadStationIds(),
      loadMeta().catch(() => null),
    ]);
    latestData = {
      ...latest,
      totals: {
        ...latest.totals,
        bikes_out_of_service: cityOosFromStations(latest.stations),
      },
    };
    barrisData = barris;
    summaryData = summary;
    historyIndex = index;
    stationIdOrder = stationIds?.ids ?? null;
    displayBarris = enrichBarrisWithFleetOos(barris.barris, latest.stations);
    displayStations = latest.stations;

    if (meta) {
      const footer = document.getElementById("footer-meta")!;
      footer.innerHTML = `Font: <a href="https://opendata-ajuntament.barcelona.cat/" target="_blank" rel="noopener">Open Data BCN</a> · ${meta.source}<br/><small>${meta.disclaimer} · ${meta.station_count} estacions · ${meta.barri_count} barris · ${formatRelativeTime(meta.last_updated)}</small>`;
    }

    setStationDonutSparklineLoader(async (b) => {
      if (!b.station_id || !historyIndex) return [];
      return loadStationSparklinePct(historyIndex, b.station_id, b.capacity, stationIdOrder);
    });

    mapView = createMap(document.getElementById("map")!, geo);
    void refresh();

    renderTimeSelector(document.getElementById("timeline")!, {
      index,
      timeView,
      onChange: (view) => {
        void applyTimeView(view);
      },
    });

    document.getElementById("barri-filter-reset")!.addEventListener("click", resetBarriFilter);
  } catch (err) {
    app.innerHTML = `<div class="error">Error carregant dades: ${(err as Error).message}</div>`;
  }
}

document.querySelectorAll<HTMLButtonElement>(".mode-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-toggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode as MetricMode;
    void refresh();
  });
});

document.querySelectorAll<HTMLButtonElement>(".heat-scale-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.heatScale as HeatScaleMode | undefined;
    if (!next || next === heatScale) return;
    heatScale = next;
    updateLegend();
    void refresh();
  });
});

init();
