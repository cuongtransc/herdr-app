# Chat Background Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Chat lens shows Claude's running background Bash commands and Agent calls in a strip above the Composer, and each one's tool card carries a running/ended badge.

**Architecture:** The Claude transcript parser (`claude.rs`) tracks running Background tasks from start `tool_result` to `<task-notification>`, sends them in `ChatMeta.background` (the existing Meta event), and tags the notification's System item with `task`. The frontend keeps `background` in the chat store, renders a `BackgroundTasks` strip, and gives tool cards a badge through a React context.

**Tech Stack:** Rust (serde_json), React 19 + TypeScript, vitest + testing-library, `@tanstack/react-virtual`.

**Spec:** `docs/superpowers/specs/2026-10-11-chat-background-tasks-design.md`

## Global Constraints

- Wire names (Rust serde = TS): `ChatMeta.background: BackgroundTask[]`; `BackgroundTask { call_id: string; kind: "bash" | "agent"; description: string; started: string | null }`; System item field `task?: TaskEnd`; `TaskEnd { call_id: string; status: string; exit_code?: number }` (`exit_code` omitted when unknown, `task` omitted when `None`).
- Start prefixes, exact: Bash `Command running in background with ID:`; Agent `Async agent launched`. Tool names: `Bash`, `Agent`.
- Exit code: the integer in the summary's `(exit code N)`; nothing else.
- Description fallback: the first 80 **chars** of `input.command` (Bash), else empty string.
- UI labels (English): `Shell` / `Agent`; strip `aria-label="Background tasks"`; badges `background · running`, `exit N`, `failed`, `killed`, `stopped`. A `completed` task with no exit code (an Agent) shows `done`.
- Elapsed text: `formatWorkDuration(started, now)` from `src/chat/workBlocks.ts` (`3m 12s`).
- Colours: badge and strip text use only tokens already in `TEXT` of `src/tokens.test.ts` (`--fg-2`, `--fg-3`, `--green-text`, `--err-fg`) on a transparent background, so the existing 4.5:1 test covers both themes. This replaces the spec's separate browser contrast test.
- Rust: no `unwrap()` outside tests; `cargo clippy` clean. Code comments match the surrounding density.
- Commits: conventional (`feat(chat): …`), no AI attribution. The pre-commit hook runs `mise run ci` (several minutes on a cold build): run `git commit` in the background or with a long timeout.

## Review Focus

- A `tool_result` with `is_error: true` for a background Bash (permission denied): must not enter the set. Test in Task 1 (`foreground_and_failed_starts_stay_out`).
- A notification for a task started before the loaded page (Chat paged from the tail): its System item still carries `task`; the badge simply has no card to sit on. No crash. Covered by `notification_without_a_start_is_shown` (Task 1).
- Two tasks running, the older ends first: the strip keeps the newer one, order preserved. Test in Task 1 (`keeps_start_order`).
- Agent exits while a task runs: strip hidden. Test in Task 3.
- Jump to a task whose Work block is folded: the block opens. Test in Task 3.

---

### Task 1: Parser tracks Background tasks

**Files:**
- Modify: `src-tauri/src/transcript/mod.rs` (add types, `ChatMeta.background`, `ChatItem::System.task`, `ChatEvent::Meta.background`)
- Modify: `src-tauri/src/transcript/claude.rs` (tracking + tests)
- Modify: `src-tauri/src/transcript/tail.rs:207-213` (pass `background` into `ChatEvent::Meta`), `tail.rs:423` and `pi.rs:127,553` (`task: None` on System constructors), `mod.rs:907` test
- Test: `src-tauri/src/transcript/claude.rs` (`mod tests`)

