import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SearchNodeItem } from "../../src/api/types";
import { useSelectedNode, nodePath } from "../../src/hooks/useSelectedNode";
import { ApiError, fetchNode } from "../../src/api/client";

vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/api/client")>()),
  fetchNode: vi.fn(),
}));

function makeNode(uid: string, overrides: Partial<SearchNodeItem> = {}): SearchNodeItem {
  return {
    uid,
    node_type: "compute_skylake",
    site_id: "uc",
    cluster_id: "chameleon",
    availability: "available",
    ...overrides,
  };
}

function setup(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { client, Wrapper };
}

function wrapper(path: string) {
  return setup(path).Wrapper;
}

beforeEach(() => {
  vi.mocked(fetchNode).mockReset();
});

describe("nodePath", () => {
  it("addresses a node by site, cluster, and uid", () => {
    expect(nodePath(makeNode("abc"))).toBe("/nodes/uc/chameleon/abc");
  });
});

describe("useSelectedNode", () => {
  it("selects nothing on the discovery page", () => {
    const { result } = renderHook(() => useSelectedNode([makeNode("abc")], true), {
      wrapper: wrapper("/"),
    });
    expect(result.current.node).toBeNull();
    expect(result.current.target).toBeNull();
    expect(fetchNode).not.toHaveBeenCalled();
  });

  it("resolves a node from the loaded list without a request", () => {
    const node = makeNode("abc");
    const { result } = renderHook(() => useSelectedNode([makeNode("other"), node], true), {
      wrapper: wrapper("/nodes/uc/chameleon/abc"),
    });
    expect(result.current.node).toBe(node);
    expect(result.current.target).toEqual({ siteId: "uc", uid: "abc" });
    expect(fetchNode).not.toHaveBeenCalled();
  });

  it("fetches a node absent from the list", async () => {
    vi.mocked(fetchNode).mockResolvedValue(makeNode("missing", { site_id: "tacc", availability: "unknown" }));
    const { result } = renderHook(() => useSelectedNode([makeNode("other")], true), {
      wrapper: wrapper("/nodes/tacc/chameleon/missing"),
    });
    await waitFor(() => expect(result.current.node?.uid).toBe("missing"));
    expect(fetchNode).toHaveBeenCalledWith("tacc", "chameleon", "missing");
  });

  it("waits for the list before fetching", () => {
    renderHook(() => useSelectedNode([], false), {
      wrapper: wrapper("/nodes/uc/chameleon/abc"),
    });
    expect(fetchNode).not.toHaveBeenCalled();
  });

  it("keeps a resolved node that leaves the list", () => {
    const node = makeNode("abc");
    const { result, rerender } = renderHook(
      ({ nodes }: { nodes: SearchNodeItem[] }) => useSelectedNode(nodes, true),
      { wrapper: wrapper("/nodes/uc/chameleon/abc"), initialProps: { nodes: [node] } },
    );
    expect(result.current.node).toBe(node);

    rerender({ nodes: [] });
    expect(result.current.node).toBe(node);
    expect(fetchNode).not.toHaveBeenCalled();
  });

  it("reports a node the API does not have", async () => {
    vi.mocked(fetchNode).mockRejectedValue(new ApiError(404, "/sites/uc/clusters/chameleon/nodes/gone"));
    const { result } = renderHook(() => useSelectedNode([], true), {
      wrapper: wrapper("/nodes/uc/chameleon/gone"),
    });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.node).toBeNull();
    expect(result.current.target).toEqual({ siteId: "uc", uid: "gone" });
  });

  it("does not report not-found when the request fails for another reason", async () => {
    vi.mocked(fetchNode).mockRejectedValue(new ApiError(500, "/sites/uc/clusters/chameleon/nodes/abc"));
    const { client, Wrapper } = setup("/nodes/uc/chameleon/abc");
    const { result } = renderHook(() => useSelectedNode([], true), { wrapper: Wrapper });
    await waitFor(() =>
      expect(client.getQueryState(["node", "uc", "chameleon", "abc"])?.status).toBe("error"),
    );
    expect(result.current.notFound).toBe(false);
  });
});
