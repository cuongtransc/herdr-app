import { describe, expect, it } from "vitest";
import type { QuotaWindow } from "../lib/types";
import { headline } from "./summary";

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
