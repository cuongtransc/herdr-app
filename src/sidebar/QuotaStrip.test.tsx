import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn(), quotaCta: vi.fn() }));
import { quotaCta, quotaFetch } from "../lib/ipc";
import type { CtaQuota, QuotaOutcome, QuotaProvider } from "../lib/types";
import { initialQuota, useQuota } from "../quota/store";
import { QuotaStrip } from "./QuotaStrip";

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
    const claude = await screen.findByRole("button", { name: /^Claude/ });
    expect(claude.textContent).toContain("week 61% · 3d4h");
    expect(claude.className).toContain("tone-warn");
    expect(screen.getByRole("button", { name: /^Codex/ }).textContent).toContain("5h 12% · 4h30m");
    expect(screen.queryByRole("button", { name: /^Grok/ })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("opens the full Quota detail on click, folding the Providers not signed in into one line", async () => {
    const o = outcomes();
    fetchMock.mockImplementation(async (p) => o[p]);
    render(<QuotaStrip />);
    fireEvent.click(await screen.findByRole("button", { name: /^Claude/ }));
    const detail = screen.getByRole("dialog", { name: "Quota" });
    expect(within(detail).getByText("42%")).toBeTruthy();
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
    expect((await screen.findByRole("button", { name: /^Claude 0bb1535b/ })).textContent).toContain("5h 52%");
    expect(screen.getByRole("button", { name: /^Claude 955f5fbe/ }).textContent).toContain("week 17%");
    expect(screen.getByRole("button", { name: /^kimi/ }).textContent).toContain("month 5%");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
