import {
  bindStationDonutInPopup,
  renderCompositionPanel,
  type StationBreakdown,
} from "../lib/stationDonut";

export type CompositionCardOptions = {
  breakdown: StationBreakdown | null;
  scopeLabel: string;
  backLabel?: string;
  onBack?: () => void;
};

function bindBack(container: HTMLElement, onBack?: () => void): void {
  const btn = container.querySelector<HTMLButtonElement>("#composition-back");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => onBack?.());
}

export function renderCompositionCard(container: HTMLElement, options: CompositionCardOptions): void {
  const { breakdown, scopeLabel, backLabel } = options;

  if (!breakdown || breakdown.capacity <= 0) {
    container.innerHTML = `<article class="composition-card composition-card--empty">
      <p>Sense dades de composició.</p>
    </article>`;
    return;
  }

  container.innerHTML = `<article class="composition-card">
    ${renderCompositionPanel(breakdown, {
      scopeLabel,
      backLabel,
      clickable: !breakdown.historical,
    })}
  </article>`;

  bindStationDonutInPopup(container);
  bindBack(container, options.onBack);
}