**Interfaces:**
- Produces (in `mod.rs`, all `#[derive(Clone, Debug, PartialEq, Serialize)]`):
  - `pub enum BackgroundKind { Bash, Agent }` with `#[serde(rename_all = "snake_case")]`
  - `pub struct BackgroundTask { pub call_id: String, pub kind: BackgroundKind, pub description: String, pub started: Option<String> }`
  - `pub struct TaskEnd { pub call_id: String, pub status: String, #[serde(skip_serializing_if = "Option::is_none")] pub exit_code: Option<i32> }`
  - `ChatMeta.background: Vec<BackgroundTask>` (oldest first); `ChatItem::System { text, task: Option<TaskEnd> (skip if none), ts }`; `ChatEvent::Meta { …, background: Vec<BackgroundTask> }`.

- [ ] **Step 1: Write the failing tests** (append inside `mod tests` in `claude.rs`; update the existing `skips_system_prompts` expectation to `System { ts: None, text: "Agent \"Research\" finished".into(), task: None }`)

```rust
    use crate::transcript::{BackgroundKind, BackgroundTask, TaskEnd};
    const BASH_STARTED: &str = "Command running in background with ID: bxb95ptkq. Output is being written to: /tmp/bxb95ptkq.output";
    fn bash_call(id: &str, background: bool, description: Option<&str>) -> String {
        let mut input = serde_json::json!({"command":"mise run ci > /tmp/ci.log 2>&1","run_in_background":background});
        if let Some(d) = description {
            input["description"] = d.into();
        }
        serde_json::json!({"type":"assistant","timestamp":"2026-10-10T17:08:00.000Z","message":{"content":[{"type":"tool_use","id":id,"name":"Bash","input":input}]}}).to_string()
    }
    fn agent_call(id: &str) -> String {
        serde_json::json!({"type":"assistant","timestamp":"2026-10-10T17:09:00.000Z","message":{"content":[{"type":"tool_use","id":id,"name":"Agent","input":{"description":"Whole-branch review","prompt":"review"}}]}}).to_string()
    }
    fn tool_result(id: &str, text: &str, is_error: bool) -> String {
        serde_json::json!({"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":id,"content":[{"type":"text","text":text}],"is_error":is_error}]}}).to_string()
    }
    fn notification(id: &str, status: &str, summary: Option<&str>) -> String {
        let summary = summary.map(|s| format!("<summary>{s}</summary>\n")).unwrap_or_default();
        serde_json::json!({"type":"user","promptSource":"system","origin":{"kind":"task-notification"},"timestamp":"2026-10-10T17:18:00.000Z","message":{"content":format!("<task-notification>\n<task-id>b1</task-id>\n<tool-use-id>{id}</tool-use-id>\n<output-file>/tmp/b1.output</output-file>\n<status>{status}</status>\n{summary}</task-notification>")}}).to_string()
    }
    fn end(id: &str, status: &str, exit_code: Option<i32>) -> Option<TaskEnd> {
        Some(TaskEnd { call_id: id.into(), status: status.into(), exit_code })
    }
    fn push(p: &mut ClaudeParser, line: &str) -> Vec<ChatItem> {
        match p.push_line(line, &mut Vec::<(String, String, Vec<u8>)>::new()) {
            ParserOutput::Append(v) => v,
            _ => vec![],
        }
    }

    #[test]
    fn a_background_command_runs_until_its_notification() {
        let (_, _, mut p) = run_with(&[bash_call("t1", true, Some("Run full dotfiles CI in background")), tool_result("t1", BASH_STARTED, false)].join("\n"));
        assert_eq!(
            p.meta().background,
            vec![BackgroundTask {
                call_id: "t1".into(),
                kind: BackgroundKind::Bash,
                description: "Run full dotfiles CI in background".into(),
                started: Some("2026-10-10T17:08:00.000Z".into()),
            }]
        );
        let summary = "Background command \"Run full dotfiles CI in background\" completed (exit code 0)";
        assert_eq!(
            push(&mut p, &notification("t1", "completed", Some(summary))),
            vec![System { ts: Some("2026-10-10T17:18:00.000Z".into()), text: summary.into(), task: end("t1", "completed", Some(0)) }]
        );
        assert_eq!(p.meta().background, vec![]);
    }

    #[test]
    fn a_background_agent_runs_until_its_notification() {
        let (_, _, mut p) = run_with(&[agent_call("a1"), tool_result("a1", "Async agent launched successfully.\nagentId: a18a42ecc9696ac94", false)].join("\n"));
        let bg = p.meta().background;
        assert_eq!((bg.len(), &bg[0].kind, bg[0].description.as_str()), (1, &BackgroundKind::Agent, "Whole-branch review"));
        let items = push(&mut p, &notification("a1", "failed", Some("Agent \"Whole-branch review\" failed")));
        assert!(matches!(&items[..], [System { task, .. }] if *task == end("a1", "failed", None)));
        assert_eq!(p.meta().background, vec![]);
    }

    #[test]
    fn reads_a_non_zero_exit_code() {
        let (_, _, mut p) = run_with(&[bash_call("t1", true, Some("ci")), tool_result("t1", BASH_STARTED, false)].join("\n"));
        let items = push(&mut p, &notification("t1", "failed", Some("Background command \"ci\" failed (exit code 1)")));
        assert!(matches!(&items[..], [System { task, .. }] if *task == end("t1", "failed", Some(1))));
    }

    #[test]
    fn a_notification_without_a_summary_still_ends_the_task() {
        let (_, _, mut p) = run_with(&[bash_call("t1", true, Some("ci")), tool_result("t1", BASH_STARTED, false)].join("\n"));
        assert_eq!(
            push(&mut p, &notification("t1", "killed", None)),
            vec![System { ts: Some("2026-10-10T17:18:00.000Z".into()), text: String::new(), task: end("t1", "killed", None) }]
        );
        assert_eq!(p.meta().background, vec![]);
    }

    #[test]
    fn foreground_and_failed_starts_stay_out() {
        let (_, _, p) = run_with(
            &[
                bash_call("t1", false, Some("ls")),
                tool_result("t1", "a\nb", false),
                bash_call("t2", true, Some("ci")),
                tool_result("t2", "Permission to use Bash has been denied.", true),
                serde_json::json!({"type":"assistant","message":{"content":[{"type":"tool_use","id":"r1","name":"Read","input":{"file_path":"/a"}}]}}).to_string(),
                tool_result("r1", BASH_STARTED, false),
            ]
            .join("\n"),
        );
        assert_eq!(p.meta().background, vec![]);
    }

    #[test]
    fn notification_without_a_start_is_shown() {
        let (items, _, p) = run_with(&notification("zz", "completed", Some("Background command \"x\" completed (exit code 0)")));
        assert!(matches!(&items[..], [System { task, .. }] if *task == end("zz", "completed", Some(0))));
        assert_eq!(p.meta().background, vec![]);
    }

    #[test]
    fn keeps_start_order() {
        let (_, _, mut p) = run_with(
            &[
                bash_call("t1", true, Some("first")),
                tool_result("t1", BASH_STARTED, false),
                bash_call("t2", true, Some("second")),
                tool_result("t2", BASH_STARTED, false),
                bash_call("t3", true, Some("third")),
                tool_result("t3", BASH_STARTED, false),
            ]
            .join("\n"),
        );
        push(&mut p, &notification("t1", "completed", Some("done (exit code 0)")));
        let names: Vec<_> = p.meta().background.into_iter().map(|t| t.description).collect();
        assert_eq!(names, vec!["second", "third"]);
    }

    #[test]
    fn describes_a_command_without_a_description_by_its_start() {
        let long = "x".repeat(100);
        let call = serde_json::json!({"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":long,"run_in_background":true}}]}}).to_string();
        let (_, _, p) = run_with(&[call, tool_result("t1", BASH_STARTED, false)].join("\n"));
        assert_eq!(p.meta().background[0].description, "x".repeat(80));
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd src-tauri && cargo test --lib transcript::claude 2>&1 | tail -20`
Expected: compile errors (`BackgroundTask`, `TaskEnd`, `task` field not found).

