import type { MetricMode } from "./data";
import type { BarriSortKey } from "../components/barriTable";

export function metricToBarriSortKey(
  mode: MetricMode
): Exclude<BarriSortKey, "barri_nom" | "stations_active" | "stations_zero_any"> {
  switch (mode) {
    case "mechanical":
      return "pct_mechanical";
    case "ebike":
      return "pct_ebike";
    case "docks":
      return "pct_docks_free";
    case "out_of_service":
      return "pct_bikes_out_of_service";
    default:
      return "pct_bikes";
  }
}

export function metricSortAscending(mode: MetricMode): boolean {
  return mode !== "out_of_service";
}
