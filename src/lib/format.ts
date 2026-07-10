export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDateDDMM(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDateDDMM(d)} ${d.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit" })}`;
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

/** Label for hourly history file keys (e.g. 2026-07-10-14 → 10/07 14:00). */
export function historyFileLabel(key: string): string {
  const parts = key.split("-");
  if (parts.length >= 4) {
    const [, month, day, hour] = parts;
    return `${day}/${month} ${hour!.padStart(2, "0")}:00`;
  }
  return key;
}
