import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link, useMatch, useNavigate } from "react-router-dom";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { SearchNodeItem, VmFlavor } from "../api/types";
import type { CartItem } from "../hooks/useCart";
import { cartItemCount } from "../hooks/useCart";
import type { FilterState } from "../lib/filters";
import { DEFAULT_FILTERS, applyFilters, applyTextQuery, getActiveFilterChips } from "../lib/filters";
import type { FlavorFilterState } from "../lib/flavorFilters";
import { DEFAULT_FLAVOR_FILTERS, applyFlavorFilters, getActiveFlavorFilterChips } from "../lib/flavorFilters";
import { useNodeSearch } from "../hooks/useNodeSearch";
import { useSelectedNode, nodePath } from "../hooks/useSelectedNode";
import { useSelectedFlavor, flavorPath, FLAVOR_ROUTE } from "../hooks/useSelectedFlavor";
import { useFlavors } from "../hooks/useFlavors";
import { useSites, useSiteMap } from "../hooks/useSites";
import { FLAVOR_AVAILABILITY_STALE_MS, flavorAvailabilityKey } from "../hooks/useFlavorAvailability";
import { truncateToHour } from "../lib/dateUtils";
import { isCoreSite, KVM_ENABLED, KVM_SITE_ID } from "../lib/sites";
import { fetchSiteAvailabilityStatus, fetchNodeAvailability, fetchFlavorAvailability } from "../api/client";
import { findNextAvailableWindow } from "../lib/availability";
import { FilterSidebar } from "../components/FilterSidebar";
import { NodeCard } from "../components/NodeCard";
import { NodeTypeCard } from "../components/NodeTypeCard";
import { NodeDetail } from "../components/NodeDetail";
import { FlavorCalendar } from "../components/FlavorCalendar";
import { FlavorCard } from "../components/FlavorCard";
import { FlavorDetail } from "../components/FlavorDetail";
import { VmOnlyNodeCard } from "../components/VmOnlyNodeCard";
import { NoticeBar } from "../components/NoticeBar";
import { SiteAvailabilityBars } from "../components/SiteAvailabilityBars";
import { ReservationCalendar } from "../components/ReservationCalendar";

type SortKey = "default" | "ram-asc" | "ram-desc" | "alphabetical";

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

