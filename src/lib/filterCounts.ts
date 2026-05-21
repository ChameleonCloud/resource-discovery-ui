import type { SearchNodeItem } from "../api/types";
import { RAM_TIERS } from "./availability";

export interface FilterState {
  sites: Set<string>;
  nodeTypes: Set<string>;
  hasGpu: boolean | null;
  gpuModels: Set<string>;
  arch: string | null;
  minRam: number | null;
  infiniband: boolean;
  resourceType: "all" | "bare-metal";
  availabilityWindow: "now" | "7d" | "custom"; // when a lease would start
  customStart: string;   // datetime-local string; empty = now
  customDuration: string; // hours, for custom window only: "1"|"6"|"24"|"72"|"168"|"336"|""; empty = unset
  duration: "any" | "6" | "24" | "72" | "168"; // how long the lease would run (now / 7d modes)
  // Advanced
  cpuModels: Set<string>;
  cpuVendors: Set<string>;
  cpuClockSpeeds: Set<number>;
  cpuCacheL1d: Set<number>;
  cpuCacheL1i: Set<number>;
  cpuCacheL2: Set<number>;
  cpuCacheL3: Set<number>;
  cpuVersions: Set<string>;
  cpuOtherDescriptions: Set<string>;
  gpuCounts: Set<number>;
  gpuVendors: Set<string>;
  gpuMemories: Set<number>;
  fpgaBoardModels: Set<string>;
  fpgaBoardVendors: Set<string>;
  netModels: Set<string>;
  netVendors: Set<string>;
  netNames: Set<string>;
  activeDeviceCounts: Set<number>;
  storageModels: Set<string>;
  storageVendors: Set<string>;
  storageSerials: Set<string>;
  storageWwns: Set<string>;
  nvmeOnly: boolean;
  ssdOnly: boolean;
  racks: Set<string>;
  gpudirect: boolean;
  nvmeof: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  sites: new Set(),
  nodeTypes: new Set(),
  hasGpu: null,
  gpuModels: new Set(),
  arch: null,
  minRam: null,
  infiniband: false,
  resourceType: "all",
  availabilityWindow: "now",
  customStart: "",
  customDuration: "",
  duration: "any",
  cpuModels: new Set(),
  cpuVendors: new Set(),
  cpuClockSpeeds: new Set(),
  cpuCacheL1d: new Set(),
  cpuCacheL1i: new Set(),
  cpuCacheL2: new Set(),
  cpuCacheL3: new Set(),
  cpuVersions: new Set(),
  cpuOtherDescriptions: new Set(),
  gpuCounts: new Set(),
  gpuVendors: new Set(),
  gpuMemories: new Set(),
  fpgaBoardModels: new Set(),
  fpgaBoardVendors: new Set(),
  netModels: new Set(),
  netVendors: new Set(),
  netNames: new Set(),
  activeDeviceCounts: new Set(),
  storageModels: new Set(),
  storageVendors: new Set(),
  storageSerials: new Set(),
  storageWwns: new Set(),
  nvmeOnly: false,
  ssdOnly: false,
  racks: new Set(),
  gpudirect: false,
  nvmeof: false,
};

export function applyTextQuery(nodes: SearchNodeItem[], query: string): SearchNodeItem[] {
  if (!query.trim()) return nodes;
  const q = query.toLowerCase();
  return nodes.filter((n) => {
    const gpuModel = n.gpu?.gpu_model?.toLowerCase() ?? "";
    const ram = n.main_memory?.ram_size ? String(Math.round(n.main_memory.ram_size / 1024 ** 3)) : "";
    return (
      n.node_type.toLowerCase().includes(q) ||
      n.site_id.toLowerCase().includes(q) ||
      gpuModel.includes(q) ||
      (n.architecture?.platform_type?.toLowerCase().includes(q) ?? false) ||
      ram.includes(q) ||
      (n.admin_note?.toLowerCase().includes(q) ?? false)
    );
  });
}

