export function isStationActive(status: string | undefined): boolean {
  const value = (status || "").toUpperCase();
  return value === "ACTIVE" || value === "IN_SERVICE";
}

/** Operational stations shown on the map (active and with docks). */
export function isStationMappable(station: { status: string; capacity: number }): boolean {
  return isStationActive(station.status) && station.capacity > 0;
}
