import {
  currentMadridHour,
  dayTypeLabel,
  hoursForDayType,
  hourViewScopeLabel,
  type DayType,
  type HistoryIndex,
  type TimeView,
} from "../lib/history";
import { formatHour } from "../lib/format";
import {
  bindStationDonutInPopup,
  renderCompositionPanel,
  type StationBreakdown,
} from "../lib/stationDonut";

export type TimeSelectorOptions = {
  index: HistoryIndex | null;
  timeView: TimeView;
  onChange: (view: TimeView) => void;
  composition?: StationBreakdown | null;
  compositionScope?: string;
  showClearStation?: boolean;
  replayPlaying?: boolean;
  replaySpeed?: 1 | 2;
  onReplayToggle?: () => void;
  onReplayStep?: (delta: -1 | 1) => void;
  onReplaySpeedToggle?: () => void;
  onClearStation?: () => void;
};

const DAY_TYPES: { id: DayType; label: string }[] = [
  { id: "weekday", label: "dl–dj" },
  { id: "friday", label: "dv" },
  { id: "saturday", label: "ds" },
  { id: "sunday", label: "dg" },
];

type TimelineState = {
  index: HistoryIndex | null;
  view: TimeView;
  onChange: (view: TimeView) => void;
  composition: StationBreakdown | null;
  compositionScope: string;
  showClearStation: boolean;
  replayPlaying: boolean;
  replaySpeed: 1 | 2;
  onReplayToggle: (() => void) | null;
  onReplayStep: ((delta: -1 | 1) => void) | null;
  onReplaySpeedToggle: (() => void) | null;
  onClearStation: (() => void) | null;
};

let timelineState: TimelineState | null = null;

function defaultHour(index: HistoryIndex | null, dayType: DayType): number {
  const hours = hoursForDayType(index, dayType);
  if (!hours.length) return currentMadridHour();
  const now = currentMadridHour();
  if (hours.includes(now)) return now;
  return hours[hours.length - 1]!;
}

function hourOptions(index: HistoryIndex | null, dayType: DayType, selectedHour: number): string {
  const hours = hoursForDayType(index, dayType);
  if (!hours.length) {
    return `<option value="" disabled selected>Sense dades per aquest tipus de dia</option>`;
  }
  return hours
    .map((h) => `<option value="${h}" ${h === selectedHour ? "selected" : ""}>${formatHour(h)}</option>`)
    .join("");
}

function replayControlsHtml(isLatest: boolean, playing: boolean, speed: 1 | 2): string {
  if (isLatest) return "";
  const playLabel = playing ? "Pausa el replay" : "Reprodueix hora a hora";
  const playIcon = playing ? "❚❚" : "▶";
  return `<div class="replay-controls" role="group" aria-label="Replay de franja horària">
    <button type="button" id="replay-prev" class="replay-btn" aria-label="Hora anterior">◀</button>
    <button type="button" id="replay-play" class="replay-btn replay-btn--play ${playing ? "active" : ""}" aria-label="${playLabel}" aria-pressed="${playing}">${playIcon}</button>
    <button type="button" id="replay-next" class="replay-btn" aria-label="Hora següent">▶</button>
    <button type="button" id="replay-speed" class="replay-btn replay-btn--speed" aria-label="Velocitat de reproducció">${speed}×</button>
  </div>`;
}

function compositionHtml(
  breakdown: StationBreakdown | null,
  scope: string,
  showClearStation: boolean
): string {
  if (!breakdown || breakdown.capacity <= 0) {
    return `<div class="timeline-composition timeline-composition--empty"><p>Sense dades de composició.</p></div>`;
  }
  return renderCompositionPanel(breakdown, {
    scopeLabel: scope,
    showClearStation,
    clickable: !breakdown.historical,
  });
}

