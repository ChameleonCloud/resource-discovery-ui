import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { SearchNodeItem, Reservation } from "../api/types";
import { fetchNodeAvailability } from "../api/client";

const DAY_MS = 86400000;
const LABEL_W = 200;

type ViewMode = "month" | "week" | "day";

interface ViewConfig {
  columns: number;
  colWidth: number;
  unit: "day" | "hour";
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function startOfMonth(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(1);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function getRange(viewMode: ViewMode, anchor: Date): { start: Date; end: Date; config: ViewConfig } {
  if (viewMode === "month") {
    const start = startOfMonth(anchor);
    const end = addMonths(start, 1);
    const columns = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    return { start, end, config: { columns, colWidth: 28, unit: "day" } };
  }
  if (viewMode === "week") {
    const start = startOfWeek(anchor);
    const end = addDays(start, 7);
    return { start, end, config: { columns: 168, colWidth: 14, unit: "hour" } };
  }
  const start = startOfDay(anchor);
  const end = addDays(start, 1);
  return { start, end, config: { columns: 24, colWidth: 40, unit: "hour" } };
}

function rangeLabel(viewMode: ViewMode, start: Date, end: Date): string {
  if (viewMode === "month") return start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (viewMode === "week") {
    const endIncl = addDays(end, -1);
    return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${endIncl.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function shiftAnchor(viewMode: ViewMode, anchor: Date, dir: 1 | -1): Date {
  if (viewMode === "month") return addMonths(anchor, dir);
  if (viewMode === "week") return addDays(anchor, dir * 7);
  return addDays(anchor, dir);
}

interface Bar {
  left: number;
  width: number;
  start: Date;
  end: Date;
}

interface Props {
  nodes: SearchNodeItem[];
  siteMap: Map<string, { name: string }>;
  onNodeClick?: (node: SearchNodeItem) => void;
}

export function ReservationCalendar({ nodes, siteMap, onNodeClick }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [groupBy, setGroupBy] = useState<"type" | "individual">("type");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { start: rangeStart, end: rangeEnd, config } = useMemo(() => getRange(viewMode, anchor), [viewMode, anchor]);
  const trackWidth = config.columns * config.colWidth;
  const rangeMs = rangeEnd.getTime() - rangeStart.getTime();

  const queries = useQueries({
    queries: nodes.map((n) => ({
      queryKey: ["availability", n.site_id, n.cluster_id, n.uid],
      queryFn: () => fetchNodeAvailability(n.site_id, n.cluster_id, n.uid),
      retry: false,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const loadedCount = queries.filter((q) => !q.isLoading).length;

  const nodeReservations = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    nodes.forEach((n, i) => {
      if (queries[i]?.data) map.set(n.uid, queries[i].data!.reservations);
    });
    return map;
  }, [queries, nodes]);

  const groups = useMemo(() => {
    const map = new Map<string, SearchNodeItem[]>();
    for (const n of nodes) {
      const key = `${n.site_id}::${n.node_type}`;
      const arr = map.get(key);
      if (arr) arr.push(n);
      else map.set(key, [n]);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a[0].node_type.localeCompare(b[0].node_type) || a[0].site_id.localeCompare(b[0].site_id))
      .map(([key, groupNodes]) => ({ key, groupNodes }));
  }, [nodes]);

  const now = new Date();
  const nowFrac = now >= rangeStart && now < rangeEnd ? (now.getTime() - rangeStart.getTime()) / rangeMs : null;

  function computeBars(uid: string): Bar[] {
    const reservations = nodeReservations.get(uid) ?? [];
    return reservations
      .map((r) => {
        const resStart = new Date(r.start).getTime();
        const resEnd = new Date(r.end).getTime();
        const clampedStart = Math.max(resStart, rangeStart.getTime());
        const clampedEnd = Math.min(resEnd, rangeEnd.getTime());
        if (clampedEnd <= clampedStart) return null;
        const left = ((clampedStart - rangeStart.getTime()) / rangeMs) * trackWidth;
        const width = ((clampedEnd - clampedStart) / rangeMs) * trackWidth;
        return { left, width, start: new Date(resStart), end: new Date(resEnd) };
      })
      .filter((b): b is Bar => b !== null);
  }

  function GridLines() {
    if (viewMode === "month") return null;
    const step = viewMode === "week" ? 24 : 1;
    return (
      <>
        {Array.from({ length: config.columns / step }, (_, i) => (
          <div key={i} className="absolute top-0 bottom-0 border-l border-white" style={{ left: i * config.colWidth * step }} />
        ))}
      </>
    );
  }

  if (nodes.length === 0) {
    return <div className="text-sm text-grey-med px-1 py-4">No nodes match the current filters.</div>;
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex rounded border border-grey-light overflow-hidden text-xs flex-shrink-0">
          {(["month", "week", "day"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 capitalize transition-colors ${viewMode === mode ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => setAnchor((a) => shiftAnchor(viewMode, a, -1))}
            className="text-xs px-2 py-1 rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info"
            aria-label="Previous"
          >
            ←
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="text-xs px-2 py-1 rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info"
          >
            Today
          </button>
          <button
            onClick={() => setAnchor((a) => shiftAnchor(viewMode, a, 1))}
            className="text-xs px-2 py-1 rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info"
            aria-label="Next"
          >
            →
          </button>
        </div>
        <span className="text-xs font-medium text-grey-dark ml-1">{rangeLabel(viewMode, rangeStart, rangeEnd)}</span>
        <div className="flex items-center gap-2 ml-auto">
          {loadedCount < nodes.length && (
            <span className="text-[10px] text-grey-med">
              Loading {loadedCount} / {nodes.length} nodes…
            </span>
          )}
          <div className="flex rounded border border-grey-light overflow-hidden text-xs flex-shrink-0">
            {(["type", "individual"] as const).map((view) => (
              <button
                key={view}
                onClick={() => setGroupBy(view)}
                className={`px-3 py-1 transition-colors ${groupBy === view ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`}
              >
                {view === "type" ? "By Node Type" : "Individual Nodes"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + trackWidth }}>
          {/* Time axis header */}
          <div className="flex mb-1 sticky top-0 bg-white z-10" style={{ paddingLeft: LABEL_W }}>
            {viewMode === "month" &&
              Array.from({ length: config.columns }, (_, i) => {
                const d = addDays(rangeStart, i);
                const isToday = startOfDay(now).getTime() === d.getTime();
                return (
                  <div
                    key={i}
                    style={{ width: config.colWidth, flexShrink: 0 }}
                    className={`text-[9px] text-center overflow-hidden ${isToday ? "font-bold text-brand-info" : "text-grey-med"}`}
                  >
                    {d.getDate()}
                  </div>
                );
              })}
            {viewMode === "week" &&
              Array.from({ length: 7 }, (_, i) => {
                const d = addDays(rangeStart, i);
                const isToday = startOfDay(now).getTime() === d.getTime();
                return (
                  <div
                    key={i}
                    style={{ width: config.colWidth * 24, flexShrink: 0 }}
                    className={`text-[9px] text-center overflow-hidden border-l border-grey-light ${isToday ? "font-bold text-brand-info" : "text-grey-med"}`}
                  >
                    {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                );
              })}
            {viewMode === "day" &&
              Array.from({ length: 24 }, (_, i) => (
                <div
                  key={i}
                  style={{ width: config.colWidth, flexShrink: 0 }}
                  className="text-[9px] text-center text-grey-med overflow-hidden border-l border-grey-light"
                >
                  {i}:00
                </div>
              ))}
          </div>

          {groups.map(({ key, groupNodes }) => {
            const site = siteMap.get(groupNodes[0].site_id);
            const groupLabel = (
              <div
                className="text-[10px] font-semibold text-grey-dark uppercase tracking-wide bg-grey-lighter px-1 py-0.5 rounded sticky left-0"
                style={{ width: LABEL_W + trackWidth }}
              >
                {groupNodes[0].node_type}
                <span className="font-normal text-grey-med ml-1">· {site?.name ?? groupNodes[0].site_id}</span>
                {groupBy === "type" && <span className="font-normal text-grey-med ml-1">({groupNodes.length})</span>}
              </div>
            );

            if (groupBy === "type") {
              const subRowH = 5;
              const trackHeight = Math.max(groupNodes.length * subRowH, 8);
              return (
                <div key={key} className="mb-2">
                  {groupLabel}
                  <div className="flex items-center" style={{ height: trackHeight + 4 }}>
                    <div style={{ width: LABEL_W, flexShrink: 0 }} />
                    <div className="relative" style={{ width: trackWidth, height: trackHeight, flexShrink: 0 }}>
                      <div className="absolute inset-0 bg-grey-lighter rounded" />
                      <GridLines />
                      {groupNodes.map((node, idx) =>
                        computeBars(node.uid).map((b, i) => (
                          <div
                            key={`${node.uid}-${i}`}
                            className="absolute bg-brand-danger/80 rounded-sm cursor-default"
                            style={{ left: b.left, width: Math.max(b.width, 2), top: idx * subRowH, height: subRowH - 1 }}
                            onMouseEnter={(e) => {
                              setTooltipPos({ x: e.clientX, y: e.clientY });
                              const fmt = (d: Date) =>
                                d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                              setTooltip(`${node.node_name || node.node_type}: ${fmt(b.start)} → ${fmt(b.end)}`);
                            }}
                            onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        )),
                      )}
                      {nowFrac !== null && (
                        <div className="absolute top-0 bottom-0 w-px bg-brand-info" style={{ left: nowFrac * trackWidth }} />
                      )}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={key} className="mb-2">
                {groupLabel}

                {groupNodes.map((node) => {
                  const bars = computeBars(node.uid);
                  return (
                    <div key={node.uid} className="flex items-center" style={{ height: 24 }}>
                      <div
                        style={{ width: LABEL_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 1 }}
                        className="text-[10px] text-grey truncate pr-2 bg-white cursor-pointer hover:text-link"
                        title={node.node_name || node.uid}
                        onClick={() => onNodeClick?.(node)}
                      >
                        {node.node_name || node.uid}
                        {node.availability === "maintenance" && (
                          <span className="ml-1 text-[9px] px-1 rounded bg-yellow-500 text-white">Maint.</span>
                        )}
                      </div>
                      <div className="relative" style={{ width: trackWidth, height: 18, flexShrink: 0 }}>
                        <div className="absolute inset-0 bg-grey-lighter rounded" />
                        <GridLines />
                        {bars.map((b, i) => (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0 bg-brand-danger/80 rounded cursor-default"
                            style={{ left: b.left, width: Math.max(b.width, 2) }}
                            onMouseEnter={(e) => {
                              setTooltipPos({ x: e.clientX, y: e.clientY });
                              const fmt = (d: Date) =>
                                d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                              setTooltip(`${node.node_name || node.node_type}: ${fmt(b.start)} → ${fmt(b.end)}`);
                            }}
                            onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setTooltip(null)}
                          />
                        ))}
                        {nowFrac !== null && (
                          <div className="absolute top-0 bottom-0 w-px bg-brand-info" style={{ left: nowFrac * trackWidth }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-grey-dark text-white text-[10px] rounded px-2 py-1 pointer-events-none shadow-lg whitespace-nowrap"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 8 }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
