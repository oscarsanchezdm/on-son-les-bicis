import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { renderCompositionCard } from "./components/compositionCard";
import { latestFromBarri, renderKpis } from "./components/kpi";
import { createMap } from "./components/map";
import { renderStationTable } from "./components/stationTable";
import { renderTimeSelector, dataModeBadgeLabel, replayStatusLabel, setTimelineStatus, timeViewLabel, updateTimeSelector } from "./components/timeline";
import type { Barri, MetricMode, Station } from "./lib/data";
import {
  enrichBarrisWithFleetOos,
  cityOosFromStations,
  loadBarris,
  loadBarrisGeo,
  loadLatest,
  loadMeta,
} from "./lib/data";
import type { BarriSparklineSeries, DayType, HistoryIndex, SparklineMetricKey, TimeView } from "./lib/history";
import {
  barriHistAveragesAtHour,
  barrisToLatestData,
  cityHistAveragesAtHour,
  currentMadridHour,
  hourViewScopeLabel,
  hoursForDayType,
  isHistoricalView,
  loadBarriSparklinePct,
  loadBarriSparklineSeries,
  loadCitySparklineSeriesRecent,
  loadHistoryIndex,
  loadHourlyViewData,
  nextReplayHourView,
  prevReplayHourView,
  loadStationIds,
  loadStationSparklinePct,
  loadSummary7d,
  sampleCountForView,
} from "./lib/history";
import { heatLegendGradient, pctLegendLabels, type HeatScaleMode } from "./lib/colors";
import { formatRelativeTime } from "./lib/format";
import { iconEbike, metricIconHtml } from "./lib/icons";
import {
  breakdownFromBarri,
  breakdownFromCity,
  breakdownFromStation,
  setStationDonutSparklineLoader,
  setStationDonutMetricMode,
  type StationBreakdown,
} from "./lib/stationDonut";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="site-header site-header--sticky">
    <div class="site-header__inner">
      <div class="site-header__row">
        <div class="site-header__brand">
          <div class="site-header__title-row">
            <h1>On són les <span class="title-accent"><span class="title-ebike-icon" aria-hidden="true">${iconEbike(22)}</span>bicis</span>?</h1>
            <span id="data-mode-badge" class="data-mode-badge data-mode-badge--hist" hidden></span>
          </div>
        </div>
        <div id="barri-filter-bar" class="barri-filter-bar hidden" hidden>
          <span id="barri-filter-label"></span>
          <button type="button" id="barri-filter-reset">Tornar a la ciutat</button>
        </div>
      </div>
      <div class="mode-toggle" role="group" aria-label="Mètrica del mapa">
        <button type="button" data-mode="total" class="active">${metricIconHtml("total")} Bicicletes</button>
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
    <section id="composition" class="composition-section"></section>
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
let selectedStation: Station | null = null;
let latestData: Awaited<ReturnType<typeof loadLatest>> | null = null;
let barrisData: Awaited<ReturnType<typeof loadBarris>> | null = null;
let summaryData: Awaited<ReturnType<typeof loadSummary7d>> | null = null;
let historyIndex: HistoryIndex | null = null;
let stationIdOrder: string[] | null = null;
let mapView: ReturnType<typeof createMap> | null = null;
let displayBarris: Barri[] = [];
let displayStations: Station[] | null = null;
let historyLoadPromise: Promise<void> | null = null;
let historyLoading = false;
let barriSparklineCache: BarriSparklineSeries | null = null;
let barriSparklineCodi: string | null = null;
let barriSparklineLoadId = 0;
let citySparklineCache: BarriSparklineSeries | null = null;
let citySparklineLoadId = 0;
let histAveragesCache: Partial<Record<SparklineMetricKey, number>> | null = null;
let histAveragesKey: string | null = null;
let histAveragesLoadId = 0;
let replayPlaying = false;
let replaySpeed: 1 | 2 = 1;
let replayTimer: ReturnType<typeof setInterval> | null = null;

const REPLAY_INTERVAL_MS = 1500;

function scheduleHistoryLoad(): void {
  if (historyLoadPromise) return;
  historyLoading = true;
  void refresh();
  historyLoadPromise = (async () => {
    const [summary, index, stationIds] = await Promise.all([
      loadSummary7d(),
      loadHistoryIndex(),
      loadStationIds(),
    ]);
    summaryData = summary;
    historyIndex = index;
    stationIdOrder = stationIds?.ids ?? null;

    const timelineEl = document.getElementById("timeline");
    if (timelineEl) {
      updateTimeSelector(timelineEl, timelineOptions());
    }
  })()
    .catch(() => {
      historyLoadPromise = null;
    })
    .finally(() => {
      historyLoading = false;
      void refresh();
    });
}

