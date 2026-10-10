# Rebindable shortcuts

Date: 2026-10-10
Status: approved design, pending implementation plan

## Goal

The app's global keyboard shortcuts can be changed in Settings → **Shortcuts**, and a new
**Toggle Files panel** shortcut (⌘E) shows and hides the Files panel. Today every shortcut is a
literal check in one `keydown` listener (`src/App.tsx:185-243`), and about a dozen tooltips and
hints repeat the keys as text.

## Scope

In:
- The global shortcuts below, one key per action, rebindable or set to None.
- The new Toggle Files panel action on ⌘E, replacing ⌘E's "focus the Files tree".
- Every hint in the UI that names one of these keys follows the current binding.

Out (stay fixed):
- Contextual keys: ⌘F / ⌘G / ⇧⌘G find and ⌘R reload in the File viewer and the Files panel, the
  Composer's keys, the Triage HUD's and dialogs' own keys (Esc, arrows, Enter).
- ⌘, (Settings), which is a macOS menu accelerator (`src-tauri/src/lib.rs:150`).
- Keys without ⌘ (see Constraints).

## Actions

| id | Label | Default |
|---|---|---|
| `jump` | Jump to pane | ⌘K |
| `triage.next` | Next Blocked or Review | ⌘J |
| `triage.prev` | Previous Blocked or Review | ⇧⌘J |
| `board` | Agent Board | ⇧⌘D |
| `layout.sidebar` | Toggle sidebar | ⌘B |
| `layout.focus` | Focus layout | ⇧⌘B |
| `tab.new` | New tab | ⌘T |
| `files.toggle` | Toggle Files panel | ⌘E |
| `files.goto` | Go to file | ⌘P |
| `item.remove` | Remove Open item | ⌘W |
| `item.prev` | Previous Open item | ⇧⌘[ |
| `item.next` | Next Open item | ⇧⌘] |
| `font.bigger` | Bigger font | ⌘= |
| `font.smaller` | Smaller font | ⌘− |
| `font.reset` | Default font size | ⌘0 |

Each action's behaviour is what `App.tsx` does today for its key, with two changes:

