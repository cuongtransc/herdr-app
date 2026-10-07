# Herdr UI/UX guidelines

How Herdr's interface decides what to show, how it looks, and how it is driven. Every UI change is
checked against this page; a change that breaks a rule either fixes the rule here in the same PR
or does not ship.

Written 2026-10-07 from a three-role review (interaction & information architecture, visual
design, macOS platform & accessibility) of the app as it stood after the triage work
(`docs/superpowers/specs/2026-10-06-triage-design.md`). Where the roles disagreed, §8 records the
call and why. Terms follow `CONTEXT.md` (Machine › Session › Workspace › Tab › Pane).

## 1. Who it is for, and the loop it serves

One person supervises many agents (claude, codex, pi…) running in parallel across Sessions on the
local Machine and SSH Machines. The day is a loop:

> **see who needs me → act on it → next.**

Everything else (starting sessions, arranging groups, reading a transcript at leisure) is
occasional. The interface is judged by how few looks, keys and pixels one turn of the loop costs,
and by how calm it is when nothing needs the user.

## 2. Principles

1. **Attention first, structure second.** Emphasis follows attention state: needs you (blocked) >
   working > done and unseen > idle > shell. The Machine › Session › Workspace › Tab tree is how
   rows are *grouped*, not what makes them loud. *Don't* give an idle agent the same card, badge
   and height as one waiting for input.
2. **Only the exceptions may shout.** Colour, tint, motion and a status *word* are spent on
   "needs you" (and, more quietly, "done and unseen"). Working is a quiet glyph; idle and shells
   carry no mark. If four things shout, none does.
3. **Constants are not content.** A value that is the same on (nearly) every sibling is not shown;
   only the exception is. *Don't*: "no folder" on every Workspace header, `local` on every local
   Session, an empty "—" pill on every shell. Absent data renders as nothing, not as a label.
4. **One fact, one source, one denominator.** Each count names what it counts and is derived from
   one predicate (`isActiveSession`, `triageQueue`). *Don't*: three unlabelled numbers side by side
   ("2 2 2"), or a raw pane total ("ca 10") that counts shells nobody acts on.
5. **Destinations are not headers.** A control that changes the whole view (the Agent Board,
   Settings) looks like a button or tab and sits apart from lists. A full-width strip above a list
   reads as that list's title. *Don't*: put a destination directly above "SESSIONS".
6. **Progressive disclosure along the hierarchy.** Level 1 shows Machines and Sessions, level 2
   Workspaces and the Panes that matter, the main area one Pane. Tabs, idle Panes and shells show as
   a count until asked for. Selection always reveals itself: the selected Pane is never folded away.
7. **Stable layout.** A state change recolours a row in place; it does not move it, resize it or
   insert rows under the pointer. Re-sorting happens at settle points (switching Session, pressing
   ⌘J), never live.
8. **Keyboard-first, every action has a keyboard path.** The loop runs on keys (⌘J, ⌘K, ⌘B). No
   action exists only on hover, drag or right-click. Global shortcuts are ⌘ chords only, because
   terminals and agents own bare keys, Ctrl, Alt and Esc.
9. **Status is never colour alone, and dimming never drops below 4.5:1.** Every status has a shape
   or word and an accessible name. "Quiet" is done with weight, size and position, not with low
   contrast or `opacity`.
10. **Quiet when nothing needs you.** The all-clear state is designed: no pill, no tint, calm
    columns. The end of the loop is the goal, not an empty screen.

## 3. Visual system

### 3.1 Status semantics and encoding

| State | Meaning | Colour | Mark in a list row | Word |
|---|---|---|---|---|
| blocked | waiting for the user's input | `--amber` | filled dot, pulsing (static under reduced motion) + 7% amber row tint | **INPUT**, in `--amber-text` |
| working | agent busy | `--blue` | filled dot, no halo | none |
| done, unseen | finished since last viewed | `--green` | check glyph | none |
| done, seen / idle | nothing to do | — | none (slot kept so titles align) | none |
| shell / unknown | no agent | — | none | none |

- **One encoding per surface.** List row: mark + (for blocked) the word. Header or detail: one pill
  with text (`.agent-status`). Never mark + badge + tint + border + glow on one row (a blocked card
  shows five signals today).
- **Tint is reserved for "needs you"**: `color-mix(in srgb, var(--amber) 7%, transparent)`, no border,
  no glow. Status colours are never used for anything that is not status.
- Tints come from three steps only: 7% (row), 14% (chip), 25% (border, high-contrast mode only).

### 3.2 Selection, focus, accent

- **Selection** is neutral: `--active` fill + title weight 600, and `aria-current="true"`. No accent
  border, no left bar (see §8, D4).
