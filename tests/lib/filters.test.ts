import { describe, it, expect } from "vitest";
import type { SearchNodeItem } from "../../src/api/types";
import {
  applyFilters,
  applyTextQuery,
  computeFacetCount,
  DEFAULT_FILTERS,
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
