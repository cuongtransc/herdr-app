# Chat background tasks

Date: 2026-10-11
Status: approved design, pending implementation plan

## Goal

When Claude starts a shell command or a subagent in the background, the Chat lens says so until
it finishes. Today the turn ends (`stop_reason: end_turn`, "CI is running in the background, I'll
commit when it's done"), the Chat lens looks idle, and nothing shows that Claude will start a new
turn by itself in ten minutes; the user may close the tab or type over it. When the task ends, the
only trace is a System line with its summary.

## Scope

In:
- Claude Code's background **Bash** commands (`run_in_background: true`) and background
  **Agent** calls (subagents).
- A **Background tasks** strip above the Composer, in the Chat lens.
- A status badge on the tool card of each Background task.

Out:
- The sidebar and the Agent status: the app reads only the Transcripts of open Panes (plus three
  Parked tails), so a sidebar marker would be wrong for every other Agent.
- Monitor, Dynamic workflow and other task kinds; pi.
- Showing a task's output file.

## Transcript records

Measured on Claude Code 2.1.295 transcripts (five days, about 6 200 task notifications: Agent
3 128, Background command 2 781, Monitor 375, Dynamic workflow 11).

| Event | Record |
|---|---|
| Start, Bash | `assistant` `tool_use` `name: "Bash"`, `input.run_in_background: true`, `input.description`; its `tool_result` text starts `Command running in background with ID: <task-id>. Output is being written to: <path>` |
| Start, Agent | `assistant` `tool_use` `name: "Agent"`, `input.description`; its `tool_result` text starts `Async agent launched successfully.` |
| End | `user` record with `promptSource: "system"`, `origin.kind: "task-notification"`, content `<task-notification>` holding `<task-id>`, `<tool-use-id>`, `<output-file>`, `<status>`, `<summary>` |

`<status>` is `completed`, `failed`, `killed` or `stopped`. A Bash summary ends `(exit code N)`:
`Background command "Use SRC helper, run full dotfiles CI" completed (exit code 0)`. While the
agent is busy the same notification is first a `queue-operation` `enqueue` record; the parser
already keeps those out of Queued messages.

A Background task is running from its start `tool_result` until a notification with its
`<tool-use-id>` arrives.

## Data (parser, `src-tauri/src/transcript/claude.rs`)

- On a `tool_use` named `Bash` or `Agent`, remember `{name, description, ts}` by its id.
  `description` is `input.description`, or the first 80 characters of `input.command` when
  absent.
- On its `tool_result`, if the text starts with one of the two start prefixes above, the call
  becomes a running Background task; otherwise forget it. The remembered calls never outlive their
  result.
- On a task notification (the existing `promptSource: "system"` branch), take `<tool-use-id>`,
  drop that task from the running set, and attach `task` to the System line it already emits:
  `task: { call_id, status, exit_code? }`, `exit_code` parsed from `(exit code N)` in the summary.
  A notification without a summary still carries `task` when it has a `<tool-use-id>`; a System
  item is emitted for it then, with the summary text empty.
- A notification whose `<tool-use-id>` matches no running task is shown as today; it is not an
  error.
- `ChatMeta` gains `background: Vec<BackgroundTask>`, oldest first:
  `{ call_id, kind: "bash" | "agent", description, started }` (`started` is the `tool_use`
  timestamp). It travels in the existing `Meta` event, as `queued` does.
- `ChatItem::System` gains `task: Option<TaskEnd>`, skipped when `None`.

The parser reads the whole Transcript on open, so reopening a Chat lens (or a Parked tail) shows
the same set.

## UI

**Background tasks strip** (`src/chat/BackgroundTasks.tsx`), directly above Queued messages:

- One row per running task: `Shell` or `Agent`, the description, and the time since `started`
  (`3m 12s`, the Working line's format). It re-renders each second only while it has rows.
- A row is a button: it scrolls to the task's tool card, opening its Work block if closed.
- `role="list"`, `aria-label="Background tasks"`.
- Hidden when the Pane has no Agent (`view.agent` is null): the tasks died with the agent.

**Tool card badge** (`ToolCallView`): a call that is a running Background task shows
`background · running`; once its notification arrives, `exit 0` (good), `exit N` (critical),
`failed`, `killed` or `stopped`, from the System item's `task`. Every badge colour is at least
4.5:1 on its background in light and dark.

## Edge cases

- **Agent exits:** the strip hides (above).
- **`claude --resume` in the same Pane:** tasks started before the resume die without a
  notification, and the Agent is present again, so they would stay in the strip. Not handled by
  this design; checked once in the real app during implementation, and reported with a proposal
  if it happens.
- **Elapsed time** is derived from the `tool_use` timestamp, not measured from the process.

## Testing

- Rust unit tests from real record shapes: Bash start and end, Agent start and end, a non-zero
  exit, `killed`, a notification with no matching start, a foreground Bash that never enters the
  set, a notification without a summary.
- Vitest: the strip's rows and elapsed time, hidden with no Agent, the row's jump; the badge for
  each end state.
- Browser test: badge and strip text contrast ≥ 4.5:1 in both themes.
- `mise run ci`, then `app:install` and a where/do/expect checklist for the real app, with a
  screenshot of the strip from the real render in the PR.
