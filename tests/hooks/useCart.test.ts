import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { SearchNodeItem } from "../../src/api/types";
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
    act(() => { result.current.dispatch({ type: "add", node: makeNode("n1") }); });
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].uid).toBe("n1");
  });

  it("does not add duplicates", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "add", node: makeNode("n1") }); });
    act(() => { result.current.dispatch({ type: "add", node: makeNode("n1") }); });
    expect(result.current.cart).toHaveLength(1);
  });

  it("removes a node", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "add", node: makeNode("n1") }); });
    act(() => { result.current.dispatch({ type: "remove", uid: "n1" }); });
    expect(result.current.cart).toHaveLength(0);
  });

  it("clears all nodes", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "add", node: makeNode("n1") }); });
    act(() => { result.current.dispatch({ type: "add", node: makeNode("n2") }); });
    act(() => { result.current.dispatch({ type: "clear" }); });
    expect(result.current.cart).toHaveLength(0);
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useCart());
    act(() => { result.current.dispatch({ type: "add", node: makeNode("n1") }); });
    const stored = JSON.parse(localStorage.getItem("discovery-cart")!);
    expect(stored).toHaveLength(1);
    expect(stored[0].uid).toBe("n1");
  });

  it("loads from localStorage on mount", () => {
    localStorage.setItem("discovery-cart", JSON.stringify([makeNode("preloaded")]));
    const { result } = renderHook(() => useCart());
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].uid).toBe("preloaded");
  });
});
