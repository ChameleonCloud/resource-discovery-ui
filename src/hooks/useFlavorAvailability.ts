import { useQuery } from "@tanstack/react-query";
import { fetchFlavorAvailability } from "../api/client";

export const FLAVOR_AVAILABILITY_STALE_MS = 2 * 60 * 1000;

export const flavorAvailabilityKey = (
  siteId: string,
  flavorId: string | null,
  startDate: Date,
  endDate: Date,
) => ["flavor-availability", siteId, flavorId, startDate.toISOString(), endDate.toISOString()] as const;

export function useFlavorAvailability(
  siteId: string,
  flavorId: string | null,
  startDate: Date,
  endDate: Date,
) {
  return useQuery({
    queryKey: flavorAvailabilityKey(siteId, flavorId, startDate, endDate),
    queryFn: () => fetchFlavorAvailability(siteId, flavorId!, startDate, endDate),
    staleTime: FLAVOR_AVAILABILITY_STALE_MS,
    enabled: !!flavorId,
  });
}
