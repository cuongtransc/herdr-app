import "../styles.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { page } from "vitest/browser";
import { beforeEach, expect, it } from "vitest";
import type { BackgroundTask } from "../lib/types";
import { BackgroundTasks } from "./BackgroundTasks";
import { WorkingIndicator } from "./WorkingIndicator";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tasks: BackgroundTask[] = [
  { call_id: "a", kind: "bash", description: "pnpm dev --host", started: "2026-10-11T00:00:00Z" },
  { call_id: "b", kind: "agent", description: "Review the chat lens", started: "2026-10-11T00:00:00Z" },
];

async function render(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  const host = document.createElement("div");
  host.style.cssText = "width:900px;background:var(--surface-0)";
  document.body.appendChild(host);
  await act(async () =>
    createRoot(host).render(
      <div className="chat-main">
        <BackgroundTasks tasks={tasks} onJump={() => {}} />
        <WorkingIndicator status="working" start="2026-10-11T00:00:00Z" />
      </div>,
    ),
  );
  return host;
}

const left = (el: Element) => el.getBoundingClientRect().left;
const right = (el: Element) => el.getBoundingClientRect().right;

beforeEach(() => {
  document.body.innerHTML = "";
});

it.each(["light", "dark"] as const)("lines the strip up with the Working line (%s)", async (theme) => {
  const host = await render(theme);
  const descs = [...host.querySelectorAll(".chat-background-desc")];
  const times = [...host.querySelectorAll(".chat-background-time")];
  const stripSpin = host.querySelector(".chat-background .spin")!;
  const workSpin = host.querySelector(".chat-working .spin")!;
  console.log("x", JSON.stringify({ descs: descs.map(left), stripSpin: left(stripSpin), workSpin: left(workSpin), times: times.map(right) }));
  expect(descs).toHaveLength(2);
  expect(Math.abs(left(descs[0]) - left(descs[1]))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(left(stripSpin) - left(workSpin))).toBeLessThanOrEqual(1);
  expect(Math.abs(right(times[0]) - right(times[1]))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(right(times[0]) - (900 - 28))).toBeLessThanOrEqual(1);
  expect(getComputedStyle(host.querySelector(".chat-background-row")!).fontSize).toBe(getComputedStyle(host.querySelector(".chat-working")!).fontSize);
  await page.screenshot({ path: `../../.vitest/herdr-bg-strip-${theme}.png`, element: host });
});
