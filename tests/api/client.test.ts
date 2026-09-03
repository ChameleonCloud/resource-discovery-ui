import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError, fetchFlavor, fetchNode } from "../../src/api/client";

function mockFetch(response: Partial<Response>) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}), ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchNode", () => {
  it("escapes ids so they cannot reach another endpoint", async () => {
    const fetchMock = mockFetch({});
    await fetchNode("uc", "chameleon", "../../sites");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sites/uc/clusters/chameleon/nodes/..%2F..%2Fsites");
  });

  it("fills in the site and cluster the node was requested from", async () => {
    mockFetch({ json: () => Promise.resolve({ uid: "abc", node_type: "compute_skylake" }) });
    const node = await fetchNode("tacc", "chameleon", "abc");
    expect(node).toMatchObject({ site_id: "tacc", cluster_id: "chameleon", availability: "unknown" });
  });

  it("reports the status of a failed request", async () => {
    mockFetch({ ok: false, status: 404 });
    await expect(fetchNode("uc", "chameleon", "gone")).rejects.toThrow(ApiError);
    await expect(fetchNode("uc", "chameleon", "gone")).rejects.toMatchObject({ status: 404 });
  });
});

describe("fetchFlavor", () => {
  it("escapes ids so they cannot reach another endpoint", async () => {
    const fetchMock = mockFetch({});
    await fetchFlavor("kvm", "../../../nodes/search");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sites/kvm/flavors/..%2F..%2F..%2Fnodes%2Fsearch");
  });

  it("keeps the dots in a flavor name", async () => {
    const fetchMock = mockFetch({});
    await fetchFlavor("kvm", "m1.large");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/sites/kvm/flavors/m1.large");
  });
});
