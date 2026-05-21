import { useQueries } from "@tanstack/react-query";
import { fetchNodeAvailability } from "../api/client";
import type { SearchNodeItem, Reservation } from "../api/types";
import { buildDailyAvailability } from "../lib/availability";

export interface DailyCapacity {
  date: Date;
  available: number;
}

export interface CapacityCalendarResult {
  data: DailyCapacity[] | null;
  total: number;
  isLoading: boolean;
}

export function useCapacityCalendar(
  nodes: SearchNodeItem[],
  windowStart: Date,
  days = 30,
): CapacityCalendarResult {
  const queries = useQueries({
    queries: nodes.map((n) => ({
      queryKey: ["availability", n.site_id, n.cluster_id, n.uid],
      queryFn: () => fetchNodeAvailability(n.site_id, n.cluster_id, n.uid),
      staleTime: 2 * 60 * 1000,
      retry: false,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const nodeReservations = new Map<string, Reservation[]>();
  for (let i = 0; i < nodes.length; i++) {
    const result = queries[i];
    nodeReservations.set(nodes[i].uid, result.data?.reservations ?? []);
  }

  if (isLoading) return { data: null, total: nodes.length, isLoading: true };

  return {
    data: buildDailyAvailability(nodeReservations, nodes.length, windowStart, days),
    total: nodes.length,
    isLoading: false,
  };
}
