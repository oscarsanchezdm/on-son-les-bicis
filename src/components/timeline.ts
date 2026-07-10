import { dayTypeLabel, type DayType, type Summary7d, type TimeView } from "../lib/history";
import { formatHour } from "../lib/format";

export type TimeSelectorOptions = {
  summary: Summary7d | null;
  currentTs: string;
  timeView: TimeView;
  onChange: (view: TimeView) => void;
};

const DAY_TYPES: { id: DayType; label: string }[] = [
  { id: "weekday", label: "Feiner" },
  { id: "friday", label: "Divendres" },
  { id: "saturday", label: "Dissabte" },
  { id: "sunday", label: "Diumenge" },
];

type TimelineState = {
  currentTs: string;
  view: TimeView;
  onChange: (view: TimeView) => void;
};

let timelineState: TimelineState | null = null;
let hourDebounce: ReturnType<typeof setTimeout> | null = null;

function currentHourFromTs(ts: string): number {
  return new Date(ts).getHours();
}

function readHour(container: HTMLElement): number {
  const range = container.querySelector<HTMLInputElement>("#hour-range");
  if (range && !range.disabled) return Number(range.value);
  const view = timelineState?.view;
  if (view?.kind === "hour") return view.hour;
  return currentHourFromTs(timelineState?.currentTs ?? new Date().toISOString());
}

function resolveDayType(clicked?: DayType): DayType {
  if (clicked) return clicked;
  const view = timelineState?.view;
  if (view?.kind === "hour") return view.dayType;
  return "weekday";
}

function defaultStatus(timeView: TimeView, summary: Summary7d | null, currentTs: string): string {
  if (timeView.kind === "latest") {
    return "Mostrant dades actuals (estacions + barris).";
  }
  const bucket = summary?.hourly.find((h) => h.hour === timeView.hour);
  const day = dayTypeLabel(timeView.dayType);
  if (!bucket || !bucket.samples.length) {
    return `Mitjana de ${day} a les ${formatHour(timeView.hour)}: carregant històric…`;
  }
  return `Mitjana de ${day} a les ${formatHour(timeView.hour)}: ${bucket.avg_pct_bikes.toFixed(1)}% bicis · ${bucket.avg_pct_mechanical.toFixed(1)}% mecàniques · ${bucket.avg_pct_ebike.toFixed(1)}% elèctriques (${bucket.samples.length} mostres recents, tots els dies).`;
}

function paintTimeline(
  container: HTMLElement,
  timeView: TimeView,
  summary: Summary7d | null,
  currentTs: string
) {
  const currentHour = currentHourFromTs(currentTs);
  const selectedHour = timeView.kind === "hour" ? timeView.hour : currentHour;
  const selectedDayType = timeView.kind === "hour" ? timeView.dayType : "weekday";
  const isLatest = timeView.kind === "latest";

  container.innerHTML = `
    <section class="timeline">
      <h2>Franja horària</h2>
      <p class="timeline-note">
        Compara les dades actuals amb la mitjana històrica a la mateixa hora, filtrada per tipus de dia (fins a 30 dies enrere).
      </p>
      <div class="time-controls">
        <button type="button" id="btn-latest" class="time-btn ${isLatest ? "active" : ""}">
          Dades actuals
        </button>
        <div class="day-type-toggle" role="group" aria-label="Tipus de dia">
          ${DAY_TYPES.map(
            (d) =>
              `<button type="button" class="day-type-btn ${!isLatest && selectedDayType === d.id ? "active" : ""}" data-day-type="${d.id}">${d.label}</button>`
          ).join("")}
        </div>
        <label class="hour-picker">
          Mitjana a les
          <input type="range" id="hour-range" min="0" max="23" value="${selectedHour}" ${isLatest ? "disabled" : ""} />
          <strong id="hour-label">${formatHour(selectedHour)}</strong>
        </label>
      </div>
      <p class="timeline-status" id="timeline-status">${defaultStatus(timeView, summary, currentTs)}</p>
    </section>
  `;
}

function syncTimelineControls(container: HTMLElement, timeView: TimeView) {
  const isLatest = timeView.kind === "latest";
  const selectedHour = timeView.kind === "hour" ? timeView.hour : readHour(container);
  const selectedDayType = timeView.kind === "hour" ? timeView.dayType : "weekday";

  container.querySelector("#btn-latest")?.classList.toggle("active", isLatest);

  const range = container.querySelector<HTMLInputElement>("#hour-range");
  if (range) {
    range.disabled = isLatest;
    range.value = String(selectedHour);
  }
  const label = container.querySelector("#hour-label");
  if (label) label.textContent = formatHour(selectedHour);

  container.querySelectorAll<HTMLButtonElement>(".day-type-btn").forEach((b) => {
    const active = !isLatest && b.dataset.dayType === selectedDayType;
    b.classList.toggle("active", active);
  });
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
      const hour = readHour(container);
      timelineState.onChange({ kind: "hour", hour, dayType });
    }
  });

  container.addEventListener("input", (e) => {
    if (!timelineState) return;
    const input = e.target as HTMLElement;
    if (input.id !== "hour-range" || !(input instanceof HTMLInputElement)) return;

    const hour = Number(input.value);
    container.querySelector("#hour-label")!.textContent = formatHour(hour);
    const dayType = resolveDayType();
    if (hourDebounce) clearTimeout(hourDebounce);
    hourDebounce = setTimeout(() => {
      timelineState?.onChange({ kind: "hour", hour, dayType });
    }, 200);
  });
}

export function renderTimeSelector(container: HTMLElement, opts: TimeSelectorOptions): void {
  timelineState = {
    currentTs: opts.currentTs,
    view: opts.timeView,
    onChange: opts.onChange,
  };
  bindTimelineEvents(container);
  paintTimeline(container, opts.timeView, opts.summary, opts.currentTs);
}

export function updateTimeSelectorStatus(
  container: HTMLElement,
  timeView: TimeView,
  summary: Summary7d | null,
  currentTs?: string
): void {
  if (timelineState) {
    timelineState.view = timeView;
    if (currentTs) timelineState.currentTs = currentTs;
  }

  if (!container.querySelector("#btn-latest")) {
    paintTimeline(container, timeView, summary, currentTs ?? timelineState?.currentTs ?? new Date().toISOString());
    return;
  }

  syncTimelineControls(container, timeView);
  const status = container.querySelector("#timeline-status");
  if (status) {
    status.textContent = defaultStatus(
      timeView,
      summary,
      currentTs ?? timelineState?.currentTs ?? new Date().toISOString()
    );
  }
}

export function setTimelineStatus(container: HTMLElement, text: string): void {
  const status = container.querySelector("#timeline-status");
  if (status) status.textContent = text;
}
