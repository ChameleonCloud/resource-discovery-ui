import { useState, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { SearchNodeItem, Reservation } from "../api/types";
import { fetchNodeAvailability } from "../api/client";
import { useCapacityCalendar } from "../hooks/useCapacityCalendar";

const DAY_MS = 86400000;
const DAYS = 30;
const SVG_HEIGHT = 80;
const SVG_PADDING = { top: 8, bottom: 20, left: 28, right: 8 };

interface CapacityChartProps {
  nodes: SearchNodeItem[];
  windowStart: Date;
  siteName: string;
}

function CapacityChart({ nodes, windowStart, siteName }: CapacityChartProps) {
  const { data, total, isLoading } = useCapacityCalendar(nodes, windowStart, DAYS);

  if (isLoading) {
    return <div className="flex items-center justify-center h-20 text-sm text-grey">Loading availability…</div>;
  }
  if (!data) {
    return <div className="text-sm text-grey-med italic">Availability data not available</div>;
  }

  const w = 500;
  const h = SVG_HEIGHT;
  const chartW = w - SVG_PADDING.left - SVG_PADDING.right;
  const chartH = h - SVG_PADDING.top - SVG_PADDING.bottom;

  const xScale = (i: number) => SVG_PADDING.left + (i / (DAYS - 1)) * chartW;
  const yScale = (v: number) => SVG_PADDING.top + chartH - (v / Math.max(total, 1)) * chartH;

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.available)}`).join(" ");
  const areaPath = [
    `M ${xScale(0)},${yScale(0)}`,
    ...data.map((d, i) => `L ${xScale(i)},${yScale(d.available)}`),
    `L ${xScale(DAYS - 1)},${yScale(0)}`,
    "Z",
  ].join(" ");

  const tickDays = [0, 6, 13, 20, 27];

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-label="Capacity chart">
        {/* Y axis labels */}
        <text x={SVG_PADDING.left - 4} y={SVG_PADDING.top + 4} textAnchor="end" fontSize="9" fill="#7e7e7e">{total}</text>
        <text x={SVG_PADDING.left - 4} y={SVG_PADDING.top + chartH / 2 + 4} textAnchor="end" fontSize="9" fill="#7e7e7e">{Math.round(total / 2)}</text>
        <text x={SVG_PADDING.left - 4} y={SVG_PADDING.top + chartH + 2} textAnchor="end" fontSize="9" fill="#7e7e7e">0</text>

        {/* Grid lines */}
        {[0, 0.5, 1].map((frac) => (
          <line
            key={frac}
            x1={SVG_PADDING.left}
            x2={w - SVG_PADDING.right}
            y1={SVG_PADDING.top + frac * chartH}
            y2={SVG_PADDING.top + frac * chartH}
            stroke="#e5e5e5"
            strokeWidth="0.5"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="#239ff020" />
        {/* Line */}
        <polyline points={points} fill="none" stroke="#239ff0" strokeWidth="1.5" strokeLinejoin="round" />

        {/* X axis ticks */}
        {tickDays.map((di) => {
          const d = data[di];
          if (!d) return null;
          const x = xScale(di);
          const label = d.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <g key={di}>
              <line x1={x} x2={x} y1={SVG_PADDING.top + chartH} y2={SVG_PADDING.top + chartH + 4} stroke="#aaaaaa" strokeWidth="0.5" />
              <text x={x} y={h - 2} textAnchor="middle" fontSize="8" fill="#7e7e7e">{label}</text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-grey mt-1">{total} total nodes of this type at {siteName}</p>
    </div>
  );
}

interface GanttProps {
  nodes: SearchNodeItem[];
  windowStart: Date;
}

interface NodeAvailData {
  node: SearchNodeItem;
  reservations: Reservation[] | null;
  synced: boolean;
}

type HoverFn = (text: string | null, x: number, y: number) => void;

function fmtTooltipDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function GanttRow({ data, windowStart, onHover }: { data: NodeAvailData; windowStart: Date; onHover: HoverFn }) {
  const w = 500;
  const rowH = 20;
  const labelW = 100;
  const chartW = w - labelW - 8;

  const windowEnd = new Date(windowStart.getTime() + DAYS * DAY_MS);
  const totalMs = windowEnd.getTime() - windowStart.getTime();

  const label = data.node.node_name ?? data.node.uid.slice(0, 8) + "…";

  if (!data.synced) {
    return (
      <g>
        <text x={labelW - 4} y={rowH / 2 + 4} textAnchor="end" fontSize="9" fill="#7e7e7e">{label}</text>
        <rect
          x={labelW} y={2} width={chartW} height={rowH - 4}
          fill="url(#hatch)" rx="1"
          onMouseEnter={(e) => onHover("Not synced — availability data unavailable", e.clientX, e.clientY)}
          onMouseLeave={() => onHover(null, 0, 0)}
        />
      </g>
    );
  }

  const bars = (data.reservations ?? [])
    .map((r) => {
      const rs = Math.max(new Date(r.start).getTime(), windowStart.getTime());
      const re = Math.min(new Date(r.end).getTime(), windowEnd.getTime());
      if (rs >= re) return null;
      const x = labelW + ((rs - windowStart.getTime()) / totalMs) * chartW;
      const bw = ((re - rs) / totalMs) * chartW;
      return { x, bw, start: r.start, end: r.end };
    })
    .filter(Boolean);

  return (
    <g>
      <text x={labelW - 4} y={rowH / 2 + 4} textAnchor="end" fontSize="9" fill="#7e7e7e">{label}</text>
      <rect x={labelW} y={2} width={chartW} height={rowH - 4} fill="#f2f2f2" rx="1" />
      {bars.map((b, i) =>
        b ? (
          <rect
            key={i} x={b.x} y={2} width={Math.max(b.bw, 1)} height={rowH - 4}
            fill="#239ff0" rx="1"
            onMouseEnter={(e) => onHover(`Reserved: ${fmtTooltipDate(b.start)} → ${fmtTooltipDate(b.end)}`, e.clientX, e.clientY)}
            onMouseLeave={() => onHover(null, 0, 0)}
          />
        ) : null,
      )}
    </g>
  );
}

function GanttChart({ nodes, windowStart }: GanttProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const queries = useQueries({
    queries: nodes.map((n) => ({
      queryKey: ["availability", n.site_id, n.cluster_id, n.uid],
      queryFn: () => fetchNodeAvailability(n.site_id, n.cluster_id, n.uid),
      retry: false,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const rowH = 20;
  const labelW = 100;
  const w = 500;
  const h = nodes.length * rowH + 24;

  const tickDays = [0, 6, 13, 20, 27];

  function handleHover(text: string | null, x: number, y: number) {
    setTooltip(text ? { text, x, y } : null);
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-label="Node availability Gantt chart">
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#aaaaaa" strokeWidth="1" />
          </pattern>
        </defs>

        {nodes.map((n, i) => {
          const q = queries[i];
          const data: NodeAvailData = {
            node: n,
            reservations: q.data?.reservations ?? null,
            synced: !q.isLoading && !q.isError,
          };
          return (
            <g key={n.uid} transform={`translate(0, ${i * rowH})`}>
              <GanttRow data={data} windowStart={windowStart} onHover={handleHover} />
            </g>
          );
        })}

        {/* X axis */}
        {tickDays.map((di) => {
          const d = new Date(windowStart.getTime() + di * DAY_MS);
          const x = labelW + (di / DAYS) * (w - labelW - 8);
          const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <g key={di}>
              <line x1={x} x2={x} y1={0} y2={nodes.length * rowH} stroke="#e5e5e5" strokeWidth="0.5" />
              <text x={x} y={h - 4} textAnchor="middle" fontSize="8" fill="#7e7e7e">{label}</text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(${labelW}, ${nodes.length * rowH + 2})`}>
          <rect x={0} y={0} width={10} height={8} fill="#239ff0" rx="1" />
          <text x={13} y={8} fontSize="8" fill="#7e7e7e">Reserved</text>
          <rect x={70} y={0} width={10} height={8} fill="#f2f2f2" rx="1" />
          <text x={83} y={8} fontSize="8" fill="#7e7e7e">Available</text>
          <rect x={140} y={0} width={10} height={8} fill="url(#hatch2)" rx="1" />
          <pattern id="hatch2" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#aaaaaa" strokeWidth="1" />
          </pattern>
          <text x={153} y={8} fontSize="8" fill="#7e7e7e">Not synced</text>
        </g>
      </svg>
      {tooltip && (
        <div
          className="fixed z-50 bg-grey-dark text-white text-[10px] rounded px-2 py-1 pointer-events-none shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

interface AvailabilityCalendarProps {
  node: SearchNodeItem;
  peerNodes: SearchNodeItem[];
  siteName: string;
}

export function AvailabilityCalendar({ node, peerNodes, siteName }: AvailabilityCalendarProps) {
  const [view, setView] = useState<"capacity" | "gantt">("gantt");
  const [windowOffset, setWindowOffset] = useState(0);

  const windowStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + windowOffset * DAYS);
    return d;
  }, [windowOffset]);

  const windowLabel = windowStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h3 className="text-sm font-semibold text-grey-dark flex-shrink-0">Availability</h3>
        <div className="flex items-center gap-2">
          {peerNodes.length > 1 && (
            <div className="flex rounded border border-grey-light overflow-hidden text-xs">
              <button
                onClick={() => setView("gantt")}
                className={`px-2 py-1 ${view === "gantt" ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`}
              >
                This node
              </button>
              <button
                onClick={() => setView("capacity")}
                className={`px-2 py-1 ${view === "capacity" ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`}
              >
                {node.node_type} availability
              </button>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-grey">
            <button
              onClick={() => setWindowOffset((v) => v - 1)}
              disabled={windowOffset === 0}
              className="px-1.5 py-0.5 rounded border border-grey-light hover:bg-grey-lighter disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ←
            </button>
            <span className="min-w-28 text-center">{windowLabel}</span>
            <button
              onClick={() => setWindowOffset((v) => v + 1)}
              className="px-1.5 py-0.5 rounded border border-grey-light hover:bg-grey-lighter"
            >
              →
            </button>
          </div>
        </div>
      </div>

      {view === "capacity" && peerNodes.length > 1 ? (
        <CapacityChart nodes={peerNodes} windowStart={windowStart} siteName={siteName} />
      ) : (
        <GanttChart nodes={[node]} windowStart={windowStart} />
      )}
    </div>
  );
}
