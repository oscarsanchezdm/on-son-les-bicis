import {
  bindStationDonutInPopup,
  renderCompositionPanel,
  type StationBreakdown,
} from "../lib/stationDonut";

export type CompositionCardOptions = {
  breakdown: StationBreakdown | null;
  scopeLabel: string;
  showClearStation?: boolean;
  onClearStation?: () => void;
};

function bindClearStation(container: HTMLElement, onClearStation?: () => void): void {
  const btn = container.querySelector<HTMLButtonElement>("#composition-clear-station");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => onClearStation?.());
}

export function renderCompositionCard(container: HTMLElement, options: CompositionCardOptions): void {
  const { breakdown, scopeLabel, showClearStation } = options;

  if (!breakdown || breakdown.capacity <= 0) {
    container.innerHTML = `<article class="composition-card composition-card--empty">
      <p>Sense dades de composició.</p>
    </article>`;
    return;
  }

  container.innerHTML = `<article class="composition-card">
    ${renderCompositionPanel(breakdown, {
      scopeLabel,
      showClearStation,
      clickable: !breakdown.historical,
    })}
  </article>`;

  bindStationDonutInPopup(container);
  bindClearStation(container, options.onClearStation);
}
