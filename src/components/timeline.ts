import { loadDailyHistory } from "../lib/data";
import { formatDateTime, formatPct } from "../lib/format";

export async function renderTimeline(container: HTMLElement, currentTs: string): Promise<void> {
  const current = new Date(currentTs);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(current);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const series: Array<{ day: string; pct: number; ts: string }> = [];
  for (const day of days) {
    const entries = await loadDailyHistory(day);
    if (!entries.length) continue;
    const closest = entries[entries.length - 1] as { ts: string; pct_bikes: number };
    series.push({ day, pct: Number(closest.pct_bikes ?? 0), ts: String(closest.ts) });
  }

  const compareDay = days[0];
  const compareEntries = await loadDailyHistory(compareDay);
  let comparePct: number | null = null;
  if (compareEntries.length) {
    const ref = compareEntries[compareEntries.length - 1] as { pct_bikes: number };
    comparePct = Number(ref.pct_bikes ?? 0);
  }
  const currentPct = series.length ? series[series.length - 1].pct : 0;
  const delta = comparePct !== null ? currentPct - comparePct : null;

  container.innerHTML = `
    <section class="timeline">
      <h2>Històric (7 dies)</h2>
      <p class="timeline-note">Percentatge de bicis disponibles a la ciutat. Compara amb fa 7 dies.</p>
      <div class="timeline-bars">
        ${series
          .map(
            (s) => `
          <div class="timeline-bar" title="${formatDateTime(s.ts)}">
            <div class="timeline-fill" style="height:${Math.max(4, s.pct)}%"></div>
            <span>${s.day.slice(5)}</span>
            <small>${formatPct(s.pct)}</small>
          </div>`
          )
          .join("")}
      </div>
      ${
        delta !== null
          ? `<p class="timeline-delta ${delta < 0 ? "negative" : "positive"}">
        ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} punts vs fa 7 dies
      </p>`
          : "<p class=\"timeline-delta\">Encara no hi ha prou històric publicat.</p>"
      }
    </section>
  `;
}
