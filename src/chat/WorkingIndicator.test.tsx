import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkingIndicator } from "./WorkingIndicator";
describe("WorkingIndicator", () => {
  it("shows while the agent is working", () => {
    render(<WorkingIndicator status="working" />);
    expect(screen.getByRole("status").textContent).toContain("Working");
  });
  it("spins the same ring as the agent list, not bouncing dots", () => {
    render(<WorkingIndicator status="working" />);
    const status = screen.getByRole("status");
    expect(status.querySelector(".spin")).toBeTruthy();
    expect(status.querySelector(".chat-working-dots")).toBeNull();
  });
  it.each(["idle", "blocked", "done", "unknown"] as const)("hides when %s", (status) => {
    render(<WorkingIndicator status={status} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