- **`files.toggle`.** Shown means not collapsed and not hidden by the Focus layout. When the
  panel is shown, the action collapses it. Otherwise it leaves the Focus layout if needed, expands
  the panel and focuses the Files tree (today's `focusTree`), so the keyboard can walk the tree
  at once. No separate "focus Files" action.
- **`font.bigger`.** While bound to ⌘=, it also takes ⇧⌘= (⌘+), as `fontZoomKey` does today. No
  other action has a second key.

`jump` also drives the Agent Board's "focus search" key (`AgentDashboard.tsx:103`) and its key
hint, so rebinding Jump moves both.

## Chords

A chord is ⌘ plus any of ⇧ ⌥ ⌃, plus one physical key, stored as
`{ code, shift, alt, ctrl }`, with `code` being `KeyboardEvent.code` (`KeyE`, `BracketLeft`,
`Equal`, `Digit0`). Matching uses `code`, not `key`: Vietnamese input methods (EVKey, Unikey) and
other layouts change `key`, never `code`. A chord is displayed in macOS order, ⌃⌥⇧⌘, then the
key (`⇧⌘[`, `⌘E`, `⌘=`, `⌘−`).

## Constraints

A chord is refused, with the reason shown, when:

- **It has no ⌘: "Include ⌘".** The Terminal lens passes only ⌘ chords to the app
  (`src/terminal/keyHandler.ts:12`); any other chord goes to the agent in the Terminal, where
  ⌃B, ⌥F and the like belong to tmux and readline.
- **It is reserved: "Reserved by macOS" or "Reserved by Herdr: Find".**
  - macOS: ⌘Q, ⌘H, ⌥⌘H, ⌘M, ⌘Tab, ⌘Space, ⌘`, ⌘C, ⌘V, ⌘X, ⌘A, ⌘Z, ⇧⌘Z.
  - Herdr: ⌘, (Settings), ⌘F (Find), ⌘G / ⇧⌘G (Find next / previous), ⌘R (Reload).
- **It is a modifier alone.** Recording waits for a non-modifier key.

A chord already bound to another action is not refused: Settings says
"⌘K is used by Jump to pane" with a **Replace** button. Replace sets the other action to None and
gives this one the chord; doing nothing changes nothing.

## Storage

`herdr-app:settings` gains `shortcuts: { [id]: Chord | null }`, holding only the actions changed
from their defaults; `null` means None. Unknown ids, malformed chords, and chords that break the
constraints are dropped on load, so those actions fall back to their defaults. If two stored
entries end up with the same chord, the later action in the table loses its chord on load.

## Code

`src/shortcuts/`:

- `chord.ts` (pure): `chordOf(e)` builds a chord from a `KeyboardEvent` (null for a modifier
  alone); `sameChord`; `formatChord`; `checkChord(chord, bindings, id)`, which returns `ok`,
  `{ refused: reason }` or `{ usedBy: id }`.
- `actions.ts`: the table above, as `{ id, label, default }`, in display order.
- `store.ts`: a zustand store over `shortcuts`, merged into `herdr-app:settings` as
  `hiddenFolders.ts` does. It holds `bindings: Record<id, Chord | null>`, `set(id, chord)`,
  `replace(id, chord)`, `reset(id)`, `resetAll()`, and `recording: boolean`.
- `useShortcutLabel(id)`: the formatted chord, or null when the action is None.
- `dispatch.ts`: `actionFor(e, bindings)` maps an event to an action id (with the ⌘+ rule for
  `font.bigger`).

`App.tsx` keeps one `keydown` listener. It does nothing while `recording`. Otherwise it maps the
event with `actionFor` and runs the action from a `run` table kept in `App.tsx`, because the
actions need its state (the palette's `setPaletteOpen`) and stores. Two rules carry over:

- An open dialog (`.overlay`) keeps its keys for every action that is blocked by one today
  (from `files.toggle` on). The ones that fire today regardless (`jump`, `triage.*`, `board`,
  `layout.*`, `tab.new`, `font.*`) keep doing so.
- A held key (`e.repeat`) does not run an action again, except `item.prev`, `item.next` and
  `font.*`, which repeat today. `jump` stops repeating: holding ⌘K today toggles the palette on
  and off.

**Hints that follow the binding**, each hidden when its action is None:

- `LayoutControls`: the sidebar, Focus, Board and triage tooltips and labels.
- `GoToFile`: the placeholder `Go to file…  ⌘P`.
- `TriageHud`: the key line.
- `App.tsx`: the empty state.
- `AgentDashboard`: the search key hint.
- `Settings`: the `Jump ⌘K` button, `New tab (⌘T) opens`, the font note `⌘+ / ⌘− / ⌘0`.
- The ui-map (`src/docs/uiMap.surfaces.ts`): text stays with the default keys, since it
  documents the defaults.

## Settings → Shortcuts

A new section, after Files. One row per action, in the table's order:

- The label, then a key button showing the chord, or `None` (muted).
- Clicking the key button records: it shows `Press keys…`, `recording` is set, and the next
  keydown on it decides:
  - **Esc** cancels.
  - **⌫** sets the action to None.
  - **A chord** is checked:
    - `ok`: saved.
    - refused: the reason shows under the row, and the key button keeps listening.
    - `usedBy`: the conflict line with **Replace** shows under the row.
  - Blur cancels.
- A row changed from its default has a reset button (↺) for that action.
- The footer has **Reset all**, disabled when nothing differs from the defaults.

While recording, the Settings dialog's Esc-to-close does not fire: Esc only cancels recording.

## Testing (TDD)

- `chord.ts`:
  - `chordOf` for letters, brackets, `Equal` / `Minus`, a modifier alone, and a key whose `key`
    is not ASCII but whose `code` is `KeyE`.
  - `formatChord` order.
  - `checkChord`: no ⌘, each reserved group, used by another action, the same action's own chord.
- Store:
  - Defaults.
  - Saving only changes, next to other settings.
  - Loading malformed or reserved entries and duplicates.
  - `replace` sets the other action to None.
  - `reset` and `resetAll`.
- Dispatch (`App.test.tsx`):
  - Each default key still does what it does today (existing tests keep passing).
  - A rebound key runs its action and the old key no longer does.
  - None disables an action.
  - Nothing runs while recording.
  - The overlay and repeat rules.
  - ⌘+ for `font.bigger`.
- `files.toggle`: collapses a shown panel; expands and focuses a collapsed one; leaves the Focus
  layout.
- Hints: rebinding `layout.sidebar` changes the LayoutControls tooltip; None hides it.
- Settings: record and save; Esc cancels without closing the dialog; ⌫ sets None; a refused
  chord; Replace; reset row; Reset all.
- `mise run ci`, then a numbered checklist for the user in Herdr Dev.