function hasNvme(n: SearchNodeItem): boolean {
  return (n.storage_devices ?? []).some(
    (d) =>
      d.driver?.toLowerCase() === "nvme" ||
      d.interface?.toLowerCase().includes("nvme") ||
      (d.device?.toLowerCase().startsWith("nvme") ?? false),
  );
}

function hasSsd(n: SearchNodeItem): boolean {
  return (n.storage_devices ?? []).some((d) => d.ssd === true);
}

export function activeDeviceCount(n: SearchNodeItem): number {
  return (n.network_adapters ?? []).filter((a) => a.enabled).length;
}

function hasNvmePcie(n: SearchNodeItem): boolean {
  return (n.storage_devices ?? []).some(
    (d) => d.driver?.toLowerCase() === "nvme" || (d.interface ?? "").toLowerCase() === "pcie",
  );
}

const GPUDIRECT_MODELS = new Set(["v100", "p100", "m40", "k80", "rtx 6000"]);

export function hasGpuDirect(n: SearchNodeItem): boolean {
  return !!n.infiniband && !!n.gpu?.gpu && GPUDIRECT_MODELS.has((n.gpu?.gpu_model ?? "").toLowerCase());
}

export function hasNvmeOf(n: SearchNodeItem): boolean {
  return !!n.infiniband && hasNvmePcie(n);
}

export function applyFilters(nodes: SearchNodeItem[], f: FilterState): SearchNodeItem[] {
  return nodes.filter((n) => {
    const noAvailabilityFilter = f.availabilityWindow !== "custom" && f.duration === "any";
    if (!noAvailabilityFilter && n.availability === "maintenance") return false;
    if (f.sites.size > 0 && !f.sites.has(n.site_id)) return false;
    if (f.nodeTypes.size > 0 && !f.nodeTypes.has(n.node_type)) return false;
    if (f.hasGpu !== null && (n.gpu?.gpu ?? false) !== f.hasGpu) return false;
    if (f.gpuModels.size > 0 && !f.gpuModels.has(n.gpu?.gpu_model ?? "")) return false;
    if (f.arch && n.architecture?.platform_type !== f.arch) return false;
    if (f.minRam !== null && (n.main_memory?.ram_size ?? 0) < f.minRam) return false;
    if (f.infiniband && !n.infiniband) return false;
    if (f.cpuModels.size > 0 && !f.cpuModels.has(n.processor?.other_description ?? n.processor?.model ?? "")) return false;
    if (f.cpuVendors.size > 0 && !f.cpuVendors.has(n.processor?.vendor ?? "")) return false;
    if (f.cpuClockSpeeds.size > 0 && !f.cpuClockSpeeds.has(n.processor?.clock_speed ?? 0)) return false;
    if (f.cpuCacheL1d.size > 0 && !f.cpuCacheL1d.has(n.processor?.cache_l1d ?? 0)) return false;
    if (f.cpuCacheL1i.size > 0 && !f.cpuCacheL1i.has(n.processor?.cache_l1i ?? 0)) return false;
    if (f.cpuCacheL2.size > 0 && !f.cpuCacheL2.has(n.processor?.cache_l2 ?? 0)) return false;
    if (f.cpuCacheL3.size > 0 && !f.cpuCacheL3.has(n.processor?.cache_l3 ?? 0)) return false;
    if (f.cpuVersions.size > 0 && !f.cpuVersions.has(n.processor?.version ?? "")) return false;
    if (f.cpuOtherDescriptions.size > 0 && !f.cpuOtherDescriptions.has(n.processor?.other_description ?? "")) return false;
    if (f.gpuCounts.size > 0 && !f.gpuCounts.has(n.gpu?.gpu_count ?? 0)) return false;
    if (f.gpuVendors.size > 0 && !f.gpuVendors.has(n.gpu?.gpu_vendor ?? "")) return false;
    if (f.gpuMemories.size > 0 && !f.gpuMemories.has(n.gpu?.gpu_memory ?? 0)) return false;
    if (f.fpgaBoardModels.size > 0 && !f.fpgaBoardModels.has(n.fpga?.board_model ?? "")) return false;
    if (f.fpgaBoardVendors.size > 0 && !f.fpgaBoardVendors.has(n.fpga?.board_vendor ?? "")) return false;
    if (f.netModels.size > 0 && !(n.network_adapters ?? []).some((a) => a.model && f.netModels.has(a.model))) return false;
    if (f.netVendors.size > 0 && !(n.network_adapters ?? []).some((a) => a.vendor && f.netVendors.has(a.vendor))) return false;
    if (f.netNames.size > 0 && !(n.network_adapters ?? []).some((a) => a.device && f.netNames.has(a.device))) return false;
    if (f.activeDeviceCounts.size > 0 && !f.activeDeviceCounts.has(activeDeviceCount(n))) return false;
    if (f.storageModels.size > 0 && !(n.storage_devices ?? []).some((d) => d.model && f.storageModels.has(d.model))) return false;
    if (f.storageVendors.size > 0 && !(n.storage_devices ?? []).some((d) => d.vendor && f.storageVendors.has(d.vendor))) return false;
    if (f.storageSerials.size > 0 && !(n.storage_devices ?? []).some((d) => d.serial && f.storageSerials.has(d.serial))) return false;
    if (f.storageWwns.size > 0 && !(n.storage_devices ?? []).some((d) => d.wwn && f.storageWwns.has(d.wwn))) return false;
    if (f.nvmeOnly && !hasNvme(n)) return false;
    if (f.ssdOnly && !hasSsd(n)) return false;
    if (f.racks.size > 0 && !f.racks.has(String(n.placement?.rack ?? ""))) return false;
    if (f.gpudirect && !hasGpuDirect(n)) return false;
    if (f.nvmeof && !hasNvmeOf(n)) return false;
    return true;
  });
}

