import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { latestFromBarri, latestFromStation, renderKpis } from "./components/kpi";
import { createMap } from "./components/map";
import { renderStationTable } from "./components/stationTable";
import { renderTimeSelector, historicalStatusLabel, setTimelineStatus, timeViewLabel, updateTimeSelector } from "./components/timeline";
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
  clearHourlyViewCache,
  currentMadridHour,
  hoursForDayType,
  isHistoricalView,
  loadBarriSparklinePct,
  loadBarriSparklineSeries,
  loadCitySparklineSeriesRecent,
  loadHistoryIndex,
  loadHourlyViewData,
  nextReplayHourView,
  preloadReplayHistory,
  prevReplayHourView,
  loadStationIds,
  loadStationSparklineSeries,
  loadStationSparklinePct,
  loadSummary7d,
  sampleCountForView,
} from "./lib/history";
import { heatLegendGradient, pctLegendLabels, type HeatScaleMode } from "./lib/colors";
import { formatRelativeTime } from "./lib/format";
import { iconEbike, metricIconHtml } from "./lib/icons";
import { matchesSearch } from "./lib/search";
import { mountTableSearch, syncTableSearch } from "./lib/tableSearch";
import {
  setStationDonutSparklineLoader,
  setStationDonutMetricMode,
} from "./lib/stationDonut";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="site-header site-header--sticky">
    <div class="site-header__inner">
      <div class="site-header__row">
        <div class="site-header__brand">
          <div class="site-header__title-row">
            <h1>On són les <span class="title-accent"><span class="title-ebike-icon" aria-hidden="true">${iconEbike(22)}</span>bicis</span>?</h1>
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
      <div class="table-header">
        <h2 id="table-title">Barris</h2>
      </div>
      <p class="section-note" id="table-note">Ordeneu per columna o seleccioneu un barri per filtrar.</p>
      <div id="table-search-host" class="table-search-host"></div>
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
let tableSearchQuery = "";
let tableSearchOpen = false;
let stationSparklineCache: BarriSparklineSeries | null = null;
let stationSparklineId: string | null = null;
let stationSparklineLoadId = 0;

const REPLAY_INTERVAL_MS = 1500;

