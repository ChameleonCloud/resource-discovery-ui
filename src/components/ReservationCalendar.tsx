import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { SearchNodeItem, Reservation } from "../api/types";
import { fetchNodeAvailability } from "../api/client";
import { toDateInput } from "../lib/dateUtils";

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const LABEL_W = 200;

type ViewMode = "month" | "week" | "day";

interface ViewConfig {
  columns: number;
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

function GridLines({ columns, colWidth }: { columns: number; colWidth: number }) {
  return (
    <>
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-l border-white" style={{ left: i * colWidth }} />
      ))}
    </>
  );
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
  groupBy: "type" | "individual";
  onNodeClick?: (node: SearchNodeItem) => void;
  staleSiteIds?: Set<string>;
}

export function ReservationCalendar({ nodes, siteMap, groupBy, onNodeClick, staleSiteIds }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [startDate, setStartDate] = useState<Date>(() => startOfWeek(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => addDays(startOfWeek(new Date()), 7));
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const rangeMs = Math.max(endDate.getTime() - startDate.getTime(), HOUR_MS);

  const config: ViewConfig = useMemo(() => {
    if (viewMode !== "day") {
      return { columns: Math.max(1, Math.round(rangeMs / DAY_MS)), unit: "day" };
    }
    return { columns: Math.max(1, Math.round(rangeMs / HOUR_MS)), unit: "hour" };
  }, [viewMode, rangeMs]);

  const trackWidth = Math.max(containerWidth - LABEL_W, config.columns);
  const colWidth = trackWidth / config.columns;

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    const s = startDate;
    if (mode === "month") {
      const ms = startOfMonth(s);
      setStartDate(ms);
      setEndDate(addMonths(ms, 1));
    } else if (mode === "week") {
      const sw = startOfWeek(s);
      setStartDate(sw);
      setEndDate(addDays(sw, 7));
    } else {
      const sd = startOfDay(s);
      setStartDate(sd);
      setEndDate(addDays(sd, 1));
    }
  }

  function shiftDates(dir: 1 | -1) {
    if (viewMode === "month") {
      setStartDate((d) => addMonths(d, dir));
      setEndDate((d) => addMonths(d, dir));
    } else if (viewMode === "week") {
      setStartDate((d) => addDays(d, dir * 7));
      setEndDate((d) => addDays(d, dir * 7));
    } else {
      setStartDate((d) => addDays(d, dir));
      setEndDate((d) => addDays(d, dir));
    }
  }

  function goToToday() {
    const now = new Date();
    if (viewMode === "month") {
      setStartDate(startOfMonth(now));
      setEndDate(addMonths(startOfMonth(now), 1));
    } else if (viewMode === "week") {
      setStartDate(startOfWeek(now));
      setEndDate(addDays(startOfWeek(now), 7));
    } else {
      setStartDate(startOfDay(now));
      setEndDate(addDays(startOfDay(now), 1));
    }
  }

  function handleStartChange(dateStr: string) {
    if (!dateStr) return;
    const [y, mo, d] = dateStr.split("-").map(Number);
    const next = new Date(startDate);
    next.setFullYear(y, mo - 1, d);
    setStartDate(next);
  }

  function handleEndChange(dateStr: string) {
    if (!dateStr) return;
    const [y, mo, d] = dateStr.split("-").map(Number);
    const next = new Date(endDate);
    next.setFullYear(y, mo - 1, d);
    setEndDate(next);
  }

  function handleStartHourChange(hourStr: string) {
    const h = parseInt(hourStr, 10);
    if (isNaN(h)) return;
    const next = new Date(startDate);
    next.setHours(Math.min(Math.max(0, h), 23), 0, 0, 0);
    setStartDate(next);
  }

  function handleEndHourChange(hourStr: string) {
    const h = parseInt(hourStr, 10);
    if (isNaN(h)) return;
    const next = new Date(endDate);
    next.setHours(Math.min(Math.max(0, h), 23), 0, 0, 0);
    setEndDate(next);
  }

  const queries = useQueries({
    queries: nodes.map((n) => ({
      queryKey: ["availability", n.site_id, n.cluster_id, n.uid],
      queryFn: () => fetchNodeAvailability(n.site_id, n.cluster_id, n.uid),
      retry: false,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const loadedCount = queries.filter((q) => !q.isLoading).length;
  const pendingCount = nodes.length - loadedCount;

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
  const nowFrac = now >= startDate && now < endDate ? (now.getTime() - startDate.getTime()) / rangeMs : null;

  function computeBars(uid: string): Bar[] {
    const reservations = nodeReservations.get(uid) ?? [];
    return reservations
      .map((r) => {
        const resStart = new Date(r.start).getTime();
        const resEnd = new Date(r.end).getTime();
        const clampedStart = Math.max(resStart, startDate.getTime());
        const clampedEnd = Math.min(resEnd, endDate.getTime());
        if (clampedEnd <= clampedStart) return null;
        const left = ((clampedStart - startDate.getTime()) / rangeMs) * trackWidth;
        const width = ((clampedEnd - clampedStart) / rangeMs) * trackWidth;
        return { left, width, start: new Date(resStart), end: new Date(resEnd) };
      })
      .filter((b): b is Bar => b !== null);
  }

  if (nodes.length === 0) {
    return <div className="text-sm text-grey-med px-1 py-4">No nodes match the current filters.</div>;
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="flex rounded border border-grey-light overflow-hidden text-xs flex-shrink-0">
          {(["month", "week", "day"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => changeViewMode(mode)}
              className={`px-3 py-1 capitalize transition-colors ${viewMode === mode ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shiftDates(-1)}
            className="text-xs px-2 py-1 rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info"
            aria-label="Previous"
          >
            ←
          </button>
          <button
            onClick={goToToday}
            className="text-xs px-2 py-1 rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info"
          >
            Today
          </button>
          <button
            onClick={() => shiftDates(1)}
            className="text-xs px-2 py-1 rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info"
            aria-label="Next"
          >
            →
          </button>
        </div>

        <div className="flex items-center gap-1 text-xs text-grey-dark">
          <span className="font-medium">Start</span>
          <input
            type="date"
            value={toDateInput(startDate)}
            onChange={(e) => handleStartChange(e.target.value)}
            className="border border-grey-light rounded px-1 py-0.5 text-xs"
          />
          <input
            type="number"
            min={0}
            max={23}
            value={startDate.getHours()}
            onChange={(e) => handleStartHourChange(e.target.value)}
            className="border border-grey-light rounded px-1 py-0.5 text-xs w-12"
          />
          <span>:00</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-grey-dark">
          <span className="font-medium">End</span>
          <input
            type="date"
            value={toDateInput(endDate)}
            onChange={(e) => handleEndChange(e.target.value)}
            className="border border-grey-light rounded px-1 py-0.5 text-xs"
          />
          <input
            type="number"
            min={0}
            max={23}
            value={endDate.getHours()}
            onChange={(e) => handleEndHourChange(e.target.value)}
            className="border border-grey-light rounded px-1 py-0.5 text-xs w-12"
          />
          <span>:00</span>
        </div>

        {pendingCount > 0 && (
          <span className="text-xs text-grey-med ml-auto">
            Loading {pendingCount} / {nodes.length} nodes…
          </span>
        )}
      </div>

      {/* Time axis header */}
      <div className="flex mb-1 sticky top-0 bg-white z-10" style={{ paddingLeft: LABEL_W }}>
        {viewMode === "month" &&
          Array.from({ length: config.columns }, (_, i) => {
            const d = addDays(startDate, i);
            const isToday = startOfDay(now).getTime() === startOfDay(d).getTime();
            return (
              <div
                key={i}
                style={{ width: colWidth, flexShrink: 0 }}
                className={`text-[9px] text-center overflow-hidden ${isToday ? "font-bold text-brand-info" : "text-grey-med"}`}
              >
                {d.getDate()}
              </div>
            );
          })}
        {viewMode === "week" &&
          Array.from({ length: config.columns }, (_, i) => {
            const d = addDays(startDate, i);
            const isToday = startOfDay(now).getTime() === startOfDay(d).getTime();
            return (
              <div
                key={i}
                style={{ width: colWidth, flexShrink: 0 }}
                className={`text-[9px] text-center overflow-hidden border-l border-grey-light ${isToday ? "font-bold text-brand-info" : "text-grey-med"}`}
              >
                {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </div>
            );
          })}
        {viewMode === "day" &&
          Array.from({ length: config.columns }, (_, i) => {
            const d = new Date(startDate.getTime() + i * HOUR_MS);
            return (
              <div
                key={i}
                style={{ width: colWidth, flexShrink: 0 }}
                className="text-[9px] text-center text-grey-med overflow-hidden border-l border-grey-light"
              >
                {d.getHours()}:00
              </div>
            );
          })}
      </div>

      {groups.map(({ key, groupNodes }) => {
        const site = siteMap.get(groupNodes[0].site_id);
        const isStale = staleSiteIds?.has(groupNodes[0].site_id) ?? false;
        const groupLabel = (
          <div
            className="text-xs font-semibold text-grey uppercase tracking-wide bg-white border-t border-b border-grey-light px-1 py-1"
            style={{ width: LABEL_W + trackWidth }}
          >
            {groupNodes[0].node_type}
            <span className="font-normal text-grey-med ml-1">· {site?.name ?? groupNodes[0].site_id}</span>
            {groupBy === "type" && <span className="font-normal text-grey-med ml-1">({groupNodes.length})</span>}
            {isStale && <span className="font-normal text-grey-med ml-1 normal-case tracking-normal">· sync unknown</span>}
          </div>
        );

        if (groupBy === "type") {
          const subRowH = 5;
          const trackHeight = Math.max(groupNodes.length * subRowH, 8);
          return (
            <div key={key} className={`mb-2 ${isStale ? "opacity-40" : ""}`}>
              {groupLabel}
              <div className="flex items-center" style={{ height: trackHeight + 4 }}>
                <div style={{ width: LABEL_W, flexShrink: 0 }} />
                <div className="relative" style={{ width: trackWidth, height: trackHeight, flexShrink: 0 }}>
                  <div className="absolute inset-0 bg-grey-lighter rounded" />
                  {viewMode === "day" && <GridLines columns={config.columns} colWidth={colWidth} />}
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
          <div key={key} className={`mb-2 ${isStale ? "opacity-40" : ""}`}>
            {groupLabel}

            {groupNodes.map((node) => {
              const bars = computeBars(node.uid);
              return (
                <div key={node.uid} className="flex items-center" style={{ height: 24 }}>
                  <div
                    style={{ width: LABEL_W, flexShrink: 0 }}
                    className="text-xs text-grey truncate pr-2 bg-white cursor-pointer hover:text-link"
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
                    {viewMode === "day" && <GridLines columns={config.columns} colWidth={colWidth} />}
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

      {tooltip && (
        <div
          className="fixed z-50 bg-grey-dark text-white text-xs rounded px-2 py-1 pointer-events-none shadow-lg whitespace-nowrap"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 8 }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
