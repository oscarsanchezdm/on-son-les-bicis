import type { Barri, LatestData } from "./data";
import { bikesOutOfService, pctBikesOutOfService, pctOosOfBikeFleet } from "./data";
import { formatDateTime, formatHour, historyFileLabel } from "./format";

const BASE = import.meta.env.BASE_URL;
const HISTORY_DAYS = 30;
const MADRID_TZ = "Europe/Madrid";

export type HistoryPoint = {
  ts: string;
  date: string;
  hour: number;
  pct_bikes: number;
  pct_mechanical: number;
  pct_ebike: number;
  pct_oos_fleet?: number;
};

export type HourlyBucket = {
  hour: number;
  avg_pct_bikes: number;
  avg_pct_mechanical: number;
  avg_pct_ebike: number;
  samples: HistoryPoint[];
};

export type Summary7d = {
  generated_at: string;
  series: HistoryPoint[];
  hourly: HourlyBucket[];
};

export type DayType = "weekday" | "friday" | "saturday" | "sunday";

export type HistoryFile = {
  key: string;
  localDate: string;
  localHour: number;
  dayType: DayType;
};

export type HistoryIndex = {
  generated_at: string;
  timezone: string;
  hoursByDayType: Record<DayType, number[]>;
  files: HistoryFile[];
};

export type TimeView =
  | { kind: "latest" }
  | { kind: "hour"; hour: number; dayType: DayType };

type HourlyBarriSnapshot = {
  barri_codi: string;
  barri_nom: string;
  bikes_total: number;
  bikes_mechanical: number;
  bikes_ebike: number;
  capacity_total: number;
  docks_available_total: number;
  pct_bikes: number;
  pct_docks_free: number;
  pct_ebike: number;
  stations_active?: number;
  stations_zero_ebike?: number;
  stations_zero_mechanical?: number;
};

export async function loadSummary7d(): Promise<Summary7d | null> {
  const res = await fetch(`${BASE}data/history/summary-7d.json`);
  if (!res.ok) return null;
  return res.json();
}

export async function loadHistoryIndex(): Promise<HistoryIndex | null> {
  const res = await fetch(`${BASE}data/history/history-index.json`);
  if (!res.ok) return null;
  return res.json();
}

async function loadHourlyGz(url: string): Promise<HourlyBarriSnapshot[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const ds = new DecompressionStream("gzip");
  const decompressed = res.body!.pipeThrough(ds);
  const text = await new Response(decompressed).text();
  const data = JSON.parse(text) as { barris?: HourlyBarriSnapshot[] };
  return data.barris ?? [];
}

export function dayTypeLabel(dayType: DayType): string {
  switch (dayType) {
    case "friday":
      return "divendres";
    case "saturday":
      return "dissabtes";
    case "sunday":
      return "diumenges";
    default:
      return "feiners (dl.–dj.)";
  }
}

export function hoursForDayType(index: HistoryIndex | null, dayType: DayType): number[] {
  return index?.hoursByDayType?.[dayType] ?? [];
}

function madridDateKey(daysAgo: number): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now.getTime() - daysAgo * 86400000));
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function filesForAverage(
  index: HistoryIndex | null,
  hour: number,
  dayType: DayType
): HistoryFile[] {
  if (!index?.files?.length) return [];
  const cutoffDates = new Set<string>();
  for (let d = 0; d < HISTORY_DAYS; d++) {
    cutoffDates.add(madridDateKey(d));
  }
  return index.files.filter(
    (f) =>
      f.dayType === dayType &&
      f.localHour === hour &&
      cutoffDates.has(f.localDate)
  );
}

function averageBarriSnapshots(samples: HourlyBarriSnapshot[]): Barri {
  const n = samples.length;
  const avg = (fn: (s: HourlyBarriSnapshot) => number) =>
    samples.reduce((sum, s) => sum + fn(s), 0) / n;

  const capacity = avg((s) => s.capacity_total);
  const mechanical = avg((s) => s.bikes_mechanical);
  const ebike = avg((s) => s.bikes_ebike);
  const bikes = avg((s) => s.bikes_total);
  const docks = avg((s) => s.docks_available_total);
  const cap = Math.round(capacity);
  const oos = bikesOutOfService(cap, Math.round(mechanical), Math.round(ebike), Math.round(docks), Math.round(bikes));

  return {
    barri_codi: samples[0]!.barri_codi,
    barri_nom: samples[0]!.barri_nom,
    stations_count: Math.round(avg((s) => s.stations_active ?? 0)),
    stations_active: Math.round(avg((s) => s.stations_active ?? 0)),
    capacity_total: cap,
    docks_available_total: Math.round(docks),
    bikes_mechanical: Math.round(mechanical),
    bikes_ebike: Math.round(ebike),
    bikes_total: Math.round(bikes),
    pct_bikes: cap > 0 ? Math.round((100 * bikes) / cap * 100) / 100 : 0,
    pct_docks_free: cap > 0 ? Math.round((100 * docks) / cap * 100) / 100 : 0,
    pct_mechanical: cap > 0 ? Math.round((100 * mechanical) / cap * 100) / 100 : 0,
    pct_ebike: cap > 0 ? Math.round((100 * ebike) / cap * 100) / 100 : 0,
    stations_zero_ebike: Math.round(avg((s) => s.stations_zero_ebike ?? 0)),
    stations_zero_mechanical: Math.round(avg((s) => s.stations_zero_mechanical ?? 0)),
    stations_zero_any: 0,
    bikes_out_of_service: oos,
    pct_bikes_out_of_service: pctBikesOutOfService(
      cap,
      Math.round(mechanical),
      Math.round(ebike),
      Math.round(docks),
      Math.round(bikes)
    ),
    superficie_ha: null,
  };
}

