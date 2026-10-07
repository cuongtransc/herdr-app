import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissToast, showToast, Toasts } from "./Toast";

describe("Toast", () => {
  afterEach(() => vi.useRealTimers());
  it("shows a message and dismisses it after 5 s", () => {
    vi.useFakeTimers();
    render(<Toasts />);
    act(() => showToast("pane.read timed out"));
    expect(screen.getByText("pane.read timed out")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText("pane.read timed out")).toBeNull();
  });

  it("dismisses after a custom time, or by the id it returns", () => {
    vi.useFakeTimers();
    render(<Toasts />);
    act(() => void showToast("Copied 5 characters", { alert: false, ms: 1500 }));
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.queryByText("Copied 5 characters")).toBeNull();
    let id = 0;
    act(() => void (id = showToast("Copied 2 characters", { alert: false })));
    act(() => dismissToast(id));
    expect(screen.queryByText("Copied 2 characters")).toBeNull();
  });
});
