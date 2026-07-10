import "./style.css";
import { renderBarriTable } from "./components/barriTable";
import { renderKpis } from "./components/kpi";
import { createMap } from "./components/map";
import { renderTimeline } from "./components/timeline";
import type { MetricMode } from "./lib/data";
import { loadBarris, loadBarrisGeo, loadLatest } from "./lib/data";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="site-header">
    <div>
      <p class="eyebrow">Dades obertes · Bicing Barcelona</p>
      <h1>On són les bicis?</h1>
      <p class="lede">Visualització periodística de la disponibilitat de bicicletes mecàniques i elèctriques per barri i estació.</p>
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
        <div class="legend-bar"></div>
        <p><span>Escassetat</span><span>Abundància</span></p>
        <p class="legend-note" id="legend-note">Color = % de bicis disponibles sobre ancoratges totals del barri/estació.</p>
      </aside>
    </section>
    <section id="timeline"></section>
    <section>
      <h2>Barris</h2>
      <p class="section-note">Ordenats per disponibilitat (pitjors primer). Files marcades: menys del 10% d'elèctriques.</p>
      <div id="barri-table"></div>
    </section>
  </main>
  <footer class="site-footer">
    <p>Font: <a href="https://opendata-ajuntament.barcelona.cat/" target="_blank" rel="noopener">Open Data BCN</a>. Projecte periodístic independent.</p>
  </footer>
`;

let mode: MetricMode = "total";
let latestData: Awaited<ReturnType<typeof loadLatest>> | null = null;
let barrisData: Awaited<ReturnType<typeof loadBarris>> | null = null;
let mapView: ReturnType<typeof createMap> | null = null;

function refresh() {
  if (!latestData || !barrisData || !mapView) return;
  mapView.update(mode, barrisData.barris, latestData.stations);
  renderBarriTable(document.getElementById("barri-table")!, barrisData.barris, mode);
  const note = document.getElementById("legend-note")!;
  note.textContent =
    mode === "docks"
      ? "Color = % d'ancoratges lliures (on deixar la bici)."
      : mode === "ebike"
        ? "Color = % d'elèctriques disponibles sobre ancoratges totals."
        : mode === "mechanical"
          ? "Color = % de mecàniques disponibles sobre ancoratges totals."
          : "Color = % de bicis disponibles sobre ancoratges totals.";
}

async function init() {
  try {
    const [latest, barris, geo] = await Promise.all([
      loadLatest(),
      loadBarris(),
      loadBarrisGeo(),
    ]);
    latestData = latest;
    barrisData = barris;
    renderKpis(document.getElementById("kpis")!, latest);
    mapView = createMap(document.getElementById("map")!, geo);
    refresh();
    await renderTimeline(document.getElementById("timeline")!, latest.last_updated);
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
