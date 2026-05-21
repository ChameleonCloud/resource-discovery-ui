import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { SearchNodeItem } from "../../src/api/types";
import { NodeCard } from "../../src/components/NodeCard";

function makeNode(overrides: Partial<SearchNodeItem> = {}): SearchNodeItem {
  return {
    uid: "test-uid",
    node_type: "compute_skylake",
    site_id: "uc",
    cluster_id: "chameleon",
    availability: "available",
    gpu: { gpu: false },
    main_memory: { ram_size: 128 * 1024 ** 3 },
    architecture: { platform_type: "x86_64" },
    infiniband: false,
    ...overrides,
  };
}

function renderCard(node = makeNode(), selected = false) {
  const onSelect = vi.fn();
  const onClick = vi.fn();
  render(
    <MemoryRouter>
      <NodeCard
        node={node}
        siteName="CHI@UC"
        selected={selected}
        onSelect={onSelect}
        onClick={onClick}
      />
    </MemoryRouter>,
  );
  return { onSelect, onClick };
}

describe("NodeCard", () => {
  it("renders node type and site name", () => {
    renderCard();
    expect(screen.getAllByText("compute_skylake").length).toBeGreaterThan(0);
    expect(screen.getByText("CHI@UC")).toBeInTheDocument();
  });

  it("shows availability badge", () => {
    renderCard();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("shows Reserved badge when reserved", () => {
    renderCard(makeNode({ availability: "reserved" }));
    expect(screen.getByText("Reserved")).toBeInTheDocument();
  });

  it("shows Bare metal badge", () => {
    renderCard();
    expect(screen.getByText("Bare metal")).toBeInTheDocument();
  });

  it("shows Associate badge for non-core sites", () => {
    renderCard(makeNode({ site_id: "nu" }));
    expect(screen.getByText("Associate")).toBeInTheDocument();
  });

  it("does not show Associate badge for core sites", () => {
    renderCard(makeNode({ site_id: "uc" }));
    expect(screen.queryByText("Associate")).not.toBeInTheDocument();
  });

  it("shows GPU info when GPU present", () => {
    renderCard(makeNode({ gpu: { gpu: true, gpu_model: "NVIDIA A100" } }));
    expect(screen.getByText(/A100/)).toBeInTheDocument();
  });

  it("calls onClick when card is clicked", async () => {
    const user = userEvent.setup();
    const { onClick } = renderCard();
    await user.click(screen.getByRole("button", { name: /compute_skylake/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("formats RAM correctly", () => {
    renderCard();
    expect(screen.getByText(/128 GiB/)).toBeInTheDocument();
  });
});