type FacetKey = "site" | "nodeType" | "hasGpu" | "gpuModel" | "arch" | "ram" | "infiniband";

export function computeFacetCount(
  all: SearchNodeItem[],
  filters: FilterState,
  facet: FacetKey,
  value: string | boolean | number,
): number {
  const without = clearFacet(filters, facet);
  const base = applyFilters(all, without);
  return base.filter((n) => matchesFacet(n, facet, value)).length;
}

function clearFacet(f: FilterState, facet: FacetKey): FilterState {
  switch (facet) {
    case "site": return { ...f, sites: new Set() };
    case "nodeType": return { ...f, nodeTypes: new Set() };
    case "hasGpu": return { ...f, hasGpu: null, gpuModels: new Set() };
    case "gpuModel": return { ...f, gpuModels: new Set() };
    case "arch": return { ...f, arch: null };
    case "ram": return { ...f, minRam: null };
    case "infiniband": return { ...f, infiniband: false };
  }
}

function matchesFacet(n: SearchNodeItem, facet: FacetKey, value: string | boolean | number): boolean {
  switch (facet) {
    case "site": return n.site_id === value;
    case "nodeType": return n.node_type === value;
    case "hasGpu": return (n.gpu?.gpu ?? false) === value;
    case "gpuModel": return (n.gpu?.gpu_model ?? "") === value;
    case "arch": return (n.architecture?.platform_type ?? "") === value;
    case "ram": return (n.main_memory?.ram_size ?? 0) >= (value as number);
    case "infiniband": return value ? (n.infiniband ?? false) : true;
  }
}

export function countWhere(nodes: SearchNodeItem[], pred: (n: SearchNodeItem) => boolean): number {
  return nodes.filter(pred).length;
}

export function uniqueValues<T>(nodes: SearchNodeItem[], fn: (n: SearchNodeItem) => T | undefined): T[] {
  const seen = new Set<T>();
  for (const n of nodes) {
    const v = fn(n);
    if (v !== undefined) seen.add(v);
  }
  return Array.from(seen).sort();
}

export function uniqueNestedValues<T extends string | number>(
  nodes: SearchNodeItem[],
  fn: (n: SearchNodeItem) => (T | undefined | null)[],
): T[] {
  const seen = new Set<T>();
  for (const n of nodes) {
    for (const v of fn(n)) {
      if (v !== undefined && v !== null && v !== ("" as T)) seen.add(v);
    }
  }
  return (Array.from(seen) as T[]).sort();
}

