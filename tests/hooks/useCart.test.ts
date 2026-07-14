import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SearchNodeItem, VmFlavor } from "../../src/api/types";
import { useCart } from "../../src/hooks/useCart";

function makeNode(uid: string): SearchNodeItem {
  return {
    uid,
    node_type: "compute_skylake",
    site_id: "uc",
    cluster_id: "chameleon",
    availability: "available",
  };
}

function makeFlavor(uid: string): VmFlavor {
  return {
    uid,
    name: uid,
    vcpus: 4,
    ram_size: 8589934592,
    humanized_ram_size: "8 GiB",
    disk_size: 42949672960,
    humanized_disk_size: "40 GiB",
    gpu: { gpu: false },
    openstack_properties: {},
    su_cost_per_hour: 0.96,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("useCart", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.cart).toHaveLength(0);
  });

  it("adds a node", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "addNode", node: makeNode("n1") }); });
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0]).toMatchObject({ kind: "node", node: { uid: "n1" } });
  });

  it("does not add duplicate nodes", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "addNode", node: makeNode("n1") }); });
    act(() => { result.current.dispatch({ type: "addNode", node: makeNode("n1") }); });
    expect(result.current.cart).toHaveLength(1);
  });

  it("removes a node", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "addNode", node: makeNode("n1") }); });
    act(() => { result.current.dispatch({ type: "removeNode", uid: "n1" }); });
    expect(result.current.cart).toHaveLength(0);
  });

  it("sets a flavor count", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "setFlavorCount", siteId: "kvm", flavor: makeFlavor("m1.large"), count: 3 }); });
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0]).toMatchObject({ kind: "flavor", siteId: "kvm", count: 3, flavor: { uid: "m1.large" } });
  });

  it("updates an existing flavor's count rather than duplicating", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "setFlavorCount", siteId: "kvm", flavor: makeFlavor("m1.large"), count: 2 }); });
    act(() => { result.current.dispatch({ type: "setFlavorCount", siteId: "kvm", flavor: makeFlavor("m1.large"), count: 5 }); });
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0]).toMatchObject({ count: 5 });
  });

  it("removes a flavor line when count drops to 0", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "setFlavorCount", siteId: "kvm", flavor: makeFlavor("m1.large"), count: 2 }); });
    act(() => { result.current.dispatch({ type: "setFlavorCount", siteId: "kvm", flavor: makeFlavor("m1.large"), count: 0 }); });
    expect(result.current.cart).toHaveLength(0);
  });

  it("clears all items", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "addNode", node: makeNode("n1") }); });
    act(() => { result.current.dispatch({ type: "setFlavorCount", siteId: "kvm", flavor: makeFlavor("m1.large"), count: 2 }); });
    act(() => { result.current.dispatch({ type: "clear" }); });
    expect(result.current.cart).toHaveLength(0);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "addNode", node: makeNode("n1") }); });
    const stored = JSON.parse(localStorage.getItem("discovery-cart")!);
    expect(stored).toHaveLength(1);
    expect(stored[0].node.uid).toBe("n1");
  });

  it("loads from localStorage on mount", () => {
    localStorage.setItem("discovery-cart", JSON.stringify([{ kind: "node", node: makeNode("preloaded") }]));
    const { result } = renderHook(() => useCart());
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0]).toMatchObject({ kind: "node", node: { uid: "preloaded" } });
  });

  it("migrates legacy pre-flavor carts (flat SearchNodeItem[] with no kind tag)", () => {
    localStorage.setItem("discovery-cart", JSON.stringify([makeNode("legacy")]));
    const { result } = renderHook(() => useCart());
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0]).toMatchObject({ kind: "node", node: { uid: "legacy" } });
  });
});