function scheduleHistoryLoad(): void {
  if (historyLoadPromise) return;
  historyLoading = true;
  void refresh();
  const cacheKey = latestData?.last_updated ?? null;
  historyLoadPromise = (async () => {
    const [summary, index, stationIds] = await Promise.all([
      loadSummary7d(),
      loadHistoryIndex(cacheKey),
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

async function refreshHistoryIndex(): Promise<void> {
  const cacheKey = latestData?.last_updated ?? null;
  const index = await loadHistoryIndex(cacheKey);
  if (!index) return;

  const prevKeys = historyIndex?.files?.map((f) => f.key).join("|") ?? "";
  const nextKeys = index.files?.map((f) => f.key).join("|") ?? "";
  historyIndex = index;
  if (prevKeys !== nextKeys) {
    clearHourlyViewCache();
  }
  updateTimelineUi();
}

function scheduleBarriSparklineLoad(): void {
  if (!historyIndex || selectedStation || !selectedBarri || isHistoricalView(timeView)) return;
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

function scheduleStationSparklineLoad(): void {
  if (!historyIndex || !selectedStation || isHistoricalView(timeView)) return;
  if (stationSparklineId === selectedStation.station_id && stationSparklineCache) return;

  const station = selectedStation;
  const loadId = ++stationSparklineLoadId;
  void loadStationSparklineSeries(
    historyIndex,
    station.station_id,
    station.capacity,
    stationIdOrder
  ).then((series) => {
    if (loadId !== stationSparklineLoadId) return;
    stationSparklineId = station.station_id;
    stationSparklineCache = series;
    void refresh();
  });
}

function scheduleCitySparklineLoad(): void {
  if (!historyIndex || selectedBarri || selectedStation || isHistoricalView(timeView)) return;
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
    const hours = hoursForDayType(historyIndex, dayType, {
      latestUpdated: latestData?.last_updated,
    });
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
  if (timeView.kind !== "hour" || !historyIndex || !latestData) return;
  replayPlaying = true;
  if (replayTimer) clearInterval(replayTimer);
  replayTimer = setInterval(advanceReplayHour, REPLAY_INTERVAL_MS / replaySpeed);
  void preloadReplayHistory(historyIndex, latestData.stations, stationIdOrder);
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

function timelineOptions() {
  return {
    index: historyIndex,
    timeView,
    latestUpdated: latestData?.last_updated ?? null,
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
  const scope = selectedStation
    ? ` Àmbit: ${selectedStation.name}.`
    : selectedBarri
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
  const query = tableSearchQuery.trim();
  if (selectedStation) {
    return `Filtrat per estació. Prem la fila o «Tornar al barri» per ampliar l'àmbit.`;
  }
  if (selectedBarri) {
    return `Estacions de ${selectedBarri.barri_nom}. Prem una fila per filtrar per estació o un punt del mapa (Filtrar per estació).`;
  }
  if (query) {
    return `Filtrant barris per «${query}».`;
  }
  if (isHistoricalView(timeView)) {
    return `Mitjana per barri · ${timeViewLabel(timeView, historyIndex)}${heatScale === "absolute" ? " · valors en nombre" : ""}.`;
  }
  return heatScale === "absolute"
    ? "Ordeneu per columna o seleccioneu un barri. Valors en nombre de bicis/ancoratges."
    : "Ordeneu per columna o seleccioneu un barri per filtrar.";
}

function filterStationsBySearch(stations: Station[]): Station[] {
  const query = tableSearchQuery.trim();
  if (!query) return stations;
  return stations.filter((s) => matchesSearch(s.name, query));
}

function filterBarrisBySearch(barris: Barri[]): Barri[] {
  const query = tableSearchQuery.trim();
  if (!query) return barris;
  return barris.filter((b) => matchesSearch(b.barri_nom, query));
}

function tableStations(): Station[] {
  if (!displayStations) return [];
  if (selectedStation) return [selectedStation];
  if (selectedBarri) {
    return displayStations.filter((s) => s.barri_codi === selectedBarri!.barri_codi);
  }
  return [];
}

function mapStations(): Station[] | null {
  if (!displayStations) return null;
  if (selectedStation) return [selectedStation];
  if (selectedBarri) return displayStations.filter((s) => s.barri_codi === selectedBarri!.barri_codi);
  return displayStations;
}

function kpiScopeLabel(): string {
  if (selectedStation) return selectedStation.name;
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
    if (selectedStation) return latestFromStation(selectedStation, latestData.last_updated);
    return selectedBarri
      ? latestFromBarri(selectedBarri, latestData.last_updated)
      : latestData;
  }

  if (selectedStation) return latestFromStation(selectedStation, latestData.last_updated);

  if (selectedBarri) {
    const barri = displayBarris.find((b) => b.barri_codi === selectedBarri!.barri_codi);
    if (barri) return latestFromBarri(barri, latestData.last_updated);
  }

  return barrisToLatestData(displayBarris, latestData.last_updated);
}

function updateFilterBar() {
  const bar = document.getElementById("barri-filter-bar")!;
  const label = document.getElementById("barri-filter-label")!;
  const resetBtn = document.getElementById("barri-filter-reset") as HTMLButtonElement;
  if (!selectedBarri && !selectedStation) {
    bar.hidden = true;
    bar.classList.add("hidden");
    return;
  }
  bar.hidden = false;
  bar.classList.remove("hidden");
  if (selectedStation) {
    label.textContent = `Estació: ${selectedStation.name}`;
    resetBtn.textContent = "Tornar al barri";
    return;
  }
  label.textContent = `Barri: ${selectedBarri!.barri_nom}`;
  resetBtn.textContent = "Tornar a la ciutat";
}

function updateTimelineStatus() {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl || !latestData) return;

  if (timeViewLoading && timeView.kind === "hour") {
    setTimelineStatus(timelineEl, "Carregant dades…");
    return;
  }

  if (timeView.kind === "hour") {
    setTimelineStatus(timelineEl, historicalStatusLabel(timeView, replayPlaying));
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
}

function tableSearchPlaceholder(): string {
  if (selectedBarri || selectedStation) return "Cercar estació…";
  return "Cercar barri…";
}

function clearTableSearch(): void {
  tableSearchQuery = "";
  tableSearchOpen = false;
  const host = document.getElementById("table-search-host");
  if (host) {
    syncTableSearch(
      host,
      { query: "", open: false, placeholder: tableSearchPlaceholder() },
      true
    );
  }
}

function syncTableSearchUi(forceValue = false): void {
  const host = document.getElementById("table-search-host");
  if (!host) return;
  syncTableSearch(
    host,
    {
      query: tableSearchQuery,
      open: tableSearchOpen,
      placeholder: tableSearchPlaceholder(),
    },
    forceValue
  );
}

function initTableSearch(): void {
  const host = document.getElementById("table-search-host");
  if (!host) return;
  mountTableSearch(host, {
    onQueryChange: (query) => {
      tableSearchQuery = query;
      tableSearchOpen = true;
      renderTableSection();
      const tnote = document.getElementById("table-note");
      if (tnote) tnote.textContent = tableNote();
    },
    onToggle: () => {
      const isOpen = tableSearchOpen || tableSearchQuery.trim().length > 0;
      tableSearchOpen = !isOpen;
      if (!tableSearchOpen && !tableSearchQuery.trim()) {
        syncTableSearchUi();
        return;
      }
      tableSearchOpen = true;
      syncTableSearchUi();
      const input = host.querySelector<HTMLInputElement>(".table-search__input");
      input?.focus();
    },
  });
  syncTableSearchUi();
}

function renderTableSection() {
  const tableContainer = document.getElementById("barri-table")!;
  const tableTitle = document.getElementById("table-title")!;
  syncTableSearchUi();

  const showStationTable = selectedStation !== null || selectedBarri !== null;

  if (showStationTable && displayStations) {
    const stations = filterStationsBySearch(tableStations());
    if (selectedStation) {
      tableTitle.textContent = `Estació · ${selectedStation.name}`;
    } else if (selectedBarri) {
      tableTitle.textContent = `Estacions · ${selectedBarri.barri_nom}`;
    } else {
      tableTitle.textContent = "Estacions";
    }
    renderStationTable(tableContainer, stations, mode, timeView, {
      selectedId: selectedStation?.station_id ?? null,
      onSelect: applyStationFilter,
      heatScale,
    });
    return;
  }

  tableTitle.textContent = "Barris";
  renderBarriTable(tableContainer, filterBarrisBySearch(displayBarris), mode, timeView, {
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
  if (selectedStation) {
    return stationSparklineId !== selectedStation.station_id;
  }
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
    ? selectedStation && stationSparklineId === selectedStation.station_id
      ? stationSparklineCache
      : selectedBarri && barriSparklineCodi === selectedBarri.barri_codi
        ? barriSparklineCache
        : !selectedBarri && !selectedStation
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
  mapView.update(
    mode,
    displayBarris,
    mapStations(),
    timeView,
    selectedBarri?.barri_codi ?? null,
    heatScale
  );
  renderTableSection();

  updateFilterBar();
  updateLegend();
  const note = document.getElementById("legend-note")!;
  note.textContent = legendText();
  const tnote = document.getElementById("table-note")!;
  tnote.textContent = tableNote();
  updateTimelineStatus();
  updateTimelineUi();

  scheduleBarriSparklineLoad();
  scheduleStationSparklineLoad();
  scheduleCitySparklineLoad();
  scheduleHistAveragesLoad();
}

function resetStationSparklineCache(): void {
  stationSparklineLoadId++;
  stationSparklineId = null;
  stationSparklineCache = null;
}

function barriForStation(station: Station): Barri | null {
  return displayBarris.find((b) => b.barri_codi === station.barri_codi) ?? null;
}

function applyStationFilter(station: Station) {
  clearTableSearch();
  const togglingOff = selectedStation?.station_id === station.station_id;
  selectedStation = togglingOff ? null : station;
  if (selectedStation) {
    const barri = barriForStation(station);
    if (barri) selectedBarri = barri;
  } else {
    resetStationSparklineCache();
  }
  void refresh();
  if (selectedStation) {
    mapView?.focusStation(selectedStation.station_id);
  } else if (selectedBarri) {
    mapView?.focusBarri(selectedBarri.barri_codi, displayStations);
  }
}

function selectBarri(barri: Barri) {
  clearTableSearch();
  const next = selectedBarri?.barri_codi === barri.barri_codi ? null : barri;
  if (next?.barri_codi !== selectedBarri?.barri_codi) {
    barriSparklineLoadId++;
    barriSparklineCodi = null;
    barriSparklineCache = null;
    resetHistAveragesCache();
    selectedStation = null;
    resetStationSparklineCache();
  }
  selectedBarri = next;
  if (!next) selectedStation = null;
  void refresh();
  mapView?.focusBarri(selectedBarri?.barri_codi ?? null, displayStations);
}

function resetScopeFilter() {
  clearTableSearch();
  if (selectedStation) {
    selectedStation = null;
    resetStationSparklineCache();
    void refresh();
    if (selectedBarri) {
      mapView?.focusBarri(selectedBarri.barri_codi, displayStations);
    }
    return;
  }
  resetBarriFilter();
}

function resetBarriFilter() {
  clearTableSearch();
  barriSparklineLoadId++;
  barriSparklineCodi = null;
  barriSparklineCache = null;
  resetHistAveragesCache();
  resetStationSparklineCache();
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
      if (!fromReplay) {
        await refreshHistoryIndex();
      }
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
        updateTimelineStatus();
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
      onStationFilter: applyStationFilter,
    });
    void refresh();

    renderTimeSelector(document.getElementById("timeline")!, timelineOptions());

    document.getElementById("barri-filter-reset")!.addEventListener("click", resetScopeFilter);

    initTableSearch();
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
