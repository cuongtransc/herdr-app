import { describe, expect, it } from "vitest";
import type { QuotaWindow } from "../lib/types";
import type { QuotaItem } from "./view";
import { headline, HIDE_AFTER_MS, trouble } from "./summary";

const H = 3_600_000;
const now = 1_000 * H;
const w = (label: string, usedPercent: number, hoursLeft: number | null, durationSecs: number | null): QuotaWindow => ({
  label, usedPercent, resetsAt: hoursLeft === null ? null : now + hoursLeft * H, durationSecs,
});

describe("headline", () => {
  it("picks a window that warns over a fuller one that does not", () => {
    // week: 61% used with 45% of the week gone burns too fast; 5h: 70% used but 80% of its time gone.
    const week = w("week", 61, 92.4, 604_800);
    const five = w("5h", 70, 1, 18_000);
    expect(headline({ kind: "ok", report: { fetchedAt: now, windows: [five, week] } }, now)).toEqual({ window: week, tone: "warn", stale: false });
  });
  it("picks the fullest window when none warns", () => {
    const five = w("5h", 12, 4, 18_000);
    const week = w("week", 23, 120, 604_800);
    expect(headline({ kind: "ok", report: { fetchedAt: now, windows: [five, week] } }, now)?.window).toBe(week);
  });
  it("keeps the last numbers, marked stale, through a problem; nothing without numbers", () => {
    const week = w("week", 30, null, null);
    expect(headline({ kind: "problem", message: "rate limited", last: { fetchedAt: now, windows: [week] } }, now)).toEqual({ window: week, tone: "muted", stale: true });
    expect(headline({ kind: "problem", message: "rate limited", last: null }, now)).toBeNull();
    expect(headline({ kind: "notSignedIn" }, now)).toBeNull();
    expect(headline({ kind: "loading" }, now)).toBeNull();
    expect(headline({ kind: "ok", report: { fetchedAt: now, windows: [] } }, now)).toBeNull();
  });
});

describe("headline, past windows", () => {
  it("skips a window whose reset has passed: its numbers are from the last cycle", () => {
    const gone = w("5h", 94, -0.1, 18_000);
    const week = w("week", 30, 100, 604_800);
    expect(headline({ kind: "ok", report: { fetchedAt: now, windows: [gone, week] } }, now)?.window).toBe(week);
    expect(headline({ kind: "ok", report: { fetchedAt: now, windows: [gone] } }, now)).toBeNull();
  });
});

describe("trouble", () => {
  const item = (more: Partial<QuotaItem>): QuotaItem => ({
    key: "k", name: "Claude", short: "Claude", account: null, accountId: null, cli: "claude", agent: "claude",
    entry: { kind: "ok", report: { fetchedAt: now, windows: [w("5h", 10, 2, 18_000)] } }, polledAt: null, fromCta: false, ...more,
  });
  const M = 60_000;

  it("is nothing for fresh numbers", () => {
    expect(trouble(item({}), now)).toBeNull();
    expect(trouble(item({ fromCta: true, polledAt: now - 29 * M }), now)).toBeNull();
  });
  it("calls a cta account polled over 30 minutes ago not polled, even with status ok", () => {
    expect(trouble(item({ fromCta: true, polledAt: now - 70 * M }), now)).toEqual({ reason: "not polled", message: "Not polled for 1h", at: now - 70 * M, notPolled: true });
  });
  it("keeps the status code of a failed cta poll short, the whole detail long", () => {
    const entry = { kind: "problem" as const, message: "HTTP 403 from opencode.ai/zen/go/v1/usage", last: null };
    expect(trouble(item({ fromCta: true, polledAt: now - 9 * 60 * M, entry }), now)).toEqual({
      reason: "HTTP 403", message: "HTTP 403 from opencode.ai/zen/go/v1/usage", at: now - 9 * 60 * M, notPolled: false,
    });
  });
  it("shortens a built-in problem to the words before the dash, aged by its last numbers", () => {
    const entry = { kind: "problem" as const, message: "sign-in expired — run claude", last: { fetchedAt: now - 2 * 60 * M, windows: [] } };
    expect(trouble(item({ entry }), now)).toEqual({ reason: "sign-in expired", message: "sign-in expired — run claude", at: now - 2 * 60 * M, notPolled: false });
    expect(trouble(item({ entry: { kind: "problem", message: "rate limited", last: null } }), now)).toEqual({ reason: "rate limited", message: "rate limited", at: null, notPolled: false });
  });
  it("hides after a day", () => {
    expect(HIDE_AFTER_MS).toBe(24 * 60 * M);
  });
});
