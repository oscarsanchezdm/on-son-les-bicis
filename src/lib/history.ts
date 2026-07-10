import type { Barri, LatestData } from "./data";
import { bikesOutOfService, pctBikesOutOfService } from "./data";

const BASE = import.meta.env.BASE_URL;

export type HistoryPoint = {
  ts: string;
  date: string;
  hour: number;
  pct_bikes: number;
  pct_mechanical: number;
  pct_ebike: number;
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

export type DayType = "weekday" | "saturday" | "sunday";

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

const HISTORY_DAYS = 30;

export async function loadSummary7d(): Promise<Summary7d | null> {
  const res = await fetch(`${BASE}data/history/summary-7d.json`);
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

function matchesDayType(date: Date, dayType: DayType): boolean {
  const dow = date.getUTCDay();
  if (dayType === "saturday") return dow === 6;
  if (dayType === "sunday") return dow === 0;
  return dow >= 1 && dow <= 5;
}

function dayTypeLabel(dayType: DayType): string {
  switch (dayType) {
    case "saturday":
      return "dissabtes";
    case "sunday":
      return "diumenges";
    default:
      return "feiners";
  }
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
  const oos = bikesOutOfService(cap, Math.round(mechanical), Math.round(ebike), Math.round(docks));

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
      Math.round(docks)
    ),
    superficie_ha: null,
  };
}

/** Average barri metrics for hour-of-day and day-type across stored history (30 days). */
export async function loadBarriHourlyAverage(
  hour: number,
  dayType: DayType
): Promise<Barri[]> {
  const byCode = new Map<string, HourlyBarriSnapshot[]>();
  const now = new Date();

  for (let d = 0; d < HISTORY_DAYS; d++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - d);
    if (!matchesDayType(date, dayType)) continue;

    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hh = String(hour).padStart(2, "0");
    const url = `${BASE}data/history/hourly/${y}-${m}-${day}-${hh}.json.gz`;
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
  const oos = bikesOutOfService(capacity, mechanical, ebike, docks);

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
      pct_bikes_out_of_service: pctBikesOutOfService(capacity, mechanical, ebike, docks),
      worst_barri: null,
    },
    stations: [],
  };
}

export function hourViewScopeLabel(hour: number, dayType: DayType): string {
  const hh = String(hour).padStart(2, "0");
  return `mitjana ${dayTypeLabel(dayType)} a les ${hh}:00`;
}

export function sparklineValues(
  series: HistoryPoint[],
  key: keyof Pick<HistoryPoint, "pct_bikes" | "pct_mechanical" | "pct_ebike">,
  maxPoints = 48
): number[] {
  const slice = series.slice(-maxPoints);
  return slice.map((p) => p[key]);
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
