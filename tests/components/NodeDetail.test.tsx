import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SearchNodeItem } from "../../src/api/types";
import { NodeDetail } from "../../src/components/NodeDetail";

vi.mock("../../src/components/AvailabilityCalendar", () => ({
  AvailabilityCalendar: () => null,
}));

function renderDetail(lease_mode: SearchNodeItem["lease_mode"]) {
  const node: SearchNodeItem = {
    uid: "test-uid",
    node_type: "gpu_h100",
    site_id: "kvm",
    cluster_id: "chameleon",
    availability: "available",
    lease_mode,
  };
  render(<NodeDetail node={node} peerNodes={[]} siteMap={new Map()} onClose={vi.fn()} />);
}

describe("NodeDetail", () => {
  it("offers the Reserve Node tab for a baremetal node", () => {
    renderDetail("baremetal");
    expect(screen.getByRole("button", { name: "Reserve Node" })).toBeInTheDocument();
  });

  it("hides the Reserve Node tab for a flavor node", () => {
    renderDetail("flavor");
    expect(screen.queryByRole("button", { name: "Reserve Node" })).not.toBeInTheDocument();
  });
});
