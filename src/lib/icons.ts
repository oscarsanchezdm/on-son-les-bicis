import type { MetricMode } from "./data";

const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

function wrap(size: number, paths: string): string {
  return `<svg width="${size}" height="${size}" ${SVG_ATTRS}>${paths}</svg>`;
}

/** Bicicleta mecànica / total. */
export function iconBike(size = 16): string {
  return wrap(
    size,
    `<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M9 17.5h6M5.5 14l3-7h4l2 4h3"/>`
  );
}

/** Bicicleta elèctrica. */
export function iconEbike(size = 16): string {
  return wrap(
    size,
    `<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M9 17.5h6M5.5 14l3-7h4l2 4h2"/><path d="M17 7v4M15 9h4"/>`
  );
}

/** Ancoratge lliure. */
export function iconDock(size = 16): string {
  return wrap(
    size,
    `<path d="M12 22V8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/><circle cx="12" cy="5" r="3"/>`
  );
}

/** Fora de servei / manteniment. */
export function iconMaintenance(size = 16): string {
  return wrap(
    size,
    `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`
  );
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

export function countIconHtml(
  kind: "ebike" | "mechanical" | "dock" | "maintenance",
  className = "count-icon"
): string {
  const icon =
    kind === "ebike"
      ? iconEbike(14)
      : kind === "mechanical"
        ? iconBike(14)
        : kind === "dock"
          ? iconDock(14)
          : iconMaintenance(14);
  return `<span class="${className}">${icon}</span>`;
}
