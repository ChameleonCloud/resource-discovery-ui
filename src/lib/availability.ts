import type { Reservation } from "../api/types";

export function isReservedAt(reservations: Reservation[], date: Date): boolean {
  return reservations.some((r) => {
    const start = new Date(r.start);
    const end = new Date(r.end);
    return date >= start && date < end;
  });
}

export function buildDailyAvailability(
  nodeReservations: Map<string, Reservation[]>,
  total: number,
  windowStart: Date,
  days: number,
): { date: Date; available: number }[] {
  const result: { date: Date; available: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(windowStart);
    date.setDate(date.getDate() + i);
    const noon = new Date(date);
    noon.setHours(12, 0, 0, 0);

    let reserved = 0;
    for (const reservations of nodeReservations.values()) {
      if (isReservedAt(reservations, noon)) reserved++;
    }
    result.push({ date, available: total - reserved });
  }
  return result;
}

/** Finds the earliest start time >= searchStart for which a window of the given
 * duration has no overlap with any of the provided reservation intervals. */
export function findNextAvailableWindow(
  intervals: { start: number; end: number }[],
  durationMs: number,
  searchStart: Date,
): { start: Date; end: Date } {
  const candidates = new Set<number>([searchStart.getTime()]);
  for (const iv of intervals) {
    if (iv.end > searchStart.getTime()) candidates.add(iv.end);
  }
  const sorted = Array.from(candidates).sort((a, b) => a - b);

  for (const candidateStart of sorted) {
    const candidateEnd = candidateStart + durationMs;
    const hasConflict = intervals.some((iv) => candidateStart < iv.end && candidateEnd > iv.start);
    if (!hasConflict) {
      return { start: new Date(candidateStart), end: new Date(candidateEnd) };
    }
  }
  // Fallback: start after the last conflicting reservation ends.
  const latestEnd = Math.max(searchStart.getTime(), ...intervals.map((iv) => iv.end));
  return { start: new Date(latestEnd), end: new Date(latestEnd + durationMs) };
}

export function formatRam(bytes?: number): string {
  if (!bytes) return "—";
  const gib = bytes / (1024 ** 3);
  return `${Math.round(gib)} GiB`;
}

export const RAM_TIERS: { label: string; bytes: number }[] = [
  { label: "64 GiB+", bytes: 64 * 1024 ** 3 },
  { label: "128 GiB+", bytes: 128 * 1024 ** 3 },
  { label: "256 GiB+", bytes: 256 * 1024 ** 3 },
  { label: "512 GiB+", bytes: 512 * 1024 ** 3 },
];
