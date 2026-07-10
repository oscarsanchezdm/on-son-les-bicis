import type { Summary7d } from "../lib/history";
import { formatHour, formatPct } from "../lib/format";

export function renderHourlyHistory(
  container: HTMLElement,
  summary: Summary7d | null,
  currentTs: string
): void {
  const currentHour = new Date(currentTs).getHours();
  const hourly = summary?.hourly ?? [];
  const bucket = hourly.find((h) => h.hour === currentHour);
  const selectedHour = bucket?.hour ?? currentHour;

  container.innerHTML = `
    <section class="timeline">
      <h2>Comparativa horària (7 dies)</h2>
      <p class="timeline-note">
        Per cada hora del dia, mitjana de disponibilitat dels darrers 7 dies.
        Compara «ahir a les 7» amb la mitjana setmanal a aquella hora.
      </p>
      <label class="hour-picker">
        Hora del dia
        <input type="range" id="hour-range" min="0" max="23" value="${selectedHour}" />
        <strong id="hour-label">${formatHour(selectedHour)}</strong>
      </label>
      <div id="hourly-detail" class="hourly-detail"></div>
      <h3 class="hourly-subtitle">Mitjana per hora (7 dies)</h3>
      <div class="timeline-bars hourly-overview">
        ${hourly
          .map(
            (h) => `
          <button type="button" class="timeline-bar hourly-bar ${h.hour === selectedHour ? "active" : ""}" data-hour="${h.hour}" title="${formatHour(h.hour)}">
            <div class="timeline-fill" style="height:${Math.max(4, h.avg_pct_bikes)}%"></div>
            <span>${formatHour(h.hour)}</span>
            <small>${formatPct(h.avg_pct_bikes)}</small>
          </button>`
          )
          .join("")}
      </div>
    </section>
  `;

  const renderDetail = (hour: number) => {
    const b = hourly.find((h) => h.hour === hour);
    const detail = container.querySelector("#hourly-detail")!;
    const label = container.querySelector("#hour-label")!;
    label.textContent = formatHour(hour);

    container.querySelectorAll(".hourly-bar").forEach((el) => {
      el.classList.toggle("active", Number((el as HTMLElement).dataset.hour) === hour);
    });

    if (!b || !b.samples.length) {
      detail.innerHTML = `<p class="timeline-delta">Encara no hi ha prou dades per a les ${formatHour(hour)}.</p>`;
      return;
    }

    const rows = b.samples
      .map(
        (s) => `
      <tr>
        <td>${s.date}</td>
        <td>${formatPct(s.pct_bikes)}</td>
        <td>${formatPct(s.pct_mechanical)}</td>
        <td>${formatPct(s.pct_ebike)}</td>
      </tr>`
      )
      .join("");

    detail.innerHTML = `
      <p class="timeline-delta">
        Mitjana a les ${formatHour(hour)}: ${formatPct(b.avg_pct_bikes)} bicis
        · ${formatPct(b.avg_pct_mechanical)} mecàniques · ${formatPct(b.avg_pct_ebike)} elèctriques
      </p>
      <div class="table-wrap">
        <table class="barri-table hourly-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>% bicis</th>
              <th>% mecàniques</th>
              <th>% elèctriques</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  };

  renderDetail(selectedHour);

  container.querySelector<HTMLInputElement>("#hour-range")?.addEventListener("input", (e) => {
    renderDetail(Number((e.target as HTMLInputElement).value));
  });

  container.querySelectorAll(".hourly-bar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const hour = Number((btn as HTMLElement).dataset.hour);
      const range = container.querySelector<HTMLInputElement>("#hour-range");
      if (range) range.value = String(hour);
      renderDetail(hour);
    });
  });
}
