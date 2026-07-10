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

export function renderTimeSelector(container: HTMLElement, opts: TimeSelectorOptions): void {
  const { summary, currentTs, timeView, onChange } = opts;
  const currentHour = new Date(currentTs).getHours();
  const selectedHour = timeView.kind === "hour" ? timeView.hour : currentHour;
  const selectedDayType = timeView.kind === "hour" ? timeView.dayType : "weekday";
  const isLatest = timeView.kind === "latest";

  const bucket = summary?.hourly.find((h) => h.hour === selectedHour);

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
      <p class="timeline-status" id="timeline-status">
        ${isLatest ? "Mostrant dades actuals (estacions + barris)." : renderHourSummary(bucket, selectedHour, selectedDayType)}
      </p>
    </section>
  `;

  container.querySelector("#btn-latest")?.addEventListener("click", () => {
    onChange({ kind: "latest" });
  });

  container.querySelectorAll<HTMLButtonElement>(".day-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dayType = btn.dataset.dayType as DayType;
      onChange({ kind: "hour", hour: selectedHour, dayType });
    });
  });

  const range = container.querySelector<HTMLInputElement>("#hour-range");
  range?.addEventListener("input", () => {
    const hour = Number(range.value);
    container.querySelector("#hour-label")!.textContent = formatHour(hour);
    onChange({ kind: "hour", hour, dayType: selectedDayType });
  });
}

function renderHourSummary(
  bucket: { avg_pct_bikes: number; avg_pct_mechanical: number; avg_pct_ebike: number; samples: unknown[] } | undefined,
  hour: number,
  dayType: DayType
): string {
  const day = dayTypeLabel(dayType);
  if (!bucket || !bucket.samples.length) {
    return `Mitjana de ${day} a les ${formatHour(hour)}: encara no hi ha prou mostres (es necessiten ~30 dies d'històric).`;
  }
  return `Mitjana de ${day} a les ${formatHour(hour)}: ${bucket.avg_pct_bikes.toFixed(1)}% bicis · ${bucket.avg_pct_mechanical.toFixed(1)}% mecàniques · ${bucket.avg_pct_ebike.toFixed(1)}% elèctriques (${bucket.samples.length} mostres, 7 dies).`;
}

export function updateTimeSelectorStatus(
  container: HTMLElement,
  timeView: TimeView,
  summary: Summary7d | null
): void {
  const status = container.querySelector("#timeline-status");
  const btn = container.querySelector("#btn-latest");
  const range = container.querySelector<HTMLInputElement>("#hour-range");
  if (!status || !btn || !range) return;

  const isLatest = timeView.kind === "latest";
  btn.classList.toggle("active", isLatest);
  range.disabled = isLatest;

  container.querySelectorAll<HTMLButtonElement>(".day-type-btn").forEach((b) => {
    const active = !isLatest && timeView.kind === "hour" && b.dataset.dayType === timeView.dayType;
    b.classList.toggle("active", active);
  });

  if (isLatest) {
    return;
  }

  const bucket = summary?.hourly.find((h) => h.hour === timeView.hour);
  void bucket;
  range.value = String(timeView.hour);
  const label = container.querySelector("#hour-label");
  if (label) label.textContent = formatHour(timeView.hour);
}
