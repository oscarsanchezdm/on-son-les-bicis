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
  bikes_disabled?: number;
  docks_disabled?: number;
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
  /** Suma d'ancoratges avariats (num_docks_disabled) a les estacions del barri. */
  docks_disabled_total?: number;
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

export type MetricMode = "total" | "mechanical" | "ebike" | "docks" | "out_of_service";

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

export function barriMetric(barri: Barri, mode: MetricMode): number {
  switch (mode) {
    case "mechanical":
      return barri.pct_mechanical;
    case "ebike":
      return barri.pct_ebike;
    case "docks":
      return barri.pct_docks_free;
    case "out_of_service":
      return barriOosAnchorPct(barri);
    default:
      return barri.pct_bikes;
  }
}

export function barriMetricCount(barri: Barri, mode: MetricMode): number {
  switch (mode) {
    case "mechanical":
      return barri.bikes_mechanical;
    case "ebike":
      return barri.bikes_ebike;
    case "docks":
      return barri.docks_available_total;
    case "out_of_service":
      return (
        barri.bikes_out_of_service ??
        bikesOutOfService(
          barri.capacity_total,
          barri.bikes_mechanical,
          barri.bikes_ebike,
          barri.docks_available_total,
          barri.bikes_total
        )
      );
    default:
      return barri.bikes_total;
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
    case "out_of_service":
      return stationOosAnchorPct(station);
    default:
      return station.pct_bikes;
  }
}

export function stationCount(station: Station, mode: MetricMode): number {
  switch (mode) {
    case "mechanical":
      return station.mechanical;
    case "ebike":
      return station.ebike;
    case "docks":
      return station.docks_available;
    case "out_of_service":
      return stationOosCount(station);
    default:
      return station.total;
  }
}

/** Bicis fora de servei: GBFS num_vehicles_disabled o residual (sense ancoratges avariats). */
export function bikesOutOfService(
  capacity: number,
  mechanical: number,
  ebike: number,
  docksAvailable: number,
  bikesAvailable?: number,
  bikesDisabled?: number,
  docksDisabled?: number
): number {
  if (typeof bikesDisabled === "number") {
    return Math.max(0, bikesDisabled);
  }
  const available = bikesAvailable ?? mechanical + ebike;
  if (available <= 0) return 0;
  const brokenDocks = Math.max(0, docksDisabled ?? 0);
  return Math.max(0, capacity - mechanical - ebike - docksAvailable - brokenDocks);
}

export function stationOosCount(station: Station): number {
  return bikesOutOfService(
    station.capacity,
    station.mechanical,
    station.ebike,
    station.docks_available,
    station.total,
    station.bikes_disabled,
    station.docks_disabled
  );
}

export function stationDocksDisabled(station: Station): number {
  return Math.max(0, station.docks_disabled ?? 0);
}

export function pctBikesOutOfService(
  capacity: number,
  mechanical: number,
  ebike: number,
  docksAvailable: number,
  bikesAvailable?: number
): number {
  if (capacity <= 0) return 0;
  return (100 * bikesOutOfService(capacity, mechanical, ebike, docksAvailable, bikesAvailable)) / capacity;
}

/** % de bicis FS sobre el total d'ancoratges. */
export function pctOosOfAnchors(capacity: number, bikesOos: number): number {
  if (capacity <= 0) return 0;
  return (100 * bikesOos) / capacity;
}

/** % de bicis FS respecte de les bicicletes aparcades (disponibles + FS). */
export function pctOosOfBikeFleet(bikesAvailable: number, bikesOos: number): number {
  const fleet = bikesAvailable + bikesOos;
  if (fleet <= 0) return 0;
  return (100 * bikesOos) / fleet;
}

/** Fleet % a partir de % bicis i % FS sobre ancoratges (mateixa capacitat). */
export function pctOosFleetFromPctBikesAndAnchors(pctBikes: number, pctOosAnchors: number): number {
  const denom = pctBikes + pctOosAnchors;
  if (denom <= 0) return 0;
  return (100 * pctOosAnchors) / denom;
}

export function barriOosAnchorPct(barri: Barri): number {
  const oos =
    barri.bikes_out_of_service ??
    bikesOutOfService(
      barri.capacity_total,
      barri.bikes_mechanical,
      barri.bikes_ebike,
      barri.docks_available_total,
      barri.bikes_total
    );
  return pctOosOfAnchors(barri.capacity_total, oos);
}

export function stationOosAnchorPct(station: Station): number {
  return pctOosOfAnchors(station.capacity, stationOosCount(station));
}

export function pctOfStations(count: number, stationsActive: number): number {
  if (stationsActive <= 0) return 0;
  return (100 * count) / stationsActive;
}

/** Recompute OOS i ancoratges avariats per barri des de les estacions. */
export function enrichBarrisWithFleetOos(barris: Barri[], stations: Station[]): Barri[] {
  const oosByBarri = new Map<string, number>();
  const docksDisabledByBarri = new Map<string, number>();
  for (const station of stations) {
    const codi = station.barri_codi;
    oosByBarri.set(codi, (oosByBarri.get(codi) ?? 0) + stationOosCount(station));
    docksDisabledByBarri.set(
      codi,
      (docksDisabledByBarri.get(codi) ?? 0) + stationDocksDisabled(station)
    );
  }
  return barris.map((barri) => {
    const oos = oosByBarri.get(barri.barri_codi) ?? 0;
    const docksDisabled = docksDisabledByBarri.get(barri.barri_codi) ?? 0;
    return {
      ...barri,
      bikes_out_of_service: oos,
      pct_bikes_out_of_service: pctOosOfAnchors(barri.capacity_total, oos),
      docks_disabled_total: docksDisabled,
    };
  });
}

export function cityOosFromStations(stations: Station[]): number {
  return stations.reduce((sum, station) => sum + stationOosCount(station), 0);
}
