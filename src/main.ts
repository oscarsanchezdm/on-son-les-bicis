import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { renderKpis } from "./components/kpi";
import { createMap } from "./components/map";
import { renderHourlyHistory } from "./components/timeline";
import type { MetricMode } from "./lib/data";
import { loadBarris, loadBarrisGeo, loadLatest } from "./lib/data";
import { loadSummary7d } from "./lib/history";

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
        <p class="legend-heading">Punts i barris</p>
        <div class="legend-bar"></div>
        <p><span>Escassetat</span><span>Abundància</span></p>
        <p class="legend-heading">Mapa de calor</p>
        <div class="legend-bar legend-bar--heat"></div>
        <p><span>Normal</span><span>Pitjor que la mitjana</span></p>
        <p class="legend-note" id="legend-note">Mapa de calor + barris + estacions segons la mètrica seleccionada.</p>
        <p class="legend-heat">El calor marca estacions per sota de la mitjana de la ciutat. La mida del punt reflecteix la capacitat de l'estació.</p>
      </aside>
    </section>
    <section id="timeline"></section>
    <section>
      <h2>Barris</h2>
      <p class="section-note">Clica una columna per ordenar.</p>
      <div id="barri-table"></div>
    </section>
  </main>
  <footer class="site-footer">
    <p>Font: <a href="https://opendata-ajuntament.barcelona.cat/" target="_blank" rel="noopener">Open Data BCN</a> · Bicing (B:SM)</p>
  </footer>
`;

let mode: MetricMode = "total";
let latestData: Awaited<ReturnType<typeof loadLatest>> | null = null;
let barrisData: Awaited<ReturnType<typeof loadBarris>> | null = null;
let summaryData: Awaited<ReturnType<typeof loadSummary7d>> | null = null;
let mapView: ReturnType<typeof createMap> | null = null;

function refresh() {
  if (!latestData || !barrisData || !mapView) return;
  mapView.update(mode, barrisData.barris, latestData.stations);
  renderBarriTable(document.getElementById("barri-table")!, barrisData.barris, mode);
  const note = document.getElementById("legend-note")!;
  note.textContent =
    mode === "docks"
      ? "Calor = estacions amb menys ancoratges lliures que la mitjana. Punts = estacions."
      : mode === "ebike"
        ? "Calor = estacions amb menys elèctriques que la mitjana. Punts = estacions."
        : mode === "mechanical"
          ? "Calor = estacions amb menys mecàniques que la mitjana. Punts = estacions."
          : "Calor = estacions amb menys bicis que la mitjana. Punts = estacions.";
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
    renderKpis(document.getElementById("kpis")!, latest, summary);
    mapView = createMap(document.getElementById("map")!, geo);
    refresh();
    renderHourlyHistory(document.getElementById("timeline")!, summary, latest.last_updated);
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
