import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn(), quotaCta: vi.fn() }));
import { quotaCta, quotaFetch } from "../lib/ipc";
import type { CtaQuota, QuotaOutcome } from "../lib/types";
import { initialQuota, useQuota } from "./store";

const fetchMock = vi.mocked(quotaFetch);
const ctaMock = vi.mocked(quotaCta);
const okWindows = [{ label: "5h", usedPercent: 19, resetsAt: null, durationSecs: 18_000 }];
const okOutcome: QuotaOutcome = { kind: "ok", windows: okWindows, fetchedAt: 1 };

describe("useQuota", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    ctaMock.mockReset();
    ctaMock.mockResolvedValue({ kind: "missing" });
    useQuota.setState(initialQuota());
  });

  it("fetches every Provider once and stores the outcomes", async () => {
    fetchMock.mockImplementation(async (p) => (p === "claude" ? okOutcome : { kind: "notSignedIn" }));
    await useQuota.getState().refresh("shown");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const s = useQuota.getState().slots;
    expect(s.claude.entry).toEqual({ kind: "ok", report: { windows: okWindows, fetchedAt: 1 } });
    expect(s.codex.entry).toEqual({ kind: "notSignedIn" });
    expect(s.claude.inFlight).toBe(false);
    expect(s.claude.lastStarted).not.toBeNull();
  });

  it("does not start a second fetch while one is in flight", async () => {
    let release!: () => void;
    fetchMock.mockImplementation(() => new Promise<QuotaOutcome>((r) => (release = () => r({ kind: "notSignedIn" }))));
    void useQuota.getState().refresh("manual");
    void useQuota.getState().refresh("manual");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(useQuota.getState().slots.grok.inFlight).toBe(true);
    release();
    fetchMock.mockResolvedValue({ kind: "notSignedIn" });
  });

  it("respects the schedule: shown twice within a minute fetches once", async () => {
    fetchMock.mockResolvedValue({ kind: "notSignedIn" });
    await useQuota.getState().refresh("shown");
    await useQuota.getState().refresh("shown");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("remembers a rate limit and waits it out even for manual refresh", async () => {
    fetchMock.mockResolvedValue({ kind: "rateLimited", until: Date.now() + 60_000 });
    await useQuota.getState().refresh("manual");
    expect(useQuota.getState().slots.claude.rateLimitedUntil).not.toBeNull();
    await useQuota.getState().refresh("manual");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("a rejected invoke becomes a problem and clears in-flight", async () => {
    fetchMock.mockRejectedValue(new Error("command quota_fetch not found"));
    await useQuota.getState().refresh("manual");
    const slot = useQuota.getState().slots.claude;
    expect(slot.inFlight).toBe(false);
    expect(slot.entry).toEqual({ kind: "problem", message: "command quota_fetch not found", last: null });
  });
});

describe("useQuota with cta", () => {
  const board: CtaQuota = { kind: "ok", readAt: 5, accounts: [
    { provider: "claude", account: "a", windows: okWindows, polledAt: 4, status: "ok", detail: "" } ] };

  beforeEach(() => {
    fetchMock.mockReset();
    ctaMock.mockReset();
    useQuota.setState(initialQuota());
  });

  it("uses cta when installed and never calls the Providers", async () => {
    ctaMock.mockResolvedValue(board);
    await useQuota.getState().refresh("shown");
    expect(ctaMock).toHaveBeenCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useQuota.getState().source).toBe("cta");
    expect(useQuota.getState().cta).toEqual({ result: board, inFlight: false, lastStarted: expect.any(Number) });
  });

  it("shows a cta failure instead of falling back", async () => {
    ctaMock.mockResolvedValue({ kind: "failed", reason: "cta exited 2: boom" });
    await useQuota.getState().refresh("shown");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useQuota.getState().source).toBe("cta");
    expect(useQuota.getState().cta.result).toEqual({ kind: "failed", reason: "cta exited 2: boom" });
  });

  it("turns a rejected invoke into a cta failure and clears the spinner", async () => {
    ctaMock.mockRejectedValue(new Error("command quota_cta not found"));
    await useQuota.getState().refresh("shown");
    expect(useQuota.getState().cta.result).toEqual({ kind: "failed", reason: "command quota_cta not found" });
    expect(useQuota.getState().cta.inFlight).toBe(false);
  });

  it("falls back to the Providers when cta is missing and asks cta again only on manual refresh", async () => {
    ctaMock.mockResolvedValue({ kind: "missing" });
    fetchMock.mockResolvedValue({ kind: "notSignedIn" });
    await useQuota.getState().refresh("shown");
    expect(useQuota.getState().source).toBe("builtin");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await useQuota.getState().refresh("tick");
    expect(ctaMock).toHaveBeenCalledTimes(1);
    ctaMock.mockResolvedValue(board);
    await useQuota.getState().refresh("manual");
    expect(ctaMock).toHaveBeenLastCalledWith(true);
    expect(useQuota.getState().source).toBe("cta");
  });

  it("polls through cta on manual refresh without starting a second cta while one runs", async () => {
    let release!: () => void;
    ctaMock.mockImplementation(() => new Promise<CtaQuota>((r) => (release = () => r(board))));
    const first = useQuota.getState().refresh("manual");
    await useQuota.getState().refresh("manual");
    expect(ctaMock).toHaveBeenCalledTimes(1);
    expect(ctaMock).toHaveBeenCalledWith(true);
    expect(useQuota.getState().cta.inFlight).toBe(true);
    release();
    await first;
    expect(useQuota.getState().cta.inFlight).toBe(false);
  });
});