- **Focus** is the `--ring` (`:focus-visible`), shown together with selection when both apply.
- **`--accent`** is reserved for focus rings, links and primary buttons; it is never a status.
- Selected + blocked: neutral fill, the amber dot and INPUT word stay.

### 3.3 Density

| Token (new) | Height | Used for |
|---|---|---|
| `--row-xs` | 24px | Workspace headers, folded "3 idle · 2 shells" lines |
| `--row-s` | 28px | every list row: sessions, panes, menus |
| `--row-l` | 40px+ | Agent Board cards only |

Lists use one-line rows. A second line is allowed only when it carries unique information (the
reason an agent is blocked) and only on that row. 28px is also the floor for drag-and-drop and
pointer targets (§5); no "compact" mode below 24px.

### 3.4 Type, spacing, radius, icons, motion

- **Type** (new tokens): `--fs-xs` 11 (meta, counters, caps section labels at 600),
  `--fs-s` 12 (secondary text), `--fs-m` 13 (row titles, body), `--fs-l` 15 (titles). The
  10/10.5/11.5/12.5/13.5/14/18px literals collapse into these; the chat font size stays a user
  setting. Weights: 400 body, 500 titles, 600 headers and the selected row.
- **Spacing**: 2/4/6/8/12/16 as `--s-1`…`--s-6`; row inline padding 8, section gaps 12.
- **Radius**: `--r-sm` 6 (rows, buttons, chips, tiles), `--r-md` 8 (inputs, popovers, cards),
  `--r-lg` 12 (dialogs), 999 (pills). No 3/5/7px. Never box a row inside a boxed container.
- **Icons**: 16px stroke glyphs, `--fg-3` at rest, `--fg-2` on hover, `--fg` when selected. The agent's
  brand mark is 16px with no tile in lists; the 24–26px tile belongs to Board cards and the new-agent
  picker.
- **Motion**: `--t-fast` 120ms (hover, press), `--t` 180ms (disclosure, layout), `--ease`. The only
  looping animation is the blocked dot's pulse. The global `prefers-reduced-motion` rule
  (styles.css) stays and covers everything; no JS-driven animation.

### 3.5 Contrast (measured, WCAG 2.x)

| Pair | Ratio | Verdict |
|---|---|---|
| dark `--fg-3` #6e717c on `--surface-1` / `--surface-0` | 3.34 / 3.54 | fails 4.5 |
| light `--fg-3` #868994 on `--surface-1` / white | 3.23 / 3.49 | fails 4.5 |
| light `--amber` #c27a10 on `--surface-1` | 3.20 | fails as text |
| light `--blue` #2f74e0 on `--surface-1` | 4.14 | fails as text |
| dark `--fg-2` / light `--fg-2` on `--surface-1` | 6.69 / 7.12 | passes |

Required token changes: dark `--fg-3` → `#8f929d` (5.2–5.5:1), light `--fg-3` → `#6a6d77`
(4.8–5.2:1), new `--amber-text` (light `#9a5f08`, 4.85:1; dark = `--amber`) for the INPUT word;
light blue is used for marks, never for text. `--grey` becomes `var(--fg-3)` in both themes.
Stopped and offline rows drop their `opacity: .7` / `.5`: quiet is `--fg-3` at the new value, nothing
lower. Vibrancy makes the sidebar backdrop vary with the wallpaper, so check new pairs over both a
light and a dark wallpaper.

### 3.6 Light/dark parity

Every colour is a token with a `[data-theme="light"]` twin, including the soft fills. Light
`--surface-2` must differ from `--surface-0` (today both are white, so raised cards vanish in light).
An `@media (prefers-contrast: more)` block restores a 1px `--line-3` border on the selected and
blocked rows.

## 4. Interaction and keyboard

### 4.1 Shortcut map

| Keys | Action |
|---|---|
| ⌘K | Jump to any pane (palette) |
| ⌘J / ⇧⌘J | Next / previous pane that needs you |
| ⌘B / ⇧⌘B | Hide the sidebar / focus on the main area |
| ⌘T | New tab with the default agent |
| ⇧⌘D (proposed, §7.2) | Open the Agent Board |

Reserved for later, in this order: ⌘N (new…), ⌘W (close pane, with confirmation), ⌘1–⌘9 (jump to
bookmarked Session). **Never** bind bare letters, Ctrl-, Alt- or Esc at `window` level:
`keyHandler.ts` forwards everything but ⌘ chords to the terminal, and that contract stays. A new
⌘ shortcut is also gated while the palette or a dialog is open.

### 4.2 Lists

- One Tab stop per list, arrows inside (roving tabindex): ↑/↓ move, ←/→ fold/unfold, Home/End,
  Enter selects, Menu key or ⇧F10 opens the row's context menu. Handlers live on the list element,
  never on `window`.
