import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SearchNodeItem, VmFlavor } from "../../src/api/types";
import { ReservationSnippets } from "../../src/components/ReservationSnippets";

vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/api/client")>()),
  fetchNodeAvailability: vi.fn(() => new Promise(() => {})),
}));

const NODE: SearchNodeItem = {
  uid: "tacc-bm01",
  node_name: "tacc-bm01",
  node_type: "compute_skylake",
  site_id: "tacc",
  cluster_id: "chameleon",
  availability: "available",
};

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

describe("ReservationSnippets", () => {
  it("reserves both nodes and flavors at the same site in python-chi", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ReservationSnippets nodes={[NODE]} flavors={[{ siteId: "tacc", flavor: FLAVOR, count: 2 }]} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "python-chi" }));

    const code = screen.getByText(/my_lease\.submit/).textContent ?? "";
    expect(code).toContain(`my_lease.add_flavor_reservation(name="m1.small", amount=2)\n`);
    expect(code).toContain(`my_lease.add_node_reservation(amount=1, node_type="compute_skylake")\n`);
  });
});