function paintTimeline(container: HTMLElement, opts: TimeSelectorOptions) {
  const { index, timeView } = opts;
  const isLatest = timeView.kind === "latest";
  const selectedDayType = timeView.kind === "hour" ? timeView.dayType : "weekday";
  const selectedHour = timeView.kind === "hour" ? timeView.hour : defaultHour(index, selectedDayType);
  const hours = isLatest ? [] : hoursForDayType(index, selectedDayType);
  const playing = opts.replayPlaying ?? false;
  const speed = opts.replaySpeed ?? 1;

  container.innerHTML = `
    <section class="timeline">
      <div class="timeline-head">
        <h2>Franja horària</h2>
        <span class="timeline-badge" id="timeline-badge" hidden></span>
      </div>
      <div class="time-controls">
        <button type="button" id="btn-latest" class="time-btn ${isLatest ? "active" : ""}">
          Dades actuals
        </button>
        <div class="day-type-toggle" role="group" aria-label="Tipus de dia">
          ${DAY_TYPES.map(
            (d) =>
              `<button type="button" class="day-type-btn ${!isLatest && selectedDayType === d.id ? "active" : ""}" data-day-type="${d.id}" ${hoursForDayType(index, d.id).length === 0 ? 'title="Encara no hi ha dades"' : ""}>${d.label}</button>`
          ).join("")}
        </div>
        <label class="hour-select-label">
          Mitjana a les
          <select id="hour-select" class="time-select" ${isLatest || !hours.length ? "disabled" : ""}>
            ${isLatest ? `<option value="">—</option>` : hourOptions(index, selectedDayType, selectedHour)}
          </select>
        </label>
      </div>
      ${replayControlsHtml(isLatest, playing, speed)}
      <div id="timeline-composition-host">
        ${compositionHtml(opts.composition ?? null, opts.compositionScope ?? "Barcelona", opts.showClearStation ?? false)}
      </div>
    </section>
  `;

  bindStationDonutInPopup(container);
}

function readHour(container: HTMLElement, dayType: DayType): number {
  const select = container.querySelector<HTMLSelectElement>("#hour-select");
  if (select?.value) return Number(select.value);
  const view = timelineState?.view;
  if (view?.kind === "hour") return view.hour;
  return defaultHour(timelineState?.index ?? null, dayType);
}

function syncTimelineControls(container: HTMLElement, opts: TimeSelectorOptions) {
  const { index, timeView } = opts;
  const isLatest = timeView.kind === "latest";
  const selectedDayType = timeView.kind === "hour" ? timeView.dayType : "weekday";
  const selectedHour = timeView.kind === "hour" ? timeView.hour : defaultHour(index, selectedDayType);
  const hours = hoursForDayType(index, selectedDayType);
  const playing = opts.replayPlaying ?? false;
  const speed = opts.replaySpeed ?? 1;

  container.querySelector("#btn-latest")?.classList.toggle("active", isLatest);
  container.querySelectorAll<HTMLButtonElement>(".day-type-btn").forEach((b) => {
    const active = !isLatest && b.dataset.dayType === selectedDayType;
    b.classList.toggle("active", active);
  });

  const select = container.querySelector<HTMLSelectElement>("#hour-select");
  if (select) {
    select.disabled = isLatest || !hours.length;
    if (!isLatest) {
      select.innerHTML = hourOptions(index, selectedDayType, selectedHour);
    }
  }

  const replayHost = container.querySelector(".replay-controls");
  const replayHtml = replayControlsHtml(isLatest, playing, speed);
  if (replayHtml) {
    if (replayHost) {
      replayHost.outerHTML = replayHtml;
    } else {
      const host = container.querySelector("#timeline-composition-host");
      host?.insertAdjacentHTML("beforebegin", replayHtml);
    }
  } else if (replayHost) {
    replayHost.remove();
  }

  const playBtn = container.querySelector<HTMLButtonElement>("#replay-play");
  if (playBtn) {
    playBtn.textContent = playing ? "❚❚" : "▶";
    playBtn.classList.toggle("active", playing);
    playBtn.setAttribute("aria-pressed", String(playing));
    playBtn.setAttribute("aria-label", playing ? "Pausa el replay" : "Reprodueix hora a hora");
  }

  const speedBtn = container.querySelector<HTMLButtonElement>("#replay-speed");
  if (speedBtn) speedBtn.textContent = `${speed}×`;

  const compositionHost = container.querySelector("#timeline-composition-host");
  if (compositionHost) {
    compositionHost.innerHTML = compositionHtml(
      opts.composition ?? null,
      opts.compositionScope ?? "Barcelona",
      opts.showClearStation ?? false
    );
    bindStationDonutInPopup(container);
  }
}

