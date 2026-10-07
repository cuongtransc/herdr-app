import "../styles.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type { CtaAccount, CtaQuota } from "../lib/types";

const M = 60_000, H = 60 * M, D = 24 * H;
const now = Date.now();
const w = (label: string, usedPercent: number, resetIn: number, durationSecs: number | null) => ({ label, usedPercent, resetsAt: now + resetIn, durationSecs });
const ok = (provider: string, account: string, windows: CtaAccount["windows"]): CtaAccount => ({ provider, account, polledAt: now - 2 * M, status: "ok", detail: "", windows });
// The ledger from the screenshot that asked for this: three OpenCode accounts, one of them failing, and a Claude account cta stopped polling.
const board: CtaQuota = { kind: "ok", readAt: now, accounts: [
  { ...ok("claude", "0bb1535b-bb5a", [w("5h", 94, 17 * M, 18_000), w("week", 30, 6 * D, 604_800), w("week · Fable", 0, 6 * D, 604_800)]), polledAt: now - 70 * M },
  ok("claude", "955f5fbe-a050", [w("5h", 5, 4 * H, 18_000), w("week", 4, 6 * D + 21 * H, 604_800), w("week · Fable", 0, 6 * D, 604_800)]),
  ok("codex", "edbec1d9", [w("week", 24, 6 * D + 8 * H, 604_800)]),
  { provider: "opencode-go", account: "sha256:008e82c8aa", polledAt: now - 9 * H, status: "http", detail: "HTTP 403 from opencode.ai/zen/go/v1/usage", windows: [] },
  ok("opencode-go", "sha256:403fae94aa", [w("5h", 19, H + 57 * M, 18_000), w("week", 7, 5 * D, 604_800), w("month", 3, 26 * D, null)]),
  ok("opencode-go", "sha256:68453c11aa", [w("5h", 0, 5 * H, 18_000), w("week", 0, 5 * D, 604_800), w("month", 100, 13 * D + 7 * H, null)]),
  ok("grok", "63f955fd", [w("week", 0, 5 * D + 15 * H, 604_800)]),
] };

vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn(async () => ({ kind: "notSignedIn" })), quotaCta: vi.fn(async () => board) }));
const { QuotaStrip } = await import("./QuotaStrip");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fits = (el: Element) => el.scrollWidth <= el.clientWidth;

beforeEach(async () => {
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  const app = document.createElement("div");
  app.style.cssText = "display:flex;height:100vh";
  app.innerHTML = '<nav class="sidebar"><div style="flex:1"></div><div id="foot"></div><div style="flex:none;height:44px"></div></nav><main style="flex:1"></main>';
  document.body.appendChild(app);
  await act(async () => createRoot(document.getElementById("foot")!).render(<QuotaStrip />));
  await act(async () => {});
});

it("fits every name and value in the Sidebar's width, with bars in one column", () => {
  const rows = [...document.querySelectorAll(".quota-row")];
  expect(rows.map((r) => r.querySelector(".quota-name")!.textContent)).toEqual(["Claude 1", "Claude 2", "Codex", "OpenCode 1", "OpenCode 2", "OpenCode 3", "Grok"]);
  for (const r of rows) {
    expect(fits(r.querySelector(".quota-name")!), r.textContent!).toBe(true);
    expect(fits(r.querySelector(".quota-val")!), r.textContent!).toBe(true);
  }
  const lefts = new Set([...document.querySelectorAll(".quota-row .dash-quota-bar")].map((b) => Math.round(b.getBoundingClientRect().left)));
  expect(lefts.size).toBe(1);
});

it("opens the panel beside the strip, inside the window, every cell readable", async () => {
  await act(async () => (document.querySelector(".quota-row") as HTMLElement).click());
  const panel = document.querySelector('[role="dialog"]')!.getBoundingClientRect();
  const strip = document.querySelector(".quota-strip")!.getBoundingClientRect();
  expect(panel.left).toBeGreaterThanOrEqual(strip.right);
  expect(panel.right).toBeLessThanOrEqual(window.innerWidth);
  expect(panel.top).toBeGreaterThanOrEqual(0);
  expect(Math.round(panel.bottom)).toBe(Math.round(strip.bottom));
  for (const n of document.querySelectorAll(".qp-num, .qp-name")) expect(fits(n), n.textContent!).toBe(true);
});
