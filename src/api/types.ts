export interface Site {
  uid: string;
  name: string;
  description: string;
  location: string;
  site_class: string;
  web: string;
  latitude: number;
  longitude: number;
}

export interface SiteCollection {
  total: number;
  offset: number;
  items: Site[];
}

export interface GpuInfo {
  gpu: boolean;
  gpu_model?: string;
  gpu_count?: number;
  gpu_memory?: number;
  gpu_vendor?: string;
}

export interface FpgaInfo {
  fpga?: boolean;
  board_model?: string;
  board_vendor?: string;
}

export interface CpuInfo {
  clock_speed?: number | null;
  count?: number;
  model?: string;
  other_description?: string;
  vendor?: string;
  version?: string | null;
  instruction_set?: string;
  cache_l1?: number | null;
  cache_l1d?: number;
  cache_l1i?: number;
  cache_l2?: number;
  cache_l3?: number;
}

export interface Architecture {
  platform_type?: string;
  smp_size?: number;
  smt_size?: number;
}

export interface MainMemory {
  ram_size?: number;
  humanized_ram_size?: string;
}

export interface StorageDevice {
  device?: string;
  driver?: string;
  humanized_size?: string;
  interface?: string;
  model?: string;
  rev?: string;
  size?: number;
  vendor?: string;
  ssd?: boolean;
  serial?: string;
  wwn?: string;
}

export interface NetworkAdapter {
  device?: string;
  driver?: string | null;
  enabled?: boolean;
  interface?: string | null;
  mac?: string | null;
  management?: boolean | null;
  model?: string;
  mounted?: boolean | null;
  rate?: number;
  vendor?: string;
  bridged?: boolean;
}

export interface BiosInfo {
  release_date?: string;
  vendor?: string;
  version?: string;
}

export interface ChassisInfo {
  manufacturer?: string;
  name?: string | null;
  serial?: string | null;
}

export interface MonitoringInfo {
  wattmeter?: boolean;
}

export interface PlacementInfo {
  rack?: number | string;
  node?: number;
}

export interface SupportedJobTypes {
  besteffort?: boolean;
  deploy?: boolean;
  virtual?: string;
}

export interface SearchNodeItem {
  uid: string;
  node_type: string;
  node_name?: string;
  site_id: string;
  cluster_id: string;
  availability: "available" | "reserved" | "unknown" | "maintenance";
  gpu?: GpuInfo;
  fpga?: FpgaInfo;
  processor?: CpuInfo;
  architecture?: Architecture;
  main_memory?: MainMemory;
  storage_devices?: StorageDevice[];
  network_adapters?: NetworkAdapter[];
  infiniband?: boolean;
  bios?: BiosInfo;
  chassis?: ChassisInfo;
  monitoring?: MonitoringInfo;
  placement?: PlacementInfo;
  supported_job_types?: SupportedJobTypes;
  admin_note?: string;
}

export interface NodeSearchResponse {
  total: number;
  offset: number;
  items: SearchNodeItem[];
}

export interface Reservation {
  start: string;
  end: string;
}

export interface NodeAvailabilityResponse {
  node_id: string;
  cluster_id: string;
  site_id: string;
  last_updated: string;
  reservations: Reservation[];
}

export interface NodeSearchParams {
  site_id?: string;
  node_type?: string;
  arch?: string;
  gpu?: boolean;
  infiniband?: boolean;
  min_ram?: number;
  start?: string;
  end?: string;
  offset?: number;
  limit?: number;
}
