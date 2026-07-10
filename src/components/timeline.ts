import {
  currentMadridHour,
  dayTypeLabel,
  hoursForDayType,
  hourViewScopeLabel,
  sampleCountForView,
  type DayType,
  type HistoryIndex,
  type TimeView,
} from "../lib/history";
import { formatHour } from "../lib/format";

export type TimeSelectorOptions = {
  index: HistoryIndex | null;
  timeView: TimeView;
  onChange: (view: TimeView) => void;
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
};

let timelineState: TimelineState | null = null;

function defaultHour(index: HistoryIndex | null, dayType: DayType): number {
  const hours = hoursForDayType(index, dayType);
  if (!hours.length) return currentMadridHour();
  const now = currentMadridHour();
  if (hours.includes(now)) return now;
  return hours[hours.length - 1]!;
}

function defaultStatus(view: TimeView, index: HistoryIndex | null): string {
  if (view.kind === "latest") {
    return "Dades en temps real.";
  }
  const n = sampleCountForView(index, view);
  if (!n) {
    return `Sense dades per a ${hourViewScopeLabel(view.hour, view.dayType)}.`;
  }
  return `${hourViewScopeLabel(view.hour, view.dayType)} · mitjana de ${n} mostra${n === 1 ? "" : "es"} (30 dies).`;
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

function paintTimeline(container: HTMLElement, opts: TimeSelectorOptions) {
  const { index, timeView } = opts;
  const isLatest = timeView.kind === "latest";
  const selectedDayType = timeView.kind === "hour" ? timeView.dayType : "weekday";
  const selectedHour = timeView.kind === "hour" ? timeView.hour : defaultHour(index, selectedDayType);
  const hours = isLatest ? [] : hoursForDayType(index, selectedDayType);

  container.innerHTML = `
    <section class="timeline">
      <div class="timeline-head">
        <h2>Franja horària</h2>
        <p class="timeline-status" id="timeline-status">${defaultStatus(timeView, index)}</p>
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
    </section>
  `;
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

  const status = container.querySelector("#timeline-status");
  if (status) status.textContent = defaultStatus(timeView, index);
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

  if (!container.querySelector("#btn-latest")) {
    paintTimeline(container, opts);
    return;
  }

  syncTimelineControls(container, opts);
}

export function setTimelineStatus(container: HTMLElement, text: string): void {
  const status = container.querySelector("#timeline-status");
  if (status) status.textContent = text;
}

export function timeViewLabel(view: TimeView, _index: HistoryIndex | null): string {
  if (view.kind === "latest") return "ciutat";
  return hourViewScopeLabel(view.hour, view.dayType);
}