export function hasAnyAdvancedFilter(f: FilterState): boolean {
  return (
    f.cpuModels.size > 0 ||
    f.cpuVendors.size > 0 ||
    f.cpuClockSpeeds.size > 0 ||
    f.cpuCacheL1d.size > 0 ||
    f.cpuCacheL1i.size > 0 ||
    f.cpuCacheL2.size > 0 ||
    f.cpuCacheL3.size > 0 ||
    f.cpuVersions.size > 0 ||
    f.cpuOtherDescriptions.size > 0 ||
    f.gpuCounts.size > 0 ||
    f.gpuVendors.size > 0 ||
    f.gpuMemories.size > 0 ||
    f.fpgaBoardModels.size > 0 ||
    f.fpgaBoardVendors.size > 0 ||
    f.netModels.size > 0 ||
    f.netVendors.size > 0 ||
    f.netNames.size > 0 ||
    f.activeDeviceCounts.size > 0 ||
    f.storageModels.size > 0 ||
    f.storageVendors.size > 0 ||
    f.storageSerials.size > 0 ||
    f.storageWwns.size > 0 ||
    f.nvmeOnly ||
    f.ssdOnly ||
    f.racks.size > 0 ||
    f.gpudirect ||
    f.nvmeof
  );
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(0)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

export function formatHz(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GHz`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MHz`;
  return `${n} Hz`;
}

export interface FilterChip {
  id: string;
  label: string;
  clear: (f: FilterState) => FilterState;
}

const DURATION_LABELS: Record<string, string> = { "6": "6 hrs", "24": "1 day", "72": "3 days", "168": "1 week" };
const CUSTOM_DURATION_LABELS: Record<string, string> = {
  "1": "1 hr", "6": "6 hrs", "24": "1 day", "72": "3 days", "168": "1 week", "336": "2 weeks",
};

function removeFromSet<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  next.delete(v);
  return next;
}

function setChips<T, K extends keyof FilterState>(
  set: Set<T>,
  field: K,
  prefix: string,
  labelFn: (v: T) => string,
): FilterChip[] {
  return Array.from(set).map((v) => ({
    id: `${field}-${String(v)}`,
    label: `${prefix}: ${labelFn(v)}`,
    clear: (cur) => ({ ...cur, [field]: removeFromSet(cur[field] as Set<T>, v) }),
  }));
}

