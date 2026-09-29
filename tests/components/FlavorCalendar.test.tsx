import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VmFlavor } from "../../src/api/types";
import { FlavorCalendar } from "../../src/components/FlavorCalendar";
import { ApiError, fetchFlavorAvailability } from "../../src/api/client";

vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/api/client")>()),
  fetchFlavorAvailability: vi.fn(),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

const FLAVOR: VmFlavor = {
  uid: "m1.small",
  name: "m1.small",
  vcpus: 1,
  ram_size: 2147483648,
  humanized_ram_size: "2 GiB",
  disk_size: 21474836480,
  humanized_disk_size: "20 GiB",
  gpu: { gpu: false },
  openstack_properties: {},
  su_cost_per_hour: 0.95,
};

function renderCalendar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FlavorCalendar siteId="tacc" flavors={[FLAVOR]} />
    </QueryClientProvider>,
  );
}

describe("FlavorCalendar", () => {
  it("says availability isn't published when the site returns 404", async () => {
    vi.mocked(fetchFlavorAvailability).mockRejectedValue(new ApiError(404, "/sites/tacc/flavors/m1.small/availability"));
    renderCalendar();
    expect(await screen.findByText("Availability isn't published for this site.")).toBeInTheDocument();
  });

  it("reports other errors as a failed load", async () => {
    vi.mocked(fetchFlavorAvailability).mockRejectedValue(new ApiError(503, "/sites/tacc/flavors/m1.small/availability"));
    renderCalendar();
    expect(await screen.findByText("Could not load availability data.")).toBeInTheDocument();
  });
});
