import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn(), quotaCta: vi.fn() }));
import { quotaCta, quotaFetch } from "../lib/ipc";
import type { CtaQuota, QuotaOutcome, QuotaProvider } from "../lib/types";
import { initialQuota, useQuota } from "../quota/store";
import { QuotaColumn } from "./QuotaColumn";

const fetchMock = vi.mocked(quotaFetch);
const ctaMock = vi.mocked(quotaCta);
const card = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("QuotaColumn", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    ctaMock.mockReset();
    ctaMock.mockResolvedValue({ kind: "missing" });
    useQuota.setState(initialQuota());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every Provider with its state after fetching on mount", async () => {
    // Frozen clock: the countdown below must not depend on how long the render takes.
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.now();
    const outcomes: Record<QuotaProvider, QuotaOutcome> = {
      claude: { kind: "ok", fetchedAt: now, windows: [
        { label: "5h", usedPercent: 19, resetsAt: now + (3_600 + 36 * 60) * 1000 + 500, durationSecs: 18_000 },
        { label: "week", usedPercent: 95, resetsAt: null, durationSecs: null },
      ] },
      codex: { kind: "notSignedIn" },
      opencodeGo: { kind: "noSubscription" },
      grok: { kind: "signInExpired" },
    };
    fetchMock.mockImplementation(async (p) => outcomes[p]);
    render(<QuotaColumn />);
    const col = screen.getByRole("region", { name: "Quota" });
    await waitFor(() => expect(within(col).getByText("19%")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const names = within(col).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(names[0]).toContain("Claude");
    expect(names[1]).toContain("Codex");
    expect(names[2]).toContain("OpenCode Go");
    expect(names[3]).toContain("Grok");
    expect(within(card("Claude")).getByText(/1h36m/)).toBeTruthy();
    expect(within(card("Claude")).getByText("95%").className).toContain("strong");
    expect(within(card("Codex")).getByText("not signed in")).toBeTruthy();
    expect(within(card("OpenCode Go")).getByText("no Go subscription")).toBeTruthy();
    expect(within(card("Grok")).getByText("sign-in expired — run grok")).toBeTruthy();
  });

  it("keeps the last numbers dimmed when sign-in expires", async () => {
    const fetchedAt = Date.now() - 3 * 3_600_000;
    useQuota.setState((s) => ({ slots: { ...s.slots, grok: { ...s.slots.grok, entry: { kind: "ok", report: { fetchedAt, windows: [
      { label: "week", usedPercent: 100, resetsAt: null, durationSecs: null } ] } } } } }));
    fetchMock.mockImplementation(async (p) => (p === "grok" ? { kind: "signInExpired" } : { kind: "notSignedIn" }));
    render(<QuotaColumn />);
    await waitFor(() => expect(within(card("Grok")).getByText(/sign-in expired — run grok/)).toBeTruthy());
    expect(within(card("Grok")).getByText(/updated 3h ago/)).toBeTruthy();
    expect(within(card("Grok")).getByText("100%").closest(".dash-quota-stale")).toBeTruthy();
  });

  it("refreshes by hand", async () => {
    fetchMock.mockResolvedValue({ kind: "notSignedIn" });
    render(<QuotaColumn />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(useQuota.getState().slots.grok.inFlight).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Refresh quota" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
  });

  it("shows one card per cta account, labels multiple accounts and unknown Providers", async () => {
    const now = Date.now();
    const board: CtaQuota = { kind: "ok", readAt: now, accounts: [
      { provider: "claude", account: "0bb1535b-bb5a", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "5h", usedPercent: 44, resetsAt: null, durationSecs: 18_000 }] },
      { provider: "claude", account: "955f5fbe-a050", polledAt: now - 3 * 3_600_000, status: "ok", detail: "",
        windows: [{ label: "week", usedPercent: 93, resetsAt: null, durationSecs: 604_800 }] },
      { provider: "opencode-go", account: "sha256:008e8aa1", polledAt: now, status: "http",
        detail: "HTTP 403 from opencode.ai/zen/go/v1/usage", windows: [] },
      { provider: "kimi", account: "k1", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "month", usedPercent: 5, resetsAt: null, durationSecs: null }] },
    ] };
    ctaMock.mockResolvedValue(board);
    render(<QuotaColumn />);
    const col = screen.getByRole("region", { name: "Quota" });
    await waitFor(() => expect(within(col).getByText("44%")).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    const items = within(col).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0].textContent).toContain("0bb1535b");
    expect(items[1].textContent).toContain("955f5fbe");
    expect(within(items[1]).getByText("updated 3h ago")).toBeTruthy();
    expect(within(items[0]).queryByText(/updated/)).toBeNull();
    expect(within(items[2]).getByText("HTTP 403 from opencode.ai/zen/go/v1/usage")).toBeTruthy();
    expect(items[2].textContent).not.toContain("008e8aa1");
    expect(within(items[3]).getByText("kimi")).toBeTruthy();
    expect(within(items[3]).getByText("5%")).toBeTruthy();
  });

  it("shows a cta failure as one card", async () => {
    ctaMock.mockResolvedValue({ kind: "failed", reason: "cta timed out" });
    render(<QuotaColumn />);
    await waitFor(() => expect(screen.getByText("cta timed out")).toBeTruthy());
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks cta to poll when refreshed by hand", async () => {
    ctaMock.mockResolvedValue({ kind: "ok", readAt: 1, accounts: [] });
    render(<QuotaColumn />);
    await waitFor(() => expect(screen.getByText("no accounts — run cta ledger quota poll")).toBeTruthy());
    await waitFor(() => expect(useQuota.getState().cta.inFlight).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Refresh quota" }));
    await waitFor(() => expect(ctaMock).toHaveBeenLastCalledWith(true));
  });
});
