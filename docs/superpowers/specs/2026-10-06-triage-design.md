# Triage: get to the agent that needs you

The user runs many agents across sessions and machines and loops: see who needs them, act,
move on. Two additions serve that loop.

Mockups (source of truth for layout and copy; Design-canvas `.dc.html` sources, screenshots are
not committed; names and numbers are sample data):
[next agent](assets/2026-10-06-triage-next-mockup.html) ·
[Active filter](assets/2026-10-06-triage-active-filter-mockup.html)

## 1. ⌘J: the next agent that needs you

- **Queue**, across all connected machines and running sessions, agent panes only (as the Agent
  Dashboard counts them): first the panes waiting for input (dashboard "Needs you"), longest
  waiting first; then the Done panes not yet seen, oldest first. A pane without a known status
  time sorts after those with one.
- **⌘J** selects the next pane in the queue after the selected one; **⇧⌘J** the previous one.
  When the selected pane is not in the queue (a Done pane leaves it once seen), stepping goes
  on from where the last step left off, so ⌘J walks the queue instead of returning to its head.
  Both wrap around.
- **HUD**: a card at the top centre lists the queue ("Needs you · k of n"), highlights the
  selected pane, and fades after 2 s; Esc hides it. An empty queue shows "Nothing needs you".
- **Focus-mode pill**: reads "N waiting · M done" and steps like ⌘J.

## 2. Sidebar filter: All | Active

- A segmented **All | Active N** control heads the session list; the choice is persisted in
  settings.
- **Active** keeps a session that is running and has an agent pane that is waiting, working, or
  Done and unseen, plus the session being viewed whatever its state. Bookmarks and the group
  tree are filtered alike, in their own order; a group left with no session is hidden.
- A footer, **"N hidden · idle or stopped — Show"**, switches back to All.
- Machines are not filtered.
