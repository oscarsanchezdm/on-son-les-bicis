import type { Barri } from "./data";

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

export type TimeView =
  | { kind: "latest" }
  | { kind: "hour"; hour: number };

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
  stations_zero_ebike?: number;
};

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

  return {
    barri_codi: samples[0]!.barri_codi,
    barri_nom: samples[0]!.barri_nom,
    stations_count: 0,
    stations_active: 0,
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
    stations_zero_mechanical: 0,
    stations_zero_any: 0,
    superficie_ha: null,
  };
}

/** Average barri metrics for a given hour-of-day across the last 7 days. */
export async function loadBarriHourlyAverage(hour: number): Promise<Barri[]> {
  const byCode = new Map<string, HourlyBarriSnapshot[]>();
  const now = new Date();

  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - d);
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