- Hover-revealed controls (a Workspace header's "+", a row's close ×) are allowed only if they also
  appear on `:focus-visible` / `:focus-within` and on the selected row, and the same action is in the
  context menu and on a key.
- Every drag has a non-drag equivalent ("Move to group…", "Move tab left/right").

### 4.3 Destructive actions

One rule for closing a pane, a tab and a workspace: confirm when it can end a running process or
an agent's work (blocked or working), otherwise act at once. Today a pane closes without
confirmation while tabs and workspaces confirm.

### 4.4 Counts and pills

- Outside the Board, counts come from the ⌘J queue (`triageQueue`: blocked, then done and unseen),
  hidden at 0. Where there is room for words they are split, **"N waiting · N done"** (waiting in
  `--amber-text`, done in `--green-text`), because a single "need you" sent the user looking for
  amber rows when the count was Done panes: the focus pill and the Agents column head do this. The
  Board button and Session rows, with only room for a number, show the total.
- A count that names things is also the way to them: the focus pill and the Agents column head
  step to the next one (in the session, for the column head), as ⌘J does.
- Working/done/idle counts live in the Board's column heads, labelled.

## 5. Accessibility checklist

- Every row has an explicit `aria-label`: "Fix login flow, claude, needs input" (not the concatenated
  text of its children).
- The selected row has `aria-current="true"`; collapsible headers are buttons with `aria-expanded`
  and an accessible name that includes their roll-up ("herdr-app, 1 needs you").
- Status: shape or word plus the name; never colour alone (deuteranopia: amber vs green).
- Text ≥ 4.5:1 against its real background (§3.5). Pointer targets ≥ 24px tall, contiguous along a
  list.
- Every action reachable by keyboard (§4.2); a status change announced through one polite live
  region ("2 need you"), not by re-reading the list.
- `user-select: none` on chrome is fine; paths and titles get a "Copy" menu item.

## 6. Engineering constraints for UI changes

- **Selectors return primitives or stable references.** Per-row state (selected, folded, needs you)
  is read inside the row with a boolean selector; no `filter`/`groupBy` inside a zustand selector.
  Every new piece of UI state ships with a `src/renders.test.tsx` case (selection must not
  re-render the sidebar).
- **One refit path.** Anything that changes the terminal's size goes through the same
  observer-driven fit as ⌘B/⇧⌘B; no manual `fit()` calls.
- **No list virtualization** at today's scale (tens of rows): it would break Tab order, `getByRole`
  tests and drag targets. Revisit above ~300 rows.
- **One predicate per meaning.** "Active" and "needs you" come from `activeFilter.ts` and
  `dashboard/triage.ts`; level 2 reuses them.
- **Tests address controls by role and name.** Renaming a control or a row's accessible name updates
  its tests in the same change.

## 7. Applying it: decisions for the current UI

These are the agreed directions; each lands in its own PR. Mockup (source of truth for layout and
copy of §7.1–§7.3; a Design-canvas `.dc.html`, sample data; screenshots are not committed):
[sidebar redesign](assets/2026-10-07-sidebar-redesign-mockup.html).

### 7.1 Level 2: the Agents column

- **Rows**: one line, 28px. `[16px agent mark] title … [mark slot]`; blocked adds the amber tint and
  INPUT. No icon tile, no badge line, no unlabelled "1"/"2" tab digits.
- **Idle agents and shells** fold into one 24px line per Workspace, "3 idle · 2 shells", which
  expands on click or ←/→. Blocked, working and done-unseen Panes are never folded; neither is the
  selected Pane. A shell whose title is not a shell name (`cargo watch`, a dev server: anything but
  `zsh`/`bash`/`fish`/`sh`) shows as a normal quiet row, unfolded and with no status mark: herdr
  reports no status for shells, so claiming "working" would be a guess (Q3).
- **Order within a Workspace**: needs you, working, done unseen, then the fold line, applied at
  settle points (§2.7). Workspace order stays the user's.
- **Workspace header**: 24px, label 12px/600 `--fg-2`, the folder's basename only when one is set
  (never "no folder"), a worst-status dot plus count when folded, "+" on hover/focus only. The header
  is a button that folds the Workspace; fold state persists per Workspace, and a fold never hides a
  blocked Pane (the header shows its dot and ⌘J unfolds it).
- **Tabs**: no bordered group box; Panes of a multi-tab Workspace show the tab name as a muted
  suffix only when it adds something. Tab drag-and-drop stays on the rows; ⌘J and selection unfold.
- **Column head**: Session name and "N need you" (hidden at 0). The raw pane count goes; "+" opens a
  New menu (workspace, agent, shell).
- **Stopped Session**: one line, "Stopped", with a Start button.

### 7.2 The Agent Board entry

The bordered, tinted "Agent Dashboard" strip above SESSIONS is read as the list's title, and nobody
expects it to open a Kanban view. It goes. In its place:

