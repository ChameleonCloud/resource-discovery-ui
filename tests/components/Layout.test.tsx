import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "../../src/components/Layout";

describe("Layout", () => {
  it("shows the static header inside the portal header element", () => {
    render(
      <MemoryRouter>
        <Layout cartCount={0}>content</Layout>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "About" }).closest("chameleon-header")).not.toBeNull();
  });
});
