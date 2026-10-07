# herdr-app

A desktop client for [herdr](https://github.com/herdrdev/herdr) that browses and drives agent panes on the local computer and on remote computers.

## Language

**Machine**:
A computer where herdr runs: either `local` or a remote one reached by an SSH target (an alias from `~/.ssh/config` or `user@host`).
_Avoid_: host, PC, server, remote

**Session**:
A named persistent herdr session on a Machine; it owns exactly one herdr socket and is either running or stopped. The user keeps one per area of work (`w-xb`, `p-ai`), never one per project: herdr means a Session as an isolation boundary with its own server.
_Avoid_: server, instance

**Workspace**:
A group of Tabs inside a Session: one repo, task or investigation, as herdr means it. The sidebar lists a Session's Workspaces with agent work under it as its projects; in the code it stays a Workspace.
_Avoid_: space

**Workspace folder**:
The folder the app remembers for a Workspace; Agents started from the app's UI run in a new Tab there. herdr itself does not know it.
_Avoid_: project dir, workspace cwd

**Group**:
A named, nestable set of Sessions the user arranges in the sidebar; it can hold Sessions from any Machine. herdr itself does not know it.
_Avoid_: folder, project

**Bookmark**:
A Session the user pinned to the top of the sidebar, independent of which Group it is in.
_Avoid_: favourite, pin

**Tab**:
A layout of Panes inside a Workspace. Its label says its role: `orch-*` the orchestrator, `lane-<slug>` a worker it dispatched (a lane's git worktree stays a Tab, never a Workspace of its own), `brief-*` a decision, or a one-word purpose for a shell (`dev`, `test`, `server`, `logs`). A bare number is herdr's default and names nothing.

**Pane**:
One cell of a Tab's layout, identified by `pane_id`; the unit the user selects and views.

**Terminal**:
The live terminal stream behind a Pane, identified by `terminal_id`; the thing that gets attached.
_Avoid_: pty, shell

**Attach**:
An exclusive connection to a Terminal's stream; herdr allows only one at a time per Terminal.

**Agent**:
A coding agent (Claude Code, pi, ...) that herdr detects running in a Pane, with an agent status of `working`, `blocked`, `done`, `idle` or `unknown`.

**Slash command**:
A command an Agent runs when a message starts with it (`/compact`, or `$name` for a Codex skill): a built-in, a user or project command, or a skill, including a plugin's.
_Avoid_: shortcut, macro

**Skill**:
A packaged set of instructions an Agent loads for a task, invoked by the user (as a Slash command) or by the Agent itself.
_Avoid_: plugin, extension

**Lens**:
A way of viewing a Pane: the **Terminal lens** (the raw attached terminal) or the **Chat lens** (the Agent's Transcript as a conversation).
_Avoid_: mode, view

**Transcript**:
The Agent's own conversation file (`.jsonl`) that the Chat lens reads.
_Avoid_: history, log

**Parked tail**:
The live reading of a Transcript kept after its Chat lens closed, so reopening that Chat lens resumes it instead of reading the Transcript again.
_Avoid_: cached chat, background tail

**Provider**:
The service an Agent's account belongs to (Claude, Codex, OpenCode Go, Grok); it owns a Quota.
_Avoid_: vendor, model

**Model**:
The language model an Agent answers with, as its Transcript records it (`claude-opus-5-5`); one Provider offers many.
_Avoid_: provider, engine

**Reasoning effort**:
How hard the Model is set to think, as the Transcript records it (`high`, `off`); never inferred.
_Avoid_: thinking level, effort mode

**Quota**:
How much of a Provider account's usage allowance is used, read on this Mac only. It belongs to the Provider, never to a Machine or an Agent.
_Avoid_: usage, limit, credits

**Window**:
One rolling or calendar period of a Quota (`5h`, `week`, `month`) with a used percent and a Reset.

**Reset**:
The moment a Window's used percent goes back to zero.

## UI surfaces

The names to use when talking about the screen, in issues, specs and prompts: each is what the
user sees, then where it lives.

| Surface | What it is | Code |
|---|---|---|
| **Sidebar** | The left column: Bookmarks, Sessions, Machines | `src/sidebar/Sidebar.tsx` |
| **Session row** | A Session in the Sidebar | `SessionRow` |
| **Project row** | A Workspace with agent work, under its Session row | `ProjectRows` (`src/sidebar/ProjectRows.tsx`), `sessionProjects` |
| **Sessions filter** | All \| Active on the Sessions header | `useSessionFilter` (`src/sidebar/activeFilter.ts`) |
| **Agents column** | The middle column, headed by the Session name and PANES | `src/agents/AgentList.tsx` |
| **Pane row** | A Pane in the Agents column | `AgentCard` |
| **Panes filter** | All \| Active on the PANES header | `usePaneFilter` (`src/agents/paneFilter.ts`), `PanesHeader` |
| **Queue chip** | "1 blocked · 1 review" atop the Agents column | `SessionQueueChip` |
| **Lane toggle** | "N lanes ›" on an orchestrator's Pane row | `.lane-toggle` in `AgentList.tsx` |
| **Triage HUD** | The queue shown by ⌘J | `src/main/TriageHud.tsx`, `src/main/triage.ts` |
| **Agent Board** | The ⇧⌘D overlay, with the Quota column | `src/dashboard/AgentDashboard.tsx`, `QuotaColumn` |
| **Chat lens** / **Terminal lens** | The main area, as a conversation or the raw terminal | `src/chat/ChatLens.tsx`, `src/terminal/TerminalLens.tsx` |
| **Composer** / **Composer chips** | The message box and the reply buttons above it | `src/chat/Composer.tsx` |

Status words, everywhere a status is put in words (ui-ux-guidelines §3.1): **Blocked** = `blocked`,
**In progress** = `working`, **Review** = `done` not yet seen, **Done** = `done` seen or `idle`.
_Avoid_: INPUT, Needs you, waiting, To do

## Relationships

- A **Machine** has zero or more **Sessions**
- A **Session** is in at most one **Group**; a **Group** has zero or more **Sessions** and **Groups**; a Session may also be a **Bookmark**
- A running **Session** has one or more **Workspaces**; a **Workspace** has one or more **Tabs**; a **Tab** has one or more **Panes**
- Each **Pane** has exactly one **Terminal**
- A **Pane** has at most one **Agent**; an **Agent** has at most one **Transcript** the app can find
- A **Terminal** has at most one **Attach** at a time
- A **Provider** has one **Quota**; a **Quota** has one or more **Windows**, each with at most one **Reset**

## Example dialogue

> **Dev:** "When the user clicks a **Pane** on devtuf, do we **Attach** right away?"
> **Domain expert:** "Only in the **Terminal lens**. If the **Agent** is Claude Code and we find its **Transcript**, the **Chat lens** opens and nothing is attached."

## Flagged ambiguities

- "space" (user's word) resolved: it is herdr's **Workspace**.
- "session" means a herdr named **Session**, never an agent's conversation; that is a **Transcript**.