- [ ] **Step 3: Implement**

In `mod.rs`: the types from Interfaces; add the fields; `ChatItem::ts()` keeps working (`System { ts, .. }`). Add `task: None` to every other `System` constructor (`pi.rs:127`, `pi.rs:553` test, `tail.rs:423`) and `background: meta.background` to `tail.rs:207`; add `background: vec![]` to the `mod.rs:907` test's `ChatEvent::Meta`.

In `claude.rs`, `ClaudeParser` gains:
- `calls: HashMap<String, (BackgroundKind, String, Option<String>)>`: Bash/Agent `tool_use` by id → (kind, description, ts). Insert in the `("assistant", "tool_use")` arm.
- `background: Vec<BackgroundTask>`. In the `("user", "tool_result")` arm, `remove` the call from `calls`; when `!is_error` and the result text starts with the kind's prefix, push a `BackgroundTask`.
- In the `promptSource == "system"` branch: `call_id = tag(s, "tool-use-id")`, `status = tag(s, "status")`, `summary = tag(s, "summary")`. With a `call_id`: `retain` the others in `background`, build `TaskEnd` (`status` empty string when the tag is missing; `exit_code` from `(exit code N)` in the summary), emit `System { text: summary or "", task }`. Without a `call_id`: today's behaviour (summary → System with `task: None`, else nothing).
- `meta()` returns `background: self.background.clone()`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd src-tauri && cargo test 2>&1 | tail -5 && cargo clippy --all-targets 2>&1 | tail -3`
Expected: all tests pass; clippy shows no warnings.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/transcript
git commit -m "feat(chat): track Claude's background tasks in the transcript parser"
```

