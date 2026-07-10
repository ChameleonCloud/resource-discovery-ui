import { useQuery } from "@tanstack/react-query";
import { fetchSiteFlavors } from "../api/client";

export function useFlavors(siteId: string, enabled = true) {
  return useQuery({
    queryKey: ["flavors", siteId],
    queryFn: () => fetchSiteFlavors(siteId),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
