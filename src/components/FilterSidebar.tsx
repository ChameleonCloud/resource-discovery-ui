import { useCallback, useEffect, useRef, useState } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import type { SearchNodeItem } from "../api/types";
import type { FilterState } from "../lib/filterCounts";
import {
  computeFacetCount,
  countWhere,
  uniqueValues,
  uniqueNestedValues,
  hasAnyAdvancedFilter,
  activeDeviceCount,
  hasGpuDirect,
  hasNvmeOf,
  DEFAULT_FILTERS,
  formatBytes,
  formatHz,
} from "../lib/filterCounts";
import { RAM_TIERS } from "../lib/availability";
import { ComingSoonOverlay } from "./ComingSoonOverlay";

interface Props {
  all: SearchNodeItem[];
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
}

function FacetCheckbox({
  id,
  label,
  count,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  count: number;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-2 py-0.5 cursor-pointer text-sm group ${count === 0 ? "text-grey-med cursor-not-allowed" : "text-grey-dark hover:text-link"}`}
    >
      <span className="flex items-center gap-2 min-w-0 overflow-hidden">
        <Checkbox.Root
          id={id}
          checked={checked}
          onCheckedChange={count === 0 ? undefined : onCheckedChange}
          disabled={count === 0}
          className="w-4 h-4 rounded border border-grey-med bg-white data-[state=checked]:bg-brand-info data-[state=checked]:border-brand-info disabled:opacity-40 flex items-center justify-center flex-shrink-0"
        >
          <Checkbox.Indicator>
            <svg viewBox="0 0 10 10" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1.5 5l2.5 2.5 4.5-4.5" />
            </svg>
          </Checkbox.Indicator>
        </Checkbox.Root>
        <span className="truncate" title={label}>{label}</span>
      </span>
      <span className={`tabular-nums text-xs flex-shrink-0 ${count === 0 ? "text-grey-med" : "text-grey"}`}>
        ({count})
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-grey-light pb-4 mb-4 last:border-0 last:mb-0 last:pb-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-grey mb-2">{title}</h3>
      {children}
    </div>
  );
}

const ADVCAP = 5;

function AdvFacetList({
  items,
  checked,
  getId,
  getLabel,
  getCount,
  onToggle,
}: {
  items: string[];
  checked: Set<string>;
  getId: (v: string) => string;
  getLabel: (v: string) => string;
  getCount: (v: string) => number;
  onToggle: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, ADVCAP);
  return (
    <>
      {visible.map((v) => (
        <FacetCheckbox
          key={v}
          id={getId(v)}
          label={getLabel(v)}
          count={getCount(v)}
          checked={checked.has(v)}
          onCheckedChange={() => onToggle(v)}
        />
      ))}
      {items.length > ADVCAP && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="text-xs text-link hover:text-link-hover mt-0.5"
        >
          {expanded ? "Show less" : `Show ${items.length - ADVCAP} more`}
        </button>
      )}
    </>
  );
}

// Top-level advanced filter group (Processor, GPU, Network, etc.), collapsed by default
function GroupSection({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 w-full text-xs font-medium text-grey-dark hover:text-link mb-1"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>{label}</span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 800;
const DEFAULT_WIDTH = 224;
const WIDTH_STORAGE_KEY = "filterSidebarWidth";

export function FilterSidebar({ all, filters, onFiltersChange }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const startRef = useRef({ x: 0, width: DEFAULT_WIDTH });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, width };
    setIsResizing(true);
  }, [width]);

  const handleDoubleClick = useCallback(() => {
    setWidth(DEFAULT_WIDTH);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    document.body.style.cursor = "col-resize";

    function handleMouseMove(e: MouseEvent) {
      const next = startRef.current.width + (e.clientX - startRef.current.x);
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    }
    function handleMouseUp() {
      setIsResizing(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  const gpuModels = uniqueValues(
    all.filter((n) => n.gpu?.gpu),
    (n) => n.gpu?.gpu_model,
  ).filter((m): m is string => !!m);

  const archs = uniqueValues(all, (n) => n.architecture?.platform_type).filter(
    (a): a is string => !!a,
  );

  const cpuModels = uniqueValues(all, (n) => n.processor?.other_description ?? n.processor?.model).filter(Boolean) as string[];
  const cpuVendors = uniqueValues(all, (n) => n.processor?.vendor).filter(Boolean) as string[];
  const cpuClockSpeeds = uniqueValues(all, (n) => n.processor?.clock_speed).filter((v): v is number => v != null);
  const cpuCacheL1d = uniqueValues(all, (n) => n.processor?.cache_l1d).filter((v): v is number => v != null);
  const cpuCacheL1i = uniqueValues(all, (n) => n.processor?.cache_l1i).filter((v): v is number => v != null);
  const cpuCacheL2 = uniqueValues(all, (n) => n.processor?.cache_l2).filter((v): v is number => v != null);
  const cpuCacheL3 = uniqueValues(all, (n) => n.processor?.cache_l3).filter((v): v is number => v != null);
  const cpuVersions = uniqueValues(all, (n) => n.processor?.version).filter(Boolean) as string[];
  const cpuOtherDescriptions = uniqueValues(all, (n) => n.processor?.other_description).filter(Boolean) as string[];
  const gpuCounts = uniqueValues(all.filter((n) => n.gpu?.gpu), (n) => n.gpu?.gpu_count).filter((v): v is number => v != null);
  const gpuVendors = uniqueValues(all.filter((n) => n.gpu?.gpu), (n) => n.gpu?.gpu_vendor).filter(Boolean) as string[];
  const gpuMemories = uniqueValues(all.filter((n) => n.gpu?.gpu), (n) => n.gpu?.gpu_memory).filter((v): v is number => v != null);
  const fpgaBoardModels = uniqueValues(all.filter((n) => n.fpga?.fpga), (n) => n.fpga?.board_model).filter(Boolean) as string[];
  const fpgaBoardVendors = uniqueValues(all.filter((n) => n.fpga?.fpga), (n) => n.fpga?.board_vendor).filter(Boolean) as string[];
  const netModels = uniqueNestedValues(all, (n) => (n.network_adapters ?? []).map((a) => a.model));
  const netVendors = uniqueNestedValues(all, (n) => (n.network_adapters ?? []).map((a) => a.vendor));
  const netNames = uniqueNestedValues(all, (n) => (n.network_adapters ?? []).map((a) => a.device));
  const activeDeviceCounts = uniqueValues(all, (n) => activeDeviceCount(n));
  const storageModels = uniqueNestedValues(all, (n) => (n.storage_devices ?? []).map((d) => d.model));
  const storageVendors = uniqueNestedValues(all, (n) => (n.storage_devices ?? []).map((d) => d.vendor));
  const storageSerials = uniqueNestedValues(all, (n) => (n.storage_devices ?? []).map((d) => d.serial));
  const storageWwns = uniqueNestedValues(all, (n) => (n.storage_devices ?? []).map((d) => d.wwn));
  const racks = uniqueValues(all, (n) => n.placement?.rack).filter((v) => v != null).map(String);

  function toggleSet(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function toggleNumSet(set: Set<number>, value: number): Set<number> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const isFiltered =
    filters.nodeTypes.size > 0 ||
    filters.hasGpu !== null ||
    filters.gpuModels.size > 0 ||
    filters.arch !== null ||
    filters.minRam !== null ||
    filters.infiniband ||
    filters.resourceType !== DEFAULT_FILTERS.resourceType ||
    filters.availabilityWindow !== DEFAULT_FILTERS.availabilityWindow ||
    filters.duration !== DEFAULT_FILTERS.duration ||
    hasAnyAdvancedFilter(filters);

  return (
    <aside
      style={{ width }}
      className={`relative flex-shrink-0 bg-white border-r border-grey-light sticky top-20 self-start h-[calc(100vh-5rem)] ${isResizing ? "select-none" : ""}`}
    >
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        title="Drag to resize, double-click to reset"
        className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-brand-info/40 ${isResizing ? "bg-brand-info/40" : ""}`}
      />
      <div className="p-4 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-grey">Filters</span>
        {isFiltered && (
          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="text-xs text-link hover:text-link-hover transition-colors"
          >
            Reset all
          </button>
        )}
      </div>
      <Section title="Resource Type">
        {(["All", "Bare metal"] as const).map((type) => {
          const value = type === "All" ? "all" : "bare-metal";
          return (
            <label key={type} className="flex items-center gap-2 py-0.5 cursor-pointer text-sm text-grey-dark hover:text-link">
              <input
                type="radio"
                name="resource-type"
                value={type}
                className="accent-brand-info"
                checked={filters.resourceType === value}
                onChange={() => onFiltersChange({ ...filters, resourceType: value })}
              />
              {type}
            </label>
          );
        })}
        <ComingSoonOverlay label="VM support coming soon">
          <label className="flex items-center gap-2 py-0.5 text-sm">
            <input type="radio" name="resource-type" value="VMs" disabled className="accent-brand-info" />
            Virtual machines
          </label>
        </ComingSoonOverlay>
      </Section>

      <Section title="Availability">
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-grey-dark">
          <span>Available</span>
          <select
            value={filters.availabilityWindow}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                availabilityWindow: e.target.value as FilterState["availabilityWindow"],
                customStart: "",
                customDuration: "",
              })
            }
            className="text-xs border border-grey-light rounded px-1.5 py-1 text-grey-dark focus:outline-none focus:ring-1 focus:ring-brand-info"
          >
            <option value="now">starting now</option>
            <option value="7d">starting within 7 days</option>
            <option value="custom">starting at a custom time</option>
          </select>
          {filters.availabilityWindow !== "custom" && (
            <>
              <span>for at least</span>
              <select
                value={filters.duration}
                onChange={(e) => onFiltersChange({ ...filters, duration: e.target.value as FilterState["duration"] })}
                className="text-xs border border-grey-light rounded px-1.5 py-1 text-grey-dark focus:outline-none focus:ring-1 focus:ring-brand-info"
              >
                <option value="any">any duration</option>
                <option value="6">6 hrs</option>
                <option value="24">1 day</option>
                <option value="72">3 days</option>
                <option value="168">1 week</option>
              </select>
            </>
          )}
        </div>

        {filters.availabilityWindow === "custom" && (
          <div className="mt-2 space-y-3 ml-1">
            <div>
              <p className="text-xs text-grey-med mb-1">Starting</p>
              <div className="flex gap-1 mb-1">
                <button
                  onClick={() => onFiltersChange({ ...filters, customStart: "" })}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${!filters.customStart ? "bg-brand-info text-white border-brand-info" : "border-grey-light text-grey hover:border-brand-info"}`}
                >
                  Now
                </button>
                <button
                  onClick={() => {
                    if (!filters.customStart) {
                      const d = new Date();
                      d.setMinutes(0, 0, 0);
                      onFiltersChange({ ...filters, customStart: d.toISOString().slice(0, 16) });
                    }
                  }}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${filters.customStart ? "bg-brand-info text-white border-brand-info" : "border-grey-light text-grey hover:border-brand-info"}`}
                >
                  Specific date
                </button>
              </div>
              {filters.customStart && (
                <input
                  type="datetime-local"
                  value={filters.customStart}
                  onChange={(e) => onFiltersChange({ ...filters, customStart: e.target.value })}
                  className="w-full text-xs border border-grey-light rounded px-2 py-1 text-grey-dark focus:outline-none focus:ring-1 focus:ring-brand-info"
                />
              )}
            </div>

            <div>
              <p className="text-xs text-grey-med mb-1">For how long</p>
              <div className="flex flex-wrap gap-1">
                {[
                  { value: "1", label: "1 hr" },
                  { value: "6", label: "6 hrs" },
                  { value: "24", label: "1 day" },
                  { value: "72", label: "3 days" },
                  { value: "168", label: "1 week" },
                  { value: "336", label: "2 weeks" },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => onFiltersChange({ ...filters, customDuration: filters.customDuration === value ? "" : value })}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${filters.customDuration === value ? "bg-brand-info text-white border-brand-info" : "border-grey-light text-grey hover:border-brand-info"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </Section>

      <Section title="GPU">
        <FacetCheckbox
          id="gpu-yes"
          label="Has GPU"
          count={computeFacetCount(all, filters, "hasGpu", true)}
          checked={filters.hasGpu === true}
          onCheckedChange={(v) =>
            onFiltersChange({ ...filters, hasGpu: v ? true : null, gpuModels: new Set() })
          }
        />
        {filters.hasGpu === true && gpuModels.length > 0 && (
          <div className="ml-4 mt-1 space-y-0.5">
            {gpuModels.map((m) => {
              const count = computeFacetCount(all, filters, "gpuModel", m);
              return (
                <FacetCheckbox
                  key={m}
                  id={`gpu-model-${m}`}
                  label={m}
                  count={count}
                  checked={filters.gpuModels.has(m)}
                  onCheckedChange={() =>
                    onFiltersChange({ ...filters, gpuModels: toggleSet(filters.gpuModels, m) })
                  }
                />
              );
            })}
          </div>
        )}
      </Section>

      <Section title="CPU Architecture">
        {archs.map((a) => {
          const count = computeFacetCount(all, filters, "arch", a);
          return (
            <FacetCheckbox
              key={a}
              id={`arch-${a}`}
              label={a}
              count={count}
              checked={filters.arch === a}
              onCheckedChange={(v) => onFiltersChange({ ...filters, arch: v ? a : null })}
            />
          );
        })}
      </Section>

      <Section title="Minimum RAM">
        <label className="flex items-center gap-2 py-0.5 cursor-pointer text-sm text-grey-dark hover:text-link">
          <input
            type="radio"
            name="min-ram"
            value="any"
            checked={filters.minRam === null}
            onChange={() => onFiltersChange({ ...filters, minRam: null })}
            className="accent-brand-info"
          />
          Any
        </label>
        {RAM_TIERS.map(({ label, bytes }) => {
          const count = computeFacetCount(all, filters, "ram", bytes);
          return (
            <label key={label} className={`flex items-center justify-between gap-2 py-0.5 cursor-pointer text-sm ${count === 0 ? "text-grey-med" : "text-grey-dark hover:text-link"}`}>
              <span className="flex items-center gap-2 min-w-0 overflow-hidden">
                <input
                  type="radio"
                  name="min-ram"
                  value={bytes}
                  checked={filters.minRam === bytes}
                  onChange={() => count > 0 && onFiltersChange({ ...filters, minRam: bytes })}
                  disabled={count === 0}
                  className="accent-brand-info flex-shrink-0"
                />
                <span className="truncate" title={label}>{label}</span>
              </span>
              <span className={`text-xs tabular-nums flex-shrink-0 ${count === 0 ? "text-grey-med" : "text-grey"}`}>({count})</span>
            </label>
          );
        })}
      </Section>

      <Section title="InfiniBand">
        <FacetCheckbox
          id="infiniband"
          label="Has InfiniBand"
          count={computeFacetCount(all, filters, "infiniband", true)}
          checked={filters.infiniband}
          onCheckedChange={(v) => onFiltersChange({ ...filters, infiniband: !!v })}
        />
      </Section>

      <div className="border-t border-grey-light pt-4">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-grey hover:text-grey-dark"
        >
          <span>Advanced Filters</span>
          <span>{showAdvanced ? "▾" : "▸"}</span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-4">

            {(cpuModels.length > 0 || cpuVendors.length > 0) && (
              <GroupSection label="Processor">
                {cpuModels.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">CPU Model</p>
                    <AdvFacetList
                      items={cpuModels}
                      checked={filters.cpuModels}
                      getId={(v) => `cpu-model-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.processor?.other_description ?? n.processor?.model ?? "") === v)}
                      onToggle={(v) => onFiltersChange({ ...filters, cpuModels: toggleSet(filters.cpuModels, v) })}
                    />
                  </div>
                )}

                {cpuVendors.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">CPU Vendor</p>
                    <AdvFacetList
                      items={cpuVendors}
                      checked={filters.cpuVendors}
                      getId={(v) => `cpu-vendor-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.processor?.vendor ?? "") === v)}
                      onToggle={(v) => onFiltersChange({ ...filters, cpuVendors: toggleSet(filters.cpuVendors, v) })}
                    />
                  </div>
                )}

                {cpuClockSpeeds.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">Clock Speed</p>
                    <AdvFacetList
                      items={cpuClockSpeeds.map(String)}
                      checked={new Set(Array.from(filters.cpuClockSpeeds).map(String))}
                      getId={(v) => `cpu-clock-${v}`}
                      getLabel={(v) => formatHz(Number(v))}
                      getCount={(v) => countWhere(all, (n) => (n.processor?.clock_speed ?? 0) === Number(v))}
                      onToggle={(v) => onFiltersChange({ ...filters, cpuClockSpeeds: toggleNumSet(filters.cpuClockSpeeds, Number(v)) })}
                    />
                  </div>
                )}

                {(cpuCacheL1d.length > 0 || cpuCacheL1i.length > 0 || cpuCacheL2.length > 0 || cpuCacheL3.length > 0) && (
                  <>
                    {cpuCacheL1d.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-grey-med mb-0.5">Cache L1 D</p>
                        <AdvFacetList
                          items={cpuCacheL1d.map(String)}
                          checked={new Set(Array.from(filters.cpuCacheL1d).map(String))}
                          getId={(v) => `cpu-cache-l1d-${v}`}
                          getLabel={(v) => formatBytes(Number(v))}
                          getCount={(v) => countWhere(all, (n) => (n.processor?.cache_l1d ?? 0) === Number(v))}
                          onToggle={(v) => onFiltersChange({ ...filters, cpuCacheL1d: toggleNumSet(filters.cpuCacheL1d, Number(v)) })}
                        />
                      </div>
                    )}

                    {cpuCacheL1i.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-grey-med mb-0.5">Cache L1 I</p>
                        <AdvFacetList
                          items={cpuCacheL1i.map(String)}
                          checked={new Set(Array.from(filters.cpuCacheL1i).map(String))}
                          getId={(v) => `cpu-cache-l1i-${v}`}
                          getLabel={(v) => formatBytes(Number(v))}
                          getCount={(v) => countWhere(all, (n) => (n.processor?.cache_l1i ?? 0) === Number(v))}
                          onToggle={(v) => onFiltersChange({ ...filters, cpuCacheL1i: toggleNumSet(filters.cpuCacheL1i, Number(v)) })}
                        />
                      </div>
                    )}

                    {cpuCacheL2.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-grey-med mb-0.5">Cache L2</p>
                        <AdvFacetList
                          items={cpuCacheL2.map(String)}
                          checked={new Set(Array.from(filters.cpuCacheL2).map(String))}
                          getId={(v) => `cpu-cache-l2-${v}`}
                          getLabel={(v) => formatBytes(Number(v))}
                          getCount={(v) => countWhere(all, (n) => (n.processor?.cache_l2 ?? 0) === Number(v))}
                          onToggle={(v) => onFiltersChange({ ...filters, cpuCacheL2: toggleNumSet(filters.cpuCacheL2, Number(v)) })}
                        />
                      </div>
                    )}

                    {cpuCacheL3.length > 0 && (
                      <div>
                        <p className="text-xs text-grey-med mb-0.5">Cache L3</p>
                        <AdvFacetList
                          items={cpuCacheL3.map(String)}
                          checked={new Set(Array.from(filters.cpuCacheL3).map(String))}
                          getId={(v) => `cpu-cache-l3-${v}`}
                          getLabel={(v) => formatBytes(Number(v))}
                          getCount={(v) => countWhere(all, (n) => (n.processor?.cache_l3 ?? 0) === Number(v))}
                          onToggle={(v) => onFiltersChange({ ...filters, cpuCacheL3: toggleNumSet(filters.cpuCacheL3, Number(v)) })}
                        />
                      </div>
                    )}
                  </>
                )}

                {(cpuVersions.length > 0 || cpuOtherDescriptions.length > 0) && (
                  <>
                    {cpuVersions.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-grey-med mb-0.5">Version</p>
                        <AdvFacetList
                          items={cpuVersions}
                          checked={filters.cpuVersions}
                          getId={(v) => `cpu-version-${v}`}
                          getLabel={(v) => v}
                          getCount={(v) => countWhere(all, (n) => (n.processor?.version ?? "") === v)}
                          onToggle={(v) => onFiltersChange({ ...filters, cpuVersions: toggleSet(filters.cpuVersions, v) })}
                        />
                      </div>
                    )}

                    {cpuOtherDescriptions.length > 0 && (
                      <div>
                        <p className="text-xs text-grey-med mb-0.5">Other Description</p>
                        <AdvFacetList
                          items={cpuOtherDescriptions}
                          checked={filters.cpuOtherDescriptions}
                          getId={(v) => `cpu-other-${v}`}
                          getLabel={(v) => v}
                          getCount={(v) => countWhere(all, (n) => (n.processor?.other_description ?? "") === v)}
                          onToggle={(v) => onFiltersChange({ ...filters, cpuOtherDescriptions: toggleSet(filters.cpuOtherDescriptions, v) })}
                        />
                      </div>
                    )}
                  </>
                )}
              </GroupSection>
            )}

            {(gpuCounts.length > 0 || gpuVendors.length > 0) && (
              <GroupSection label="GPU">
                {gpuCounts.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">GPU Count</p>
                    {gpuCounts.map((c) => (
                      <FacetCheckbox
                        key={c}
                        id={`gpu-count-${c}`}
                        label={String(c)}
                        count={countWhere(all, (n) => (n.gpu?.gpu_count ?? 0) === c)}
                        checked={filters.gpuCounts.has(c)}
                        onCheckedChange={() => onFiltersChange({ ...filters, gpuCounts: toggleNumSet(filters.gpuCounts, c) })}
                      />
                    ))}
                  </div>
                )}

                {gpuVendors.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">GPU Vendor</p>
                    <AdvFacetList
                      items={gpuVendors}
                      checked={filters.gpuVendors}
                      getId={(v) => `gpu-vendor-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.gpu?.gpu_vendor ?? "") === v)}
                      onToggle={(v) => onFiltersChange({ ...filters, gpuVendors: toggleSet(filters.gpuVendors, v) })}
                    />
                  </div>
                )}

                {gpuMemories.length > 0 && (
                  <div>
                    <p className="text-xs text-grey-med mb-0.5">GPU Memory</p>
                    <AdvFacetList
                      items={gpuMemories.map(String)}
                      checked={new Set(Array.from(filters.gpuMemories).map(String))}
                      getId={(v) => `gpu-memory-${v}`}
                      getLabel={(v) => formatBytes(Number(v))}
                      getCount={(v) => countWhere(all, (n) => (n.gpu?.gpu_memory ?? 0) === Number(v))}
                      onToggle={(v) => onFiltersChange({ ...filters, gpuMemories: toggleNumSet(filters.gpuMemories, Number(v)) })}
                    />
                  </div>
                )}
              </GroupSection>
            )}

            {(fpgaBoardModels.length > 0 || fpgaBoardVendors.length > 0) && (
              <GroupSection label="FPGA">
                {fpgaBoardModels.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">Board Model</p>
                    <AdvFacetList
                      items={fpgaBoardModels}
                      checked={filters.fpgaBoardModels}
                      getId={(v) => `fpga-board-model-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.fpga?.board_model ?? "") === v)}
                      onToggle={(v) => onFiltersChange({ ...filters, fpgaBoardModels: toggleSet(filters.fpgaBoardModels, v) })}
                    />
                  </div>
                )}

                {fpgaBoardVendors.length > 0 && (
                  <div>
                    <p className="text-xs text-grey-med mb-0.5">Board Vendor</p>
                    <AdvFacetList
                      items={fpgaBoardVendors}
                      checked={filters.fpgaBoardVendors}
                      getId={(v) => `fpga-board-vendor-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.fpga?.board_vendor ?? "") === v)}
                      onToggle={(v) => onFiltersChange({ ...filters, fpgaBoardVendors: toggleSet(filters.fpgaBoardVendors, v) })}
                    />
                  </div>
                )}
              </GroupSection>
            )}

            {racks.length > 0 && (
              <GroupSection label="Placement">
                <div>
                  <p className="text-xs text-grey-med mb-0.5">Rack</p>
                  <AdvFacetList
                    items={racks}
                    checked={filters.racks}
                    getId={(v) => `rack-${v}`}
                    getLabel={(v) => v}
                    getCount={(v) => countWhere(all, (n) => String(n.placement?.rack ?? "") === v)}
                    onToggle={(v) => onFiltersChange({ ...filters, racks: toggleSet(filters.racks, v) })}
                  />
                </div>
              </GroupSection>
            )}

            {(netModels.length > 0 || netVendors.length > 0) && (
              <GroupSection label="Network">
                {netModels.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">Adapter Model</p>
                    <AdvFacetList
                      items={netModels as string[]}
                      checked={filters.netModels}
                      getId={(v) => `net-model-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.network_adapters ?? []).some((a) => a.model === v))}
                      onToggle={(v) => onFiltersChange({ ...filters, netModels: toggleSet(filters.netModels, v) })}
                    />
                  </div>
                )}

                {netVendors.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">Adapter Vendor</p>
                    <AdvFacetList
                      items={netVendors as string[]}
                      checked={filters.netVendors}
                      getId={(v) => `net-vendor-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.network_adapters ?? []).some((a) => a.vendor === v))}
                      onToggle={(v) => onFiltersChange({ ...filters, netVendors: toggleSet(filters.netVendors, v) })}
                    />
                  </div>
                )}

                {activeDeviceCounts.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5"># Active Devices</p>
                    {activeDeviceCounts.map((c) => (
                      <FacetCheckbox
                        key={c}
                        id={`net-active-${c}`}
                        label={String(c)}
                        count={countWhere(all, (n) => activeDeviceCount(n) === c)}
                        checked={filters.activeDeviceCounts.has(c)}
                        onCheckedChange={() => onFiltersChange({ ...filters, activeDeviceCounts: toggleNumSet(filters.activeDeviceCounts, c) })}
                      />
                    ))}
                  </div>
                )}

                {netNames.length > 0 && (
                  <div>
                    <p className="text-xs text-grey-med mb-0.5">Name</p>
                    <AdvFacetList
                      items={netNames as string[]}
                      checked={filters.netNames}
                      getId={(v) => `net-name-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.network_adapters ?? []).some((a) => a.device === v))}
                      onToggle={(v) => onFiltersChange({ ...filters, netNames: toggleSet(filters.netNames, v) })}
                    />
                  </div>
                )}
              </GroupSection>
            )}

            {(storageModels.length > 0 || storageVendors.length > 0) && (
              <GroupSection label="Storage">
                {storageModels.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">Model</p>
                    <AdvFacetList
                      items={storageModels as string[]}
                      checked={filters.storageModels}
                      getId={(v) => `storage-model-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.storage_devices ?? []).some((d) => d.model === v))}
                      onToggle={(v) => onFiltersChange({ ...filters, storageModels: toggleSet(filters.storageModels, v) })}
                    />
                  </div>
                )}

                {storageVendors.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">Vendor</p>
                    <AdvFacetList
                      items={storageVendors as string[]}
                      checked={filters.storageVendors}
                      getId={(v) => `storage-vendor-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.storage_devices ?? []).some((d) => d.vendor === v))}
                      onToggle={(v) => onFiltersChange({ ...filters, storageVendors: toggleSet(filters.storageVendors, v) })}
                    />
                  </div>
                )}

                <FacetCheckbox
                  id="nvme-only"
                  label="NVMe only"
                  count={countWhere(all, (n) =>
                    (n.storage_devices ?? []).some(
                      (d) =>
                        d.driver?.toLowerCase() === "nvme" ||
                        d.interface?.toLowerCase().includes("nvme") ||
                        (d.device?.toLowerCase().startsWith("nvme") ?? false),
                    ),
                  )}
                  checked={filters.nvmeOnly}
                  onCheckedChange={(v) => onFiltersChange({ ...filters, nvmeOnly: !!v })}
                />

                <FacetCheckbox
                  id="ssd-only"
                  label="SSD only"
                  count={countWhere(all, (n) => (n.storage_devices ?? []).some((d) => d.ssd === true))}
                  checked={filters.ssdOnly}
                  onCheckedChange={(v) => onFiltersChange({ ...filters, ssdOnly: !!v })}
                />

                {storageSerials.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs text-grey-med mb-0.5">Serial</p>
                    <AdvFacetList
                      items={storageSerials as string[]}
                      checked={filters.storageSerials}
                      getId={(v) => `storage-serial-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.storage_devices ?? []).some((d) => d.serial === v))}
                      onToggle={(v) => onFiltersChange({ ...filters, storageSerials: toggleSet(filters.storageSerials, v) })}
                    />
                  </div>
                )}

                {storageWwns.length > 0 && (
                  <div>
                    <p className="text-xs text-grey-med mb-0.5">WWN</p>
                    <AdvFacetList
                      items={storageWwns as string[]}
                      checked={filters.storageWwns}
                      getId={(v) => `storage-wwn-${v}`}
                      getLabel={(v) => v}
                      getCount={(v) => countWhere(all, (n) => (n.storage_devices ?? []).some((d) => d.wwn === v))}
                      onToggle={(v) => onFiltersChange({ ...filters, storageWwns: toggleSet(filters.storageWwns, v) })}
                    />
                  </div>
                )}
              </GroupSection>
            )}

            <GroupSection label="RDMA">
              <FacetCheckbox
                id="rdma-gpudirect"
                label="GPUDirect"
                count={countWhere(all, hasGpuDirect)}
                checked={filters.gpudirect}
                onCheckedChange={(v) => onFiltersChange({ ...filters, gpudirect: !!v })}
              />
              <FacetCheckbox
                id="rdma-nvmeof"
                label="NVMe-oF"
                count={countWhere(all, hasNvmeOf)}
                checked={filters.nvmeof}
                onCheckedChange={(v) => onFiltersChange({ ...filters, nvmeof: !!v })}
              />
            </GroupSection>
          </div>
        )}
      </div>
      </div>
    </aside>
  );
}
