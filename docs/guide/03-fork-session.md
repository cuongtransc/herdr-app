# 03 · Fork a Claude session

A fork is a new Claude session that starts with the whole conversation of the original, in a new tab of the same
Workspace. The original keeps running untouched.

## How

Right-click a Claude Pane row:

| Choice | Runs | Use it for |
|---|---|---|
| **Fork session** | `claude --resume <id> --fork-session` in the same folder | Work that edits no files: update a ticket, look something up, draft a reply |
| **Fork into a new worktree** | the same, plus `--worktree fork-<time>` | Code changes while the original edits the same repo |

The fork opens on the Chat lens with a banner saying where it came from, and **Back to original**.

## What to expect

- **Only from an idle or done pane.** A fork taken in the middle of a tool call runs that call again, so the menu
  items are off while the pane works or waits for an answer.
- **It knows nothing after the fork.** What the original does next never reaches it.
- **Normal permissions.** It asks for what your settings say it asks for, like any session.
- **Until its first message,** Claude has not written the fork's own transcript: the Chat lens shows the original's
  history up to the fork, with a note. Your first message starts the fork's transcript and the lens follows it.
- **Same folder, same files.** Two sessions editing one checkout overwrite each other: fork into a worktree for that.
