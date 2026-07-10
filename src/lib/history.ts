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

export type DayType = "weekday" | "friday" | "saturday" | "sunday";

export type HistorySnapshot = {
  key: string;
  date: string;
  hour: number;
  dayType: DayType;
  label: string;
};

export type HistoryIndex = {
  generated_at: string;
  snapshots: HistorySnapshot[];
};

export type TimeView =
  | { kind: "latest" }
  | { kind: "snapshot"; key: string; date: string; hour: number; dayType: DayType };

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

function snapshotToBarri(s: HourlyBarriSnapshot): Barri {
  const cap = s.capacity_total;
  const oos = bikesOutOfService(
    cap,
    s.bikes_mechanical,
    s.bikes_ebike,
    s.docks_available_total
  );

  return {
    barri_codi: s.barri_codi,
    barri_nom: s.barri_nom,
    stations_count: s.stations_active ?? 0,
    stations_active: s.stations_active ?? 0,
    capacity_total: cap,
    docks_available_total: s.docks_available_total,
    bikes_mechanical: s.bikes_mechanical,
    bikes_ebike: s.bikes_ebike,
    bikes_total: s.bikes_total,
    pct_bikes: s.pct_bikes,
    pct_docks_free: s.pct_docks_free,
    pct_mechanical: cap > 0 ? Math.round((100 * s.bikes_mechanical) / cap * 100) / 100 : 0,
    pct_ebike: s.pct_ebike,
    stations_zero_ebike: s.stations_zero_ebike ?? 0,
    stations_zero_mechanical: s.stations_zero_mechanical ?? 0,
    stations_zero_any: 0,
    bikes_out_of_service: oos,
    pct_bikes_out_of_service: pctBikesOutOfService(
      cap,
      s.bikes_mechanical,
      s.bikes_ebike,
      s.docks_available_total
    ),
    superficie_ha: null,
  };
}

/** Load barri metrics from one stored hourly snapshot file. */
export async function loadBarriSnapshot(date: string, hour: number): Promise<Barri[]> {
  const hh = String(hour).padStart(2, "0");
  const url = `${BASE}data/history/hourly/${date}-${hh}.json.gz`;
  const barris = await loadHourlyGz(url);
  return barris
    .map(snapshotToBarri)
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

export function snapshotScopeLabel(view: Extract<TimeView, { kind: "snapshot" }>): string {
  const hh = String(view.hour).padStart(2, "0");
  return `mitjana ${dayTypeLabel(view.dayType)} a les ${hh}:00`;
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

export function isHistoricalView(view: TimeView): view is Extract<TimeView, { kind: "snapshot" }> {
  return view.kind === "snapshot";
}
