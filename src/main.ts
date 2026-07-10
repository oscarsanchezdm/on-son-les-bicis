import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { renderKpis } from "./components/kpi";
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
    </div>
  </header>
  <main>
    <section id="kpis"></section>
    <section class="map-section">
      <div id="map"></div>
      <aside class="legend">
        <h2>Llegenda</h2>
        <p class="legend-heading">Punts, barris i calor</p>
        <div class="legend-bar"></div>
        <p><span>Escassetat</span><span>Abundància</span></p>
        <p class="legend-note" id="legend-note">Mapa de calor + barris + estacions segons la mètrica seleccionada.</p>
        <p class="legend-heat">El calor usa la mateixa escala de color que les boletes; les estacions grans tenen més pes visual.</p>
      </aside>
    </section>
    <section id="timeline"></section>
    <section>
      <h2>Barris</h2>
      <p class="section-note" id="table-note">Clica una columna per ordenar.</p>
      <div id="barri-table"></div>
    </section>
  </main>
  <footer class="site-footer">
    <p>Font: <a href="https://opendata-ajuntament.barcelona.cat/" target="_blank" rel="noopener">Open Data BCN</a> · Bicing (B:SM)</p>
  </footer>
`;

let mode: MetricMode = "total";
let timeView: TimeView = { kind: "latest" };
let latestData: Awaited<ReturnType<typeof loadLatest>> | null = null;
let barrisData: Awaited<ReturnType<typeof loadBarris>> | null = null;
let summaryData: Awaited<ReturnType<typeof loadSummary7d>> | null = null;
let mapView: ReturnType<typeof createMap> | null = null;
let displayBarris: Barri[] = [];
let displayStations: Station[] | null = null;

function legendText(): string {
  const metric =
    mode === "docks"
      ? "ancoratges lliures"
      : mode === "ebike"
        ? "elèctriques"
        : mode === "mechanical"
          ? "mecàniques"
          : "bicis";
  if (timeView.kind === "hour") {
    return `Barris segons mitjana 7 dies de ${metric} a la franja seleccionada.`;
  }
  return `Calor i punts amb la mateixa escala; estacions grans pesen més al mapa de calor.`;
}

function tableNote(): string {
  if (timeView.kind === "hour") {
    return "Mitjana per barri dels darrers 7 dies a la franja horària seleccionada.";
  }
  return "Dades recents per barri. Clica una columna per ordenar.";
}

function refresh() {
  if (!mapView) return;
  mapView.update(mode, displayBarris, displayStations, timeView);
  renderBarriTable(
    document.getElementById("barri-table")!,
    displayBarris,
    mode,
    timeView
  );
  const note = document.getElementById("legend-note")!;
  note.textContent = legendText();
  const tnote = document.getElementById("table-note")!;
  tnote.textContent = tableNote();
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

    renderKpis(document.getElementById("kpis")!, latest, summary);
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
