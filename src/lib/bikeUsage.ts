import type { CityUsageSnapshot, DayType, HistoryPoint } from "./history";
import { formatHour } from "./format";

export type UsageChartPoint = { label: string; value: number };

export type UsageMetrics = {
  headline: number;
  headlineLabel: string;
  byHour: UsageChartPoint[];
  byDay: UsageChartPoint[];
};

function parked(s: CityUsageSnapshot): number {
  return s.bikes + s.oos;
}

function madridDateFromTs(ts: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function dateLabel(localDate: string): string {
  const [, month, day] = localDate.split("-");
  return `${day}/${month}`;
}

export function usageFromSummarySeries(series: HistoryPoint[]): UsageMetrics | null {
  const snapshots: CityUsageSnapshot[] = series
    .filter((p) => p.bikes_total !== undefined)
    .map((p) => ({
      ts: p.ts,
      localDate: madridDateFromTs(p.ts),
      localHour: p.hour,
      dayType: "weekday" as DayType,
      bikes: p.bikes_total ?? 0,
      oos: p.bikes_out_of_service ?? 0,
    }));

  return computeUsageMetrics(snapshots, {});
}

export function computeUsageMetrics(
  snapshots: CityUsageSnapshot[],
  options: { highlightHour?: number }
): UsageMetrics | null {
  if (!snapshots.length) return null;

  const byDay = new Map<string, CityUsageSnapshot[]>();
  for (const s of snapshots) {
    const list = byDay.get(s.localDate) ?? [];
    list.push(s);
    byDay.set(s.localDate, list);
  }

  const dayFleetMax = new Map<string, number>();
  for (const [date, snaps] of byDay) {
    dayFleetMax.set(date, Math.max(...snaps.map(parked)));
  }

  const withUsage = snapshots.map((s) => {
    const fleetMax = dayFleetMax.get(s.localDate) ?? parked(s);
    const parkedNow = parked(s);
    return {
      ...s,
      inUse: Math.max(0, fleetMax - parkedNow),
    };
  });

  const hourBuckets = new Map<number, number[]>();
  for (const p of withUsage) {
    const arr = hourBuckets.get(p.localHour) ?? [];
    arr.push(p.inUse);
    hourBuckets.set(p.localHour, arr);
  }

  const byHour = [...hourBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, vals]) => ({
      label: formatHour(hour),
      value: Math.round(vals.reduce((sum, v) => sum + v, 0) / vals.length),
    }));

  const dayPeak = new Map<string, number>();
  for (const p of withUsage) {
    dayPeak.set(p.localDate, Math.max(dayPeak.get(p.localDate) ?? 0, p.inUse));
  }

  const byDayChart = [...dayPeak.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({
      label: dateLabel(date),
      value: Math.round(value),
    }));

  let headline = 0;
  let headlineLabel = "Ara (aprox.)";

  if (options.highlightHour !== undefined) {
    const atHour = withUsage.filter((p) => p.localHour === options.highlightHour);
    headline = atHour.length
      ? Math.round(atHour.reduce((sum, p) => sum + p.inUse, 0) / atHour.length)
      : 0;
    headlineLabel = `Mitjana a les ${formatHour(options.highlightHour)}`;
  } else {
    const latest = [...withUsage].sort((a, b) => a.ts.localeCompare(b.ts)).at(-1);
    headline = latest ? Math.round(latest.inUse) : 0;
  }

  return { headline, headlineLabel, byHour, byDay: byDayChart };
}

/** Estimació puntual des de totals vius (ciutat). */
export function usageFromLiveTotals(
  bikes: number,
  oos: number,
  daySnapshots: CityUsageSnapshot[]
): number {
  const parkedNow = bikes + oos;
  const today = madridDateFromTs(new Date().toISOString());
  const todaySnaps = daySnapshots.filter((s) => s.localDate === today);
  const source = todaySnaps.length ? todaySnaps : daySnapshots;
  const dayMax = Math.max(parkedNow, ...source.map(parked));
  return Math.max(0, dayMax - parkedNow);
}
