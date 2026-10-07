import { describe, expect, it } from "vitest";
import type { CtaAccount } from "../lib/types";
import { ctaCards, shortAccount, staleNote, STALE_POLL_MS } from "./cta";

const w = { label: "week", usedPercent: 12, resetsAt: null, durationSecs: 604_800 };
const acct = (provider: string, account: string, more: Partial<CtaAccount> = {}): CtaAccount => ({
  provider, account, windows: [w], polledAt: 1_000, status: "ok", detail: "", ...more,
});

describe("ctaCards", () => {
  it("orders known Providers first, unknown ids alphabetically, accounts in cta order", () => {
    const cards = ctaCards([
      acct("zeta", "z1"), acct("grok", "g1"), acct("kimi", "k1"),
      acct("claude", "c-second"), acct("opencode-go", "sha256:abcdef0123456"), acct("claude", "c-first"),
    ]);
    expect(cards.map((c) => c.key)).toEqual([
      "claude/c-second", "claude/c-first", "opencode-go/sha256:abcdef0123456", "grok/g1", "kimi/k1", "zeta/z1",
    ]);
    expect(cards.map((c) => c.name)).toEqual(["Claude", "Claude", "OpenCode Go", "Grok", "kimi", "zeta"]);
    expect(cards.map((c) => c.agent)).toEqual(["claude", "claude", "opencode", "grok", "kimi", "zeta"]);
  });

  it("numbers accounts only when a Provider has several, and keeps each account's short id", () => {
    const cards = ctaCards([acct("claude", "0bb1535b-bb5a"), acct("claude", "955f5fbe-a050"), acct("codex", "edbec1d9")]);
    expect(cards.map((c) => c.account)).toEqual(["1", "2", null]);
    expect(cards.map((c) => c.accountId)).toEqual(["0bb1535b", "955f5fbe", "edbec1d9"]);
  });

  it("names the short Provider name and its sign-in command", () => {
    const cards = ctaCards([acct("opencode-go", "a"), acct("claude", "b"), acct("kimi", "k")]);
    expect(cards.map((c) => [c.short, c.cli])).toEqual([["Claude", "claude"], ["OpenCode", "opencode"], ["kimi", null]]);
  });

  it("maps poll status to entries, keeping windows of a failed poll as the last report", () => {
    const [ok, failedWithNumbers, failedEmpty, noDetail] = ctaCards([
      acct("claude", "a"),
      acct("claude", "b", { status: "http", detail: "HTTP 401 from x" }),
      acct("claude", "c", { status: "http", detail: "HTTP 403 from y", windows: [], polledAt: null }),
      acct("claude", "d", { status: "auth", detail: "" }),
    ]);
    expect(ok.entry).toEqual({ kind: "ok", report: { windows: [w], fetchedAt: 1_000 } });
    expect(failedWithNumbers.entry).toEqual({ kind: "problem", message: "HTTP 401 from x", last: { windows: [w], fetchedAt: 1_000 } });
    expect(failedEmpty.entry).toEqual({ kind: "problem", message: "HTTP 403 from y", last: null });
    expect(noDetail.entry).toEqual({ kind: "problem", message: "auth", last: { windows: [w], fetchedAt: 1_000 } });
  });
});

describe("shortAccount", () => {
  it("drops a sha256 prefix and keeps 8 characters", () => {
    expect(shortAccount("sha256:008e8aa1234")).toBe("008e8aa1");
    expect(shortAccount("g1")).toBe("g1");
  });
});

describe("staleNote", () => {
  it("speaks only after 30 minutes", () => {
    const now = 10 * STALE_POLL_MS;
    expect(staleNote(now - STALE_POLL_MS, now)).toBeNull();
    expect(staleNote(now - 2 * 3_600_000, now)).toBe("updated 2h ago");
    expect(staleNote(null, now)).toBeNull();
  });
});
