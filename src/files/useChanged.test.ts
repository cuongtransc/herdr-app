import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(), Channel: class {} }));
import { invoke } from "@tauri-apps/api/core";
import { useChanged } from "./useChanged";

const result = (n: number) => ({ repo: true, total: n, changes: [] });

describe("useChanged", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());
  afterEach(() => vi.useRealTimers());

  it("reads the changes on mount and again on each reload", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(result(1)).mockResolvedValueOnce(result(2));
    const { result: r, rerender } = renderHook(({ k }) => useChanged("m", "/r", k), { initialProps: { k: 0 } });
    await waitFor(() => expect(r.current.changed).toEqual(result(1)));
    expect(invoke).toHaveBeenCalledWith("files_changed", { machineId: "m", root: "/r" });
    rerender({ k: 1 });
    await waitFor(() => expect(r.current.changed).toEqual(result(2)));
  });

  it("reads once after a burst of file changes settles", async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockResolvedValue(result(1));
    const { result: r } = renderHook(() => useChanged("m", "/r", 0));
    await act(async () => {});
    expect(invoke).toHaveBeenCalledTimes(1);
    act(() => {
      r.current.touched();
      r.current.touched();
      r.current.touched();
    });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("keeps the last list when a read fails", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(result(1)).mockRejectedValueOnce(new Error("offline"));
    const { result: r, rerender } = renderHook(({ k }) => useChanged("m", "/r", k), { initialProps: { k: 0 } });
    await waitFor(() => expect(r.current.changed).toEqual(result(1)));
    rerender({ k: 1 });
    await act(async () => {});
    expect(r.current.changed).toEqual(result(1));
  });
});
