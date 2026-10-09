import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
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
  it("counts the turn's time every second, the one live clock in the chat", () => {
    vi.useFakeTimers({ now: Date.parse("2026-10-03T00:01:23Z") });
    try {
      render(<WorkingIndicator status="working" start="2026-10-03T00:00:00Z" />);
      expect(screen.getByRole("status").textContent).toBe("Working 1m 23s");
      act(() => vi.advanceTimersByTime(1_000));
      expect(screen.getByRole("status").textContent).toBe("Working 1m 24s");
    } finally {
      vi.useRealTimers();
    }
  });
  it("reads Working… while the turn's start is unknown", () => {
    render(<WorkingIndicator status="working" start={null} />);
    expect(screen.getByRole("status").textContent).toBe("Working…");
  });
  it.each(["idle", "blocked", "done", "unknown"] as const)("hides when %s", (status) => {
    render(<WorkingIndicator status={status} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
