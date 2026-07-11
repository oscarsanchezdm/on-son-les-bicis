import {
  bindStationDonutInPopup,
  renderCompositionPanel,
  type StationBreakdown,
} from "../lib/stationDonut";

export type CompositionCardOptions = {
  breakdown: StationBreakdown | null;
  scopeLabel: string;
};

export function renderCompositionCard(container: HTMLElement, options: CompositionCardOptions): void {
  const { breakdown, scopeLabel } = options;

  if (!breakdown || breakdown.capacity <= 0) {
    container.innerHTML = `<article class="composition-card composition-card--empty">
      <p>Sense dades de composició.</p>
    </article>`;
    return;
  }

  container.innerHTML = `<article class="composition-card">
    ${renderCompositionPanel(breakdown, {
      scopeLabel,
      clickable: !breakdown.historical,
    })}
  </article>`;

  bindStationDonutInPopup(container);
}