/** Average barri metrics for local hour and day-type across stored history (30 days). */
export async function loadBarriHourlyAverage(
  index: HistoryIndex | null,
  hour: number,
  dayType: DayType
): Promise<Barri[]> {
  const matches = filesForAverage(index, hour, dayType);
  const byCode = new Map<string, HourlyBarriSnapshot[]>();

  for (const file of matches) {
    const url = `${BASE}data/history/hourly/${file.key}.json.gz`;
    const barris = await loadHourlyGz(url);
    for (const b of barris) {
      const list = byCode.get(b.barri_codi) ?? [];
      list.push(b);
      byCode.set(b.barri_codi, list);
    }
  }

  return [...byCode.values()]
    .map(averageBarriSnapshots)
    .sort((a, b) => a.barri_nom.localeCompare(b.barri_nom, "ca"));
}

export function barrisToLatestData(barris: Barri[], lastUpdated: string): LatestData {
  const capacity = barris.reduce((s, b) => s + b.capacity_total, 0);
  const bikes = barris.reduce((s, b) => s + b.bikes_total, 0);
  const mechanical = barris.reduce((s, b) => s + b.bikes_mechanical, 0);
  const ebike = barris.reduce((s, b) => s + b.bikes_ebike, 0);
  const docks = barris.reduce((s, b) => s + b.docks_available_total, 0);
  const stationsActive = barris.reduce((s, b) => s + b.stations_active, 0);
  const zeroEbike = barris.reduce((s, b) => s + b.stations_zero_ebike, 0);
  const zeroMech = barris.reduce((s, b) => s + (b.stations_zero_mechanical ?? 0), 0);
  const zeroAny = barris.reduce((s, b) => s + b.stations_zero_any, 0);
  const oos = bikesOutOfService(capacity, mechanical, ebike, docks, bikes);

  return {
    last_updated: lastUpdated,
    totals: {
      capacity,
      bikes_total: bikes,
      bikes_mechanical: mechanical,
      bikes_ebike: ebike,
      docks_available: docks,
      stations_active: stationsActive,
      stations_zero_ebike: zeroEbike,
      stations_zero_mechanical: zeroMech,
      stations_zero_any: zeroAny,
      pct_bikes: capacity ? Math.round((100 * bikes) / capacity * 100) / 100 : 0,
      pct_docks_free: capacity ? Math.round((100 * docks) / capacity * 100) / 100 : 0,
      pct_mechanical: capacity ? Math.round((100 * mechanical) / capacity * 100) / 100 : 0,
      pct_ebike: capacity ? Math.round((100 * ebike) / capacity * 100) / 100 : 0,
      bikes_out_of_service: oos,
      pct_bikes_out_of_service: pctBikesOutOfService(capacity, mechanical, ebike, docks, bikes),
      worst_barri: null,
    },
    stations: [],
  };
}

export function hourViewScopeLabel(hour: number, dayType: DayType): string {
  return `mitjana ${dayTypeLabel(dayType)} a les ${formatHour(hour)}`;
}

export type SparklineMetricKey = "pct_bikes" | "pct_mechanical" | "pct_ebike" | "pct_oos_fleet";

export type ChartPoint = { label: string; value: number; ts?: string; key?: string };

export const CHART_DETAIL_HOURS = 24;

export function historyCutoffKey(hours: number): string {
  const cutoff = Date.now() - hours * 3_600_000;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(cutoff));
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  const h = parts.find((p) => p.type === "hour")!.value;
  return `${y}-${m}-${d}-${h}`;
}

/** Keep chart detail points from the last N hours when timestamps are available. */
export function filterChartPointsLast24h(
  points: ChartPoint[],
  hours = CHART_DETAIL_HOURS
): ChartPoint[] {
  const cutoffMs = Date.now() - hours * 3_600_000;
  const cutoffKey = historyCutoffKey(hours);
  const filtered = points.filter((p) => {
    if (p.ts) return new Date(p.ts).getTime() >= cutoffMs;
    if (p.key) return p.key >= cutoffKey;
    return false;
  });
  return filtered.length ? filtered : points;
}

export function sparklineChartPoints(
  series: HistoryPoint[],
  key: SparklineMetricKey,
  maxPoints = 96
): ChartPoint[] {
  return series.slice(-maxPoints).flatMap((p) => {
    const value = p[key];
    if (value === undefined) return [];
    const label = p.ts ? formatDateTime(p.ts) : `${p.date} ${formatHour(p.hour)}`;
    return [{ label, value, ts: p.ts }];
  });
}