---

### Task 2: Frontend types and chat store

**Files:**
- Modify: `src/lib/types.ts:101-119`
- Modify: `src/chat/chatStore.ts`
- Test: `src/chat/chatStore.test.ts`

**Interfaces:**
- Consumes: wire shapes from Task 1 (Global Constraints).
- Produces: `export interface BackgroundTask`, `export interface TaskEnd` in `types.ts`; system item `{ kind: "system"; text: string; task?: TaskEnd }`; meta event `{ type: "meta"; queued: string[]; background: BackgroundTask[] } & ChatMeta`; `ChatState.background: BackgroundTask[]` (`emptyChat.background = []`, kept across `reset` like `queued`).

- [ ] **Step 1: Write the failing test** (append to `chatStore.test.ts`; existing meta events in that file gain `background: []`)

```ts
  it("keeps the running background tasks from meta, across a reset", () => {
    const task = { call_id: "t1", kind: "bash" as const, description: "Run CI", started: "2026-10-10T17:08:00.000Z" };
    let s = reduce(emptyChat, { type: "meta", model: null, effort: null, context_tokens: null, queued: [], background: [task] });
    expect(s.background).toEqual([task]);
    s = reduce(s, { type: "reset", items: [], total: 0 });
    expect(s.background).toEqual([task]);
    s = reduce(s, { type: "meta", model: null, effort: null, context_tokens: null, queued: [], background: [] });
    expect(s.background).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/chat/chatStore.test.ts`
Expected: FAIL (type error / `background` undefined).

