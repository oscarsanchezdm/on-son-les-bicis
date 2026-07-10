import type { Summary7d, TimeView } from "../lib/history";
import { formatHour } from "../lib/format";

export type TimeSelectorOptions = {
  summary: Summary7d | null;
  currentTs: string;
  timeView: TimeView;
  onChange: (view: TimeView) => void;
};

export function renderTimeSelector(container: HTMLElement, opts: TimeSelectorOptions): void {
  const { summary, currentTs, timeView, onChange } = opts;
  const currentHour = new Date(currentTs).getHours();
  const selectedHour = timeView.kind === "hour" ? timeView.hour : currentHour;
  const isLatest = timeView.kind === "latest";

  const bucket = summary?.hourly.find((h) => h.hour === selectedHour);

  container.innerHTML = `
    <section class="timeline">
      <h2>Franja horària</h2>
      <p class="timeline-note">
        Compara la disponibilitat actual amb la mitjana dels darrers 7 dies a la mateixa hora del dia.
      </p>
      <div class="time-controls">
        <button type="button" id="btn-latest" class="time-btn ${isLatest ? "active" : ""}">
          Dades recents
        </button>
        <label class="hour-picker">
          Mitjana 7 dies a les
          <input type="range" id="hour-range" min="0" max="23" value="${selectedHour}" />
          <strong id="hour-label">${formatHour(selectedHour)}</strong>
        </label>
      </div>
      <p class="timeline-status" id="timeline-status">
        ${isLatest ? "Mostrant dades en temps quasi real (estacions + barris)." : renderHourSummary(bucket, selectedHour)}
      </p>
    </section>
  `;

  container.querySelector("#btn-latest")?.addEventListener("click", () => {
    onChange({ kind: "latest" });
  });

  const range = container.querySelector<HTMLInputElement>("#hour-range");
  range?.addEventListener("input", () => {
    const hour = Number(range.value);
    container.querySelector("#hour-label")!.textContent = formatHour(hour);
    onChange({ kind: "hour", hour });
  });
}

function renderHourSummary(
  bucket: { avg_pct_bikes: number; avg_pct_mechanical: number; avg_pct_ebike: number; samples: unknown[] } | undefined,
  hour: number
): string {
  if (!bucket || !bucket.samples.length) {
    return `Mitjana 7 dies a les ${formatHour(hour)}: encara no hi ha prou mostres.`;
  }
  return `Mitjana 7 dies a les ${formatHour(hour)}: ${bucket.avg_pct_bikes.toFixed(1)}% bicis · ${bucket.avg_pct_mechanical.toFixed(1)}% mecàniques · ${bucket.avg_pct_ebike.toFixed(1)}% elèctriques (${bucket.samples.length} mostres).`;
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
  range.disabled = false;

  if (isLatest) {
    status.textContent = "Mostrant dades en temps quasi real (estacions + barris).";
    return;
  }

  const bucket = summary?.hourly.find((h) => h.hour === timeView.hour);
  status.textContent = renderHourSummary(bucket, timeView.hour);
  range.value = String(timeView.hour);
  const label = container.querySelector("#hour-label");
  if (label) label.textContent = formatHour(timeView.hour);
}
