import {
  snapshotScopeLabel,
  type HistoryIndex,
  type TimeView,
} from "../lib/history";

export type TimeSelectorOptions = {
  index: HistoryIndex | null;
  timeView: TimeView;
  onChange: (view: TimeView) => void;
};

type TimelineState = {
  index: HistoryIndex | null;
  view: TimeView;
  onChange: (view: TimeView) => void;
};

let timelineState: TimelineState | null = null;

function selectedKey(view: TimeView): string {
  if (view.kind === "latest") return "latest";
  return view.key;
}

function defaultStatus(view: TimeView, index: HistoryIndex | null): string {
  if (view.kind === "latest") {
    return "Mostrant dades actuals (estacions + barris).";
  }
  const snap = index?.snapshots.find((s) => s.key === view.key);
  if (!snap) return "Snapshot històric no trobat.";
  return `Mostrant mitjana de barris: ${snap.label}.`;
}

function paintTimeline(container: HTMLElement, opts: TimeSelectorOptions) {
  const { index, timeView } = opts;
  const snapshots = index?.snapshots ?? [];
  const currentKey = selectedKey(timeView);

  container.innerHTML = `
    <section class="timeline">
      <div class="timeline-head">
        <h2>Franja horària</h2>
        <p class="timeline-status" id="timeline-status">${defaultStatus(timeView, index)}</p>
      </div>
      <div class="time-controls">
        <label class="time-select-label">
          Visualització
          <select id="time-view-select" class="time-select" ${snapshots.length === 0 ? "disabled" : ""}>
            <option value="latest" ${currentKey === "latest" ? "selected" : ""}>Dades actuals</option>
            ${
              snapshots.length
                ? snapshots
                    .map(
                      (s) =>
                        `<option value="${s.key}" ${currentKey === s.key ? "selected" : ""}>${s.label}</option>`
                    )
                    .join("")
                : `<option value="" disabled selected>Encara no hi ha històric</option>`
            }
          </select>
        </label>
      </div>
    </section>
  `;
}

function bindTimelineEvents(container: HTMLElement) {
  if (container.dataset.bound === "1") return;
  container.dataset.bound = "1";

  container.addEventListener("change", (e) => {
    if (!timelineState) return;
    const select = (e.target as HTMLElement).closest<HTMLSelectElement>("#time-view-select");
    if (!select) return;

    const value = select.value;
    if (value === "latest") {
      timelineState.onChange({ kind: "latest" });
      return;
    }

    const snap = timelineState.index?.snapshots.find((s) => s.key === value);
    if (!snap) return;
    timelineState.onChange({
      kind: "snapshot",
      key: snap.key,
      date: snap.date,
      hour: snap.hour,
      dayType: snap.dayType,
    });
  });
}

export function renderTimeSelector(container: HTMLElement, opts: TimeSelectorOptions): void {
  timelineState = {
    index: opts.index,
    view: opts.timeView,
    onChange: opts.onChange,
  };
  bindTimelineEvents(container);
  paintTimeline(container, opts);
}

export function updateTimeSelector(container: HTMLElement, opts: TimeSelectorOptions): void {
  if (timelineState) {
    timelineState.index = opts.index;
    timelineState.view = opts.timeView;
    timelineState.onChange = opts.onChange;
  }

  const select = container.querySelector<HTMLSelectElement>("#time-view-select");
  if (!select) {
    paintTimeline(container, opts);
    return;
  }

  const snapshots = opts.index?.snapshots ?? [];
  const currentKey = selectedKey(opts.timeView);
  select.disabled = snapshots.length === 0;
  select.innerHTML = `
    <option value="latest" ${currentKey === "latest" ? "selected" : ""}>Dades actuals</option>
    ${
      snapshots.length
        ? snapshots
            .map(
              (s) =>
                `<option value="${s.key}" ${currentKey === s.key ? "selected" : ""}>${s.label}</option>`
            )
            .join("")
        : `<option value="" disabled>Encara no hi ha històric</option>`
    }
  `;

  const status = container.querySelector("#timeline-status");
  if (status) status.textContent = defaultStatus(opts.timeView, opts.index);
}

export function setTimelineStatus(container: HTMLElement, text: string): void {
  const status = container.querySelector("#timeline-status");
  if (status) status.textContent = text;
}

export function timeViewLabel(view: TimeView, index: HistoryIndex | null): string {
  if (view.kind === "latest") return "ciutat";
  const snap = index?.snapshots.find((s) => s.key === view.key);
  return snap?.label ?? snapshotScopeLabel(view);
}