function buildAvailabilityParams(f: Pick<FilterState, "availabilityWindow" | "customStart" | "customDuration" | "duration">) {
  const now = new Date();
  if (f.availabilityWindow === "custom") {
    const hours = Number(f.customDuration) || 0;
    if (!hours) return {};
    const start = f.customStart ? new Date(f.customStart) : now;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  // "No duration filter" — show everything regardless of availability.
  if (f.duration === "any") return {};
  // "7d" duration is enforced by the per-node slot check below, not the server.
  if (f.availabilityWindow === "7d") return {};
  // "now"
  const hours = Number(f.duration);
  const end = new Date(now.getTime() + hours * 3600 * 1000);
  return { start: now.toISOString(), end: end.toISOString() };
}

const MAX_ID_IN_MESSAGE = 64;

/** Quotes an identifier from the URL for display, clipped to a readable length. */
function quoteId(id: string): string {
  return `"${id.length > MAX_ID_IN_MESSAGE ? `${id.slice(0, MAX_ID_IN_MESSAGE)}…` : id}"`;
}

interface Props {
  cart: CartItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onCartChange: (node: SearchNodeItem, add: boolean) => void;
  onFlavorCountChange: (flavor: VmFlavor, siteId: string, count: number) => void;
  onClearCart: () => void;
  onFiltersSummaryChange?: (summary: string) => void;
  searchEnterSignal?: number;
}

export function DiscoveryPage({ cart, query, onQueryChange, onCartChange, onFlavorCountChange, onClearCart, onFiltersSummaryChange, searchEnterSignal }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [flavorFilters, setFlavorFilters] = useState<FlavorFilterState>(DEFAULT_FLAVOR_FILTERS);
  const [chipSelections, setChipSelections] = useState<Set<string>>(new Set());
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [availTab, setAvailTab] = useState<"now" | "timeline">("now");
  const openedOnFlavor = !!useMatch(FLAVOR_ROUTE);
  const [activeView, setActiveView] = useState<"bare-metal" | "vms">(
    KVM_ENABLED && openedOnFlavor ? "vms" : "bare-metal",
  );
  const [cardView, setCardView] = useState<"individual" | "type">("individual");

  const isBmView = activeView === "bare-metal";
  const isVmView = KVM_ENABLED && activeView === "vms";

  // Debounce query from header
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const searchParams = useMemo(() => {
    const avail = buildAvailabilityParams({
      availabilityWindow: filters.availabilityWindow,
      customStart: filters.customStart,
      customDuration: filters.customDuration,
      duration: filters.duration,
    });
    return {
      gpu: filters.hasGpu ?? undefined,
      min_ram: filters.minRam ?? undefined,
      infiniband: filters.infiniband || undefined,
      ...avail,
      limit: 500,
    };
  }, [filters]);

  const { data, isFetching } = useNodeSearch(searchParams);
  const { data: sitesData } = useSites();
  const { data: flavorsData, isFetching: flavorsFetching } = useFlavors(KVM_SITE_ID, KVM_ENABLED);
  const siteMap = useSiteMap();

  const allNodes = useMemo(() => data?.items ?? [], [data]);
  const sites = useMemo(() => sitesData?.items ?? [], [sitesData]);

  const flavors = useMemo(() => flavorsData?.items ?? [], [flavorsData]);
  const filteredFlavors = useMemo(() => {
    const afterFilters = applyFlavorFilters(flavors, flavorFilters);
    const q = debouncedQuery.trim().toLowerCase();
    return q ? afterFilters.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      (q === "gpu" && f.gpu.gpu)
    ) : afterFilters;
  }, [flavors, flavorFilters, debouncedQuery]);
  const sortedFlavors = useMemo(() => {
    const arr = [...filteredFlavors];
    if (sortKey === "alphabetical") return arr.sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey === "ram-asc") return arr.sort((a, b) => a.ram_size - b.ram_size || a.name.localeCompare(b.name));
    if (sortKey === "ram-desc") return arr.sort((a, b) => b.ram_size - a.ram_size || a.name.localeCompare(b.name));
    return arr.sort((a, b) =>
      (a.gpu.gpu ? 1 : 0) - (b.gpu.gpu ? 1 : 0) ||
      a.vcpus - b.vcpus ||
      a.ram_size - b.ram_size ||
      a.name.localeCompare(b.name)
    );
  }, [filteredFlavors, sortKey]);
  const { data: kvmNodesData } = useNodeSearch({ site_id: KVM_SITE_ID, limit: 500 }, KVM_ENABLED);
  const vmOnlyNodes = useMemo(
    () => (kvmNodesData?.items ?? []).filter((n) => n.node_mode === "vm_only"),
    [kvmNodesData],
  );

  const navigate = useNavigate();
  const nodePool = useMemo(() => [...allNodes, ...vmOnlyNodes], [allNodes, vmOnlyNodes]);
  const nodePoolLoaded = !!data && (!KVM_ENABLED || !!kvmNodesData);
  const { node: selectedNode, target: nodeTarget, notFound: nodeNotFound } = useSelectedNode(nodePool, nodePoolLoaded);
  const { flavor: selectedFlavor, target: flavorTarget, notFound: flavorNotFound } = useSelectedFlavor(flavors, !!flavorsData);
  const openNode = useCallback((node: SearchNodeItem) => navigate(nodePath(node)), [navigate]);
  const closeNode = useCallback(() => navigate("/"), [navigate]);
  const openFlavor = useCallback((flavor: VmFlavor) => navigate(flavorPath(KVM_SITE_ID, flavor)), [navigate]);
  const closeFlavor = useCallback(() => navigate("/"), [navigate]);

  const [notice, setNotice] = useState<string | null>(null);

  const missingMessage = useMemo(() => {
    const target = nodeTarget ?? flavorTarget;
    if (!target) return null;
    const siteName = siteMap.get(target.siteId)?.name;
    if (sites.length > 0 && !siteName) return `Site ${quoteId(target.siteId)} does not exist.`;
    const site = siteName ?? quoteId(target.siteId);
    if (nodeTarget && nodeNotFound) return `Node ${quoteId(nodeTarget.uid)} does not exist at ${site}.`;
    if (flavorTarget && flavorNotFound) return `Flavor ${quoteId(flavorTarget.uid)} does not exist at ${site}.`;
    return null;
  }, [nodeTarget, flavorTarget, nodeNotFound, flavorNotFound, sites, siteMap]);

  useEffect(() => {
    if (!missingMessage) return;
    setNotice(missingMessage);
    navigate("/", { replace: true });
  }, [missingMessage, navigate]);

  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isVmView || sortedFlavors.length === 0) return;
    const defaultId = sortedFlavors[0].uid;
    const now = truncateToHour();
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    void queryClient.prefetchQuery({
      queryKey: flavorAvailabilityKey(KVM_SITE_ID, defaultId, now, end),
      queryFn: () => fetchFlavorAvailability(KVM_SITE_ID, defaultId, now, end),
      staleTime: FLAVOR_AVAILABILITY_STALE_MS,
    });
  }, [isVmView, sortedFlavors, queryClient]);

  const flavorCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of cart) {
      if (item.kind === "flavor" && item.siteId === KVM_SITE_ID) m.set(item.flavor.uid, item.count);
    }
    return m;
  }, [cart]);
  const totalSelected = useMemo(() => cartItemCount(cart), [cart]);

  const sitesInitialized = useRef(false);
  useEffect(() => {
    if (sites.length === 0 || sitesInitialized.current) return;
    sitesInitialized.current = true;
    setSelectedSites(new Set(sites.filter((s) => isCoreSite(s.uid)).map((s) => s.uid)));
  }, [sites]);

  const [siteOrder, setSiteOrder] = useState<string[]>([]);
  useEffect(() => {
    if (allNodes.length === 0) return;
    const counts = new Map<string, number>();
    for (const n of allNodes) counts.set(n.site_id, (counts.get(n.site_id) ?? 0) + 1);
    setSiteOrder(Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id));
  }, [allNodes]);

  const siteIds = useMemo(() => sites.map((s) => s.uid), [sites]);
  const syncQueries = useQueries({
    queries: siteIds.map((id) => ({
      queryKey: ["site-availability-status", id],
      queryFn: () => fetchSiteAvailabilityStatus(id),
      retry: false,
      staleTime: 60 * 1000,
    })),
  });
  const lastSynced = useMemo(() => {
    const times = syncQueries
      .filter((q) => q.data)
      .map((q) => new Date(q.data!.last_synced).getTime());
    if (times.length === 0) return null;
    return new Date(Math.min(...times));
  }, [syncQueries]);

  const staleSiteIds = useMemo(() => {
    const now = Date.now();
    const stale = new Set<string>();
    siteIds.forEach((id, i) => {
      const q = syncQueries[i];
      if (!q?.data) {
        stale.add(id);
      } else {
        const ageMin = (now - new Date(q.data.last_synced).getTime()) / 60000;
        if (ageMin > 60) stale.add(id);
      }
    });
    return stale;
  }, [syncQueries, siteIds]);

  const cartIds = useMemo(
    () => new Set(cart.filter((i) => i.kind === "node").map((i) => i.node.uid)),
    [cart],
  );

  // The search API only filters by status, not duration, so duration is enforced per-node below.
  const needsSlotCheck =
    filters.availabilityWindow === "custom" ? Boolean(filters.customDuration) : filters.duration !== "any";

  const stateFiltered = useMemo(() => {
    const afterFilters = applyFilters(allNodes, filters);
    return applyTextQuery(afterFilters, debouncedQuery);
  }, [allNodes, filters, debouncedQuery]);

  const slotQueries = useQueries({
    queries: stateFiltered.map((n) => ({
      queryKey: ["availability", n.site_id, n.cluster_id, n.uid],
      queryFn: () => fetchNodeAvailability(n.site_id, n.cluster_id, n.uid),
      staleTime: 2 * 60 * 1000,
      retry: false,
      enabled: needsSlotCheck,
    })),
  });

  const slotFiltered = useMemo(() => {
    if (!needsSlotCheck) return stateFiltered;
    const now = new Date();
    const isCustom = filters.availabilityWindow === "custom";
    const durationMs = Number(isCustom ? filters.customDuration : filters.duration) * 3600 * 1000;
    const searchStart = isCustom && filters.customStart ? new Date(filters.customStart) : now;
    const horizonEnd =
      filters.availabilityWindow === "7d" ? now.getTime() + SEVEN_DAYS_MS : searchStart.getTime();
    return stateFiltered.filter((_n, i) => {
      const data = slotQueries[i]?.data;
      if (!data) return false;
      const intervals = data.reservations.map((r) => ({ start: new Date(r.start).getTime(), end: new Date(r.end).getTime() }));
      const slot = findNextAvailableWindow(intervals, durationMs, searchStart);
      return slot.start.getTime() <= horizonEnd;
    });
  }, [stateFiltered, needsSlotCheck, slotQueries, filters.duration, filters.availabilityWindow, filters.customStart, filters.customDuration]);

  const filteredPreChip = useMemo(() => {
    if (selectedSites.size === 0) return slotFiltered;
    return slotFiltered.filter((n) => selectedSites.has(n.site_id));
  }, [slotFiltered, selectedSites]);

  const filtered = useMemo(() => {
    if (chipSelections.size === 0) return filteredPreChip;
    return filteredPreChip.filter((n) => chipSelections.has(`${n.site_id}:${n.node_type}`));
  }, [filteredPreChip, chipSelections]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === "default") {
      const order: Record<string, number> = { available: 0, unknown: 1, maintenance: 2, reserved: 3 };
      const counts = new Map<string, number>();
      for (const n of arr) counts.set(n.node_type, (counts.get(n.node_type) ?? 0) + 1);
      return arr.sort((a, b) => {
        const byAvail = order[a.availability] - order[b.availability];
        if (byAvail !== 0) return byAvail;
        const byCount = (counts.get(b.node_type) ?? 0) - (counts.get(a.node_type) ?? 0);
        if (byCount !== 0) return byCount;
        return a.node_type.localeCompare(b.node_type);
      });
    }
    if (sortKey === "ram-asc") {
      return arr.sort((a, b) =>
        (a.main_memory?.ram_size ?? 0) - (b.main_memory?.ram_size ?? 0) ||
        (a.node_name || a.node_type).localeCompare(b.node_name || b.node_type)
      );
    }
    if (sortKey === "ram-desc") {
      return arr.sort((a, b) =>
        (b.main_memory?.ram_size ?? 0) - (a.main_memory?.ram_size ?? 0) ||
        (a.node_name || a.node_type).localeCompare(b.node_name || b.node_type)
      );
    }
    return arr.sort((a, b) =>
      (a.node_name || a.node_type).localeCompare(b.node_name || b.node_type)
    );
  }, [filtered, sortKey]);

  const typeGroups = useMemo(() => {
    const groups = new Map<string, SearchNodeItem[]>();
    for (const n of sorted) {
      const key = `${n.site_id}::${n.node_type}`;
      const arr = groups.get(key);
      if (arr) arr.push(n);
      else groups.set(key, [n]);
    }
    const result = Array.from(groups.values());
    if (sortKey === "alphabetical") {
      result.sort((a, b) => a[0].node_type.localeCompare(b[0].node_type));
    }
    return result;
  }, [sorted, sortKey]);

  const filterChips = useMemo(() => getActiveFilterChips(filters), [filters]);
  const flavorFilterChips = useMemo(() => getActiveFlavorFilterChips(flavorFilters), [flavorFilters]);

  const selectedNodeTypeChips = useMemo(
    () => Array.from(new Set(Array.from(chipSelections).map((k) => k.split(":")[1]))),
    [chipSelections],
  );

  const handleRemoveNodeTypeChip = useCallback((nodeType: string) => {
    setChipSelections((prev) => {
      const next = new Set(prev);
      for (const key of next) {
        if (key.split(":")[1] === nodeType) next.delete(key);
      }
      return next;
    });
  }, []);

  const handleNodeTypeQuantityChange = useCallback((nodes: SearchNodeItem[], count: number) => {
    const inCart = nodes.filter((n) => cartIds.has(n.uid));
    const current = inCart.length;
    if (count > current) {
      const toAdd = nodes.filter((n) => !cartIds.has(n.uid)).slice(0, count - current);
      for (const n of toAdd) onCartChange(n, true);
    } else if (count < current) {
      const toRemove = inCart.slice(count);
      for (const n of toRemove) onCartChange(n, false);
    }
  }, [cartIds, onCartChange]);

  const peerNodes = useMemo(() => {
    if (!selectedNode) return [];
    return allNodes.filter(
      (n) =>
        n.node_type === selectedNode.node_type &&
        n.site_id === selectedNode.site_id,
    );
  }, [selectedNode, allNodes]);

  const sitesDifferFromDefault = useMemo(() => {
    if (sites.length === 0) return false;
    return sites.some((s) => isCoreSite(s.uid) ? !selectedSites.has(s.uid) : selectedSites.has(s.uid));
  }, [sites, selectedSites]);

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (debouncedQuery.trim()) parts.push(`Search: "${debouncedQuery.trim()}"`);
    parts.push(...filterChips.map((c) => c.label));
    if (sitesDifferFromDefault) {
      parts.push(`Sites: ${Array.from(selectedSites).map((id) => siteMap.get(id)?.name ?? id).join(", ")}`);
    }
    if (selectedNodeTypeChips.length > 0) parts.push(`Node types: ${selectedNodeTypeChips.join(", ")}`);
    return parts.join("; ");
  }, [debouncedQuery, filterChips, sitesDifferFromDefault, selectedSites, siteMap, selectedNodeTypeChips]);

  useEffect(() => {
    onFiltersSummaryChange?.(filtersSummary);
  }, [filtersSummary, onFiltersSummaryChange]);

  const reservationWindow = useMemo(() => {
    if (!searchParams.start || !searchParams.end) return null;
    return { start: searchParams.start, end: searchParams.end };
  }, [searchParams]);

  useEffect(() => {
    if (reservationWindow) {
      localStorage.setItem("reservation-window", JSON.stringify(reservationWindow));
    } else {
      localStorage.removeItem("reservation-window");
    }
  }, [reservationWindow]);

  useEffect(() => {
    if (searchEnterSignal === 0) return;
    const q = query.trim();
    if (!q) return;
    setDebouncedQuery(q);
  }, [searchEnterSignal, query]);

  const handleResetBm = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setChipSelections(new Set());
    setSelectedSites(new Set(sites.filter((s) => isCoreSite(s.uid)).map((s) => s.uid)));
  }, [sites]);

  const handleViewChange = useCallback((view: "bare-metal" | "vms") => {
    setActiveView(view);
    setSortKey("default");
  }, []);

  const handleSiteToggle = useCallback((siteId: string) => {
    setSelectedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }, []);

  const handleAvailabilityFilter = useCallback((siteId: string, nodeType: string) => {
    const key = `${siteId}:${nodeType}`;
    setChipSelections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="flex">
      <FilterSidebar
        all={allNodes}
        filters={filters}
        onFiltersChange={setFilters}
        flavors={flavors}
        flavorFilters={flavorFilters}
        onFlavorFiltersChange={setFlavorFilters}
        sites={sites}
        selectedSites={selectedSites}
        sitesDifferFromDefault={sitesDifferFromDefault}
        chipSelectionsSize={chipSelections.size}
        onSiteToggle={handleSiteToggle}
        onReset={handleResetBm}
        view={activeView}
        onViewChange={handleViewChange}
        cardView={cardView}
        onCardViewChange={setCardView}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="p-6">

          <div className="flex flex-col gap-4">

            {notice && <NoticeBar message={notice} onDismiss={() => setNotice(null)} />}

            {isBmView && (
              <div className="bg-white border border-grey-light rounded-md">
                <div className="flex items-center gap-2 px-6 pt-3 pb-0">
                  {(() => {
                    const ageMin = lastSynced ? (Date.now() - lastSynced.getTime()) / 60000 : null;
                    const dotColor = ageMin === null ? "bg-grey-med" : ageMin <= 15 ? "bg-brand-success" : ageMin <= 60 ? "bg-yellow-500" : "bg-brand-danger";
                    return (
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`} />
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
                      </span>
                    );
                  })()}
                  <span className="text-xs font-medium text-grey uppercase tracking-wide">
                    {cardView === "type" ? "Availability of Filtered Node Types" : "Availability of Filtered Nodes"}
                    {lastSynced && (
                      <span className="normal-case font-normal text-grey-med ml-1">
                        (last sync&apos;d {lastSynced.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3 px-6 pt-2 pb-0">
                  <div className="flex rounded border border-grey-light overflow-hidden text-xs">
                    {(["now", "timeline"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setAvailTab(tab)}
                        className={`px-3 py-1 transition-colors ${availTab === tab ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`}
                      >
                        {tab === "now" ? "Status Now" : "Reservation Calendar"}
                      </button>
                    ))}
                  </div>
                </div>

                {availTab === "now" ? (
                  <SiteAvailabilityBars
                    nodes={slotFiltered}
                    siteMap={siteMap}
                    onFilter={handleAvailabilityFilter}
                    selectedChips={chipSelections}
                    selectedSites={selectedSites}
                    siteOrder={siteOrder}
                  />
                ) : (
                  <div className="px-6 py-3">
                    <ReservationCalendar nodes={filtered} siteMap={siteMap} groupBy={cardView === "type" ? "type" : "individual"} onNodeClick={openNode} staleSiteIds={staleSiteIds} />
                  </div>
                )}
              </div>
            )}

            {isBmView && (
              <div className="flex items-center gap-3 border-b border-grey-light py-1">
                <div className="flex items-center gap-1.5 flex-wrap flex-1">
                  {debouncedQuery.trim() && (
                    <span className="flex items-center gap-1 text-xs bg-brand-info/10 text-brand-info px-2 py-0.5 rounded-full">
                      Search: &quot;{debouncedQuery.length > 24 ? `${debouncedQuery.slice(0, 24)}…` : debouncedQuery}&quot;
                      <button onClick={() => onQueryChange("")} className="hover:text-brand-danger transition-colors" aria-label="Clear search">✕</button>
                    </span>
                  )}
                  {filterChips.map((chip) => (
                    <span key={chip.id} className="flex items-center gap-1 text-xs bg-brand-info/10 text-brand-info px-2 py-0.5 rounded-full">
                      {chip.label}
                      <button onClick={() => setFilters(chip.clear(filters))} className="hover:text-brand-danger transition-colors" aria-label={`Remove filter: ${chip.label}`}>✕</button>
                    </span>
                  ))}
                  {sitesDifferFromDefault && Array.from(selectedSites).map((id) => (
                    <span key={`site-${id}`} className="flex items-center gap-1 text-xs bg-grey-lighter text-grey-dark px-2 py-0.5 rounded-full">
                      Site: {siteMap.get(id)?.name ?? id}
                      <button onClick={() => handleSiteToggle(id)} className="hover:text-brand-danger transition-colors" aria-label={`Remove site filter: ${siteMap.get(id)?.name ?? id}`}>✕</button>
                    </span>
                  ))}
                  {selectedNodeTypeChips.map((nt) => (
                    <span key={`type-${nt}`} className="flex items-center gap-1 text-xs bg-brand-info/10 text-brand-info px-2 py-0.5 rounded-full">
                      Node type: {nt}
                      <button onClick={() => handleRemoveNodeTypeChip(nt)} className="hover:text-brand-danger transition-colors" aria-label={`Remove node type filter: ${nt}`}>✕</button>
                    </span>
                  ))}
                  {(debouncedQuery.trim() || filterChips.length > 0 || sitesDifferFromDefault || chipSelections.size > 0) && (
                    <button
                      onClick={() => { handleResetBm(); onQueryChange(""); }}
                      className="text-xs text-link hover:text-link-hover transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                {isFetching && <span className="text-grey-med text-xs">Refreshing…</span>}
                <span className="text-xs text-grey tabular-nums">
                  {cardView === "type"
                    ? `${typeGroups.length} node type${typeGroups.length !== 1 ? "s" : ""}`
                    : `${sorted.length} node${sorted.length !== 1 ? "s" : ""}`}
                </span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-xs border border-grey-light rounded px-2 py-1 text-grey-dark bg-white focus:outline-none focus:ring-1 focus:ring-brand-info"
                  aria-label="Sort by"
                >
                  <option value="default">Sort: Soonest available</option>
                  <option value="ram-asc">Sort: RAM low → high</option>
                  <option value="ram-desc">Sort: RAM high → low</option>
                  <option value="alphabetical">Sort: Alphabetical</option>
                </select>
              </div>
            )}

            {isBmView && KVM_ENABLED && debouncedQuery.trim() && sortedFlavors.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-3 py-2">
                <span>{sortedFlavors.length} VM flavor{sortedFlavors.length !== 1 ? "s" : ""} match your search.</span>
                <button
                  onClick={() => handleViewChange("vms")}
                  className="font-medium underline underline-offset-2 hover:text-purple-900 transition-colors whitespace-nowrap"
                >
                  Switch to Virtual Machines →
                </button>
              </div>
            )}

            {/* Bare metal node cards */}
            {isBmView && (
              sorted.length === 0 && !isFetching ? (
                <div className="flex flex-col items-center justify-center h-40 text-grey">
                  <p className="text-lg font-medium mb-2">No resources found</p>
                  <p className="text-sm">Try adjusting your filters or search query.</p>
                  <button
                    onClick={handleResetBm}
                    className="mt-3 text-sm text-link hover:text-link-hover transition-colors"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {cardView === "individual"
                    ? sorted.map((node) => (
                        <NodeCard
                          key={node.uid}
                          node={node}
                          siteName={siteMap.get(node.site_id)?.name ?? node.site_id}
                          selected={cartIds.has(node.uid)}
                          onSelect={(add) => onCartChange(node, add)}
                          onClick={() => openNode(node)}
                        />
                      ))
                    : typeGroups.map((nodes) => (
                        <NodeTypeCard
                          key={`${nodes[0].site_id}::${nodes[0].node_type}`}
                          nodes={nodes}
                          siteName={siteMap.get(nodes[0].site_id)?.name ?? nodes[0].site_id}
                          selectedCount={nodes.filter((n) => cartIds.has(n.uid)).length}
                          onQuantityChange={(count) => handleNodeTypeQuantityChange(nodes, count)}
                          onClick={() => openNode(nodes[0])}
                        />
                      ))}
                </div>
              )
            )}

            {/* VM flavor cards */}
            {isVmView && (
              sortedFlavors.length === 0 && !flavorsFetching ? (
                <div className="flex flex-col items-center justify-center h-40 text-grey">
                  <p className="text-sm font-medium mb-1">No flavors found</p>
                  <p className="text-xs">Try adjusting your search query or filters.</p>
                  <button
                    onClick={() => { setFlavorFilters(DEFAULT_FLAVOR_FILTERS); onQueryChange(""); }}
                    className="mt-3 text-sm text-link hover:text-link-hover transition-colors"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-white border border-grey-light rounded-md p-6">
                    <FlavorCalendar siteId={KVM_SITE_ID} flavors={sortedFlavors} />
                  </div>
                  <div className="flex items-center gap-3 border-b border-grey-light py-1">
                    <div className="flex items-center gap-1.5 flex-wrap flex-1">
                      {debouncedQuery.trim() && (
                        <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          Search: &quot;{debouncedQuery.length > 24 ? `${debouncedQuery.slice(0, 24)}…` : debouncedQuery}&quot;
                          <button onClick={() => onQueryChange("")} className="hover:text-purple-900 transition-colors" aria-label="Clear search">✕</button>
                        </span>
                      )}
                      {flavorFilterChips.map((chip) => (
                        <span key={chip.id} className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          {chip.label}
                          <button onClick={() => setFlavorFilters(chip.clear(flavorFilters))} className="hover:text-purple-900 transition-colors" aria-label={`Remove filter: ${chip.label}`}>✕</button>
                        </span>
                      ))}
                      {(flavorFilterChips.length > 0 || debouncedQuery.trim()) && (
                        <button onClick={() => { setFlavorFilters(DEFAULT_FLAVOR_FILTERS); onQueryChange(""); }} className="text-xs text-link hover:text-link-hover transition-colors">
                          Clear all
                        </button>
                      )}
                    </div>
                    {flavorsFetching && <span className="text-grey-med text-xs">Refreshing…</span>}
                    <span className="text-xs text-grey tabular-nums">
                      {`${sortedFlavors.length} flavor${sortedFlavors.length !== 1 ? "s" : ""}`}
                    </span>
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="text-xs border border-grey-light rounded px-2 py-1 text-grey-dark bg-white focus:outline-none focus:ring-1 focus:ring-brand-info"
                      aria-label="Sort by"
                    >
                      <option value="default">Sort: By vCPUs</option>
                      <option value="ram-asc">Sort: RAM low → high</option>
                      <option value="ram-desc">Sort: RAM high → low</option>
                      <option value="alphabetical">Sort: Alphabetical</option>
                    </select>
                  </div>
                  {debouncedQuery.trim() && sorted.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                      <span>{sorted.length} bare metal node{sorted.length !== 1 ? "s" : ""} match your search.</span>
                      <button
                        onClick={() => handleViewChange("bare-metal")}
                        className="font-medium underline underline-offset-2 hover:text-blue-900 transition-colors whitespace-nowrap"
                      >
                        Switch to Bare Metal →
                      </button>
                    </div>
                  )}
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {sortedFlavors.map((flavor) => (
                      <FlavorCard
                        key={flavor.uid}
                        flavor={flavor}
                        siteName={siteMap.get(KVM_SITE_ID)?.name ?? KVM_SITE_ID}
                        count={flavorCounts.get(flavor.uid) ?? 0}
                        onCountChange={(count) => onFlavorCountChange(flavor, KVM_SITE_ID, count)}
                        onClick={() => openFlavor(flavor)}
                      />
                    ))}
                  </div>
                  {vmOnlyNodes.length > 0 && (
                    <>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 border-t border-grey-light" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-grey">Physical Hardware for Virtual Machines</span>
                        <div className="flex-1 border-t border-grey-light" />
                      </div>
                      <div className="bg-yellow-50 border border-yellow-300 rounded px-3 py-2 text-xs text-yellow-800">
                        <strong>Note:</strong> These are example reference hardware nodes that your VMs may run on. Your VM may run on different hardware not shown here.
                      </div>
                      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {vmOnlyNodes.map((node) => (
                          <VmOnlyNodeCard
                            key={node.uid}
                            node={node}
                            siteName={siteMap.get(node.site_id)?.name ?? node.site_id}
                            onClick={() => openNode(node)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )
            )}

          </div>

        </div>
      </div>

      <NodeDetail
        node={selectedNode}
        peerNodes={peerNodes}
        siteMap={siteMap}
        reservationWindow={reservationWindow}
        onClose={closeNode}
      />

      {KVM_ENABLED && (
        <FlavorDetail
          flavor={selectedFlavor}
          siteName={siteMap.get(KVM_SITE_ID)?.name ?? KVM_SITE_ID}
          sites={sites.filter((s) => s.uid === KVM_SITE_ID)}
          count={selectedFlavor ? flavorCounts.get(selectedFlavor.uid) ?? 0 : 0}
          onCountChange={(count) => selectedFlavor && onFlavorCountChange(selectedFlavor, KVM_SITE_ID, count)}
          horizonUrl={siteMap.get(KVM_SITE_ID)?.web}
          reservationWindow={reservationWindow}
          onClose={closeFlavor}
        />
      )}

      {totalSelected > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 bg-grey-dark text-white rounded-full shadow-2xl px-5 py-3 animate-in slide-in-from-bottom duration-200">
            <span className="text-sm font-medium">
              {totalSelected} resource{totalSelected !== 1 ? "s" : ""} selected
            </span>
            <span className="text-grey-med text-xs">·</span>
            <Link
              to="/cart"
              className="bg-brand-primary text-grey-dark text-sm font-semibold px-4 py-1.5 rounded-full hover:bg-brand-success transition-colors"
            >
              Reserve selected →
            </Link>
            <button
              onClick={onClearCart}
              className="text-grey-med hover:text-white text-xs transition-colors"
              aria-label="Clear selection"
            >
              ✕ Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
