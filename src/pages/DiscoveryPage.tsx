import { useState, useMemo, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import type { SearchNodeItem } from "../api/types";
import type { FilterState } from "../lib/filterCounts";
import { DEFAULT_FILTERS, applyFilters, applyTextQuery, getActiveFilterChips } from "../lib/filterCounts";
import { useNodeSearch } from "../hooks/useNodeSearch";
import { useSites, useSiteMap } from "../hooks/useSites";
import { isCoreSite } from "../lib/sites";
import { fetchSiteAvailabilityStatus, fetchNodeAvailability } from "../api/client";
import { findNextAvailableWindow } from "../lib/availability";
import { FilterSidebar } from "../components/FilterSidebar";
import { NodeCard } from "../components/NodeCard";
import { NodeTypeCard } from "../components/NodeTypeCard";
import { NodeDetail } from "../components/NodeDetail";
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
  if (f.availabilityWindow === "7d") {
    const end = new Date(now.getTime() + SEVEN_DAYS_MS);
    return { start: now.toISOString(), end: end.toISOString() };
  }
  // "now"
  const hours = Number(f.duration);
  const end = new Date(now.getTime() + hours * 3600 * 1000);
  return { start: now.toISOString(), end: end.toISOString() };
}

interface Props {
  cart: SearchNodeItem[];
  query: string;
  onQueryChange: (query: string) => void;
  onCartChange: (node: SearchNodeItem, add: boolean) => void;
  onClearCart: () => void;
}

