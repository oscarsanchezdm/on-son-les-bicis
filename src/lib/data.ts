export type Station = {
  station_id: string;
  name: string;
  lat: number;
  lon: number;
  capacity: number;
  config: string;
  barri_codi: string;
  barri_nom: string;
  district: string;
  status: string;
  mechanical: number;
  ebike: number;
  total: number;
  docks_available: number;
  pct_bikes: number;
  pct_docks_free: number;
};

export type Barri = {
  barri_codi: string;
  barri_nom: string;
  stations_count: number;
  stations_active: number;
  capacity_total: number;
  docks_available_total: number;
  bikes_mechanical: number;
  bikes_ebike: number;
  bikes_total: number;
  pct_bikes: number;
  pct_docks_free: number;
  pct_mechanical: number;
  pct_ebike: number;
  stations_zero_ebike: number;
  stations_zero_mechanical: number;
  stations_zero_any: number;
  bikes_out_of_service?: number;
  pct_bikes_out_of_service?: number;
  superficie_ha: number | null;
};

export type LatestData = {
  last_updated: string;
  totals: {
    capacity: number;
    bikes_total: number;
    bikes_mechanical: number;
    bikes_ebike: number;
    docks_available: number;
    stations_active: number;
    stations_zero_ebike: number;
    stations_zero_mechanical: number;
    stations_zero_any: number;
    pct_bikes: number;
    pct_docks_free: number;
    pct_mechanical?: number;
    pct_ebike?: number;
    bikes_out_of_service?: number;
    pct_bikes_out_of_service?: number;
    worst_barri: Barri | null;
  };
  stations: Station[];
};

export type BarrisData = {
  last_updated: string;
  barris: Barri[];
};

export type MetaData = {
  last_updated: string;
  exported_at: string;
  source: string;
  station_count: number;
  barri_count: number;
  disclaimer: string;
};

export type MetricMode = "total" | "mechanical" | "ebike" | "docks";

const BASE = import.meta.env.BASE_URL;

export async function loadLatest(): Promise<LatestData> {
  const res = await fetch(`${BASE}data/latest.json`);
  if (!res.ok) throw new Error("No s'han pogut carregar les dades");
  return res.json();
}

export async function loadBarris(): Promise<BarrisData> {
  const res = await fetch(`${BASE}data/barris-latest.json`);
  if (!res.ok) throw new Error("No s'han pogut carregar les dades de barris");
  return res.json();
}

export async function loadMeta(): Promise<MetaData> {
  const res = await fetch(`${BASE}data/meta.json`);
  if (!res.ok) throw new Error("No s'ha pogut carregar meta");
  return res.json();
}

export async function loadBarrisGeo(): Promise<GeoJSON.FeatureCollection> {
  const res = await fetch(`${BASE}data/static/barris.geojson`);
  if (!res.ok) throw new Error("No s'ha pogut carregar el mapa de barris");
  return res.json();
}

export async function loadDailyHistory(day: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${BASE}data/history/daily/${day}.json.gz`);
  if (!res.ok) return [];
  const ds = new DecompressionStream("gzip");
  const decompressed = res.body!.pipeThrough(ds);
  const text = await new Response(decompressed).text();
  return JSON.parse(text);
}

export function barriMetric(barri: Barri, mode: MetricMode): number {
  switch (mode) {
    case "mechanical":
      return barri.pct_mechanical;
    case "ebike":
      return barri.pct_ebike;
    case "docks":
      return barri.pct_docks_free;
    default:
      return barri.pct_bikes;
  }
}

export function stationMetric(station: Station, mode: MetricMode): number {
  if (station.capacity <= 0) return 0;
  switch (mode) {
    case "mechanical":
      return (100 * station.mechanical) / station.capacity;
    case "ebike":
      return (100 * station.ebike) / station.capacity;
    case "docks":
      return station.pct_docks_free;
    default:
      return station.pct_bikes;
  }
}

/** Bicis fora de servei = capacitat − mecàniques − elèctriques − ancoratges lliures. */
export function bikesOutOfService(
  capacity: number,
  mechanical: number,
  ebike: number,
  docksAvailable: number
): number {
  return Math.max(0, capacity - mechanical - ebike - docksAvailable);
}

export function pctBikesOutOfService(
  capacity: number,
  mechanical: number,
  ebike: number,
  docksAvailable: number
): number {
  if (capacity <= 0) return 0;
  return (100 * bikesOutOfService(capacity, mechanical, ebike, docksAvailable)) / capacity;
}
