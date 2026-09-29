import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SearchNodeItem, Site, VmFlavor } from "../../src/api/types";
import type { CartItem } from "../../src/hooks/useCart";
import { DiscoveryPage } from "../../src/pages/DiscoveryPage";
import { fetchNodeSearch, fetchSiteFlavors, fetchSites } from "../../src/api/client";

vi.mock("../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/api/client")>()),
  fetchSites: vi.fn(),
  fetchNodeSearch: vi.fn(),
  fetchSiteFlavors: vi.fn(),
  fetchSiteAvailabilityStatus: vi.fn(() => new Promise(() => {})),
  fetchFlavorAvailability: vi.fn(() => new Promise(() => {})),
}));

vi.mock("../../src/components/FlavorCalendar", () => ({
  FlavorCalendar: ({ siteId }: { siteId: string }) => <div>Flavor calendar for {siteId}</div>,
}));

function site(uid: string, name: string, site_class: string): Site {
  return { uid, name, site_class, description: "", location: "", web: "", latitude: 0, longitude: 0 };
}

function node(site_id: string, node_name: string, lease_mode: SearchNodeItem["lease_mode"]): SearchNodeItem {
  return {
    uid: `${site_id}-${node_name}`,
    node_name,
    node_type: "compute_skylake",
    site_id,
    cluster_id: "chameleon",
    availability: "available",
    lease_mode,
  };
}

function flavor(uid: string): VmFlavor {
  return {
    uid,
    name: uid,
    vcpus: 1,
    ram_size: 2147483648,
    humanized_ram_size: "2 GiB",
    disk_size: 21474836480,
    humanized_disk_size: "20 GiB",
    gpu: { gpu: false },
    openstack_properties: {},
    su_cost_per_hour: 0.95,
  };
}

const SITES = [site("uc", "CHI@UC", "baremetal"), site("tacc", "CHI@TACC", "baremetal"), site("kvm", "KVM@TACC", "kvm")];
const NODES = [
  node("uc", "uc-bm01", "baremetal"),
  node("tacc", "tacc-bm01", "baremetal"),
  node("tacc", "tacc-vm01", "flavor"),
  node("kvm", "kvmgpu01", "flavor"),
];

function mockApi(flavorsBySite: Record<string, VmFlavor[]>) {
  vi.mocked(fetchSites).mockResolvedValue({ total: SITES.length, offset: 0, items: SITES });
  vi.mocked(fetchNodeSearch).mockImplementation(async ({ site_id }) => {
    const items = NODES.filter((n) => !site_id || n.site_id === site_id);
    return { total: items.length, offset: 0, items };
  });
  vi.mocked(fetchSiteFlavors).mockImplementation(async (siteId) => {
    const items = flavorsBySite[siteId] ?? [];
    return { total: items.length, offset: 0, items };
  });
}

function renderPage(cart: CartItem[] = [], query = "") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DiscoveryPage
          cart={cart}
          query={query}
          onQueryChange={vi.fn()}
          onCartChange={vi.fn()}
          onFlavorCountChange={vi.fn()}
          onClearCart={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DiscoveryPage", () => {
  it("leaves flavor-leased nodes out of the bare-metal view", async () => {
    mockApi({ kvm: [flavor("m1.small")], tacc: [flavor("m1.small")] });
    renderPage();

    expect(await screen.findByRole("button", { name: "tacc-bm01 at CHI@TACC" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "tacc-vm01 at CHI@TACC" })).not.toBeInTheDocument();
  });

  it("shows a tab per site with flavors, each with its own flavors and hardware", async () => {
    mockApi({ kvm: [flavor("g1.h100.vgpu.1g.12gb")], tacc: [flavor("m1.tiny")] });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Virtual Machines" }));

    const tabs = await screen.findByRole("tablist", { name: "Virtual machine sites" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["CHI@TACC", "KVM@TACC"]);

    expect(await screen.findByRole("button", { name: "m1.tiny details" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "tacc-vm01 at CHI@TACC" })).toBeInTheDocument();
    expect(screen.getByText("Flavor calendar for tacc")).toBeInTheDocument();

    await userEvent.click(within(tabs).getByRole("tab", { name: "KVM@TACC" }));
    expect(await screen.findByRole("button", { name: "g1.h100.vgpu.1g.12gb details" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "kvmgpu01 at KVM@TACC" })).toBeInTheDocument();
    expect(screen.getByText("Flavor calendar for kvm")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "m1.tiny details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "tacc-vm01 at CHI@TACC" })).not.toBeInTheDocument();
  });

  it("shows no site tabs when only one site has flavors", async () => {
    mockApi({ kvm: [flavor("m1.small")] });
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Virtual Machines" }));

    expect(await screen.findByRole("button", { name: "m1.small details" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Virtual machine sites" })).not.toBeInTheDocument();
  });

  it("counts a flavor in the cart only at its own site", async () => {
    mockApi({ kvm: [flavor("m1.small")], tacc: [flavor("m1.small")] });
    renderPage([{ kind: "flavor", siteId: "tacc", flavor: flavor("m1.small"), count: 2 }]);
    await userEvent.click(screen.getByRole("button", { name: "Virtual Machines" }));

    expect(await screen.findByRole("spinbutton", { name: "m1.small quantity" })).toHaveValue(2);

    const tabs = screen.getByRole("tablist", { name: "Virtual machine sites" });
    await userEvent.click(within(tabs).getByRole("tab", { name: "KVM@TACC" }));
    expect(await screen.findByRole("spinbutton", { name: "m1.small quantity" })).toHaveValue(0);
  });

  it("switches from bare metal to the first VM site whose flavors match", async () => {
    mockApi({ kvm: [flavor("g1.h100.vgpu.1g.12gb"), flavor("m1.small")], tacc: [flavor("m1.tiny")] });
    renderPage([], "g1");

    expect(await screen.findByText("1 VM flavor match your search.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to Virtual Machines →" }));

    expect(await screen.findByRole("tab", { name: "KVM@TACC", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "g1.h100.vgpu.1g.12gb details" })).toBeInTheDocument();
  });

  it("offers a switch to each other VM site whose flavors match", async () => {
    mockApi({ kvm: [flavor("m1.small")], tacc: [flavor("m1.tiny")] });
    renderPage([], "m1");

    expect(await screen.findByText("2 VM flavors match your search.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to Virtual Machines →" }));

    expect(await screen.findByRole("tab", { name: "CHI@TACC", selected: true })).toBeInTheDocument();
    expect(screen.getByText("1 VM flavor at KVM@TACC match your search.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to KVM@TACC →" }));

    expect(await screen.findByRole("tab", { name: "KVM@TACC", selected: true })).toBeInTheDocument();
    expect(screen.getByText("1 VM flavor at CHI@TACC match your search.")).toBeInTheDocument();
    expect(screen.queryByText("1 VM flavor at KVM@TACC match your search.")).not.toBeInTheDocument();
  });

  it("offers the switch when the current VM site has no matching flavors", async () => {
    mockApi({ kvm: [flavor("g1.h100.vgpu.1g.12gb")], tacc: [flavor("m1.tiny")] });
    renderPage([], "g1");
    await userEvent.click(screen.getByRole("button", { name: "Virtual Machines" }));

    expect(await screen.findByRole("tab", { name: "CHI@TACC", selected: true })).toBeInTheDocument();
    expect(await screen.findByText("No flavors found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to KVM@TACC →" })).toBeInTheDocument();
  });
});