export function getActiveFilterChips(f: FilterState): FilterChip[] {
  const chips: FilterChip[] = [];

  if (f.resourceType !== DEFAULT_FILTERS.resourceType) {
    chips.push({
      id: "resourceType",
      label: "Resource: Bare metal",
      clear: (cur) => ({ ...cur, resourceType: "all" }),
    });
  }

  chips.push(...setChips(f.nodeTypes, "nodeTypes", "Type", (v) => v));

  if (f.hasGpu === true) {
    chips.push({ id: "hasGpu", label: "Has GPU", clear: (cur) => ({ ...cur, hasGpu: null, gpuModels: new Set() }) });
  }
  chips.push(...setChips(f.gpuModels, "gpuModels", "GPU", (v) => v));

  if (f.arch !== null) {
    chips.push({ id: "arch", label: `Arch: ${f.arch}`, clear: (cur) => ({ ...cur, arch: null }) });
  }

  if (f.minRam !== null) {
    const tier = RAM_TIERS.find((t) => t.bytes === f.minRam);
    chips.push({ id: "minRam", label: `RAM: ${tier?.label ?? `${formatBytes(f.minRam)}+`}`, clear: (cur) => ({ ...cur, minRam: null }) });
  }

  if (f.infiniband) {
    chips.push({ id: "infiniband", label: "InfiniBand", clear: (cur) => ({ ...cur, infiniband: false }) });
  }

  if (f.availabilityWindow !== DEFAULT_FILTERS.availabilityWindow) {
    const label = f.availabilityWindow === "7d" ? "Starting within 7 days" : "Custom start time";
    chips.push({
      id: "availabilityWindow",
      label,
      clear: (cur) => ({ ...cur, availabilityWindow: "now", customStart: "", customDuration: "" }),
    });
  }

  if (f.availabilityWindow === "custom" && f.customStart) {
    chips.push({
      id: "customStart",
      label: `Start: ${new Date(f.customStart).toLocaleString()}`,
      clear: (cur) => ({ ...cur, customStart: "" }),
    });
  }

  if (f.availabilityWindow === "custom" && f.customDuration) {
    chips.push({
      id: "customDuration",
      label: `For: ${CUSTOM_DURATION_LABELS[f.customDuration] ?? `${f.customDuration} hrs`}`,
      clear: (cur) => ({ ...cur, customDuration: "" }),
    });
  }

  if (f.availabilityWindow !== "custom" && f.duration !== "any") {
    chips.push({
      id: "duration",
      label: `Available for at least: ${DURATION_LABELS[f.duration] ?? f.duration}`,
      clear: (cur) => ({ ...cur, duration: "any" }),
    });
  }

  // Advanced filters
  chips.push(...setChips(f.cpuModels, "cpuModels", "CPU", (v) => v));
  chips.push(...setChips(f.cpuVendors, "cpuVendors", "CPU Vendor", (v) => v));
  chips.push(...setChips(f.cpuClockSpeeds, "cpuClockSpeeds", "Clock", formatHz));
  chips.push(...setChips(f.cpuCacheL1d, "cpuCacheL1d", "Cache L1d", formatBytes));
  chips.push(...setChips(f.cpuCacheL1i, "cpuCacheL1i", "Cache L1i", formatBytes));
  chips.push(...setChips(f.cpuCacheL2, "cpuCacheL2", "Cache L2", formatBytes));
  chips.push(...setChips(f.cpuCacheL3, "cpuCacheL3", "Cache L3", formatBytes));
  chips.push(...setChips(f.cpuVersions, "cpuVersions", "CPU Version", (v) => v));
  chips.push(...setChips(f.cpuOtherDescriptions, "cpuOtherDescriptions", "CPU", (v) => v));
  chips.push(...setChips(f.gpuCounts, "gpuCounts", "GPU Count", (v) => String(v)));
  chips.push(...setChips(f.gpuVendors, "gpuVendors", "GPU Vendor", (v) => v));
  chips.push(...setChips(f.gpuMemories, "gpuMemories", "GPU Memory", formatBytes));
  chips.push(...setChips(f.fpgaBoardModels, "fpgaBoardModels", "FPGA Board", (v) => v));
  chips.push(...setChips(f.fpgaBoardVendors, "fpgaBoardVendors", "FPGA Vendor", (v) => v));
  chips.push(...setChips(f.netModels, "netModels", "NIC Model", (v) => v));
  chips.push(...setChips(f.netVendors, "netVendors", "NIC Vendor", (v) => v));
  chips.push(...setChips(f.netNames, "netNames", "NIC", (v) => v));
  chips.push(...setChips(f.activeDeviceCounts, "activeDeviceCounts", "Active NICs", (v) => String(v)));
  chips.push(...setChips(f.storageModels, "storageModels", "Storage Model", (v) => v));
  chips.push(...setChips(f.storageVendors, "storageVendors", "Storage Vendor", (v) => v));
  chips.push(...setChips(f.storageSerials, "storageSerials", "Storage Serial", (v) => v));
  chips.push(...setChips(f.storageWwns, "storageWwns", "Storage WWN", (v) => v));
  chips.push(...setChips(f.racks, "racks", "Rack", (v) => v));

  if (f.nvmeOnly) chips.push({ id: "nvmeOnly", label: "NVMe only", clear: (cur) => ({ ...cur, nvmeOnly: false }) });
  if (f.ssdOnly) chips.push({ id: "ssdOnly", label: "SSD only", clear: (cur) => ({ ...cur, ssdOnly: false }) });
  if (f.gpudirect) chips.push({ id: "gpudirect", label: "GPUDirect", clear: (cur) => ({ ...cur, gpudirect: false }) });
  if (f.nvmeof) chips.push({ id: "nvmeof", label: "NVMe-oF", clear: (cur) => ({ ...cur, nvmeof: false }) });

  return chips;
}
