import type {
  FeedbackPayload,
  FlavorAvailabilityResponse,
  FlavorCollection,
  NodeAvailabilityResponse,
  NodeSearchParams,
  NodeSearchResponse,
  SearchNodeItem,
  SiteCollection,
  VmFlavor,
} from "./types";

declare global {
  interface Window {
    __FEEDBACK_SECRET__?: string;
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(readonly status: number, path: string) {
    super(`API ${status}: ${path}`);
  }
}

/** Escapes one path segment, so a caller-supplied id cannot reach another endpoint. */
function segment(value: string): string {
  return encodeURIComponent(value);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, path);
  }
  return res.json() as Promise<T>;
}

export function fetchSites(): Promise<SiteCollection> {
  return apiFetch<SiteCollection>("/sites?limit=500");
}

export function fetchNodeSearch(params: NodeSearchParams): Promise<NodeSearchResponse> {
  const q = new URLSearchParams();
  if (params.site_id) q.set("site_id", params.site_id);
  if (params.node_type) q.set("node_type", params.node_type);
  if (params.arch) q.set("arch", params.arch);
  if (params.gpu !== undefined) q.set("gpu", String(params.gpu));
  if (params.infiniband !== undefined) q.set("infiniband", String(params.infiniband));
  if (params.min_ram !== undefined) q.set("min_ram", String(params.min_ram));
  if (params.start) q.set("start", params.start);
  if (params.end) q.set("end", params.end);
  q.set("offset", String(params.offset ?? 0));
  q.set("limit", String(params.limit ?? 500));
  return apiFetch<NodeSearchResponse>(`/nodes/search?${q}`);
}

/** Fetches one node, with site and cluster filled from the arguments and availability unknown. */
export async function fetchNode(
  siteId: string,
  clusterId: string,
  nodeId: string,
): Promise<SearchNodeItem> {
  const path = `/sites/${segment(siteId)}/clusters/${segment(clusterId)}/nodes/${segment(nodeId)}`;
  const node = await apiFetch<Omit<SearchNodeItem, "site_id" | "cluster_id" | "availability">>(path);
  return { ...node, site_id: siteId, cluster_id: clusterId, availability: "unknown" };
}

export function fetchSiteFlavors(siteId: string): Promise<FlavorCollection> {
  return apiFetch<FlavorCollection>(`/sites/${siteId}/flavors?limit=500`);
}

export function fetchFlavor(siteId: string, flavorId: string): Promise<VmFlavor> {
  return apiFetch<VmFlavor>(`/sites/${segment(siteId)}/flavors/${segment(flavorId)}`);
}

export function fetchSiteAvailabilityStatus(siteId: string): Promise<{ site_id: string; last_synced: string; synced_node_count: number }> {
  return apiFetch(`/sites/${siteId}/availability`);
}

export function fetchNodeAvailability(
  siteId: string,
  clusterId: string,
  nodeId: string,
): Promise<NodeAvailabilityResponse> {
  return apiFetch<NodeAvailabilityResponse>(
    `/sites/${siteId}/clusters/${clusterId}/nodes/${nodeId}/availability`,
  );
}

export function fetchFlavorAvailability(
  siteId: string,
  flavorId: string,
  startDate: Date,
  endDate: Date,
): Promise<FlavorAvailabilityResponse> {
  const q = new URLSearchParams();
  q.set("start_date", startDate.toISOString());
  q.set("end_date", endDate.toISOString());
  return apiFetch<FlavorAvailabilityResponse>(
    `/sites/${siteId}/flavors/${flavorId}/availability?${q}`,
  );
}

export async function submitFeedback(payload: FeedbackPayload): Promise<void> {
  const res = await fetch("/feedback/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      secret: window.__FEEDBACK_SECRET__ ?? "",
      userAgent: navigator.userAgent,
    }),
  });
  if (!res.ok) {
    throw new Error(`Feedback submission failed: ${res.status}`);
  }
}
