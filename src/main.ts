import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { latestFromBarri, renderKpis } from "./components/kpi";
import { createMap } from "./components/map";
import { renderTimeSelector, setTimelineStatus, timeViewLabel, updateTimeSelector } from "./components/timeline";
import type { Barri, MetricMode, Station } from "./lib/data";
import { loadBarris, loadBarrisGeo, loadLatest } from "./lib/data";
import {
  barrisToLatestData,
  hourViewScopeLabel,
  isHistoricalView,
  loadBarriHourlyAverage,
  loadHistoryIndex,
  loadSummary7d,
  sampleCountForView,
  type HistoryIndex,
  type TimeView,
} from "./lib/history";
import { metricIconHtml } from "./lib/icons";

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
        <p class="legend-heading">Punts, barris i calor</p>
        <div class="legend-bar"></div>
        <p><span>Escassetat</span><span>Abundància</span></p>
        <p class="legend-note" id="legend-note">Mapa de calor + barris + estacions segons la mètrica seleccionada.</p>
        <p class="legend-heat">El calor pinta el color real de cada estació (com les boletes); les grans tenen més pes. En agrupar-se, els colors es barregen sense tornar-se verds artificialment.</p>
      </aside>
    </section>
    <section>
      <h2>Barris</h2>
      <p class="section-note" id="table-note">Clica una columna per ordenar. Clica un barri per filtrar el mapa i els KPIs.</p>
      <div id="barri-table"></div>
    </section>
  </main>
  <footer class="site-footer">
    <p>Font: <a href="https://opendata-ajuntament.barcelona.cat/" target="_blank" rel="noopener">Open Data BCN</a> · Bicing (B:SM)</p>
  </footer>
`;

let mode: MetricMode = "total";
let timeView: TimeView = { kind: "latest" };
let selectedBarri: Barri | null = null;
let latestData: Awaited<ReturnType<typeof loadLatest>> | null = null;
let barrisData: Awaited<ReturnType<typeof loadBarris>> | null = null;
let summaryData: Awaited<ReturnType<typeof loadSummary7d>> | null = null;
let historyIndex: HistoryIndex | null = null;
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
      return "bicis";
  }
}

function legendText(): string {
  const metric = metricLabel();
  if (selectedBarri) {
    return `Filtrat per ${selectedBarri.barri_nom}: ${metric} del barri.`;
  }
  if (isHistoricalView(timeView)) {
    return `Barris segons mitjana de ${metric} (${timeViewLabel(timeView, historyIndex)}).`;
  }
  return `Calor i punts amb la mateixa escala; estacions grans pesen més al mapa de calor.`;
}

function tableNote(): string {
  if (selectedBarri) {
    return `Filtrant per ${selectedBarri.barri_nom}. Clica «Tornar a la ciutat» o un altre barri.`;
  }
  if (isHistoricalView(timeView)) {
    return `Mitjana per barri (${timeViewLabel(timeView, historyIndex)}).`;
  }
  return "Dades actuals per barri. Clica una columna per ordenar o un barri per filtrar.";
}

function mapStations(): Station[] | null {
  if (!displayStations) return null;
  if (!selectedBarri) return displayStations;
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
  label.textContent = `Mostrant només: ${selectedBarri.barri_nom}`;
}

function updateTimelineStatus() {
  const timelineEl = document.getElementById("timeline");
  if (!timelineEl) return;

  if (timeView.kind === "latest") {
    setTimelineStatus(timelineEl, "Mostrant dades actuals (estacions + barris).");
    return;
  }

  const label = timeViewLabel(timeView, historyIndex);
  if (!displayBarris.length) {
    const n = sampleCountForView(historyIndex, timeView);
    setTimelineStatus(
      timelineEl,
      n
        ? `${label}: encara no hi ha dades per aquesta franja.`
        : `${hourViewScopeLabel(timeView.hour, timeView.dayType)}: encara no hi ha prou mostres (30 dies).`
    );
    return;
  }

  const n = sampleCountForView(historyIndex, timeView);

  const agg = barrisToLatestData(displayBarris, latestData!.last_updated).totals;
  setTimelineStatus(
    timelineEl,
    `${label}: ${agg.pct_bikes.toFixed(1)}% bicis · ${agg.pct_mechanical.toFixed(1)}% mecàniques · ${agg.pct_ebike.toFixed(1)}% elèctriques (${n} mostra${n === 1 ? "" : "es"}).`
  );
}

function refresh() {
  if (!mapView || !latestData) return;

  const kpiData = buildKpiData();
  if (!kpiData) return;

  renderKpis(
    document.getElementById("kpis")!,
    kpiData,
    summaryData,
    kpiScopeLabel(),
    timeView.kind === "hour"
  );
  mapView.update(
    mode,
    displayBarris,
    mapStations(),
    timeView,
    selectedBarri?.barri_codi ?? null
  );
  renderBarriTable(document.getElementById("barri-table")!, displayBarris, mode, timeView, {
    selectedCodi: selectedBarri?.barri_codi ?? null,
    onSelect: selectBarri,
  });

  updateBarriFilterBar();
  const note = document.getElementById("legend-note")!;
  note.textContent = legendText();
  const tnote = document.getElementById("table-note")!;
  tnote.textContent = tableNote();
  updateTimelineStatus();
}

function selectBarri(barri: Barri) {
  selectedBarri = selectedBarri?.barri_codi === barri.barri_codi ? null : barri;
  refresh();
  mapView?.focusBarri(selectedBarri?.barri_codi ?? null, displayStations);
}

function resetBarriFilter() {
  selectedBarri = null;
  refresh();
  mapView?.focusBarri(null, null);
}

let timeViewRequest = 0;

async function applyTimeView(view: TimeView) {
  timeView = view;
  if (!barrisData || !latestData) return;

  const requestId = ++timeViewRequest;
  const timelineEl = document.getElementById("timeline")!;

  if (view.kind === "latest") {
    displayBarris = barrisData.barris;
    displayStations = latestData.stations;
  } else {
    setTimelineStatus(timelineEl, `${timeViewLabel(view, historyIndex)}: carregant…`);
    displayBarris = await loadBarriHourlyAverage(historyIndex, view.hour, view.dayType);
    if (requestId !== timeViewRequest) return;
    displayStations = null;
    selectedBarri = null;
  }

  updateTimeSelector(timelineEl, {
    index: historyIndex,
    timeView,
    onChange: (v) => {
      void applyTimeView(v);
    },
  });
  refresh();
}

async function init() {
  try {
    const [latest, barris, geo, summary, index] = await Promise.all([
      loadLatest(),
      loadBarris(),
      loadBarrisGeo(),
      loadSummary7d(),
      loadHistoryIndex(),
    ]);
    latestData = latest;
    barrisData = barris;
    summaryData = summary;
    historyIndex = index;
    displayBarris = barris.barris;
    displayStations = latest.stations;

    mapView = createMap(document.getElementById("map")!, geo);
    refresh();

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
    refresh();
  });
});

init();
