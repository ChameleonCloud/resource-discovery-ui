import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { SearchNodeItem, VmFlavor } from "../api/types";
import type { CartItem } from "../hooks/useCart";
import { cartItemCount } from "../hooks/useCart";
import type { FilterState } from "../lib/filters";
import { DEFAULT_FILTERS, applyFilters, applyTextQuery, getActiveFilterChips } from "../lib/filters";
import type { FlavorFilterState } from "../lib/flavorFilters";
import { DEFAULT_FLAVOR_FILTERS, applyFlavorFilters } from "../lib/flavorFilters";
import { useNodeSearch } from "../hooks/useNodeSearch";
import { useFlavors } from "../hooks/useFlavors";
import { useSites, useSiteMap } from "../hooks/useSites";
import { FLAVOR_AVAILABILITY_STALE_MS, flavorAvailabilityKey } from "../hooks/useFlavorAvailability";
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
import { SiteAvailabilityBars } from "../components/SiteAvailabilityBars";
import { ReservationCalendar } from "../components/ReservationCalendar";

type SortKey = "availability" | "alphabetical";

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
  const [sortKey, setSortKey] = useState<SortKey>("availability");
  const [availTab, setAvailTab] = useState<"now" | "timeline">("now");
  const [selectedNode, setSelectedNode] = useState<SearchNodeItem | null>(null);
  const [selectedFlavor, setSelectedFlavor] = useState<VmFlavor | null>(null);
  const [cardView, setCardView] = useState<"individual" | "type" | "flavors">("individual");
  const viewSwitchPendingRef = useRef(false);

  const showBareMetal = filters.resourceType !== "vms";
  const showVms = KVM_ENABLED && filters.resourceType !== "bare-metal";

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
      (q === "gpu" && f.gpu?.gpu)
    ) : afterFilters;
  }, [flavors, flavorFilters, debouncedQuery]);
  const sortedFlavors = useMemo(
    () => sortKey === "alphabetical"
      ? [...filteredFlavors].sort((a, b) => a.name.localeCompare(b.name))
      : [...filteredFlavors].sort((a, b) => a.vcpus - b.vcpus || a.name.localeCompare(b.name)),
    [filteredFlavors, sortKey],
  );
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!KVM_ENABLED || sortedFlavors.length === 0) return;
    const defaultId = sortedFlavors[0].uid;
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    void queryClient.prefetchQuery({
      queryKey: flavorAvailabilityKey(KVM_SITE_ID, defaultId, now, end),
      queryFn: () => fetchFlavorAvailability(KVM_SITE_ID, defaultId, now, end),
      staleTime: FLAVOR_AVAILABILITY_STALE_MS,
    });
  }, [sortedFlavors, queryClient]);

  const flavorCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of cart) {
      if (item.kind === "flavor" && item.siteId === KVM_SITE_ID) m.set(item.flavor.uid, item.count);
    }
    return m;
  }, [cart]);
  const totalSelected = useMemo(() => cartItemCount(cart), [cart]);

  useEffect(() => {
    if (sites.length === 0) return;
    setSelectedSites((prev) => {
      if (prev.size > 0) return prev;
      return new Set(sites.filter((s) => isCoreSite(s.uid)).map((s) => s.uid));
    });
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
    return new Date(Math.max(...times));
  }, [syncQueries]);

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
    if (sortKey === "availability") {
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

  const handleGroupSelect = useCallback((nodes: SearchNodeItem[], add: boolean) => {
    for (const n of nodes) {
      const inCart = cartIds.has(n.uid);
      if (add && !inCart) onCartChange(n, true);
      if (!add && inCart) onCartChange(n, false);
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

  // Keep cardView in sync when a resource type is toggled off
  useEffect(() => {
    if (!showVms && cardView === "flavors") setCardView("individual");
  }, [showVms, cardView]);
  useEffect(() => {
    if (!showBareMetal && KVM_ENABLED && cardView !== "flavors") setCardView("flavors");
  }, [showBareMetal, cardView]);

  useEffect(() => {
    if (searchEnterSignal === 0) return;
    const q = query.trim();
    if (!q) return;
    setDebouncedQuery(q);
    viewSwitchPendingRef.current = true;
  }, [searchEnterSignal, query]);

  useEffect(() => {
    if (!viewSwitchPendingRef.current) return;
    if (isFetching) return;
    viewSwitchPendingRef.current = false;
    if (cardView !== "flavors" && showVms && sortedFlavors.length > 0 && sorted.length === 0) {
      setCardView("flavors");
    } else if (cardView === "flavors" && showBareMetal && sorted.length > 0 && sortedFlavors.length === 0) {
      setCardView("individual");
    }
  // viewSwitchPendingRef is intentionally excluded: refs are stable and don't need to be listed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching, sorted, sortedFlavors, cardView, showVms, showBareMetal]);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setFlavorFilters(DEFAULT_FLAVOR_FILTERS);
    setChipSelections(new Set());
    setSelectedSites(new Set(sites.filter((s) => isCoreSite(s.uid)).map((s) => s.uid)));
  }, [sites]);

  const handleResetSiteTypeFilters = useCallback(() => {
    setChipSelections(new Set());
    setSelectedSites(new Set(sites.filter((s) => isCoreSite(s.uid)).map((s) => s.uid)));
  }, [sites]);

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

  const anyVmSidebarFilter =
    flavorFilters.hasGpu ||
    flavorFilters.minVcpus !== null ||
    flavorFilters.minRamBytes !== null ||
    flavorFilters.minDiskBytes !== null ||
    flavorFilters.maxSuPerHour !== null;

  const vmSearchHits = !!debouncedQuery.trim() && sortedFlavors.length > 0;

  const anyVmFilter = anyVmSidebarFilter || vmSearchHits;

  const bmSearchHits = !!debouncedQuery.trim() && sorted.length > 0;

  const anyBmFilter =
    bmSearchHits ||
    filterChips.length > 0 ||
    sitesDifferFromDefault ||
    chipSelections.size > 0;

  return (
    <div className="flex">
      <FilterSidebar
        all={allNodes}
        filters={filters}
        onFiltersChange={setFilters}
        flavors={flavors}
        flavorFilters={flavorFilters}
        onFlavorFiltersChange={setFlavorFilters}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="p-6">

          <div className="flex flex-col gap-4">

            {/* Primary view tabs + count/sort */}
            <div className="flex items-center justify-between border-b border-grey-light">
              <div className="flex text-sm">
                <button
                  onClick={() => showBareMetal && setCardView("individual")}
                  title={!showBareMetal ? "Enable bare metal to use this view" : undefined}
                  className={`px-4 py-2 flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                    !showBareMetal
                      ? "border-transparent text-grey-med cursor-not-allowed"
                      : cardView === "individual"
                      ? "border-brand-info text-brand-info font-medium"
                      : "border-transparent text-grey hover:text-grey-dark"
                  }`}
                >
                  Bare Metal — Nodes
                  {showBareMetal && anyBmFilter && sorted.length > 0 && cardView === "flavors" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  )}
                </button>
                <button
                  onClick={() => showBareMetal && setCardView("type")}
                  title={!showBareMetal ? "Enable bare metal to use this view" : undefined}
                  className={`px-4 py-2 flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                    !showBareMetal
                      ? "border-transparent text-grey-med cursor-not-allowed"
                      : cardView === "type"
                      ? "border-brand-info text-brand-info font-medium"
                      : "border-transparent text-grey hover:text-grey-dark"
                  }`}
                >
                  Bare Metal — Node Types
                </button>
                {KVM_ENABLED && (
                  <>
                    <div className="w-px bg-grey-light self-stretch my-1" />
                    <button
                      onClick={() => showVms && setCardView("flavors")}
                      title={!showVms ? "Enable virtual machines to use this view" : undefined}
                      className={`px-4 py-2 flex items-center gap-1.5 border-b-2 -mb-px transition-colors ${
                        !showVms
                          ? "border-transparent text-grey-med cursor-not-allowed"
                          : cardView === "flavors"
                          ? "border-purple-500 text-purple-600 font-medium"
                          : "border-transparent text-grey hover:text-grey-dark"
                      }`}
                    >
                      Virtual Machines
                      {showVms && anyVmFilter && sortedFlavors.length > 0 && cardView !== "flavors" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                      )}
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 pb-1">
                {isFetching && cardView !== "flavors" && (
                  <span className="text-grey-med text-xs">Refreshing…</span>
                )}
                <span className="text-xs text-grey tabular-nums">
                  {cardView === "flavors"
                    ? `${sortedFlavors.length} flavor${sortedFlavors.length !== 1 ? "s" : ""}`
                    : cardView === "type"
                    ? `${typeGroups.length} node type${typeGroups.length !== 1 ? "s" : ""}`
                    : `${sorted.length} node${sorted.length !== 1 ? "s" : ""}`}
                </span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="text-xs border border-grey-light rounded px-2 py-1 text-grey-dark bg-white focus:outline-none focus:ring-1 focus:ring-brand-info"
                  aria-label="Sort by"
                >
                  <option value="availability">{cardView === "flavors" ? "Sort: By vCPUs" : "Sort: Soonest available"}</option>
                  <option value="alphabetical">Sort: Alphabetical</option>
                </select>
              </div>
            </div>

            {showBareMetal && cardView !== "flavors" && (
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
                    Availability of Filtered Nodes
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

                {(availTab === "now" || chipSelections.size > 0 || sitesDifferFromDefault) && (
                  <div className="h-7 flex items-center px-6">
                    {availTab === "now" && (
                      <span className="text-xs text-grey-med italic">Click site names to include or exclude from results</span>
                    )}
                    {(chipSelections.size > 0 || sitesDifferFromDefault) && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-xs text-grey-med">Filtered by:</span>
                        {sitesDifferFromDefault &&
                          Array.from(selectedSites).map((id) => (
                            <span key={id} className="text-xs bg-grey-lighter text-grey-dark px-1.5 py-0.5 rounded">
                              {siteMap.get(id)?.name ?? id}
                            </span>
                          ))}
                        {chipSelections.size > 0 &&
                          selectedNodeTypeChips.map((nt) => (
                            <span key={nt} className="text-xs bg-brand-info/10 text-brand-info px-1.5 py-0.5 rounded">
                              {nt}
                            </span>
                          ))}
                        <button
                          onClick={handleResetSiteTypeFilters}
                          className="text-xs text-link hover:text-link-hover transition-colors ml-1"
                        >
                          ↺ Reset
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {availTab === "now" ? (
                  <SiteAvailabilityBars
                    nodes={slotFiltered}
                    siteMap={siteMap}
                    onFilter={handleAvailabilityFilter}
                    selectedChips={chipSelections}
                    selectedSites={selectedSites}
                    onSiteToggle={handleSiteToggle}
                    siteOrder={siteOrder}
                  />
                ) : (
                  <div className="px-6 py-3">
                    <ReservationCalendar nodes={filtered} siteMap={siteMap} groupBy={cardView === "type" ? "type" : "individual"} onNodeClick={setSelectedNode} />
                  </div>
                )}
              </div>
            )}

            {/* Active filter chips — bare metal views */}
            {showBareMetal && cardView !== "flavors" && (debouncedQuery.trim() || filterChips.length > 0 || sitesDifferFromDefault || chipSelections.size > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {debouncedQuery.trim() && (
                  <span className="flex items-center gap-1 text-xs bg-brand-info/10 text-brand-info px-2 py-0.5 rounded-full">
                    Search: &quot;{debouncedQuery.length > 24 ? `${debouncedQuery.slice(0, 24)}…` : debouncedQuery}&quot;
                    <button
                      onClick={() => onQueryChange("")}
                      className="hover:text-brand-danger transition-colors"
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  </span>
                )}
                {filterChips.map((chip) => (
                  <span
                    key={chip.id}
                    className="flex items-center gap-1 text-xs bg-brand-info/10 text-brand-info px-2 py-0.5 rounded-full"
                  >
                    {chip.label}
                    <button
                      onClick={() => setFilters(chip.clear(filters))}
                      className="hover:text-brand-danger transition-colors"
                      aria-label={`Remove filter: ${chip.label}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {sitesDifferFromDefault &&
                  Array.from(selectedSites).map((id) => (
                    <span
                      key={`site-${id}`}
                      className="flex items-center gap-1 text-xs bg-grey-lighter text-grey-dark px-2 py-0.5 rounded-full"
                    >
                      Site: {siteMap.get(id)?.name ?? id}
                      <button
                        onClick={() => handleSiteToggle(id)}
                        className="hover:text-brand-danger transition-colors"
                        aria-label={`Remove site filter: ${siteMap.get(id)?.name ?? id}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                {selectedNodeTypeChips.map((nt) => (
                  <span
                    key={`type-${nt}`}
                    className="flex items-center gap-1 text-xs bg-brand-info/10 text-brand-info px-2 py-0.5 rounded-full"
                  >
                    Node type: {nt}
                    <button
                      onClick={() => handleRemoveNodeTypeChip(nt)}
                      className="hover:text-brand-danger transition-colors"
                      aria-label={`Remove node type filter: ${nt}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setFlavorFilters(DEFAULT_FLAVOR_FILTERS);
                    handleResetSiteTypeFilters();
                    onQueryChange("");
                  }}
                  className="text-xs text-link hover:text-link-hover transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Active filter chips — VM flavor views */}
            {(!showBareMetal || cardView === "flavors") && anyVmFilter && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {flavorFilters.hasGpu && (
                  <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    Has GPU
                    <button onClick={() => setFlavorFilters({ ...flavorFilters, hasGpu: false })} className="hover:text-purple-900 transition-colors" aria-label="Remove Has GPU filter">✕</button>
                  </span>
                )}
                {flavorFilters.minVcpus !== null && (
                  <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    ≥{flavorFilters.minVcpus} vCPUs
                    <button onClick={() => setFlavorFilters({ ...flavorFilters, minVcpus: null })} className="hover:text-purple-900 transition-colors" aria-label="Remove vCPU filter">✕</button>
                  </span>
                )}
                {flavorFilters.minRamBytes !== null && (
                  <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    ≥{flavorFilters.minRamBytes / 1024 ** 3} GiB RAM
                    <button onClick={() => setFlavorFilters({ ...flavorFilters, minRamBytes: null })} className="hover:text-purple-900 transition-colors" aria-label="Remove RAM filter">✕</button>
                  </span>
                )}
                {flavorFilters.minDiskBytes !== null && (
                  <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    ≥{flavorFilters.minDiskBytes / 1024 ** 3} GiB disk
                    <button onClick={() => setFlavorFilters({ ...flavorFilters, minDiskBytes: null })} className="hover:text-purple-900 transition-colors" aria-label="Remove disk filter">✕</button>
                  </span>
                )}
                {flavorFilters.maxSuPerHour !== null && (
                  <span className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    ≤{flavorFilters.maxSuPerHour} SU/hr
                    <button onClick={() => setFlavorFilters({ ...flavorFilters, maxSuPerHour: null })} className="hover:text-purple-900 transition-colors" aria-label="Remove cost filter">✕</button>
                  </span>
                )}
                <button onClick={() => setFlavorFilters(DEFAULT_FLAVOR_FILTERS)} className="text-xs text-link hover:text-link-hover transition-colors">
                  Clear all
                </button>
              </div>
            )}

            {/* Callout: VM filters active but currently viewing bare metal cards */}
            {showVms && showBareMetal && cardView !== "flavors" && anyVmFilter && (
              <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-3 py-2">
                <span>
                  {sortedFlavors.length > 0
                    ? `${sortedFlavors.length} virtual machine${sortedFlavors.length !== 1 ? "s" : ""} match — not visible in this view.`
                    : "Virtual machine filters are active but not visible in this view."}
                </span>
                <button
                  onClick={() => setCardView("flavors")}
                  className="font-medium underline underline-offset-2 hover:text-purple-900 transition-colors whitespace-nowrap"
                >
                  Switch to Virtual Machines →
                </button>
              </div>
            )}

            {/* Callout: bare metal filters active but currently viewing VM flavor cards */}
            {showBareMetal && cardView === "flavors" && anyBmFilter && (
              <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                <span>
                  {sorted.length > 0
                    ? `${sorted.length} bare metal node${sorted.length !== 1 ? "s" : ""} match — not visible in this view.`
                    : "Bare metal filters are active but not visible in this view."}
                </span>
                <button
                  onClick={() => setCardView("individual")}
                  className="font-medium underline underline-offset-2 hover:text-blue-900 transition-colors whitespace-nowrap"
                >
                  Switch to Bare Metal Nodes →
                </button>
              </div>
            )}

            {/* Bare metal node cards */}
            {showBareMetal && cardView !== "flavors" && (
              sorted.length === 0 && !isFetching ? (
                <div className="flex flex-col items-center justify-center h-40 text-grey">
                  <p className="text-lg font-medium mb-2">No resources found</p>
                  <p className="text-sm">Try adjusting your filters or search query.</p>
                  <button
                    onClick={handleResetFilters}
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
                          onClick={() => setSelectedNode(node)}
                        />
                      ))
                    : typeGroups.map((nodes) => (
                        <NodeTypeCard
                          key={`${nodes[0].site_id}::${nodes[0].node_type}`}
                          nodes={nodes}
                          siteName={siteMap.get(nodes[0].site_id)?.name ?? nodes[0].site_id}
                          selectedCount={nodes.filter((n) => cartIds.has(n.uid)).length}
                          onSelect={(add) => handleGroupSelect(nodes, add)}
                          onClick={() => setSelectedNode(nodes[0])}
                        />
                      ))}
                </div>
              )
            )}

            {/* VM flavor cards — Virtual Machines toggle or VMs-only mode */}
            {showVms && (!showBareMetal || cardView === "flavors") && (
              sortedFlavors.length === 0 && !flavorsFetching ? (
                <div className="flex flex-col items-center justify-center h-40 text-grey">
                  <p className="text-sm font-medium mb-1">No flavors found</p>
                  <p className="text-xs">Try adjusting your search query or filters.</p>
                </div>
              ) : (
                <>
                  <div className="bg-white border border-grey-light rounded-md p-6">
                    <FlavorCalendar siteId={KVM_SITE_ID} flavors={sortedFlavors} />
                  </div>
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {sortedFlavors.map((flavor) => (
                      <FlavorCard
                        key={flavor.uid}
                        flavor={flavor}
                        siteName={siteMap.get(KVM_SITE_ID)?.name ?? KVM_SITE_ID}
                        count={flavorCounts.get(flavor.uid) ?? 0}
                        onCountChange={(count) => onFlavorCountChange(flavor, KVM_SITE_ID, count)}
                        onClick={() => setSelectedFlavor(flavor)}
                      />
                    ))}
                  </div>
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
        onClose={() => setSelectedNode(null)}
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
          onClose={() => setSelectedFlavor(null)}
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