async function ensureHistoryLoaded(): Promise<void> {
  scheduleHistoryLoad();
  if (historyLoadPromise) await historyLoadPromise;
}

function scheduleBarriSparklineLoad(): void {
  if (!historyIndex || !selectedBarri || isHistoricalView(timeView)) return;
  if (barriSparklineCodi === selectedBarri.barri_codi && barriSparklineCache) return;

  const codi = selectedBarri.barri_codi;
  const loadId = ++barriSparklineLoadId;
  void loadBarriSparklineSeries(historyIndex, codi).then((series) => {
    if (loadId !== barriSparklineLoadId) return;
    barriSparklineCodi = codi;
    barriSparklineCache = series;
    void refresh();
  });
}

function scheduleCitySparklineLoad(): void {
  if (!historyIndex || selectedBarri || isHistoricalView(timeView)) return;
  if (citySparklineCache) return;

  const loadId = ++citySparklineLoadId;
  void loadCitySparklineSeriesRecent(historyIndex).then((series) => {
    if (loadId !== citySparklineLoadId) return;
    citySparklineCache = series;
    void refresh();
  });
}

function histAveragesScopeKey(): string | null {
  if (isHistoricalView(timeView)) return null;
  const hour = currentMadridHour();
  if (selectedBarri) return `barri:${selectedBarri.barri_codi}:${hour}`;
  return `city:${hour}`;
}

function scheduleHistAveragesLoad(): void {
  const scopeKey = histAveragesScopeKey();
  if (!historyIndex || !scopeKey) return;
  if (histAveragesKey === scopeKey && histAveragesCache) return;

  const loadId = ++histAveragesLoadId;
  const hour = currentMadridHour();
  const loader = selectedBarri
    ? barriHistAveragesAtHour(historyIndex, selectedBarri.barri_codi, hour)
    : cityHistAveragesAtHour(historyIndex, hour);

  void loader.then((averages) => {
    if (loadId !== histAveragesLoadId) return;
    histAveragesKey = scopeKey;
    histAveragesCache = averages;
    void refresh();
  });
}

function resetHistAveragesCache(): void {
  histAveragesLoadId++;
  histAveragesKey = null;
  histAveragesCache = null;
}

function stopReplay(): void {
  replayPlaying = false;
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
}

function defaultReplayView(): Extract<TimeView, { kind: "hour" }> | null {
  if (!historyIndex) return null;
  const order: DayType[] = ["weekday", "friday", "saturday", "sunday"];
  for (const dayType of order) {
    const hours = hoursForDayType(historyIndex, dayType);
    if (hours.length) {
      const now = currentMadridHour();
      const hour = hours.includes(now) ? now : hours[0]!;
      return { kind: "hour", hour, dayType };
    }
  }
  return null;
}

function advanceReplayHour(): void {
  if (timeViewLoading || !replayPlaying || timeView.kind !== "hour" || !historyIndex) {
    return;
  }
  const next = nextReplayHourView(historyIndex, timeView);
  if (!next) {
    stopReplay();
    void refresh();
    return;
  }
  void applyTimeView(next, true);
}

function startReplay(): void {
  if (timeView.kind !== "hour" || !historyIndex) return;
  replayPlaying = true;
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = setInterval(advanceReplayHour, REPLAY_INTERVAL_MS / replaySpeed);
  void refresh();
}

async function toggleReplay(): Promise<void> {
  if (replayPlaying) {
    stopReplay();
    void refresh();
    return;
  }
  if (timeView.kind === "latest") {
    await ensureHistoryLoaded();
    const view = defaultReplayView();
    if (!view) return;
    await applyTimeView(view, true);
    startReplay();
    return;
  }
  startReplay();
}

function stepReplayHour(delta: -1 | 1): void {
  stopReplay();
  if (timeView.kind !== "hour" || !historyIndex) return;
  const next =
    delta === 1
      ? nextReplayHourView(historyIndex, timeView)
      : prevReplayHourView(historyIndex, timeView);
  if (!next) return;
  void applyTimeView(next);
}

function toggleReplaySpeed(): void {
  replaySpeed = replaySpeed === 1 ? 2 : 1;
  if (replayPlaying) {
    if (replayTimer) clearInterval(replayTimer);
    replayTimer = setInterval(advanceReplayHour, REPLAY_INTERVAL_MS / replaySpeed);
  }
  void refresh();
}

function compositionScopeLabel(): string {
  if (selectedStation) return selectedStation.name;
  if (selectedBarri) return selectedBarri.barri_nom;
  if (isHistoricalView(timeView)) return `Barcelona · ${timeViewLabel(timeView, historyIndex)}`;
  return "Barcelona";
}

