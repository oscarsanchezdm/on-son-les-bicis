export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
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

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ca-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
