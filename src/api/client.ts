import type {
  FeedbackPayload,
  NodeAvailabilityResponse,
  NodeSearchParams,
  NodeSearchResponse,
  SiteCollection,
} from "./types";

declare global {
  interface Window {
    __FEEDBACK_SECRET__?: string;
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
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
