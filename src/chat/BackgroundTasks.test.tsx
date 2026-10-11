import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BackgroundTasks } from "./BackgroundTasks";

const ci = { call_id: "t1", kind: "bash" as const, description: "Run full dotfiles CI in background", started: "2026-10-10T17:08:00.000Z" };
const review = { call_id: "a1", kind: "agent" as const, description: "Whole-branch review", started: "2026-10-10T17:10:30.000Z" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T17:11:12.000Z"));
});
afterEach(() => vi.useRealTimers());

it("lists each running task with its kind and time running", () => {
  render(<BackgroundTasks tasks={[ci, review]} onJump={() => {}} />);
  const rows = screen.getAllByRole("button");
  expect(rows.map((r) => r.textContent)).toEqual([
    "ShellRun full dotfiles CI in background3m 12s",
    "AgentWhole-branch review42s",
  ]);
  expect(screen.getByRole("list", { name: "Background tasks" })).toBeTruthy();
});

it("jumps to the task's tool card", () => {
  const onJump = vi.fn();
  render(<BackgroundTasks tasks={[ci]} onJump={onJump} />);
  fireEvent.click(screen.getByRole("button"));
  expect(onJump).toHaveBeenCalledWith("t1");
});

it("renders nothing without tasks", () => {
  const { container } = render(<BackgroundTasks tasks={[]} onJump={() => {}} />);
  expect(container.innerHTML).toBe("");
});
