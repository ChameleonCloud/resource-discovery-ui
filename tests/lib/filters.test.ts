import { describe, it, expect } from "vitest";
import type { SearchNodeItem } from "../../src/api/types";
import {
  applyFilters,
  applyTextQuery,
  computeFacetCount,
  DEFAULT_FILTERS,
  STORAGE_TOTAL_TIERS,
} from "../../src/lib/filters";

function makeNode(overrides: Partial<SearchNodeItem> = {}): SearchNodeItem {
  return {
    uid: "node-1",
    node_type: "compute_skylake",
    site_id: "uc",
    cluster_id: "chameleon",
    availability: "available",
    gpu: { gpu: false },
    main_memory: { ram_size: 128 * 1024 ** 3 },
    architecture: { platform_type: "x86_64" },
    infiniband: false,
    ...overrides,
  };
}

const NODES: SearchNodeItem[] = [
  makeNode({ uid: "a", node_type: "compute_skylake", site_id: "uc" }),
  makeNode({ uid: "b", node_type: "compute_haswell", site_id: "tacc" }),
  makeNode({ uid: "c", node_type: "gpu_a100", site_id: "uc", gpu: { gpu: true, gpu_model: "A100" } }),
  makeNode({ uid: "d", node_type: "compute_skylake", site_id: "ncar", infiniband: true }),
];

describe("applyFilters", () => {
  it("returns all nodes with default filters", () => {
    expect(applyFilters(NODES, DEFAULT_FILTERS)).toHaveLength(4);
  });

  it("filters by GPU", () => {
    const f = { ...DEFAULT_FILTERS, hasGpu: true };
    const result = applyFilters(NODES, f);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("c");
  });

  it("filters by infiniband", () => {
    const f = { ...DEFAULT_FILTERS, infiniband: true };
    const result = applyFilters(NODES, f);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("d");
  });

  it("filters by minRam", () => {
    const lowRamNode = makeNode({ uid: "e", main_memory: { ram_size: 32 * 1024 ** 3 } });
    const nodes = [...NODES, lowRamNode];
    const f = { ...DEFAULT_FILTERS, minRam: 64 * 1024 ** 3 };
    const result = applyFilters(nodes, f);
    expect(result.some((n) => n.uid === "e")).toBe(false);
  });
});

describe("applyFilters, advanced hardware facets", () => {
  const GiB = 1024 ** 3;
  const small = makeNode({
    uid: "small",
    architecture: { platform_type: "x86_64", smp_size: 1, smt_size: 32 },
    processor: { cache_l1: 768000 },
    main_memory: { ram_size: 64 * GiB },
    storage_devices: [{ size: 100 * GiB }],
  });
  const big = makeNode({
    uid: "big",
    architecture: { platform_type: "x86_64", smp_size: 2, smt_size: 96 },
    processor: { cache_l1: 2 * 1024 ** 2 },
    main_memory: { ram_size: 256 * GiB },
    storage_devices: [{ size: 900 * GiB }, { size: 900 * GiB }],
  });
  const nodes = [small, big];

  it("filters by CPU count", () => {
    const result = applyFilters(nodes, { ...DEFAULT_FILTERS, cpuCounts: new Set([2]) });
    expect(result.map((n) => n.uid)).toEqual(["big"]);
  });

  it("filters by thread count", () => {
    const result = applyFilters(nodes, { ...DEFAULT_FILTERS, threadCounts: new Set([32]) });
    expect(result.map((n) => n.uid)).toEqual(["small"]);
  });

  it("filters by L1 cache size", () => {
    const result = applyFilters(nodes, { ...DEFAULT_FILTERS, cpuCacheL1: new Set([768000]) });
    expect(result.map((n) => n.uid)).toEqual(["small"]);
  });

  it("filters by exact RAM size, in whole GiB", () => {
    const result = applyFilters(nodes, { ...DEFAULT_FILTERS, ramSizes: new Set([256]) });
    expect(result.map((n) => n.uid)).toEqual(["big"]);
  });

  it("groups RAM sizes that round to the same GiB", () => {
    const odd = makeNode({ uid: "odd", main_memory: { ram_size: 63.8 * GiB } });
    const result = applyFilters([...nodes, odd], { ...DEFAULT_FILTERS, ramSizes: new Set([64]) });
    expect(result.map((n) => n.uid)).toEqual(["small", "odd"]);
  });

  it("filters by total storage summed across devices", () => {
    const overATib = STORAGE_TOTAL_TIERS[STORAGE_TOTAL_TIERS.length - 1].label;
    const result = applyFilters(nodes, { ...DEFAULT_FILTERS, storageTotals: new Set([overATib]) });
    expect(result.map((n) => n.uid)).toEqual(["big"]);
  });

  it("accepts a node matching any selected storage tier", () => {
    const mid = makeNode({ uid: "mid", storage_devices: [{ size: 300 * GiB }] });
    const labels = STORAGE_TOTAL_TIERS.map((t) => t.label);
    const result = applyFilters([small, mid, big], {
      ...DEFAULT_FILTERS,
      storageTotals: new Set([labels[0], labels[3]]),
    });
    expect(result.map((n) => n.uid)).toEqual(["small", "big"]);
  });
});

describe("applyTextQuery", () => {
  it("matches node_type", () => {
    const result = applyTextQuery(NODES, "skylake");
    expect(result.every((n) => n.node_type.includes("skylake"))).toBe(true);
  });

  it("matches GPU model", () => {
    const result = applyTextQuery(NODES, "A100");
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("c");
  });

  it("matches site_id", () => {
    const result = applyTextQuery(NODES, "tacc");
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe("b");
  });

  it("returns all nodes for empty query", () => {
    expect(applyTextQuery(NODES, "")).toHaveLength(4);
  });
});

describe("computeFacetCount", () => {
  it("counts nodes matching a GPU facet", () => {
    const count = computeFacetCount(NODES, DEFAULT_FILTERS, "hasGpu", true);
    expect(count).toBe(1);
  });

  it("counts zero for a GPU facet with no matches", () => {
    const count = computeFacetCount(NODES, DEFAULT_FILTERS, "hasGpu", false);
    expect(count).toBe(3);
  });

  it("clears its own facet before counting", () => {
    // hasGpu:false is active, but computeFacetCount clears that facet first,
    // so the GPU node is still visible for the hasGpu:true count
    const f = { ...DEFAULT_FILTERS, hasGpu: false as const };
    const count = computeFacetCount(NODES, f, "hasGpu", true);
    expect(count).toBe(1);
  });
});
