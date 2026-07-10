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

export async function loadSummary7d(): Promise<Summary7d | null> {
  const res = await fetch(`${BASE}data/history/summary-7d.json`);
  if (!res.ok) return null;
  return res.json();
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
