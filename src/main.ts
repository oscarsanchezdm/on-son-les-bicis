import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { latestFromBarri, renderKpis } from "./components/kpi";
import { createMap } from "./components/map";
import { renderTimeSelector, updateTimeSelectorStatus } from "./components/timeline";
import type { Barri, MetricMode, Station } from "./lib/data";
import { loadBarris, loadBarrisGeo, loadLatest } from "./lib/data";
import { loadBarriHourlyAverage, loadSummary7d, type TimeView } from "./lib/history";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="site-header">
    <div>
      <p class="eyebrow">Dades obertes · Bicing Barcelona</p>
      <h1>On són les bicis?</h1>
      <p class="lede">Mapa en temps quasi real de la disponibilitat de bicicletes mecàniques i elèctriques del Bicing, per estació i per barri.</p>
    </div>
    <div class="mode-toggle" role="group" aria-label="Mètrica del mapa">
      <button type="button" data-mode="total" class="active">Totals</button>
      <button type="button" data-mode="mechanical">Mecàniques</button>
      <button type="button" data-mode="ebike">Elèctriques</button>
      <button type="button" data-mode="docks">Ancoratges lliures</button>
      <button type="button" data-mode="out_of_service">Fora de servei</button>
    </div>
  </header>
  <main>
    <div id="barri-filter-bar" class="barri-filter-bar hidden" hidden>
      <span id="barri-filter-label"></span>
      <button type="button" id="barri-filter-reset">Tornar a la ciutat</button>
    </div>
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
    <section id="timeline"></section>
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
let mapView: ReturnType<typeof createMap> | null = null;
let displayBarris: Barri[] = [];
let displayStations: Station[] | null = null;

function metricLabel(): string {
  switch (mode) {
    case "docks":
      return "ancoratges lliures";
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
  if (timeView.kind === "hour") {
    return `Barris segons mitjana 7 dies de ${metric} a la franja seleccionada.`;
  }
  return `Calor i punts amb la mateixa escala; estacions grans pesen més al mapa de calor.`;
}

function tableNote(): string {
  if (selectedBarri) {
    return `Filtrant per ${selectedBarri.barri_nom}. Clica «Tornar a la ciutat» o un altre barri.`;
  }
  if (timeView.kind === "hour") {
    return "Mitjana per barri dels darrers 7 dies a la franja horària seleccionada.";
  }
  return "Dades recents per barri. Clica una columna per ordenar o un barri per filtrar.";
}

function mapStations(): Station[] | null {
  if (!displayStations) return null;
  if (!selectedBarri) return displayStations;
  return displayStations.filter((s) => s.barri_codi === selectedBarri!.barri_codi);
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

function refresh() {
  if (!mapView || !latestData) return;

  const kpiData = selectedBarri
    ? latestFromBarri(selectedBarri, latestData.last_updated)
    : latestData;
  const scopeLabel = selectedBarri ? selectedBarri.barri_nom : "ciutat";

  renderKpis(document.getElementById("kpis")!, kpiData, summaryData, scopeLabel);
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

async function applyTimeView(view: TimeView) {
  timeView = view;
  if (!barrisData || !latestData) return;

  if (view.kind === "latest") {
    displayBarris = barrisData.barris;
    displayStations = latestData.stations;
  } else {
    displayBarris = await loadBarriHourlyAverage(view.hour);
    displayStations = null;
    selectedBarri = null;
  }

  const timelineEl = document.getElementById("timeline")!;
  updateTimeSelectorStatus(timelineEl, timeView, summaryData);
  refresh();
}

async function init() {
  try {
    const [latest, barris, geo, summary] = await Promise.all([
      loadLatest(),
      loadBarris(),
      loadBarrisGeo(),
      loadSummary7d(),
    ]);
    latestData = latest;
    barrisData = barris;
    summaryData = summary;
    displayBarris = barris.barris;
    displayStations = latest.stations;

    mapView = createMap(document.getElementById("map")!, geo);
    refresh();

    renderTimeSelector(document.getElementById("timeline")!, {
      summary,
      currentTs: latest.last_updated,
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
