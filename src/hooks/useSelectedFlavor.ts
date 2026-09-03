import { useMemo, useRef } from "react";
import { useMatch } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchFlavor } from "../api/client";
import type { VmFlavor } from "../api/types";

export const FLAVOR_ROUTE = "/flavors/:siteId/:uid";

export interface FlavorSelection {
  flavor: VmFlavor | null;
  target: { siteId: string; uid: string } | null;
  notFound: boolean;
}

export function flavorPath(siteId: string, flavor: VmFlavor): string {
  return `/flavors/${siteId}/${flavor.uid}`;
}

/** The flavor named by the current URL, fetched directly when absent from `flavors`. */
export function useSelectedFlavor(flavors: VmFlavor[], flavorsLoaded: boolean): FlavorSelection {
  const params = useMatch(FLAVOR_ROUTE)?.params;
  const { siteId, uid } = params ?? {};

  const fromList = useMemo(
    () => (uid ? flavors.find((f) => f.uid === uid) ?? null : null),
    [flavors, uid],
  );

  const resolved = useRef<VmFlavor | null>(null);
  const alreadyResolved = resolved.current?.uid === uid ? resolved.current : null;

  const { data: fetched, error } = useQuery({
    queryKey: ["flavor", siteId, uid],
    queryFn: () => fetchFlavor(siteId!, uid!),
    enabled: !!siteId && !!uid && flavorsLoaded && !fromList && !alreadyResolved,
    staleTime: 5 * 60 * 1000,
  });

  const flavor = fromList ?? alreadyResolved ?? fetched ?? null;
  resolved.current = flavor;

  return {
    flavor,
    target: siteId && uid ? { siteId, uid } : null,
    notFound: error instanceof ApiError && error.status === 404,
  };
}
