import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { FeedbackWidget } from "../../src/components/FeedbackWidget";

function renderWidget() {
  render(
    <MemoryRouter>
      <FeedbackWidget />
    </MemoryRouter>,
  );
}

describe("FeedbackWidget", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
  });

  it("opens the feedback dialog from the header button", async () => {
    renderWidget();
    await userEvent.click(screen.getByRole("button", { name: "Give feedback" }));
    expect(screen.getByText("How's it going?")).toBeInTheDocument();
  });

  it("links to the Chameleon Help Desk", async () => {
    renderWidget();
    await userEvent.click(screen.getByRole("button", { name: "Give feedback" }));
    const link = screen.getByRole("link", { name: "Open a support ticket" });
    expect(link).toHaveAttribute(
      "href",
      "https://www.chameleoncloud.org/user/help/ticket/new/guest/",
    );
  });

  it("submits a sentiment and comment to /feedback/", async () => {
    renderWidget();
    await userEvent.click(screen.getByRole("button", { name: "Give feedback" }));
    await userEvent.click(screen.getByRole("button", { name: "Thumbs up" }));
    await userEvent.type(screen.getByPlaceholderText(/anything you'd like/i), "Great tool!");
    await userEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(fetch).toHaveBeenCalledWith(
      "/feedback/",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toMatchObject({ page: "/", sentiment: "up", comment: "Great tool!" });

    expect(await screen.findByText("Thanks for the feedback!")).toBeInTheDocument();
  });

  it("disables submit until a sentiment is chosen", async () => {
    renderWidget();
    await userEvent.click(screen.getByRole("button", { name: "Give feedback" }));
    expect(screen.getByRole("button", { name: "Send feedback" })).toBeDisabled();
  });
});
