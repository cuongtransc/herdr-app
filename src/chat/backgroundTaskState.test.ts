import { expect, it } from "vitest";
import type { ChatItem } from "../lib/types";
import { taskBadge, taskEnds } from "./backgroundTaskState";

const state = (running: string[], ends: [string, { status: string; exit_code?: number }][]) => ({
  running: new Set(running),
  ends: new Map(ends.map(([id, e]) => [id, { call_id: id, ...e }])),
});

it("reads each task's end from the system items", () => {
  const items: ChatItem[] = [
    { kind: "system", text: "x completed (exit code 0)", task: { call_id: "t1", status: "completed", exit_code: 0 } },
    { kind: "system", text: "plain" },
  ];
  expect([...taskEnds(items).keys()]).toEqual(["t1"]);
});

it.each([
  [state(["t1"], []), { label: "background · running", tone: "running" }],
  [state([], [["t1", { status: "completed", exit_code: 0 }]]), { label: "exit 0", tone: "good" }],
  [state([], [["t1", { status: "completed" }]]), { label: "done", tone: "good" }],
  [state([], [["t1", { status: "failed", exit_code: 1 }]]), { label: "exit 1", tone: "bad" }],
  [state([], [["t1", { status: "failed" }]]), { label: "failed", tone: "bad" }],
  [state([], [["t1", { status: "killed" }]]), { label: "killed", tone: "bad" }],
  [state(["t1"], [["t1", { status: "stopped" }]]), { label: "stopped", tone: "bad" }],
  [state([], []), null],
])("badges %#", (s, want) => {
  expect(taskBadge("t1", s)).toEqual(want);
});
