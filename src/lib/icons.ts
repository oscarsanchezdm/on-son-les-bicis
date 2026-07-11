import type { MetricMode } from "./data";

/** MDI paths (Pictogrammers / Material Design Icons). */
const MDI_BIKE =
  "M5,20.5A3.5,3.5 0 0,1 1.5,17A3.5,3.5 0 0,1 5,13.5A3.5,3.5 0 0,1 8.5,17A3.5,3.5 0 0,1 5,20.5M5,12A5,5 0 0,0 0,17A5,5 0 0,0 5,22A5,5 0 0,0 10,17A5,5 0 0,0 5,12M14.8,10H19V8.2H15.8L13.86,4.93C13.57,4.43 13,4.1 12.4,4.1C11.93,4.1 11.5,4.29 11.2,4.6L7.5,8.29C7.19,8.6 7,9 7,9.5C7,10.13 7.33,10.66 7.85,10.97L11.2,13V18H13V11.5L10.75,9.85L13.07,7.5M19,20.5A3.5,3.5 0 0,1 15.5,17A3.5,3.5 0 0,1 19,13.5A3.5,3.5 0 0,1 22.5,17A3.5,3.5 0 0,1 19,20.5M19,12A5,5 0 0,0 14,17A5,5 0 0,0 19,22A5,5 0 0,0 24,17A5,5 0 0,0 19,12M16,4.8C17,4.8 17.8,4 17.8,3C17.8,2 17,1.2 16,1.2C15,1.2 14.2,2 14.2,3C14.2,4 15,4.8 16,4.8Z";

const MDI_BIKE_FAST =
  "M16 1.2C15 1.2 14.2 2 14.2 3S15 4.8 16 4.8 17.8 4 17.8 3 17 1.2 16 1.2M12.4 4.1C11.93 4.1 11.5 4.29 11.2 4.6L7.5 8.29C7.19 8.6 7 9 7 9.5C7 10.13 7.33 10.66 7.85 10.97L11.2 13V18H13V11.5L10.75 9.85L13.07 7.5L14.8 10H19V8.2H15.8L13.86 4.93C13.57 4.43 13 4.1 12.4 4.1M10 3H3C2.45 3 2 2.55 2 2S2.45 1 3 1H12.79C12.58 1.34 12.41 1.71 12.32 2.11C11.46 2.13 10.65 2.45 10 3M5 12C2.24 12 0 14.24 0 17S2.24 22 5 22 10 19.76 10 17 7.76 12 5 12M5 20.5C3.07 20.5 1.5 18.93 1.5 17S3.07 13.5 5 13.5 8.5 15.07 8.5 17 6.93 20.5 5 20.5M19 12C16.24 12 14 14.24 14 17S16.24 22 19 22 24 19.76 24 17 21.76 12 19 12M19 20.5C17.07 20.5 15.5 18.93 15.5 17S17.07 13.5 19 13.5 22.5 15.07 22.5 17 20.93 20.5 19 20.5M5.32 11H1C.448 11 0 10.55 0 10S.448 9 1 9H5.05C5.03 9.16 5 9.33 5 9.5C5 10.03 5.12 10.54 5.32 11M6 7H2C1.45 7 1 6.55 1 6S1.45 5 2 5H7.97L6.09 6.87C6.05 6.91 6 6.96 6 7Z";

/** Estació (mapa / recompte d'estacions). */
const MDI_STATION =
  "M12,2C8.13,2 5,5.13 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9C19,5.13 15.87,2 12,2M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5Z";

const MDI_WRENCH =
  "M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z";

/** Ancoratge Bicing (sense cercle), adaptat del mapa oficial. */
const BICING_DOCK_BASE =
  "M99.8,110.1H46.2v-1.6c0-3.3,2.7-6,6-6h41.7c3.3,0,6,2.7,6,6V110.1z";
const BICING_DOCK_PILLAR =
  "M82.6,37.7c0-1-0.9-1.8-1.9-1.8H65.5c-1,0-1.9,0.8-1.9,1.8l-3.2,64.8h25.1L82.6,37.7z M76,94.6c0,1.6-1.3,3-3,3s-3-1.3-3-3V45.7c0-1.6,1.3-3,3-3s3,1.3,3,3V94.6z";

const MDI_ARROW_LEFT =
  "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";

function mdiIcon(path: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
}

function bicingDockIcon(size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="44 36 58 76" aria-hidden="true"><g fill="currentColor"><path d="${BICING_DOCK_BASE}"/><path fill-rule="evenodd" d="${BICING_DOCK_PILLAR}"/></g></svg>`;
}

/** Fletxa enrere (mdi-arrow-left). */
export function iconBack(size = 16): string {
  return mdiIcon(MDI_ARROW_LEFT, size);
}

/** Bicicleta mecànica (mdi-bike). */
export function iconBike(size = 16): string {
  return mdiIcon(MDI_BIKE, size);
}

/** Bicicleta elèctrica (mdi-bike-fast). */
export function iconEbike(size = 16): string {
  return mdiIcon(MDI_BIKE_FAST, size);
}

/** Estació Bicing (pin de mapa). */
export function iconStation(size = 16): string {
  return mdiIcon(MDI_STATION, size);
}

/** Ancoratge (pillar Bicing). */
export function iconDock(size = 16): string {
  return bicingDockIcon(size);
}

/** Fora de servei / manteniment. */
export function iconMaintenance(size = 16): string {
  return mdiIcon(MDI_WRENCH, size);
}

const METRIC_ICONS: Record<MetricMode, (size?: number) => string> = {
  total: iconBike,
  mechanical: iconBike,
  ebike: iconEbike,
  docks: iconDock,
  out_of_service: iconMaintenance,
};

export function metricIcon(mode: MetricMode, size = 16): string {
  return METRIC_ICONS[mode](size);
}

export function metricIconHtml(mode: MetricMode, className = "metric-icon"): string {
  return `<span class="${className}">${metricIcon(mode)}</span>`;
}

export type CountIconKind = "ebike" | "mechanical" | "dock" | "station" | "maintenance";

export function countIconHtml(kind: CountIconKind, className = "count-icon"): string {
  const icon =
    kind === "ebike"
      ? iconEbike(14)
      : kind === "mechanical"
        ? iconBike(14)
        : kind === "dock"
          ? iconDock(14)
          : kind === "station"
            ? iconStation(14)
            : iconMaintenance(14);
  return `<span class="${className}">${icon}</span>`;
}

export function kpiIconHtml(kind: "total" | "mechanical" | "ebike", className = "kpi-icon"): string {
  const icon =
    kind === "ebike" ? iconEbike(16) : kind === "mechanical" ? iconBike(16) : iconBike(16);
  return `<span class="${className}">${icon}</span>`;
}