- a labelled **Board** button with a columns (Kanban) icon in the titlebar control cluster, next to
  the sidebar toggle, visible in every layout including focus, carrying the amber "N need you" count
  (hidden at 0);
- **⇧⌘D** and a ⌘K command, "Open Agent Board";
- the Board keeps its overlay behaviour, and its column heads carry the labelled working/done/idle
  counts.

### 7.3 Level 1: the sidebar

**Section structure.** Today BOOKMARKS hangs under the SESSIONS label at the same level as the
Groups, but with a different header style (small caps and a star, against bold Group rows with a
folder). Its rows are indented like a Group's children, so it reads both as a section and as a
Group. A bookmarked Session shows twice and both rows light up when selected, and ungrouped Sessions
trail after the last (possibly nested) Group with no header, reading as its children. The fix:

- **Three sibling sections, one header style**: BOOKMARKS (only when not empty), SESSIONS, MACHINES,
  each an 11px/600 caps label with the same fold chevron. All|Active belongs to the SESSIONS header
  and filters Bookmarks too.
- **Bookmarks are shortcuts, not a container.** Their rows sit under the section header like any
  section's rows, without a Group's guide line or fold chevron, and keep the user's order.
- **Each level starts under its parent's text.** A section's rows start where its header's text does;
  a Group's children start where the Group's name does, with the guide line under the Group's
  chevron.
- **One selected row.** Selecting a Session highlights the row that was clicked. Its twin (the same
  Session in the other section) shows only the quieter "current" mark (`--hover` fill), so two rows
  are never both "selected".
- **Ungrouped Sessions get a place**: they come first in SESSIONS, before the Groups (or under an
  "Ungrouped" label when Groups exist), never after the last Group where they read as its children.
- Group nesting therefore steps one Group label (42px) per level, with a 1px `--line` guide, so
  depth stays legible past two levels.

**Rows.**

- A bookmarked Session keeps its place in its Group too (Q4); that row carries a small star.
- Machine badge only for remote Machines; local Sessions show none.
- A Session row shows an amber count when something in it needs the user; nothing otherwise.
- The Machines section stays at the bottom and folds by default once more than one Machine exists.

## 8. Decisions where the review disagreed

| # | Question | Positions | Decision |
|---|---|---|---|
| D1 | Row height | IA 26px · visual 28 or 32px · platform ≥ 28px for drag targets | **28px**, the same as level 1 |
| D2 | Status words | IA and visual: words only for exceptions · platform: keep words for accessibility | **Only INPUT** keeps a word; other states get a distinct shape plus an `aria-label` |
| D3 | Idle mark | platform: a hollow ring · IA and visual: nothing | **Nothing**; idle is the default and the slot keeps titles aligned |
| D4 | Selection style | visual (1): neutral fill, because `--accent` #7c8cff and `--blue` #5b9dff read alike · visual (2): accent fill and a bar | **Neutral** `--active` fill and weight 600, so "selected" never looks like "working" |
| D5 | Grouping | IA (1) and visual: keep Workspaces · IA (2): a flat, status-sorted view by default | **Keep Workspaces**, sorted inside by status at settle points; no status-flat view for now (Q1) |
| D6 | Folding | IA (2): auto-fold quiet Workspaces · platform: never hide blocked work, no accordion | **User-controlled fold**, persisted; idle Panes and shells are always folded; nothing urgent is ever hidden |
| D7 | Board entry | IA: a [Sessions \| Board] switcher or a toolbar button · visual: a nav row with a chevron, or the footer | **Toolbar button** in the titlebar cluster: it is visible in focus mode too and cannot be read as a list header |
| D8 | Dimming | visual: lighter `--fg-3` and opacity · platform: never below 4.5:1 | **Platform**: measured (§3.5); fix the tokens, drop the opacity |

## 9. Product owner decisions (2026-10-07)

- **Q1. A flat, status-sorted level 2?** No, not now. ⌘J, the Board and the in-Workspace status
  order cover the loop; a second view would duplicate the Board and add a toggle. Revisit if the
  user still scans the column after the compact rows ship.
- **Q2. The Board's name and shortcut?** "Board", ⇧⌘D. "Dashboard" promises read-only metrics,
  while the Board is a Kanban to act from. ⌘D stays free because terminals (iTerm) use it to split a
  pane.
- **Q3. Long-running shell commands?** Shown as a normal quiet row, not folded, with no status mark
  (§7.1). herdr gives shells no status, so the app shows that the process runs without claiming
  how it is doing.
- **Q4. A bookmarked Session in its Group too?** Yes, as `CONTEXT.md` defines a Bookmark
  (independent of its Group): Groups stay complete and unbookmarking never moves a Session. Only
  the clicked row is "selected"; the Group row carries a star (§7.3).