export function sparklineValues(
  series: HistoryPoint[],
  key: SparklineMetricKey,
  maxPoints = 48
): number[] {
  return sparklineChartPoints(series, key, maxPoints).map((p) => p.value);
}

export function labeledChartPoints(
  labels: string[],
  values: number[],
  keys?: string[]
): ChartPoint[] {
  return labels.map((label, i) => ({
    label,
    value: values[i] ?? 0,
    key: keys?.[i],
  }));
}

export function hourlyAverage(
  summary: Summary7d | null,
  hour: number,
  key: keyof Pick<HistoryPoint, "pct_bikes" | "pct_mechanical" | "pct_ebike">
): number | null {
  const bucket = summary?.hourly.find((h) => h.hour === hour);
  if (!bucket) return null;
  if (key === "pct_bikes") return bucket.avg_pct_bikes;
  if (key === "pct_mechanical") return bucket.avg_pct_mechanical;
  return bucket.avg_pct_ebike;
}

export function isHistoricalView(view: TimeView): view is Extract<TimeView, { kind: "hour" }> {
  return view.kind === "hour";
}

export function currentMadridHour(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MADRID_TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")!.value);
}

export function sampleCountForView(
  index: HistoryIndex | null,
  view: Extract<TimeView, { kind: "hour" }>
): number {
  return filesForAverage(index, view.hour, view.dayType).length;
}

export type BarriSparklineSeries = {
  labels: string[];
  keys: string[];
  pct_bikes: number[];
  pct_mechanical: number[];
  pct_ebike: number[];
  pct_oos_fleet: number[];
};

/** Recent hourly snapshots for one barri (for KPI sparklines). */
export async function loadBarriSparklineSeries(
  index: HistoryIndex | null,
  barriCodi: string
): Promise<BarriSparklineSeries | null> {
  if (!index?.files?.length) return null;

  const pct_bikes: number[] = [];
  const pct_mechanical: number[] = [];
  const pct_ebike: number[] = [];
  const pct_oos_fleet: number[] = [];
  const labels: string[] = [];
  const keys: string[] = [];

  for (const file of [...index.files].sort((a, b) => a.key.localeCompare(b.key))) {
    const url = `${BASE}data/history/hourly/${file.key}.json.gz`;
    const barris = await loadHourlyGz(url);
    const b = barris.find((x) => x.barri_codi === barriCodi);
    if (!b || b.capacity_total <= 0) continue;
    const oos = bikesOutOfService(
      b.capacity_total,
      b.bikes_mechanical,
      b.bikes_ebike,
      b.docks_available_total,
      b.bikes_total
    );
    labels.push(historyFileLabel(file.key));
    keys.push(file.key);
    pct_bikes.push(b.pct_bikes);
    pct_mechanical.push((100 * b.bikes_mechanical) / b.capacity_total);
    pct_ebike.push(b.pct_ebike);
    pct_oos_fleet.push(pctOosOfBikeFleet(b.bikes_total, oos));
  }

  if (!pct_bikes.length) return null;
  return { labels, keys, pct_bikes, pct_mechanical, pct_ebike, pct_oos_fleet };
}

/** Recent hourly city totals (for KPI sparklines when no barri is selected). */
export async function loadCitySparklineSeries(
  index: HistoryIndex | null
): Promise<BarriSparklineSeries | null> {
  if (!index?.files?.length) return null;

  const pct_bikes: number[] = [];
  const pct_mechanical: number[] = [];
  const pct_ebike: number[] = [];
  const pct_oos_fleet: number[] = [];
  const labels: string[] = [];
  const keys: string[] = [];

  for (const file of [...index.files].sort((a, b) => a.key.localeCompare(b.key))) {
    const url = `${BASE}data/history/hourly/${file.key}.json.gz`;
    const barris = await loadHourlyGz(url);
    if (!barris.length) continue;

    let capacity = 0;
    let bikes = 0;
    let mechanical = 0;
    let ebike = 0;
    let docks = 0;
    for (const b of barris) {
      capacity += b.capacity_total;
      bikes += b.bikes_total;
      mechanical += b.bikes_mechanical;
      ebike += b.bikes_ebike;
      docks += b.docks_available_total;
    }
    if (capacity <= 0) continue;

    const oos = bikesOutOfService(capacity, mechanical, ebike, docks, bikes);
    labels.push(historyFileLabel(file.key));
    keys.push(file.key);
    pct_bikes.push((100 * bikes) / capacity);
    pct_mechanical.push((100 * mechanical) / capacity);
    pct_ebike.push((100 * ebike) / capacity);
    pct_oos_fleet.push(pctOosOfBikeFleet(bikes, oos));
  }

  if (!pct_bikes.length) return null;
  return { labels, keys, pct_bikes, pct_mechanical, pct_ebike, pct_oos_fleet };
}
