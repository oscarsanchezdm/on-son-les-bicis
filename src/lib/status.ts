export function isStationActive(status: string | undefined): boolean {
  const value = (status || "").toUpperCase();
  return value === "ACTIVE" || value === "IN_SERVICE";
}
