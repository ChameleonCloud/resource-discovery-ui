import { useQuery } from "@tanstack/react-query";
import { fetchNodeSearch } from "../api/client";
import type { NodeSearchParams } from "../api/types";

export function useNodeSearch(params: NodeSearchParams) {
  return useQuery({
    queryKey: ["nodes", "search", params],
    queryFn: () => fetchNodeSearch(params),
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
