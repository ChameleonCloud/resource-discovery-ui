import type { VmFlavor } from "../api/types";

export function clamp(n: number): number {
  return Math.max(0, Math.min(99, n));
}

export interface FlavorFilterState {
  hasGpu: boolean;
  minVcpus: number | null;
  minRamBytes: number | null;
  minDiskBytes: number | null;
  maxSuPerHour: number | null;
}

export const DEFAULT_FLAVOR_FILTERS: FlavorFilterState = {
  hasGpu: false,
  minVcpus: null,
  minRamBytes: null,
  minDiskBytes: null,
  maxSuPerHour: null,
};

const GiB = 1024 ** 3;

export const VCPU_TIERS: { label: string; vcpus: number }[] = [
  { label: "2+ vCPUs", vcpus: 2 },
  { label: "4+ vCPUs", vcpus: 4 },
  { label: "8+ vCPUs", vcpus: 8 },
  { label: "16+ vCPUs", vcpus: 16 },
];

export const RAM_FLAVOR_TIERS: { label: string; bytes: number }[] = [
  { label: "8+ GiB", bytes: 8 * GiB },
  { label: "32+ GiB", bytes: 32 * GiB },
  { label: "128+ GiB", bytes: 128 * GiB },
];

export const DISK_FLAVOR_TIERS: { label: string; bytes: number }[] = [
  { label: "20+ GiB", bytes: 20 * GiB },
  { label: "40+ GiB", bytes: 40 * GiB },
];

export const COST_TIERS: { label: string; su: number }[] = [
  { label: "≤ 2 SU/hr", su: 2 },
  { label: "≤ 4 SU/hr", su: 4 },
  { label: "≤ 16 SU/hr", su: 16 },
];

export interface FlavorFilterChip {
  id: string;
  label: string;
  clear: (f: FlavorFilterState) => FlavorFilterState;
}

export function getActiveFlavorFilterChips(f: FlavorFilterState): FlavorFilterChip[] {
  const chips: FlavorFilterChip[] = [];
  if (f.hasGpu) chips.push({ id: "hasGpu", label: "Has GPU", clear: (cur) => ({ ...cur, hasGpu: false }) });
  if (f.minVcpus !== null) chips.push({ id: "minVcpus", label: `≥${f.minVcpus} vCPUs`, clear: (cur) => ({ ...cur, minVcpus: null }) });
  if (f.minRamBytes !== null) chips.push({ id: "minRamBytes", label: `≥${f.minRamBytes / 1024 ** 3} GiB RAM`, clear: (cur) => ({ ...cur, minRamBytes: null }) });
  if (f.minDiskBytes !== null) chips.push({ id: "minDiskBytes", label: `≥${f.minDiskBytes / 1024 ** 3} GiB disk`, clear: (cur) => ({ ...cur, minDiskBytes: null }) });
  if (f.maxSuPerHour !== null) chips.push({ id: "maxSuPerHour", label: `≤${f.maxSuPerHour} SU/hr`, clear: (cur) => ({ ...cur, maxSuPerHour: null }) });
  return chips;
}

export function applyFlavorFilters(flavors: VmFlavor[], f: FlavorFilterState): VmFlavor[] {
  return flavors.filter((flavor) => {
    if (f.hasGpu && !(flavor.gpu?.gpu ?? false)) return false;
    if (f.minVcpus !== null && flavor.vcpus < f.minVcpus) return false;
    if (f.minRamBytes !== null && flavor.ram_size < f.minRamBytes) return false;
    if (f.minDiskBytes !== null && flavor.disk_size < f.minDiskBytes) return false;
    if (f.maxSuPerHour !== null && (typeof flavor.su_cost_per_hour !== "number" || flavor.su_cost_per_hour > f.maxSuPerHour)) return false;
    return true;
  });
}