function bindTimelineEvents(container: HTMLElement) {
  if (container.dataset.bound === "1") return;
  container.dataset.bound = "1";

  container.addEventListener("click", (e) => {
    if (!timelineState) return;
    const target = e.target as HTMLElement;

    if (target.closest("#btn-latest")) {
      timelineState.onChange({ kind: "latest" });
      return;
    }

    if (target.closest("#replay-play")) {
      timelineState.onReplayToggle?.();
      return;
    }

    if (target.closest("#replay-prev")) {
      timelineState.onReplayStep?.(-1);
      return;
    }

    if (target.closest("#replay-next")) {
      timelineState.onReplayStep?.(1);
      return;
    }

    if (target.closest("#replay-speed")) {
      timelineState.onReplaySpeedToggle?.();
      return;
    }

    if (target.closest("#composition-clear-station")) {
      timelineState.onClearStation?.();
      return;
    }

    const dayBtn = target.closest<HTMLButtonElement>("[data-day-type]");
    if (dayBtn?.dataset.dayType) {
      const dayType = dayBtn.dataset.dayType as DayType;
      const hours = hoursForDayType(timelineState.index, dayType);
      if (!hours.length) return;
      const hour = readHour(container, dayType);
      const picked = hours.includes(hour) ? hour : defaultHour(timelineState.index, dayType);
      timelineState.onChange({ kind: "hour", hour: picked, dayType });
    }
  });

  container.addEventListener("change", (e) => {
    if (!timelineState) return;
    const select = (e.target as HTMLElement).closest<HTMLSelectElement>("#hour-select");
    if (!select) return;
    const view = timelineState.view;
    const dayType = view.kind === "hour" ? view.dayType : "weekday";
    timelineState.onChange({ kind: "hour", hour: Number(select.value), dayType });
  });
}

function applyTimelineState(opts: TimeSelectorOptions): void {
  timelineState = {
    index: opts.index,
    view: opts.timeView,
    onChange: opts.onChange,
    composition: opts.composition ?? null,
    compositionScope: opts.compositionScope ?? "Barcelona",
    showClearStation: opts.showClearStation ?? false,
    replayPlaying: opts.replayPlaying ?? false,
    replaySpeed: opts.replaySpeed ?? 1,
    onReplayToggle: opts.onReplayToggle ?? null,
    onReplayStep: opts.onReplayStep ?? null,
    onReplaySpeedToggle: opts.onReplaySpeedToggle ?? null,
    onClearStation: opts.onClearStation ?? null,
  };
}

export function renderTimeSelector(container: HTMLElement, opts: TimeSelectorOptions): void {
  applyTimelineState(opts);
  bindTimelineEvents(container);
  paintTimeline(container, opts);
}

export function updateTimeSelector(container: HTMLElement, opts: TimeSelectorOptions): void {
  applyTimelineState(opts);

  if (!container.querySelector("#btn-latest")) {
    paintTimeline(container, opts);
    return;
  }

  syncTimelineControls(container, opts);
}

export function setTimelineStatus(
  container: HTMLElement,
  content: string,
  _asHtml = false
): void {
  const badge = container.querySelector("#timeline-badge");
  if (!badge) return;
  if (!content) {
    badge.textContent = "";
    badge.hidden = true;
    return;
  }
  badge.textContent = content;
  badge.hidden = false;
}

export function timeViewLabel(view: TimeView, _index: HistoryIndex | null): string {
  if (view.kind === "latest") return "ciutat";
  return hourViewScopeLabel(view.hour, view.dayType);
}

export function replayStatusLabel(view: TimeView, playing: boolean): string {
  if (!playing || view.kind !== "hour") return "";
  return `▶ Replay · ${dayTypeLabel(view.dayType)} · ${formatHour(view.hour)}`;
}
