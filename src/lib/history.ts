import type { Barri, LatestData, MetricMode, Station } from "./data";
import { bikesOutOfService, pctBikesOutOfService, pctOosOfAnchors, pctOosOfBikeFleet, pctOosFleetFromPctBikesAndAnchors } from "./data";
import { formatDateTime, formatHour, historyFileLocalLabel } from "./format";

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
  pct_oos_anchors?: number;
  /** Clau històrica (abans era % del parc de bicis). */
  pct_oos_fleet?: number;
  bikes_total?: number;
  bikes_mechanical?: number;
  bikes_ebike?: number;
  bikes_out_of_service?: number;
};

export type HourlyBucket = {
  hour: number;
  avg_pct_bikes: number;
  avg_pct_mechanical: number;
  avg_pct_ebike: number;
  avg_bikes_total?: number;
  avg_bikes_mechanical?: number;
  avg_bikes_ebike?: number;
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

/** Compact metrics per station: [mechanical, ebike, total, docks, bikes_disabled, docks_disabled?]. */
export type StationTuple = [number, number, number, number, number, number?];

type HourlySnapshot = {
  ts: string;
  barris: HourlyBarriSnapshot[];
  v?: StationTuple[];
};

export type StationIdsManifest = {
  generated_at: string;
  ids: string[];
};

const hourlyCache = new Map<string, HourlySnapshot | null>();

export async function loadStationIds(): Promise<StationIdsManifest | null> {
  const res = await fetch(`${BASE}data/station-ids.json`);
  if (!res.ok) return null;
  return res.json();
}

async function loadHourlySnapshot(key: string): Promise<HourlySnapshot | null> {
  const cached = hourlyCache.get(key);
  if (cached !== undefined) return cached;

  const url = `${BASE}data/history/hourly/${key}.json.gz`;
  const res = await fetch(url);
  if (!res.ok) {
    hourlyCache.set(key, null);
    return null;
  }
  const ds = new DecompressionStream("gzip");
  const decompressed = res.body!.pipeThrough(ds);
  const text = await new Response(decompressed).text();
  const data = JSON.parse(text) as HourlySnapshot;
  data.barris ??= [];
  hourlyCache.set(key, data);
  return data;
}

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

function averageStationTuples(samples: StationTuple[]): StationTuple {
  const n = samples.length;
  const avg = (i: number) => samples.reduce((sum, t) => sum + (t[i] ?? 0), 0) / n;
  return [
    Math.round(avg(0)),
    Math.round(avg(1)),
    Math.round(avg(2)),
    Math.round(avg(3)),
    Math.round(avg(4)),
    Math.round(avg(5)),
  ];
}

export function stationsFromAverages(
  base: Station[],
  idOrder: string[],
  averages: Map<string, StationTuple>
): Station[] {
  const byId = new Map(base.map((s) => [s.station_id, s]));
  const out: Station[] = [];

  for (const sid of idOrder) {
    const tuple = averages.get(sid);
    const s = byId.get(sid);
    if (!tuple || !s) continue;
    const [mechanical, ebike, total, docks, bikes_disabled, docks_disabled] = tuple;
    const cap = s.capacity;
    out.push({
      ...s,
      mechanical,
      ebike,
      total,
      docks_available: docks,
      bikes_disabled,
      docks_disabled: docks_disabled ?? 0,
      pct_bikes: cap > 0 ? Math.round((100 * total) / cap * 100) / 100 : 0,
      pct_docks_free: cap > 0 ? Math.round((100 * docks) / cap * 100) / 100 : 0,
    });
  }

  return out;
}

export type HourlyViewData = {
  barris: Barri[];
  stations: Station[] | null;
};

/** Average barri and station metrics for a local hour and day-type (30 days). */
export async function loadHourlyViewData(
  index: HistoryIndex | null,
  hour: number,
  dayType: DayType,
  baseStations: Station[],
  stationIds: string[] | null
): Promise<HourlyViewData> {
  const matches = filesForAverage(index, hour, dayType);
  const byCode = new Map<string, HourlyBarriSnapshot[]>();
  const byStationIdx = new Map<number, StationTuple[]>();
  const idOrder = stationIds ?? [...baseStations].sort((a, b) => a.station_id.localeCompare(b.station_id)).map((s) => s.station_id);

  for (const file of matches) {
    const snapshot = await loadHourlySnapshot(file.key);
    if (!snapshot) continue;

    for (const b of snapshot.barris) {
      const list = byCode.get(b.barri_codi) ?? [];
      list.push(b);
      byCode.set(b.barri_codi, list);
    }

    if (snapshot.v?.length) {
      for (let i = 0; i < snapshot.v.length; i++) {
        const tuple = snapshot.v[i]!;
        const list = byStationIdx.get(i) ?? [];
        list.push(tuple);
        byStationIdx.set(i, list);
      }
    }
  }

  const barris = [...byCode.values()]
    .map(averageBarriSnapshots)
    .sort((a, b) => a.barri_nom.localeCompare(b.barri_nom, "ca"));

  if (!byStationIdx.size || !idOrder.length) {
    return { barris, stations: null };
  }

  const averages = new Map<string, StationTuple>();
  for (const [idx, samples] of byStationIdx) {
    const sid = idOrder[idx];
    if (!sid || !samples.length) continue;
    averages.set(sid, averageStationTuples(samples));
  }

  const stations = stationsFromAverages(baseStations, idOrder, averages);
  return { barris, stations: stations.length ? stations : null };
}

/** Average barri metrics for local hour and day-type across stored history (30 days). */
export async function loadBarriHourlyAverage(
  index: HistoryIndex | null,
  hour: number,
  dayType: DayType
): Promise<Barri[]> {
  const { barris } = await loadHourlyViewData(index, hour, dayType, [], null);
  return barris;
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

export type SparklineMetricKey =
  | "pct_bikes"
  | "pct_mechanical"
  | "pct_ebike"
  | "pct_oos_anchors"
  | "pct_oos_fleet"
  | "bikes_total"
  | "bikes_mechanical"
  | "bikes_ebike";

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

/** UTC file-key cutoff for comparing history hourly keys (stored in UTC). */
export function historyCutoffKeyUtc(hours: number): string {
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const y = cutoff.getUTCFullYear();
  const m = String(cutoff.getUTCMonth() + 1).padStart(2, "0");
  const d = String(cutoff.getUTCDate()).padStart(2, "0");
  const h = String(cutoff.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}-${h}`;
}

/** Keep chart detail points from the last N hours when timestamps are available. */
export function filterChartPointsLast24h(
  points: ChartPoint[],
  hours = CHART_DETAIL_HOURS
): ChartPoint[] {
  const cutoffMs = Date.now() - hours * 3_600_000;
  const cutoffKey = historyCutoffKeyUtc(hours);
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
    let value: number | undefined;
    if (key === "pct_oos_anchors") {
      value = p.pct_oos_anchors ?? p.pct_oos_fleet;
    } else if (key === "pct_oos_fleet") {
      value =
        p.pct_oos_fleet ??
        (p.pct_bikes !== undefined && p.pct_oos_anchors !== undefined
          ? pctOosFleetFromPctBikesAndAnchors(p.pct_bikes, p.pct_oos_anchors)
          : undefined);
    } else {
      value = p[key];
    }
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
  key: SparklineMetricKey
): number | null {
  const bucket = summary?.hourly.find((h) => h.hour === hour);
  if (!bucket) return null;
  if (key === "pct_bikes") return bucket.avg_pct_bikes;
  if (key === "pct_mechanical") return bucket.avg_pct_mechanical;
  if (key === "pct_ebike") return bucket.avg_pct_ebike;
  if (key === "bikes_total") {
    if (bucket.avg_bikes_total !== undefined) return bucket.avg_bikes_total;
    const samples = bucket.samples.filter((s) => s.bikes_total !== undefined);
    if (!samples.length) return null;
    return samples.reduce((sum, s) => sum + (s.bikes_total ?? 0), 0) / samples.length;
  }
  if (key === "bikes_mechanical") {
    if (bucket.avg_bikes_mechanical !== undefined) return bucket.avg_bikes_mechanical;
    const samples = bucket.samples.filter((s) => s.bikes_mechanical !== undefined);
    if (!samples.length) return null;
    return samples.reduce((sum, s) => sum + (s.bikes_mechanical ?? 0), 0) / samples.length;
  }
  if (key === "bikes_ebike") {
    if (bucket.avg_bikes_ebike !== undefined) return bucket.avg_bikes_ebike;
    const samples = bucket.samples.filter((s) => s.bikes_ebike !== undefined);
    if (!samples.length) return null;
    return samples.reduce((sum, s) => sum + (s.bikes_ebike ?? 0), 0) / samples.length;
  }
  if (key === "pct_oos_anchors") {
    const samples = bucket.samples.filter((s) => s.pct_oos_anchors !== undefined);
    if (!samples.length) return null;
    return (
      samples.reduce((sum, s) => sum + (s.pct_oos_anchors ?? 0), 0) / samples.length
    );
  }
  if (key === "pct_oos_fleet") {
    const samples = bucket.samples.filter(
      (s) =>
        s.pct_oos_fleet !== undefined ||
        (s.pct_bikes !== undefined && s.pct_oos_anchors !== undefined)
    );
    if (!samples.length) return null;
    return (
      samples.reduce((sum, s) => {
        const fleet =
          s.pct_oos_fleet ??
          pctOosFleetFromPctBikesAndAnchors(s.pct_bikes, s.pct_oos_anchors!);
        return sum + fleet;
      }, 0) / samples.length
    );
  }
  return null;
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
  bikes_total: number[];
  bikes_mechanical: number[];
  bikes_ebike: number[];
  pct_bikes: number[];
  pct_mechanical: number[];
  pct_ebike: number[];
  pct_oos_anchors: number[];
  pct_oos_fleet: number[];
};

/** Recent hourly snapshots for one barri (for KPI sparklines). */
export async function loadBarriSparklineSeries(
  index: HistoryIndex | null,
  barriCodi: string
): Promise<BarriSparklineSeries | null> {
  if (!index?.files?.length) return null;

  const bikes_total: number[] = [];
  const bikes_mechanical: number[] = [];
  const bikes_ebike: number[] = [];
  const pct_bikes: number[] = [];
  const pct_mechanical: number[] = [];
  const pct_ebike: number[] = [];
  const pct_oos_anchors: number[] = [];
  const pct_oos_fleet: number[] = [];
  const labels: string[] = [];
  const keys: string[] = [];

  for (const file of [...index.files].sort((a, b) => a.key.localeCompare(b.key))) {
    const snapshot = await loadHourlySnapshot(file.key);
    const barris = snapshot?.barris ?? [];
    const b = barris.find((x) => x.barri_codi === barriCodi);
    if (!b || b.capacity_total <= 0) continue;
    const oos = bikesOutOfService(
      b.capacity_total,
      b.bikes_mechanical,
      b.bikes_ebike,
      b.docks_available_total,
      b.bikes_total
    );
    labels.push(historyFileLocalLabel(file.localDate, file.localHour));
    keys.push(file.key);
    bikes_total.push(b.bikes_total);
    bikes_mechanical.push(b.bikes_mechanical);
    bikes_ebike.push(b.bikes_ebike);
    pct_bikes.push(b.pct_bikes);
    pct_mechanical.push((100 * b.bikes_mechanical) / b.capacity_total);
    pct_ebike.push((100 * b.bikes_ebike) / b.capacity_total);
    pct_oos_anchors.push(pctOosOfAnchors(b.capacity_total, oos));
    pct_oos_fleet.push(pctOosOfBikeFleet(b.bikes_total, oos));
  }

  if (!pct_bikes.length) return null;
  return {
    labels,
    keys,
    bikes_total,
    bikes_mechanical,
    bikes_ebike,
    pct_bikes,
    pct_mechanical,
    pct_ebike,
    pct_oos_anchors,
    pct_oos_fleet,
  };
}

/** Recent hourly city totals (for KPI sparklines when no barri is selected). */
export async function loadCitySparklineSeries(
  index: HistoryIndex | null
): Promise<BarriSparklineSeries | null> {
  if (!index?.files?.length) return null;

  const bikes_total: number[] = [];
  const bikes_mechanical: number[] = [];
  const bikes_ebike: number[] = [];
  const pct_bikes: number[] = [];
  const pct_mechanical: number[] = [];
  const pct_ebike: number[] = [];
  const pct_oos_anchors: number[] = [];
  const pct_oos_fleet: number[] = [];
  const labels: string[] = [];
  const keys: string[] = [];

  for (const file of [...index.files].sort((a, b) => a.key.localeCompare(b.key))) {
    const snapshot = await loadHourlySnapshot(file.key);
    const barris = snapshot?.barris ?? [];
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
    labels.push(historyFileLocalLabel(file.localDate, file.localHour));
    keys.push(file.key);
    bikes_total.push(bikes);
    bikes_mechanical.push(mechanical);
    bikes_ebike.push(ebike);
    pct_bikes.push((100 * bikes) / capacity);
    pct_mechanical.push((100 * mechanical) / capacity);
    pct_ebike.push((100 * ebike) / capacity);
    pct_oos_anchors.push(pctOosOfAnchors(capacity, oos));
    pct_oos_fleet.push(pctOosOfBikeFleet(bikes, oos));
  }

  if (!pct_bikes.length) return null;
  return {
    labels,
    keys,
    bikes_total,
    bikes_mechanical,
    bikes_ebike,
    pct_bikes,
    pct_mechanical,
    pct_ebike,
    pct_oos_anchors,
    pct_oos_fleet,
  };
}

function filesForHourLastDays(
  index: HistoryIndex | null,
  hour: number,
  days: number
): HistoryFile[] {
  if (!index?.files?.length) return [];
  const cutoffDates = new Set<string>();
  for (let d = 0; d < days; d++) cutoffDates.add(madridDateKey(d));
  return index.files.filter((f) => f.localHour === hour && cutoffDates.has(f.localDate));
}

/** 7-day averages at a given local hour for one barri (KPI comparison). */
export async function barriHistAveragesAtHour(
  index: HistoryIndex | null,
  barriCodi: string,
  hour: number
): Promise<Partial<Record<SparklineMetricKey, number>> | null> {
  const matches = filesForHourLastDays(index, hour, 7);
  if (!matches.length) return null;

  const bikes_total: number[] = [];
  const bikes_mechanical: number[] = [];
  const bikes_ebike: number[] = [];
  const pct_bikes: number[] = [];
  const pct_mechanical: number[] = [];
  const pct_ebike: number[] = [];
  const pct_oos_anchors: number[] = [];
  const pct_oos_fleet: number[] = [];

  for (const file of matches) {
    const snapshot = await loadHourlySnapshot(file.key);
    const b = snapshot?.barris?.find((x) => x.barri_codi === barriCodi);
    if (!b || b.capacity_total <= 0) continue;
    const oos = bikesOutOfService(
      b.capacity_total,
      b.bikes_mechanical,
      b.bikes_ebike,
      b.docks_available_total,
      b.bikes_total
    );
    bikes_total.push(b.bikes_total);
    bikes_mechanical.push(b.bikes_mechanical);
    bikes_ebike.push(b.bikes_ebike);
    pct_bikes.push(b.pct_bikes);
    pct_mechanical.push((100 * b.bikes_mechanical) / b.capacity_total);
    pct_ebike.push((100 * b.bikes_ebike) / b.capacity_total);
    pct_oos_anchors.push(pctOosOfAnchors(b.capacity_total, oos));
    pct_oos_fleet.push(pctOosOfBikeFleet(b.bikes_total, oos));
  }

  if (!pct_bikes.length) return null;
  const avg = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;
  return {
    bikes_total: avg(bikes_total),
    bikes_mechanical: avg(bikes_mechanical),
    bikes_ebike: avg(bikes_ebike),
    pct_bikes: avg(pct_bikes),
    pct_mechanical: avg(pct_mechanical),
    pct_ebike: avg(pct_ebike),
    pct_oos_anchors: avg(pct_oos_anchors),
    pct_oos_fleet: avg(pct_oos_fleet),
  };
}

/** 7-day averages at a given local hour for the whole city (KPI comparison). */
export async function cityHistAveragesAtHour(
  index: HistoryIndex | null,
  hour: number
): Promise<Partial<Record<SparklineMetricKey, number>> | null> {
  const matches = filesForHourLastDays(index, hour, 7);
  if (!matches.length) return null;

  const bikes_total: number[] = [];
  const bikes_mechanical: number[] = [];
  const bikes_ebike: number[] = [];
  const pct_oos_fleet: number[] = [];

  for (const file of matches) {
    const snapshot = await loadHourlySnapshot(file.key);
    const barris = snapshot?.barris ?? [];
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
    bikes_total.push(bikes);
    bikes_mechanical.push(mechanical);
    bikes_ebike.push(ebike);
    pct_oos_fleet.push(pctOosOfBikeFleet(bikes, oos));
  }

  if (!bikes_total.length) return null;
  const avg = (vals: number[]) => vals.reduce((s, v) => s + v, 0) / vals.length;
  return {
    bikes_total: avg(bikes_total),
    bikes_mechanical: avg(bikes_mechanical),
    bikes_ebike: avg(bikes_ebike),
    pct_oos_fleet: avg(pct_oos_fleet),
  };
}

function barriSparklinePct(b: HourlyBarriSnapshot, mode: MetricMode): number {
  const cap = b.capacity_total;
  if (cap <= 0) return 0;
  const oos = bikesOutOfService(
    cap,
    b.bikes_mechanical,
    b.bikes_ebike,
    b.docks_available_total,
    b.bikes_total
  );
  switch (mode) {
    case "mechanical":
      return Math.round((100 * b.bikes_mechanical) / cap * 100) / 100;
    case "ebike":
      return b.pct_ebike;
    case "docks":
      return b.pct_docks_free;
    case "out_of_service":
      return Math.round(pctOosOfAnchors(cap, oos) * 100) / 100;
    default:
      return b.pct_bikes;
  }
}

function stationSparklinePct(tuple: StationTuple, capacity: number, mode: MetricMode): number {
  if (capacity <= 0) return 0;
  const [mechanical, ebike, total, docks, bikes_disabled, docks_disabled] = tuple;
  const oos = bikesOutOfService(
    capacity,
    mechanical,
    ebike,
    docks,
    total,
    bikes_disabled,
    docks_disabled
  );
  switch (mode) {
    case "mechanical":
      return Math.round((100 * mechanical) / capacity * 100) / 100;
    case "ebike":
      return Math.round((100 * ebike) / capacity * 100) / 100;
    case "docks":
      return Math.round((100 * docks) / capacity * 100) / 100;
    case "out_of_service":
      return Math.round(pctOosOfAnchors(capacity, oos) * 100) / 100;
    default:
      return Math.round((100 * total) / capacity * 100) / 100;
  }
}

/** Recent % bikes for one station (modal sparkline, last 24 h). */
export async function loadStationSparklinePct(
  index: HistoryIndex | null,
  stationId: string,
  capacity: number,
  stationIdOrder: string[] | null,
  mode: MetricMode = "total",
  hours = CHART_DETAIL_HOURS
): Promise<ChartPoint[]> {
  if (!index?.files?.length || !stationIdOrder?.length || capacity <= 0) return [];
  const idx = stationIdOrder.indexOf(stationId);
  if (idx < 0) return [];

  const cutoffKey = historyCutoffKeyUtc(hours);
  const points: ChartPoint[] = [];

  for (const file of [...index.files].sort((a, b) => a.key.localeCompare(b.key))) {
    if (file.key < cutoffKey) continue;
    const snapshot = await loadHourlySnapshot(file.key);
    const tuple = snapshot?.v?.[idx];
    if (!tuple) continue;
    points.push({
      label: formatHour(file.localHour),
      value: stationSparklinePct(tuple, capacity, mode),
      key: file.key,
    });
  }

  return points;
}

/** Recent metric % for one barri (popup/modal sparkline, last 24 h). */
export async function loadBarriSparklinePct(
  index: HistoryIndex | null,
  barriCodi: string,
  mode: MetricMode = "total",
  hours = CHART_DETAIL_HOURS
): Promise<ChartPoint[]> {
  if (!index?.files?.length) return [];

  const cutoffKey = historyCutoffKeyUtc(hours);
  const points: ChartPoint[] = [];

  for (const file of [...index.files].sort((a, b) => a.key.localeCompare(b.key))) {
    if (file.key < cutoffKey) continue;
    const snapshot = await loadHourlySnapshot(file.key);
    const b = snapshot?.barris?.find((x) => x.barri_codi === barriCodi);
    if (!b || b.capacity_total <= 0) continue;
    points.push({
      label: formatHour(file.localHour),
      value: barriSparklinePct(b, mode),
      key: file.key,
    });
  }

  return points;
}
