import { useMemo, useRef } from "react";
import { useMatch } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, fetchNode } from "../api/client";
import type { SearchNodeItem } from "../api/types";

export const NODE_ROUTE = "/nodes/:siteId/:clusterId/:uid";

export interface NodeSelection {
  node: SearchNodeItem | null;
  target: { siteId: string; uid: string } | null;
  notFound: boolean;
}

export function nodePath(node: SearchNodeItem): string {
  return `/nodes/${node.site_id}/${node.cluster_id}/${node.uid}`;
}

/** The node named by the current URL, fetched directly when absent from `nodes`. */
export function useSelectedNode(nodes: SearchNodeItem[], nodesLoaded: boolean): NodeSelection {
  const params = useMatch(NODE_ROUTE)?.params;
  const { siteId, clusterId, uid } = params ?? {};

  const fromList = useMemo(
    () => (uid ? nodes.find((n) => n.uid === uid) ?? null : null),
    [nodes, uid],
  );

  const resolved = useRef<SearchNodeItem | null>(null);
  const alreadyResolved = resolved.current?.uid === uid ? resolved.current : null;

  const { data: fetched, error } = useQuery({
    queryKey: ["node", siteId, clusterId, uid],
    queryFn: () => fetchNode(siteId!, clusterId!, uid!),
    enabled: !!siteId && !!clusterId && !!uid && nodesLoaded && !fromList && !alreadyResolved,
    staleTime: 5 * 60 * 1000,
  });

  const node = fromList ?? alreadyResolved ?? fetched ?? null;
  resolved.current = node;

  return {
    node,
    target: siteId && uid ? { siteId, uid } : null,
    notFound: error instanceof ApiError && error.status === 404,
  };
}