function buildCompositionBreakdown(): StationBreakdown | null {
  const stations = displayStations;
  if (!stations?.length) return null;

  const historical = isHistoricalView(timeView);
  const historicalLabel = historical ? timeViewLabel(timeView, historyIndex) : undefined;
  const ctx = { historical, historicalLabel };

  if (selectedStation && selectedBarri) {
    const station = stations.find((s) => s.station_id === selectedStation!.station_id);
    if (station) return breakdownFromStation(station, ctx);
  }
  if (selectedBarri) {
    const barri = displayBarris.find((b) => b.barri_codi === selectedBarri!.barri_codi);
    if (barri) return breakdownFromBarri(barri, ctx, stations);
  }
  return breakdownFromCity(stations, ctx);
}

function timelineOptions() {
  return {
    index: historyIndex,
    timeView,
    onChange: (view: TimeView) => {
      void applyTimeView(view);
    },
    replayPlaying,
    replaySpeed,
    onReplayToggle: () => {
      void toggleReplay();
    },
    onReplayStep: stepReplayHour,
    onReplaySpeedToggle: toggleReplaySpeed,
  };
}

function updateTimelineUi(): void {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl) return;
  updateTimeSelector(timelineEl, timelineOptions());
}

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
    return `Estacions de ${selectedBarri.barri_nom}. Clica una fila o un punt del mapa per seleccionar l'estació.`;
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

function updateDataModeBadge(): void {
  const badge = document.getElementById("data-mode-badge");
  if (!badge) return;

  const label = dataModeBadgeLabel(timeView);
  if (!label) {
    badge.hidden = true;
    badge.textContent = "";
    badge.title = "";
    return;
  }

  badge.hidden = false;
  badge.textContent = label;
  badge.className = `data-mode-badge data-mode-badge--hist${replayPlaying ? " data-mode-badge--replay" : ""}`;
  if (timeView.kind === "hour") {
    badge.title = hourViewScopeLabel(timeView.hour, timeView.dayType);
  }
}

function updateTimelineStatus() {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl || !latestData) return;

  if (replayPlaying && timeView.kind === "hour") {
    setTimelineStatus(timelineEl, replayStatusLabel(timeView, true));
    return;
  }

  if (timeView.kind === "latest") {
    if (historyLoading) {
      setTimelineStatus(timelineEl, "Carregant dades…");
      return;
    }
    setTimelineStatus(timelineEl, formatRelativeTime(latestData.last_updated));
    return;
  }

  setTimelineStatus(timelineEl, "");
}

