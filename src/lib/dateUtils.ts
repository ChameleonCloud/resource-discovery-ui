export function truncateToHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d;
}

export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
