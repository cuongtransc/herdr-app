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
| End, agent idle | `user` record with `promptSource: "system"`, `origin.kind: "task-notification"`, content `<task-notification>` holding `<task-id>`, `<tool-use-id>`, `<output-file>`, `<status>`, `<summary>` |
| End, agent mid-turn | `attachment` record, `attachment.type: "queued_command"`, `attachment.origin.kind: "task-notification"`, `attachment.prompt` holding the same `<task-notification>` text. The CLI writes this instead of the `user` record when the task ends while Claude is working |
| End, stopped by Claude | `assistant` `tool_use` `name: "TaskStop"` (`input.task_id`) or `name: "KillShell"` (`input.shell_id`); its non-error `tool_result` (JSON text `{"message":"Successfully stopped task: ...","task_id":...}`) ends the task. `TaskStop` writes no `<task-notification>` |

`<status>` is `completed`, `failed`, `killed` or `stopped`. A Bash summary ends `(exit code N)` (the last one in the summary is read):
`Background command "Use SRC helper, run full dotfiles CI" completed (exit code 0)`. While the
agent is busy the same notification is first a `queue-operation` `enqueue` record; the parser
already keeps those out of Queued messages. Both end records can appear for one task.

A Background task is running from its start `tool_result` until a notification with its
`<tool-use-id>` arrives, or a `TaskStop` / `KillShell` call on its task id succeeds.

## Data (parser, `src-tauri/src/transcript/claude.rs`)

- On a `tool_use` named `Bash` or `Agent`, remember `{name, description, ts}` by its id.
  `description` is `input.description`, or the first 80 characters of `input.command` when
  absent.
- On its `tool_result`, if the text starts with one of the two start prefixes above, the call
  becomes a running Background task; otherwise forget it. The remembered calls never outlive their
  result.
- A `queued_command` attachment with `origin.kind: "task-notification"` is rewritten into the
  `promptSource: "system"` user record it stands for, so one branch handles both paths. It is
  never shown as the user's words.
- On a task notification (the existing `promptSource: "system"` branch), take `<tool-use-id>`,
  drop that task from the running set, and attach `task` to the System line it already emits:
  `task: { call_id, status, exit_code? }`, `exit_code` parsed from `(exit code N)` in the summary.
  A notification without a summary still carries `task` when it has a `<tool-use-id>`; a System
  item is emitted for it then, with the summary text empty; the Chat lens draws no row for an
  empty-text System item (no turn, no Work block split), but the item stays in the list so its
  badge works.
- A notification whose `<tool-use-id>` matches no running task is shown as today, once; it is
  not an error.
- Ended task ids are remembered (newest 512). A repeated notification for an ended `<tool-use-id>`,
  by either path, emits nothing: one System line, one end badge.
- Unfinished remembered calls are bounded at 512; the map is cleared when it reaches that.
- **TaskStop / KillShell:** when a start `tool_result` succeeds, the parser remembers the task id
  by call id: Bash `ID: <id>.` in the result text, Agent `agentId: <id>`. On a `tool_use` named
  `TaskStop` (`input.task_id`) or `KillShell` (`input.shell_id`), it remembers the target by that
  call's id. On the stop call's `tool_result` with `is_error` false, the running task whose task id
  matches leaves the running set, joins the ended ids and emits one `System` item with empty text
  and `task: { call_id, status: "stopped" }` (no exit code), stamped with the result's timestamp.
  The Chat lens draws no row for it; the badge reads `stopped`. With `is_error` true the task keeps
  running. An unknown id, or one already ended, is a no-op. A later notification for the same task
  is dropped through the ended ids (single badge). The task-id and stop maps are bounded at 512 and
  cleared on reaching it, like the call map.
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
- Layout matches the Working line (`.chat-working`): the strip has `padding: 0 28px`, and each row
  is a grid, `12px 40px minmax(0, 1fr) auto` with an 8px column gap: spinner, kind, description
  (ellipsis), time (right-aligned). The spinners share one x with the Working line, descriptions
  share one x, and times share one right edge.
- A row is a button: it opens the task's Work block if closed, scrolls to the row, then scrolls
  the tool card itself into view (`block: "nearest"`).
- `role="list"`, `aria-label="Background tasks"`.
- Hidden when the Pane has no Agent (`view.agent` is null): the tasks died with the agent.

**Tool card badge** (`ToolCallView`): a call that is a running Background task shows
`background · running`; once its notification arrives, `exit 0` (good), `exit N` (critical),
`failed`, `killed` or `stopped`, from the System item's `task`. A notification without
`<status>` shows a neutral `ended` badge (same colour as `running`), not a failure. The running
set follows the strip's rule: empty when `view.agent` is null, and empty in a fork's preview of
the original Transcript, so the preview never claims the original's tasks. End badges still show. Every badge colour is at least
4.5:1 on its background in light and dark.

## Edge cases

- **Agent exits:** the strip hides (above).
- **`claude --resume` in the same Pane:** tasks started before the resume die without a
  notification, and the Agent is present again, so they would stay in the strip. Not handled by
  this design; checked once in the real app during implementation, and reported with a proposal
  if it happens.
- **Notification by both paths or twice:** dropped after the first; no second badge or System
  line (see Data).
- **TaskStop / KillShell:** a successful stop ends the task as `stopped` without a notification
  (see Data); a failed stop leaves it running; a notification arriving after the stop adds nothing.
- **Notification without `<status>`:** ended, neutral `ended` badge.
- **Call not loaded** (older than the loaded window): a strip click pages older items in, in one
  prepend, until the call is found, then jumps as above. If the start of the Transcript is
  reached without it, a notice reads `Task call not found in the transcript: ...`. A paging
  error, a click while older items are already loading, or a Transcript that changed during
  paging also show a notice. The notice stays until the next click or Pane change.
- **Elapsed time** is derived from the `tool_use` timestamp, not measured from the process.

## Testing

- Rust unit tests from real record shapes: Bash start and end, Agent start and end, a non-zero
  exit, `killed`, a notification with no matching start, a foreground Bash that never enters the
  set, a notification without a summary, the same end as a `queued_command` attachment, an end
  delivered by both paths and a repeated one (one item), a summary with two `(exit code N)`
  (the last wins), TaskStop on a Bash and on an Agent task, KillShell, a stop that errors, a stop
  with an unknown id, a notification after the stop (one item).
- Vitest: the strip's rows and elapsed time, hidden with no Agent, the row's jump; the badge for
  each end state, the neutral `ended` badge, no running badge without an Agent or in a fork
  preview, the jump paging older items in and the not-found notice, the card scrolled into view,
  no row for an empty-summary System item.
- Browser test: badge and strip text contrast ≥ 4.5:1 in both themes; the strip's spinner,
  description and time line up with the Working line (inset 28px) in both themes.
- `mise run ci`, then `app:install` and a where/do/expect checklist for the real app, with a
  screenshot of the strip from the real render in the PR.