function renderTableSection() {
  const tableContainer = document.getElementById("barri-table")!;
  const tableTitle = document.getElementById("table-title")!;

  if (selectedBarri && displayStations) {
    tableTitle.textContent = `Estacions · ${selectedBarri.barri_nom}`;
    renderStationTable(tableContainer, barriStations(), mode, timeView, {
      selectedId: selectedStation?.station_id ?? null,
      onSelect: (station) => selectStation(station, false),
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

function setupSparklineLoader() {
  setStationDonutMetricMode(mode);
  setStationDonutSparklineLoader(async (b) => {
    if (b.historical) return [];
    await ensureHistoryLoaded();
    if (!historyIndex) return [];
    if (b.station_id) {
      return loadStationSparklinePct(historyIndex, b.station_id, b.capacity, stationIdOrder, mode);
    }
    if (b.barri_codi) {
      return loadBarriSparklinePct(historyIndex, b.barri_codi, mode);
    }
    return [];
  });
}

function statsPending(): boolean {
  if (isHistoricalView(timeView)) return false;
  if (historyLoading) return true;
  if (!historyIndex) return false;
  if (selectedBarri) {
    return barriSparklineCodi !== selectedBarri.barri_codi;
  }
  return !citySparklineCache;
}

async function refresh() {
  if (!mapView || !latestData) return;

  setupSparklineLoader();

  const kpiData = buildKpiData();
  if (!kpiData) return;

  const isHistorical = isHistoricalView(timeView);

  const sparklines = !isHistorical
    ? selectedBarri && barriSparklineCodi === selectedBarri.barri_codi
      ? barriSparklineCache
      : !selectedBarri
        ? citySparklineCache
        : null
    : null;

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
      barriHistAverages: histAveragesCache,
      statsPending: statsPending(),
    }
  );
  renderCompositionCard(document.getElementById("composition")!, {
    breakdown: buildCompositionBreakdown(),
    scopeLabel: compositionScopeLabel(),
    showClearStation: Boolean(selectedStation && selectedBarri),
    onClearStation: clearStationSelection,
  });
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
  updateDataModeBadge();
  updateLegend();
  const note = document.getElementById("legend-note")!;
  note.textContent = legendText();
  const tnote = document.getElementById("table-note")!;
  tnote.textContent = tableNote();
  updateTimelineStatus();
  updateTimelineUi();

  scheduleBarriSparklineLoad();
  scheduleCitySparklineLoad();
  scheduleHistAveragesLoad();
}

function applyBarriFilter(barri: Barri): void {
  if (selectedBarri?.barri_codi === barri.barri_codi) return;
  barriSparklineLoadId++;
  barriSparklineCodi = null;
  barriSparklineCache = null;
  resetHistAveragesCache();
  selectedStation = null;
  selectedBarri = barri;
}

function findBarriByCodi(codi: string): Barri | null {
  return (
    displayBarris.find((b) => b.barri_codi === codi) ??
    barrisData?.barris.find((b) => b.barri_codi === codi) ??
    null
  );
}

function selectStation(station: Station, fromMap = false) {
  const barri = findBarriByCodi(station.barri_codi);
  if (barri && (!selectedBarri || selectedBarri.barri_codi !== barri.barri_codi)) {
    applyBarriFilter(barri);
  }
  if (!selectedBarri) return;

  const next =
    selectedStation?.station_id === station.station_id ? null : station;
  selectedStation = next;
  if (fromMap && next) {
    mapView?.setPendingPopup({ stationId: next.station_id });
  }
  void refresh();
  if (!fromMap) {
    mapView?.focusStation(selectedStation?.station_id ?? null);
  }
}

function clearStationSelection() {
  selectedStation = null;
  void refresh();
}

function selectBarriFromMap(barri: Barri) {
  if (selectedBarri?.barri_codi === barri.barri_codi) return;
  applyBarriFilter(barri);
  mapView?.setPendingPopup({ barriCodi: barri.barri_codi });
  void refresh();
}

function selectBarri(barri: Barri) {
  const next = selectedBarri?.barri_codi === barri.barri_codi ? null : barri;
  if (next?.barri_codi !== selectedBarri?.barri_codi) {
    barriSparklineLoadId++;
    barriSparklineCodi = null;
    barriSparklineCache = null;
    resetHistAveragesCache();
    selectedStation = null;
  }
  selectedBarri = next;
  void refresh();
  mapView?.focusBarri(selectedBarri?.barri_codi ?? null, displayStations);
}

function resetBarriFilter() {
  barriSparklineLoadId++;
  barriSparklineCodi = null;
  barriSparklineCache = null;
  resetHistAveragesCache();
  selectedStation = null;
  selectedBarri = null;
  void refresh();
  mapView?.focusBarri(null, null);
}

let timeViewRequest = 0;
let timeViewLoading = false;

async function applyTimeView(view: TimeView, fromReplay = false) {
  if (!fromReplay) stopReplay();
  timeView = view;
  if (!barrisData || !latestData) return;

  const requestId = ++timeViewRequest;
  const timelineEl = document.getElementById("timeline")!;

  if (view.kind === "latest") {
    displayBarris = enrichBarrisWithFleetOos(barrisData.barris, latestData.stations);
    displayStations = latestData.stations;
  } else {
    timeViewLoading = true;
    setTimelineStatus(timelineEl, "Carregant dades…");
    try {
      await ensureHistoryLoaded();
      const { barris, stations } = await loadHourlyViewData(
        historyIndex,
        view.hour,
        view.dayType,
        latestData.stations,
        stationIdOrder
      );
      if (requestId !== timeViewRequest) return;
      displayBarris = stations
        ? enrichBarrisWithFleetOos(barris, stations)
        : barris;
      displayStations = stations;
    } finally {
      if (requestId === timeViewRequest) {
        timeViewLoading = false;
        if (!replayPlaying) setTimelineStatus(timelineEl, "");
      }
    }
  }

  updateTimeSelector(timelineEl, timelineOptions());
  void refresh();
}

async function init() {
  try {
    const [latest, barris, geo, meta] = await Promise.all([
      loadLatest(),
      loadBarris(),
      loadBarrisGeo(),
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
    displayBarris = enrichBarrisWithFleetOos(barris.barris, latest.stations);
    displayStations = latest.stations;

    if (meta) {
      const footer = document.getElementById("footer-meta")!;
      footer.innerHTML = `Font: <a href="https://opendata-ajuntament.barcelona.cat/" target="_blank" rel="noopener">Open Data BCN</a> · ${meta.source}<br/><small>${meta.disclaimer} · ${meta.station_count} estacions · ${meta.barri_count} barris · ${formatRelativeTime(meta.last_updated)}</small>`;
    }

    mapView = createMap(document.getElementById("map")!, geo, {
      onBarriFilter: selectBarri,
      onBarriMapClick: selectBarriFromMap,
      onStationSelect: (station) => selectStation(station, true),
    });
    void refresh();

    renderTimeSelector(document.getElementById("timeline")!, timelineOptions());

    document.getElementById("barri-filter-reset")!.addEventListener("click", resetBarriFilter);

    scheduleHistoryLoad();
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
