import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SearchNodeItem, Site } from "../../src/api/types";
import { SiteAvailabilityBars } from "../../src/components/SiteAvailabilityBars";

const SITE_MAP = new Map<string, Site>([
  ["uc", { uid: "uc", name: "CHI@UC", site_class: "baremetal", description: "", location: "", web: "", latitude: 0, longitude: 0 }],
]);

function node(uid: string, node_type: string, availability: SearchNodeItem["availability"]): SearchNodeItem {
  return { uid, node_type, site_id: "uc", cluster_id: "chameleon", availability };
}

describe("SiteAvailabilityBars", () => {
  it("labels each chip with available out of total", () => {
    const nodes = [node("a", "compute_skylake", "available"), node("b", "compute_skylake", "reserved"), node("c", "compute_skylake", "maintenance")];
    render(<SiteAvailabilityBars nodes={nodes} siteMap={SITE_MAP} />);

    expect(screen.getByRole("button", { name: "compute_skylake 1/3" })).toHaveAttribute(
      "title",
      "1 available · 1 reserved · 1 maintenance",
    );
  });

  it("fades unpicked chips while any chip is picked", () => {
    const nodes = [node("a", "compute_skylake", "available"), node("b", "compute_haswell", "available")];
    render(<SiteAvailabilityBars nodes={nodes} siteMap={SITE_MAP} selectedChips={new Set(["uc:compute_skylake"])} />);

    expect(screen.getByRole("button", { name: "compute_haswell 1/1" })).toHaveClass("opacity-40");
    expect(screen.getByRole("button", { name: "compute_skylake 1/1" })).not.toHaveClass("opacity-40");
  });

  it("orders chips with the same available count by name", () => {
    const nodes = [node("a", "storage", "reserved"), node("b", "compute_haswell", "reserved")];
    render(<SiteAvailabilityBars nodes={nodes} siteMap={SITE_MAP} />);

    expect(screen.getAllByRole("button", { name: /\d+\/\d+$/ }).map((b) => b.textContent)).toEqual(["compute_haswell 0/1", "storage 0/1"]);
  });
});