- [ ] **Step 3: Implement** the types and the store field per Interfaces. Add `background: []` to meta events in other tests that `pnpm typecheck` flags (e.g. `ChatLens.test.tsx:192`).

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/chat && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/chat
git commit -m "feat(chat): keep background tasks in the chat store"
```

---

### Task 3: Background tasks strip

**Files:**
- Create: `src/chat/BackgroundTasks.tsx`, `src/chat/BackgroundTasks.test.tsx`
- Modify: `src/chat/workBlocks.ts` (add `rowOfCall`), `src/chat/ChatLens.tsx` (render above `<QueuedMessages>`, jump), `src/styles.css` (next to `.chat-queued`, line ~1207)
- Test: `src/chat/BackgroundTasks.test.tsx`, `src/chat/workBlocks.test.ts`, `src/chat/ChatLens.test.tsx`

**Interfaces:**
- Consumes: `BackgroundTask`, `ChatState.background` (Task 2).
- Produces:
  - `export function BackgroundTasks({ tasks, onJump }: { tasks: BackgroundTask[]; onJump: (callId: string) => void }): JSX.Element | null`. Renders nothing for `[]`. Mount the second clock (`useSecondClock`) only inside a child rendered when there are rows.
  - `export function rowOfCall(rows: ChatRow[], callId: string): number` in `workBlocks.ts`: index of the row holding the `tool_call` with that id (an `item` row, or a `work` row whose `block.items` holds it); `-1` when not loaded.
  - In `ChatLens`: `onJump(callId)`: `i = rowOfCall(rows, callId)`; if `i < 0` do nothing; if `rows[i].kind === "work"`, `setChosenOpen(m => new Map(m).set(block.id, true))`; then `jumpTo(i)`. Render `{view.agent && <BackgroundTasks tasks={state.background} onJump={onJump} />}`.
- Markup: `<ul className="chat-background" role="list" aria-label="Background tasks">`, each `<li><button type="button" className="chat-background-row">` holding `<span className="chat-background-kind">Shell|Agent</span>`, `<span className="chat-background-desc">{description}</span>`, `<span className="chat-background-time">{elapsed}</span>`. Kind and time in `--fg-3`, description in `--fg-2`, a `.spin` before the kind. Description ellipsizes on one line.

- [ ] **Step 1: Write the failing tests**

`src/chat/BackgroundTasks.test.tsx`:

```tsx
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
```

Append to `src/chat/workBlocks.test.ts`:

```ts
it("finds the row of a tool call, inside a work block or not", () => {
  const items: ChatItem[] = [
    { kind: "user", text: "go" },
    { kind: "tool_call", id: "t1", name: "Bash", input_summary: "ci", input: {} },
    { kind: "assistant_text", markdown: "running" },
  ];
  const { rows } = buildRows(items);
  const i = rowOfCall(rows, "t1");
  expect(i).toBeGreaterThanOrEqual(0);
  const row = rows[i];
  expect(row.kind === "work" ? row.block.items.some((x) => x.kind === "tool_call" && x.id === "t1") : row.kind === "item" && row.item.kind === "tool_call").toBe(true);
  expect(rowOfCall(rows, "nope")).toBe(-1);
});
```

(import `rowOfCall` and `type ChatItem` alongside the file's existing imports.)

Append to `src/chat/ChatLens.test.tsx` (inside the describe that holds the queued test; reuse its `pane`, `channels`, render helpers and `act` as that test does):

```tsx
  it("shows the background tasks while the agent runs, and hides them once it is gone", () => {
    const view = { status: "idle", agent: "claude", title: "claude" } as PaneView;
    const { rerender } = render(<ChatLens pane={pane} view={view} />);
    act(() =>
      channels[channels.length - 1].onmessage({
        type: "meta", model: null, effort: null, context_tokens: null, queued: [],
        background: [{ call_id: "t1", kind: "bash", description: "Run CI", started: "2026-10-10T17:08:00.000Z" }],
      }),
    );
    expect(screen.getByRole("list", { name: "Background tasks" }).textContent).toContain("Run CI");
    rerender(<ChatLens pane={pane} view={{ ...view, agent: null }} />);
    expect(screen.queryByRole("list", { name: "Background tasks" })).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/chat/BackgroundTasks.test.tsx src/chat/workBlocks.test.ts src/chat/ChatLens.test.tsx`
Expected: FAIL (module / export not found; list not rendered).

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/chat && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/chat src/styles.css
git commit -m "feat(chat): show running background tasks above the Composer"
```

---

### Task 4: Tool card badge

**Files:**
- Create: `src/chat/backgroundTasks.ts`, `src/chat/backgroundTasks.test.ts`
- Modify: `src/chat/ChatItemView.tsx` (`ToolCallView`), `src/chat/ChatLens.tsx` (provider), `src/styles.css`
- Test: `src/chat/backgroundTasks.test.ts`, `src/chat/ChatItemView.test.tsx`

**Interfaces:**
- Consumes: `BackgroundTask`, `TaskEnd`, system item `task` (Task 2).
- Produces in `backgroundTasks.ts`:
  - `export interface BackgroundState { running: Set<string>; ends: Map<string, TaskEnd> }`
  - `export const BackgroundContext = createContext<BackgroundState>({ running: new Set(), ends: new Map() })`
  - `export function taskEnds(items: ChatItem[]): Map<string, TaskEnd>`: every system item's `task`, by `call_id`.
  - `export function taskBadge(callId: string, s: BackgroundState): { label: string; tone: "running" | "good" | "bad" } | null`: an end wins over running; `completed` + `exit_code` 0 → `exit 0` good; `completed` without exit code → `done` good; any `exit_code` ≠ 0 → `exit N` bad; else the status word (`failed`, `killed`, `stopped`) bad; running → `background · running` running; neither → null.
- `ChatLens` wraps its content in `<BackgroundContext.Provider value={…}>`, memoised on `state.background` and `items`. `ToolCallView` reads it with `useContext` and renders `<span className={"chat-tool-badge " + tone}>{label}</span>` after the summary. CSS: running `--fg-3`, good `--green-text`, bad `--err-fg`; 1px `currentColor` border, transparent background, 11px, `--r-sm` radius, `flex: none`.

- [ ] **Step 1: Write the failing tests**

`src/chat/backgroundTasks.test.ts`:

```ts
import { expect, it } from "vitest";
import type { ChatItem } from "../lib/types";
import { taskBadge, taskEnds } from "./backgroundTasks";

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
```

Append to `src/chat/ChatItemView.test.tsx` (add imports `BackgroundContext` from `./backgroundTasks` and `ChatItemView` if missing):

```tsx
it("badges a background tool call from the context", () => {
  const call = { kind: "tool_call" as const, id: "t1", name: "Bash", input_summary: "mise run ci", input: {} };
  render(
    <BackgroundContext.Provider value={{ running: new Set(["t1"]), ends: new Map() }}>
      <ChatItemView item={call} />
    </BackgroundContext.Provider>,
  );
  expect(screen.getByText("background · running").className).toContain("running");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/chat/backgroundTasks.test.ts src/chat/ChatItemView.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** per Interfaces.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run && pnpm typecheck && pnpm lint`
Expected: PASS (includes `src/tokens.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/chat src/styles.css
git commit -m "feat(chat): badge background tool calls with running and end state"
```

---

### Task 5: Gate and real-app check

**Files:** none new (fixes only if a check fails).

- [ ] **Step 1: Full gate**

Run: `mise run ci > /tmp/herdr-bg-ci-$(date +%s).log 2>&1; echo $?`
Expected: `0`, log ends with `ci passed`.

- [ ] **Step 2: Browser tests**

Run: `mise run test:browser > /tmp/herdr-bg-browser-$(date +%s).log 2>&1; echo $?`
Expected: `0`.

- [ ] **Step 3: Install and drive the real app**

Run `mise run app:install`. In a Claude pane of the installed app, ask Claude to run `sleep 90; echo done` with `run_in_background`. Expected, in the Chat lens: the strip shows `Shell · <description> · Ns`, counting; the tool card shows `background · running`; after ~90 s the row disappears, the card shows `exit 0`, and a System line reads the summary. Clicking the row before it ends scrolls to the (opened) Work block.

- [ ] **Step 4: Resume check (spec edge case)**

Start a background `sleep 600`, quit Claude (`/exit`), then `claude --resume` the same session in that pane. Record whether the strip still lists the dead task. Report the result to the user; do not fix it in this plan.

- [ ] **Step 5: Screenshot** the strip and a badge from the real render (light and dark) for the PR, kept in the main checkout's gitignored `tmp/mockups/`.
