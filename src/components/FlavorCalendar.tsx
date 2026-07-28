import { useState, useMemo, useRef, useEffect } from "react";
import type { VmFlavor } from "../api/types";
import { useFlavorAvailability } from "../hooks/useFlavorAvailability";

const CHART = {
  info: "#239ff0",
  infoFaint: "#239ff020",
  gridLine: "#e5e5e5",
  text: "#7e7e7e",
  muted: "#aaaaaa",
} as const;

const SVG_HEIGHT = 80;
const SVG_PADDING = { top: 8, bottom: 20, left: 48, right: 16 };
const CHART_H = SVG_HEIGHT - SVG_PADDING.top - SVG_PADDING.bottom;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HOUR_INTERVALS = [HOUR_MS, 2 * HOUR_MS, 3 * HOUR_MS, 6 * HOUR_MS, 12 * HOUR_MS];
const DAY_INTERVALS = [DAY_MS, 2 * DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS];

interface FlavorCalendarProps {
  siteId: string;
  flavors: VmFlavor[];
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseUTC(s: string): Date {
  return new Date(s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s) ? s : s + "Z");
}

function truncateToHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d;
}

export function FlavorCalendar({ siteId, flavors }: FlavorCalendarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(500);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const [selectedFlavorId, setSelectedFlavorId] = useState<string | null>(
    () => flavors[0]?.uid ?? null,
  );
  const [startDate, setStartDate] = useState<Date>(truncateToHour);
  const [endDate, setEndDate] = useState<Date>(() => {
    const d = truncateToHour();
    return new Date(d.getTime() + 7 * 24 * 3600 * 1000);
  });
  const [preset, setPreset] = useState<1 | 7 | 30 | null>(7);
  const [hover, setHover] = useState<{
    svgX: number;
    clientX: number;
    clientY: number;
    time: Date;
    available: number;
    total: number;
  } | null>(null);

  function applyPreset(days: 1 | 7 | 30) {
    const d = truncateToHour();
    setStartDate(d);
    setEndDate(new Date(d.getTime() + days * 24 * 3600 * 1000));
    setPreset(days);
  }

  function handleStartDateChange(dateStr: string) {
    if (!dateStr) return;
    const [y, mo, day] = dateStr.split("-").map(Number);
    const next = new Date(startDate);
    next.setFullYear(y, mo - 1, day);
    setStartDate(next);
    setPreset(null);
  }

  function handleStartHourChange(hourStr: string) {
    const h = parseInt(hourStr, 10);
    if (isNaN(h)) return;
    const next = new Date(startDate);
    next.setHours(Math.min(Math.max(0, h), 23), 0, 0, 0);
    setStartDate(next);
    setPreset(null);
  }

  function handleEndDateChange(dateStr: string) {
    if (!dateStr) return;
    const [y, mo, day] = dateStr.split("-").map(Number);
    const next = new Date(endDate);
    next.setFullYear(y, mo - 1, day);
    setEndDate(next);
    setPreset(null);
  }

  function handleEndHourChange(hourStr: string) {
    const h = parseInt(hourStr, 10);
    if (isNaN(h)) return;
    const next = new Date(endDate);
    next.setHours(Math.min(Math.max(0, h), 23), 0, 0, 0);
    setEndDate(next);
    setPreset(null);
  }

  const { data, isLoading, isError } = useFlavorAvailability(
    siteId,
    selectedFlavorId,
    startDate,
    endDate,
  );

  const chartContent = useMemo(() => {
    if (endDate <= startDate) return null;
    if (!data || data.availability.length === 0) return null;

    const chartW = containerWidth - SVG_PADDING.left - SVG_PADDING.right;
    const segs = data.availability;
    const total = segs[0].total;
    const totalMs = endDate.getTime() - startDate.getTime();

    const xS = (d: Date) =>
      SVG_PADDING.left + ((d.getTime() - startDate.getTime()) / totalMs) * chartW;
    const yS = (v: number) =>
      SVG_PADDING.top + CHART_H - (v / Math.max(total, 1)) * CHART_H;

    const firstStart = parseUTC(segs[0].start);
    let stepD = `M ${xS(firstStart)},${yS(segs[0].available)} H ${xS(parseUTC(segs[0].end))}`;
    for (let i = 1; i < segs.length; i++) {
      stepD += ` V ${yS(segs[i].available)} H ${xS(parseUTC(segs[i].end))}`;
    }
    const areaD = `${stepD} V ${yS(0)} H ${xS(firstStart)} Z`;

    // Short windows (≤1d) use hour ticks; longer windows use day ticks.
    const msPerPx = totalMs / Math.max(chartW, 1);
    const candidates = totalMs <= DAY_MS ? HOUR_INTERVALS : DAY_INTERVALS;
    const tickIntervalMs = candidates.find(i => i >= msPerPx * 80) ?? candidates[candidates.length - 1];

    const tickDates: Date[] = [];
    if (tickIntervalMs >= DAY_MS) {
      // Align to local midnight so day labels match actual calendar days.
      const firstMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1);
      for (let t = firstMidnight.getTime(); t <= endDate.getTime(); t += tickIntervalMs) {
        tickDates.push(new Date(t));
      }
    } else {
      // UTC epoch rounding aligns to local hours for whole-hour UTC offsets.
      const firstTickMs = Math.ceil(startDate.getTime() / tickIntervalMs) * tickIntervalMs;
      for (let t = firstTickMs; t <= endDate.getTime(); t += tickIntervalMs) {
        tickDates.push(new Date(t));
      }
    }

    return { total, stepD, areaD, tickDates, tickIntervalMs, xS };
  }, [data, startDate, endDate, containerWidth]);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!chartContent || !data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    if (svgX < SVG_PADDING.left || svgX > containerWidth - SVG_PADDING.right) {
      setHover(null);
      return;
    }
    const chartW = containerWidth - SVG_PADDING.left - SVG_PADDING.right;
    const totalMs = endDate.getTime() - startDate.getTime();
    const timeMs = startDate.getTime() + ((svgX - SVG_PADDING.left) / chartW) * totalMs;
    const seg =
      data.availability.find(
        s => parseUTC(s.start).getTime() <= timeMs && parseUTC(s.end).getTime() > timeMs,
      ) ?? data.availability[data.availability.length - 1];
    setHover({
      svgX,
      clientX: e.clientX,
      clientY: e.clientY,
      time: new Date(timeMs),
      available: seg.available,
      total: seg.total,
    });
  }

  if (flavors.length === 0) {
    return <p className="text-sm italic text-grey-med">No flavors available.</p>;
  }

  const presetBtn = (n: 1 | 7 | 30) =>
    `px-2 py-1 text-xs ${preset === n ? "bg-brand-info text-white" : "bg-white text-grey hover:bg-grey-lighter"}`;

  const tickAnchor = (x: number): "start" | "middle" | "end" =>
    x <= SVG_PADDING.left + 24 ? "start" : x >= containerWidth - SVG_PADDING.right - 24 ? "end" : "middle";

  return (
    <div>
      <h3 className="text-sm font-semibold text-grey-dark mb-3">Flavor Availability</h3>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded border border-grey-light overflow-hidden">
          {([1, 7, 30] as const).map((n) => (
            <button key={n} onClick={() => applyPreset(n)} className={presetBtn(n)}>
              {n} day{n !== 1 ? "s" : ""}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs text-grey-dark">
          <span className="font-medium">Start</span>
          <input
            type="date"
            value={toDateInput(startDate)}
            onChange={(e) => handleStartDateChange(e.target.value)}
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
            onChange={(e) => handleEndDateChange(e.target.value)}
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

        <div className="flex items-center gap-1 text-xs text-grey-dark">
          <span className="font-medium">Flavor</span>
          <select
            value={selectedFlavorId ?? ""}
            onChange={(e) => setSelectedFlavorId(e.target.value || null)}
            className="border border-grey-light rounded px-1 py-0.5 text-xs"
          >
            {flavors.map((f) => (
              <option key={f.uid} value={f.uid}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div ref={containerRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-20 text-sm text-grey gap-2">
            <svg
              className="animate-spin h-4 w-4 text-brand-info flex-shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Loading availability… this may take a moment</span>
          </div>
        ) : isError ? (
          <p className="text-sm italic text-grey-med">Could not load availability data.</p>
        ) : !chartContent ? (
          <p className="text-sm italic text-grey-med">No availability data for this period.</p>
        ) : (
          <svg
            width="100%"
            height={SVG_HEIGHT}
            aria-label="Flavor availability chart"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: "crosshair" }}
          >
            <text x={SVG_PADDING.left - 4} y={SVG_PADDING.top + 4} textAnchor="end" fontSize="0.75rem" fill={CHART.text}>
              {chartContent.total.toLocaleString()}
            </text>
            <text x={SVG_PADDING.left - 4} y={SVG_PADDING.top + CHART_H / 2 + 4} textAnchor="end" fontSize="0.75rem" fill={CHART.text}>
              {Math.round(chartContent.total / 2).toLocaleString()}
            </text>
            <text x={SVG_PADDING.left - 4} y={SVG_PADDING.top + CHART_H + 2} textAnchor="end" fontSize="0.75rem" fill={CHART.text}>
              0
            </text>

            {[0, 0.5, 1].map((frac) => (
              <line
                key={frac}
                x1={SVG_PADDING.left}
                x2={containerWidth - SVG_PADDING.right}
                y1={SVG_PADDING.top + frac * CHART_H}
                y2={SVG_PADDING.top + frac * CHART_H}
                stroke={CHART.gridLine}
                strokeWidth="0.5"
              />
            ))}

            <path d={chartContent.areaD} fill={CHART.infoFaint} />
            <path
              d={chartContent.stepD}
              fill="none"
              stroke={CHART.info}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />

            {hover && (
              <line
                x1={hover.svgX}
                x2={hover.svgX}
                y1={SVG_PADDING.top}
                y2={SVG_PADDING.top + CHART_H}
                stroke={CHART.muted}
                strokeWidth="1"
                strokeDasharray="3 2"
                pointerEvents="none"
              />
            )}

            {chartContent.tickDates.map((d, i) => {
              const x = chartContent.xS(d);
              const label = chartContent.tickIntervalMs < DAY_MS
                ? d.toLocaleTimeString(undefined, { hour: "numeric" })
                : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              return (
                <g key={i}>
                  <line
                    x1={x}
                    x2={x}
                    y1={SVG_PADDING.top + CHART_H}
                    y2={SVG_PADDING.top + CHART_H + 4}
                    stroke={CHART.muted}
                    strokeWidth="0.5"
                  />
                  <text x={x} y={SVG_HEIGHT - 2} textAnchor={tickAnchor(x)} fontSize="0.75rem" fill={CHART.text}>
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {hover && (
        <div
          className="fixed z-50 bg-grey-dark text-white text-xs rounded px-2 py-1 pointer-events-none shadow-lg whitespace-nowrap"
          style={{ left: hover.clientX + 12, top: hover.clientY - 8 }}
        >
          {hover.time.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — {hover.available} / {hover.total} available
        </div>
      )}
    </div>
  );
}
