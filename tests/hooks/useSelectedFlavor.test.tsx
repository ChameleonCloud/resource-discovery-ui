import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VmFlavor } from "../../src/api/types";
import { useSelectedFlavor, flavorPath } from "../../src/hooks/useSelectedFlavor";
import { ApiError, fetchFlavor } from "../../src/api/client";

vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/api/client")>()),
  fetchFlavor: vi.fn(),
}));

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
  vi.mocked(fetchFlavor).mockReset();
});

describe("flavorPath", () => {
  it("addresses a flavor by site and uid", () => {
    expect(flavorPath("kvm", makeFlavor("m1.large"))).toBe("/flavors/kvm/m1.large");
  });
});

describe("useSelectedFlavor", () => {
  it("selects nothing on the discovery page", () => {
    const { result } = renderHook(() => useSelectedFlavor([makeFlavor("m1.large")], true), {
      wrapper: wrapper("/"),
    });
    expect(result.current.flavor).toBeNull();
    expect(fetchFlavor).not.toHaveBeenCalled();
  });

  it("resolves a flavor from the loaded list without a request", () => {
    const flavor = makeFlavor("m1.large");
    const { result } = renderHook(() => useSelectedFlavor([makeFlavor("m1.tiny"), flavor], true), {
      wrapper: wrapper("/flavors/kvm/m1.large"),
    });
    expect(result.current.flavor).toBe(flavor);
    expect(result.current.target).toEqual({ siteId: "kvm", uid: "m1.large" });
    expect(fetchFlavor).not.toHaveBeenCalled();
  });

  it("fetches a flavor absent from the list", async () => {
    vi.mocked(fetchFlavor).mockResolvedValue(makeFlavor("g1.h100.pci.1"));
    const { result } = renderHook(() => useSelectedFlavor([makeFlavor("m1.tiny")], true), {
      wrapper: wrapper("/flavors/kvm/g1.h100.pci.1"),
    });
    await waitFor(() => expect(result.current.flavor?.uid).toBe("g1.h100.pci.1"));
    expect(fetchFlavor).toHaveBeenCalledWith("kvm", "g1.h100.pci.1");
  });

  it("waits for the list before fetching", () => {
    renderHook(() => useSelectedFlavor([], false), {
      wrapper: wrapper("/flavors/kvm/m1.large"),
    });
    expect(fetchFlavor).not.toHaveBeenCalled();
  });

  it("reports a flavor the API does not have", async () => {
    vi.mocked(fetchFlavor).mockRejectedValue(new ApiError(404, "/sites/kvm/flavors/gone"));
    const { result } = renderHook(() => useSelectedFlavor([], true), {
      wrapper: wrapper("/flavors/kvm/gone"),
    });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.flavor).toBeNull();
  });

  it("does not report not-found when the request fails for another reason", async () => {
    vi.mocked(fetchFlavor).mockRejectedValue(new ApiError(500, "/sites/kvm/flavors/m1.large"));
    const { client, Wrapper } = setup("/flavors/kvm/m1.large");
    const { result } = renderHook(() => useSelectedFlavor([], true), { wrapper: Wrapper });
    await waitFor(() => expect(client.getQueryState(["flavor", "kvm", "m1.large"])?.status).toBe("error"));
    expect(result.current.notFound).toBe(false);
  });
});
