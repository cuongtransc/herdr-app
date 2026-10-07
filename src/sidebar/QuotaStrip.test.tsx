import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn() }));
import { quotaFetch } from "../lib/ipc";
import type { QuotaOutcome, QuotaProvider } from "../lib/types";
import { initialSlots, useQuota } from "../quota/store";
import { QuotaStrip } from "./QuotaStrip";

const fetchMock = vi.mocked(quotaFetch);
const H = 3_600_000;

describe("QuotaStrip", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    useQuota.setState({ slots: initialSlots() });
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
});
