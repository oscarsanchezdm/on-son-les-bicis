import type { CityUsageSnapshot, DayType, HistoryPoint } from "./history";
import { dayTypeLabel, madridDayType } from "./history";
import { formatHour } from "./format";

export type HourlyUsagePoint = { hour: number; value: number };

export type UsageMetrics = {
  headline: number;
  headlineLabel: string;
  byHour: HourlyUsagePoint[];
  /** Només en mode dades actuals: mitjana mateix tipus de dia + avui. */
  hourlyDual?: {
    avgByHour: HourlyUsagePoint[];
    todayByHour: HourlyUsagePoint[];
    avgLegend: string;
    todayLegend: string;
  };
};

function parked(s: CityUsageSnapshot): number {
  return s.bikes + s.oos;
}

export function madridTodayKey(): string {
  return madridDateFromTs(new Date().toISOString());
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

/** Màxim aparcades observat per dia (disponibles + FS). */
function parkedMaxByDay(snapshots: CityUsageSnapshot[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const s of snapshots) {
    const p = parked(s);
    byDay.set(s.localDate, Math.max(byDay.get(s.localDate) ?? 0, p));
  }
  return byDay;
}

/**
 * Referència de flota per calcular l'ús.
 * Dies passats: màxim del propi dia. Dia actual (incomplet): màxim del dia anterior.
 */
function fleetMaxRefByDay(
  parkedMax: Map<string, number>,
  today: string
): Map<string, number> {
  const ref = new Map<string, number>();
  const dates = [...parkedMax.keys()].sort();
  let lastCompleteMax = 0;

  for (const date of dates) {
    const raw = parkedMax.get(date) ?? 0;
    if (date < today) {
      ref.set(date, raw);
      lastCompleteMax = raw;
    } else if (date === today) {
      ref.set(date, lastCompleteMax > 0 ? lastCompleteMax : raw);
    } else {
      ref.set(date, raw);
    }
  }
  return ref;
}

function previousDayParkedMax(snapshots: CityUsageSnapshot[], today: string): number {
  const parkedMax = parkedMaxByDay(snapshots);
  const prevDate = [...parkedMax.keys()].filter((d) => d < today).sort().at(-1);
  return prevDate ? (parkedMax.get(prevDate) ?? 0) : 0;
}

type SnapshotWithUsage = CityUsageSnapshot & { inUse: number };

function attachUsage(
  snapshots: CityUsageSnapshot[],
  fleetScope: CityUsageSnapshot[]
): SnapshotWithUsage[] {
  const today = madridTodayKey();
  const fleetMax = fleetMaxRefByDay(parkedMaxByDay(fleetScope), today);
  return snapshots.map((s) => {
    const fleetRef = fleetMax.get(s.localDate) ?? parked(s);
    return { ...s, inUse: Math.max(0, fleetRef - parked(s)) };
  });
}

function avgByHour(points: SnapshotWithUsage[]): HourlyUsagePoint[] {
  const buckets = new Map<number, number[]>();
  for (const p of points) {
    const arr = buckets.get(p.localHour) ?? [];
    arr.push(p.inUse);
    buckets.set(p.localHour, arr);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, vals]) => ({
      hour,
      value: Math.round(vals.reduce((sum, v) => sum + v, 0) / vals.length),
    }));
}

/** Un punt per hora avui (mitjana si n'hi ha més d'un). */
function todayByHour(points: SnapshotWithUsage[]): HourlyUsagePoint[] {
  return avgByHour(points);
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
  options: { highlightHour?: number; today?: string }
): UsageMetrics | null {
  if (!snapshots.length) return null;

  const withUsage = attachUsage(snapshots, snapshots);
  const byHour = avgByHour(withUsage);

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

  return { headline, headlineLabel, byHour };
}

export function computeUsageHourlyLatest(
  fleetScope: CityUsageSnapshot[],
  sameDayTypeHistory: CityUsageSnapshot[],
  today = madridTodayKey()
): UsageMetrics["hourlyDual"] | null {
  const todaySnaps = fleetScope.filter((s) => s.localDate === today);
  const histSnaps = sameDayTypeHistory.filter((s) => s.localDate !== today);
  if (!todaySnaps.length && !histSnaps.length) return null;

  const todayUsage = attachUsage(todaySnaps, fleetScope);
  const histUsage = attachUsage(histSnaps, histSnaps);

  const dayType = madridDayType();
  return {
    avgByHour: avgByHour(histUsage),
    todayByHour: todayByHour(todayUsage),
    avgLegend: `Mitjana ${dayTypeLabel(dayType)}`,
    todayLegend: "Avui",
  };
}

/** Estimació puntual des de totals vius (ciutat). */
export function usageFromLiveTotals(
  bikes: number,
  oos: number,
  snapshots: CityUsageSnapshot[]
): number {
  const parkedNow = bikes + oos;
  const today = madridTodayKey();
  const prevMax = previousDayParkedMax(snapshots, today);
  const fleetRef = prevMax > 0 ? prevMax : Math.max(parkedNow, ...snapshots.map(parked));
  return Math.max(0, fleetRef - parkedNow);
}
