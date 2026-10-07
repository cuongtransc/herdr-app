import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn(), quotaCta: vi.fn() }));
import { quotaCta, quotaFetch } from "../lib/ipc";
import type { CtaQuota, QuotaOutcome, QuotaProvider } from "../lib/types";
import { initialQuota, useQuota } from "../quota/store";
import { QuotaStrip } from "./QuotaStrip";
import { useApp } from "../store/app";

const fetchMock = vi.mocked(quotaFetch);
const ctaMock = vi.mocked(quotaCta);
const H = 3_600_000;

describe("QuotaStrip", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    ctaMock.mockReset();
    ctaMock.mockResolvedValue({ kind: "missing" });
    useQuota.setState(initialQuota());
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  const outcomes = (): Record<QuotaProvider, QuotaOutcome> => {
    const now = Date.now();
    return {
      claude: { kind: "ok", fetchedAt: now, windows: [
        { label: "5h", usedPercent: 42, resetsAt: now + 2 * H + 30 * 60_000, durationSecs: 18_000 },
        { label: "week", usedPercent: 61, resetsAt: now + 76 * H + 30 * 60_000, durationSecs: 604_800 },
      ] },
      codex: { kind: "ok", fetchedAt: now, windows: [{ label: "5h", usedPercent: 12, resetsAt: now + 4 * H + 30 * 60_000, durationSecs: 18_000 }] },
      opencodeGo: { kind: "notSignedIn" },
      grok: { kind: "notSignedIn" },
    };
  };

  it("shows one line per signed-in Provider: its most pressing window and the time to reset", async () => {
    const o = outcomes();
    fetchMock.mockImplementation(async (p) => o[p]);
    render(<QuotaStrip />);
    const claude = await screen.findByRole("button", { name: /^Claude, week 61%/ });
    expect(claude.textContent).toBe("Claude61% · 3d");
    expect(claude.className).toContain("tone-warn");
    expect(screen.getByRole("button", { name: /^Codex, 5h 12%/ }).textContent).toBe("Codex12% · 5h");
    expect(screen.queryByRole("button", { name: /^Grok/ })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("opens the full Quota detail on click, folding the Providers not signed in into one line", async () => {
    const o = outcomes();
    fetchMock.mockImplementation(async (p) => o[p]);
    render(<QuotaStrip />);
    fireEvent.click(await screen.findByRole("button", { name: /^Claude/ }));
    const detail = screen.getByRole("dialog", { name: "Quota" });
    expect(within(detail).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Account", "5 hours", "Week"]);
    expect(within(detail).getByRole("row", { name: /^Claude/ }).textContent).toContain("42%");
    expect(within(detail).getByText("Not signed in: OpenCode Go, Grok")).toBeTruthy();
    expect(within(detail).queryByText("not signed in")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Quota" })).toBeNull();
  });

  it("shows nothing until a Provider has numbers", async () => {
    fetchMock.mockImplementation(async () => ({ kind: "notSignedIn" }));
    const { container } = render(<QuotaStrip />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(container.textContent).toBe("");
  });

  it("shows one line per cta account, naming the account when a Provider has several", async () => {
    const now = Date.now();
    const board: CtaQuota = { kind: "ok", readAt: now, accounts: [
      { provider: "claude", account: "0bb1535b-bb5a", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "5h", usedPercent: 52, resetsAt: now + H, durationSecs: 18_000 }] },
      { provider: "claude", account: "955f5fbe-a050", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "week", usedPercent: 17, resetsAt: now + 100 * H, durationSecs: 604_800 }] },
      { provider: "kimi", account: "k1", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "month", usedPercent: 5, resetsAt: null, durationSecs: null }] },
    ] };
    ctaMock.mockResolvedValue(board);
    render(<QuotaStrip />);
    const first = await screen.findByRole("button", { name: /^Claude 1, 5h 52%/ });
    expect(first.title).toBe("Claude 1 · 0bb1535b · 5h window");
    expect(screen.getByRole("button", { name: /^Claude 2, week 17%/ }).textContent).toContain("17%");
    expect(screen.getByRole("button", { name: /^kimi, month 5%/ }).textContent).toBe("kimi5%");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("greys out a cta account it cannot trust, naming why, and drops one gone for a day", async () => {
    const now = Date.now();
    const M = 60_000;
    const board: CtaQuota = { kind: "ok", readAt: now, accounts: [
      // cta still says ok but stopped polling it: the sign-in is gone.
      { provider: "claude", account: "0bb1535b-bb5a", polledAt: now - 70 * M, status: "ok", detail: "",
        windows: [{ label: "5h", usedPercent: 94, resetsAt: now + 17 * M, durationSecs: 18_000 }] },
      { provider: "claude", account: "955f5fbe-a050", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "5h", usedPercent: 5, resetsAt: now + 4 * H, durationSecs: 18_000 },
          { label: "week · Fable", usedPercent: 0, resetsAt: now + 100 * H, durationSecs: 604_800 }] },
      { provider: "opencode-go", account: "sha256:008e82c8aa", polledAt: now - 9 * H, status: "http",
        detail: "HTTP 403 from opencode.ai/zen/go/v1/usage", windows: [] },
      { provider: "grok", account: "g1", polledAt: now - 25 * H, status: "ok", detail: "",
        windows: [{ label: "week", usedPercent: 3, resetsAt: now + 50 * H, durationSecs: 604_800 }] },
    ] };
    ctaMock.mockResolvedValue(board);
    render(<QuotaStrip />);
    const gone = await screen.findByRole("button", { name: /^Claude 1, not polled · 1h/ });
    expect(gone.textContent).toBe("Claude 1not polled · 1h");
    expect(gone.className).toContain("problem");
    expect(gone.className).not.toContain("tone-warn");
    expect(screen.getByRole("button", { name: /^OpenCode, HTTP 403 · 9h/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Grok/ })).toBeNull();

    fireEvent.click(gone);
    const detail = screen.getByRole("dialog", { name: "Quota" });
    expect(within(detail).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Account", "5 hours", "Other"]);
    const claude1 = within(detail).getByRole("row", { name: /^Claude 1/ });
    expect(claude1.textContent).toContain("Not polled for 1h.");
    expect(claude1.textContent).toContain("Sign in again with claude");
    expect(claude1.textContent).not.toContain("94%");
    expect(within(detail).getByRole("row", { name: /^Claude 2/ }).textContent).toContain("Fable 0%");
    expect(within(detail).getByRole("row", { name: /^OpenCode/ }).textContent).toContain("HTTP 403 from opencode.ai/zen/go/v1/usage.");
    // The strip leaves out an account gone for a day; the detail keeps it, with what to do.
    expect(within(detail).getByRole("row", { name: /^Grok/ }).textContent).toContain("Not polled for 1d.");
    fireEvent.click(within(detail).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Quota" })).toBeNull();
  });
});

describe("QuotaStrip fold", () => {
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ kind: "notSignedIn" });
    ctaMock.mockReset();
    useQuota.setState(initialQuota());
    useApp.setState({ expanded: {} });
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  type W = { label: string; usedPercent: number; resetsAt: number | null; durationSecs: number | null };
  const account = (provider: string, account: string, windows: W[], status = "ok") => ({
    provider, account, polledAt: Date.now(), status, detail: status === "ok" ? "" : "HTTP 403", windows,
  });
  const board = (...accounts: ReturnType<typeof account>[]): CtaQuota => ({ kind: "ok", readAt: Date.now(), accounts });
  const week = (usedPercent: number, inH: number): W => ({ label: "week", usedPercent, resetsAt: Date.now() + inH * H, durationSecs: 604_800 });
  const fiveH = (usedPercent: number, inH: number): W => ({ label: "5h", usedPercent, resetsAt: Date.now() + inH * H, durationSecs: 18_000 });
  const month = (usedPercent: number, inH: number): W => ({ label: "month", usedPercent, resetsAt: Date.now() + inH * H, durationSecs: null });
  const fold = async () => {
    const head = await screen.findByRole("button", { name: /^Quota/ });
    fireEvent.click(head);
    return screen.getByRole("button", { name: /^Quota/ });
  };

  it("folds to its header and opens again, remembering the choice", async () => {
    ctaMock.mockResolvedValue(board(account("codex", "c1", [week(24, 100)])));
    const { unmount } = render(<QuotaStrip />);
    await screen.findByRole("button", { name: /^Codex/ });
    const head = await fold();
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /^Codex/ })).toBeNull();
    unmount();
    render(<QuotaStrip />);
    const again = await screen.findByRole("button", { name: /^Quota/ });
    expect(again.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(again);
    expect(await screen.findByRole("button", { name: /^Codex/ })).toBeTruthy();
    // Open, the header says nothing more: the rows do.
    expect(screen.getByRole("button", { name: /^Quota/ }).textContent).toBe("Quota");
  });

  it("folded, names the account that warns, counting full ones beside it", async () => {
    ctaMock.mockResolvedValue(board(
      account("claude", "a1", [fiveH(92, 2)]),
      account("opencode-go", "o1", [month(100, 13 * 24)]),
      account("codex", "c1", [week(24, 100)]),
    ));
    render(<QuotaStrip />);
    await screen.findByRole("button", { name: /^Codex/ });
    const head = await fold();
    expect(head.textContent).toBe("QuotaClaude · 92% · 2h· 1 full");
    expect(head.querySelector(".quota-fold")!.className).toContain("tone-warn");
  });

  it("folded, a full account alone never takes the line: the fullest one with room does, plainly", async () => {
    ctaMock.mockResolvedValue(board(
      account("opencode-go", "o1", [month(100, 13 * 24)]),
      account("codex", "c1", [week(24, 100)]),
      account("grok", "g1", [week(3, 100)]),
    ));
    render(<QuotaStrip />);
    await screen.findByRole("button", { name: /^Codex/ });
    const head = await fold();
    expect(head.textContent).toBe("QuotaCodex · 24%· 1 full");
    expect(head.querySelector(".quota-fold")!.className).not.toContain("tone-warn");
  });

  it("folded, warns with the soonest reset once every account is full", async () => {
    ctaMock.mockResolvedValue(board(
      account("opencode-go", "o1", [month(100, 13 * 24)]),
      account("claude", "a1", [fiveH(100, 2)]),
    ));
    render(<QuotaStrip />);
    await screen.findByRole("button", { name: /^Claude/ });
    const head = await fold();
    expect(head.textContent).toBe("Quota2 full · 2h");
    expect(head.querySelector(".quota-fold")!.className).toContain("tone-warn");
  });

  it("folded, leaves out accounts whose numbers cannot be trusted", async () => {
    ctaMock.mockResolvedValue(board(account("opencode-go", "o1", [], "http")));
    render(<QuotaStrip />);
    await screen.findByRole("button", { name: /^OpenCode/ });
    const head = await fold();
    expect(head.textContent).toBe("Quota");
  });
});
