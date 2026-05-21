import { useQuery } from "@tanstack/react-query";
import { fetchSites } from "../api/client";
import type { Site } from "../api/types";

export function useSites() {
  return useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSiteMap(): Map<string, Site> {
  const { data } = useSites();
  const map = new Map<string, Site>();
  for (const site of data?.items ?? []) {
    map.set(site.uid, site);
  }
  return map;
}