export function DiscoveryPage({ cart, query, onQueryChange, onCartChange, onClearCart }: Props) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [chipSelections, setChipSelections] = useState<Set<string>>(new Set());
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("availability");
  const [availTab, setAvailTab] = useState<"now" | "timeline">("now");
  const [selectedNode, setSelectedNode] = useState<SearchNodeItem | null>(null);
  const [cardView, setCardView] = useState<"type" | "individual">("individual");

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
  const siteMap = useSiteMap();

  const allNodes = useMemo(() => data?.items ?? [], [data]);
  const sites = useMemo(() => sitesData?.items ?? [], [sitesData]);

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

  const cartIds = useMemo(() => new Set(cart.map((n) => n.uid)), [cart]);

  // "Within 7 days" + a duration needs a per-node check for a free slot of that
  // length somewhere in the next 7 days (the search API only filters by status).
  const needsSlotCheck = filters.availabilityWindow === "7d" && filters.duration !== "any";

  const baseFiltered = useMemo(() => {
    const afterFilters = applyFilters(allNodes, { ...filters, sites: new Set() });
    return applyTextQuery(afterFilters, debouncedQuery);
  }, [allNodes, filters, debouncedQuery]);

  const slotQueries = useQueries({
    queries: baseFiltered.map((n) => ({
      queryKey: ["availability", n.site_id, n.cluster_id, n.uid],
      queryFn: () => fetchNodeAvailability(n.site_id, n.cluster_id, n.uid),
      staleTime: 2 * 60 * 1000,
      retry: false,
      enabled: needsSlotCheck,
    })),
  });

  const filteredBase = useMemo(() => {
    if (!needsSlotCheck) return baseFiltered;
    const durationMs = Number(filters.duration) * 3600 * 1000;
    const now = new Date();
    const horizonEnd = now.getTime() + SEVEN_DAYS_MS;
    return baseFiltered.filter((_n, i) => {
      const data = slotQueries[i]?.data;
      if (!data) return false;
      const intervals = data.reservations.map((r) => ({ start: new Date(r.start).getTime(), end: new Date(r.end).getTime() }));
      const slot = findNextAvailableWindow(intervals, durationMs, now);
      return slot.start.getTime() <= horizonEnd;
    });
  }, [baseFiltered, needsSlotCheck, slotQueries, filters.duration]);

  const filteredPreChip = useMemo(() => {
    if (selectedSites.size === 0) return filteredBase;
    return filteredBase.filter((n) => selectedSites.has(n.site_id));
  }, [filteredBase, selectedSites]);

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
    return arr.sort((a, b) => a.node_type.localeCompare(b.node_type));
  }, [filtered, sortKey]);

  const typeGroups = useMemo(() => {
    const groups = new Map<string, SearchNodeItem[]>();
    for (const n of sorted) {
      const key = `${n.site_id}::${n.node_type}`;
      const arr = groups.get(key);
      if (arr) arr.push(n);
      else groups.set(key, [n]);
    }
    return Array.from(groups.values());
  }, [sorted]);

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

  const reservationWindow = useMemo(() => {
    const params = buildAvailabilityParams({
      availabilityWindow: filters.availabilityWindow,
      customStart: filters.customStart,
      customDuration: filters.customDuration,
      duration: filters.duration,
    });
    if (!params.start || !params.end) return null;
    return { start: params.start, end: params.end };
  }, [filters]);

  useEffect(() => {
    if (reservationWindow) {
      localStorage.setItem("reservation-window", JSON.stringify(reservationWindow));
    } else {
      localStorage.removeItem("reservation-window");
    }
  }, [reservationWindow]);

  const handleFiltersChange = useCallback((f: FilterState) => setFilters(f), []);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
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

  return (
    <div className="flex">
      <FilterSidebar
        all={allNodes}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Availability section with tabs */}
        <div className="bg-white border-b border-grey-light">
          {/* Header row */}
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
            <span className="text-[10px] font-medium text-grey uppercase tracking-wide">
              Availability of Filtered Nodes
              {lastSynced && (
                <span className="normal-case font-normal text-grey-med ml-1">
                  (last sync&apos;d {lastSynced.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})
                </span>
              )}
            </span>
          </div>

          {/* Tab toggle row */}
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
                <span className="text-[9px] text-grey-med italic">Click site names to include or exclude from results</span>
              )}
              {(chipSelections.size > 0 || sitesDifferFromDefault) && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[10px] text-grey-med">Filtered by:</span>
                  {sitesDifferFromDefault &&
                    Array.from(selectedSites).map((id) => (
                      <span key={id} className="text-[10px] bg-grey-lighter text-grey-dark px-1.5 py-0.5 rounded">
                        {siteMap.get(id)?.name ?? id}
                      </span>
                    ))}
                  {chipSelections.size > 0 &&
                    selectedNodeTypeChips.map((nt) => (
                      <span key={nt} className="text-[10px] bg-brand-info/10 text-brand-info px-1.5 py-0.5 rounded">
                        {nt}
                      </span>
                    ))}
                  <button
                    onClick={handleResetSiteTypeFilters}
                    className="text-[10px] text-link hover:text-link-hover transition-colors ml-1"
                  >
                    ↺ Reset
                  </button>
                </div>
              )}
            </div>
          )}

          {availTab === "now" ? (
            <SiteAvailabilityBars
              nodes={filteredBase}
              siteMap={siteMap}
              onFilter={handleAvailabilityFilter}
              selectedChips={chipSelections}
              selectedSites={selectedSites}
              onSiteToggle={handleSiteToggle}
              siteOrder={siteOrder}
              controls={
                <>
                  {isFetching && <span className="text-grey-med text-xs">Refreshing…</span>}
                  <span className="text-xs text-grey">{sorted.length} results</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="text-xs border border-grey-light rounded px-2 py-1 text-grey-dark bg-white focus:outline-none focus:ring-1 focus:ring-brand-info"
                    aria-label="Sort by"
                  >
                    <option value="availability">Sort: Soonest available</option>
                    <option value="alphabetical">Sort: Alphabetical</option>
                  </select>
                </>
              }
            />
          ) : (
            <div className="px-6 py-3">
              <ReservationCalendar nodes={filtered} siteMap={siteMap} onNodeClick={setSelectedNode} />
            </div>
          )}
        </div>

        {/* Results grid */}
        <div className="p-6">
          {sorted.length === 0 && !isFetching ? (
            <div className="flex flex-col items-center justify-center h-full text-grey">
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
            <>
              <div className="flex items-center justify-between gap-2 mb-4">
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
                        onClick={() => handleFiltersChange(chip.clear(filters))}
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
                  {(filterChips.length > 0 || sitesDifferFromDefault || chipSelections.size > 0 || debouncedQuery.trim()) && (
                    <button
                      onClick={() => {
                        handleFiltersChange(DEFAULT_FILTERS);
                        handleResetSiteTypeFilters();
                        onQueryChange("");
                      }}
                      className="text-xs text-link hover:text-link-hover transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="flex rounded border border-grey-light overflow-hidden text-xs flex-shrink-0">
                  {(["individual", "type"] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setCardView(view)}
                      className={`px-3 py-1 transition-colors ${cardView === view ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`}
                    >
                      {view === "type" ? "By Node Type" : "Individual Nodes"}
                    </button>
                  ))}
                </div>
              </div>
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
            </>
          )}
        </div>
      </div>

      <NodeDetail
        node={selectedNode}
        peerNodes={peerNodes}
        siteMap={siteMap}
        reservationWindow={reservationWindow}
        onClose={() => setSelectedNode(null)}
      />

      {/* Floating selection bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 bg-grey-dark text-white rounded-full shadow-2xl px-5 py-3 animate-in slide-in-from-bottom duration-200">
            <span className="text-sm font-medium">
              {cart.length} node{cart.length !== 1 ? "s" : ""} selected
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
