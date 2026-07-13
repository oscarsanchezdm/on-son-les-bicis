const MADRID_TZ = "Europe/Madrid";

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("ca-ES");
}

/** Variació relativa respecte una mitjana (p.ex. +34%, -12%). */
export function formatRelativeDeltaPct(current: number, avg: number): string {
  if (avg <= 0) return current > 0 ? "+100%" : "0%";
  const pct = Math.round(((current - avg) / avg) * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function madridParts(isoOrDate: string | Date, options: Intl.DateTimeFormatOptions) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("en-GB", { timeZone: MADRID_TZ, ...options }).formatToParts(d);
}

export function formatDateDDMM(isoOrDate: string | Date): string {
  const parts = madridParts(isoOrDate, { day: "2-digit", month: "2-digit" });
  const day = parts.find((p) => p.type === "day")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${day}/${month}`;
}

export function formatDateTime(iso: string): string {
  const dateParts = madridParts(iso, { day: "2-digit", month: "2-digit" });
  const timeParts = madridParts(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = dateParts.find((p) => p.type === "day")!.value;
  const month = dateParts.find((p) => p.type === "month")!.value;
  const hour = timeParts.find((p) => p.type === "hour")!.value;
  const minute = timeParts.find((p) => p.type === "minute")!.value;
  return `${day}/${month} ${hour}:${minute}`;
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return "fa menys d'1 minut";
  if (diffMin === 1) return "fa 1 minut";
  if (diffMin < 60) return `fa ${diffMin} minuts`;
  const hours = Math.round(diffMin / 60);
  if (hours === 1) return "fa 1 hora";
  return `fa ${hours} hores`;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Label for hourly history file keys (UTC key → hora local Madrid). */
export function historyFileLabel(key: string): string {
  const parts = key.split("-");
  if (parts.length >= 4) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const hour = Number(parts[3]);
    const utc = new Date(Date.UTC(year, month - 1, day, hour));
    const dateParts = madridParts(utc, { day: "2-digit", month: "2-digit" });
    const timeParts = madridParts(utc, { hour: "2-digit", hour12: false });
    const dd = dateParts.find((p) => p.type === "day")!.value;
    const mm = dateParts.find((p) => p.type === "month")!.value;
    const hh = timeParts.find((p) => p.type === "hour")!.value;
    return `${dd}/${mm} ${hh}:00`;
  }
  return key;
}

/** Label from history-index local fields (preferred when available). */
export function historyFileLocalLabel(localDate: string, localHour: number): string {
  const [, month, day] = localDate.split("-");
  return `${day}/${month} ${formatHour(localHour)}`;
}
