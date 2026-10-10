# Rebindable Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings → Shortcuts rebinds the app's 15 global ⌘ shortcuts, a new Toggle Files panel action takes ⌘E, and every key hint in the UI follows the current binding.

**Architecture:** `src/shortcuts/` holds pure chord helpers, the action table, a persisted zustand store and `actionFor(e, bindings)`. `App.tsx`'s one `keydown` listener maps events through `actionFor` to a `run` table. Hints read `useShortcutLabel(id)`, and Settings gets a recording UI over the store.

**Tech Stack:** React 19, TypeScript, zustand, vitest + Testing Library (jsdom), pnpm, `mise run ci`.

**Spec:** `docs/superpowers/specs/2026-10-10-rebindable-shortcuts-design.md`

## Global Constraints

- All new code lives in `src/shortcuts/` and is in TypeScript. No Rust changes.
- `type ActionId = "jump" | "triage.next" | "triage.prev" | "board" | "layout.sidebar" | "layout.focus" | "tab.new" | "files.toggle" | "files.goto" | "item.remove" | "item.prev" | "item.next" | "font.bigger" | "font.smaller" | "font.reset"`, exported from `src/shortcuts/actions.ts`.
- `interface Chord { code: string; shift: boolean; alt: boolean; ctrl: boolean }`, exported from `src/shortcuts/chord.ts`. ⌘ is implied: a `Chord` always means ⌘ is held. A recorded or stored chord without ⌘ never exists.
- Matching uses `KeyboardEvent.code`. When `code` is `""` (synthetic events in tests), `chordOf` derives it from `key`:
  - a single letter → `Key<Upper>`
  - a digit → `Digit<d>`
  - `[` / `{` → `BracketLeft`, `]` / `}` → `BracketRight`
  - `=` / `+` → `Equal`, `-` / `_` → `Minus`
  - `,` → `Comma`, `` ` `` → `Backquote`, `" "` → `Space`, `Tab` → `Tab`
- `formatChord` order: `⌃⌥⇧⌘` then the key label.
  - `KeyX` → `X`, `DigitN` → `N`
  - `BracketLeft` → `[`, `BracketRight` → `]`, `Equal` → `=`, `Minus` → `−` (U+2212)
  - `Comma` → `,`, `Backquote` → `` ` ``, `Space` → `Space`, `Tab` → `Tab`
  - any other code → the code itself
- Storage: key `shortcuts` inside the JSON object at localStorage `herdr-app:settings`, merged with the other keys (read-modify-write as `src/settings/hiddenFolders.ts` does). It holds only the actions that differ from their defaults (`Chord`, or `null` for None).
- User-facing copy, exact:
  - `"Include ⌘"`, `"Reserved by macOS"`, `"Reserved by Herdr: <name>"` (name is `Settings`, `Find`, `Find next`, `Find previous` or `Reload`)
  - `"<chord> is used by <label>"`, `Replace`, `Press keys…`, `None`, `Reset all`
- Any test that fires a shortcut keydown passes `code` when the key is not a letter or a digit.

## Review Focus

- A Vietnamese input method sends `key: "ê"` with `code: "KeyE"`: ⌘E must still toggle the Files panel (Task 1 test).
- A held ⌘K must not flicker the palette (Task 3 test).
- Recording a key inside Settings must not also fire that key's current action, and Esc must not close Settings (Task 3 and Task 5 tests).
- Stored JSON edited by hand or left over from an older build (unknown id, a `code` that is not a string, two actions on one chord) must load without throwing (Task 2 test).
- Rebinding Jump moves the Agent Board's search key too (Task 3 test).

---

### Task 1: Chord helpers

**Files:**
- Create: `src/shortcuts/chord.ts`
- Test: `src/shortcuts/chord.test.ts`

**Interfaces:**
- Produces:
  - `interface Chord { code: string; shift: boolean; alt: boolean; ctrl: boolean }`
  - `chordOf(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "shiftKey" | "altKey" | "ctrlKey">): Chord | "no-meta" | null`. `null` for a modifier alone (`Meta`, `Shift`, `Alt`, `Control`), `"no-meta"` when ⌘ is not held.
  - `sameChord(a: Chord | null, b: Chord | null): boolean`
  - `formatChord(c: Chord): string`
  - `reservedReason(c: Chord): string | null`. Returns `"Reserved by macOS"` or `"Reserved by Herdr: <name>"` for the spec's reserved list, null otherwise.
  - `isChord(v: unknown): v is Chord`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { chordOf, formatChord, isChord, reservedReason, sameChord, type Chord } from "./chord";

const ev = (key: string, code: string, mods: Partial<Record<"metaKey" | "shiftKey" | "altKey" | "ctrlKey", boolean>> = {}) => ({
  key, code, metaKey: true, shiftKey: false, altKey: false, ctrlKey: false, ...mods,
});
const c = (code: string, m: Partial<Chord> = {}): Chord => ({ code, shift: false, alt: false, ctrl: false, ...m });

describe("chordOf", () => {
  it("reads the physical key and the modifiers", () => {
    expect(chordOf(ev("e", "KeyE"))).toEqual(c("KeyE"));
    expect(chordOf(ev("{", "BracketLeft", { shiftKey: true }))).toEqual(c("BracketLeft", { shift: true }));
    expect(chordOf(ev("+", "Equal", { shiftKey: true }))).toEqual(c("Equal", { shift: true }));
    expect(chordOf(ev("e", "KeyE", { altKey: true, ctrlKey: true }))).toEqual(c("KeyE", { alt: true, ctrl: true }));
  });
  it("keeps the physical key when an input method changes the character", () => {
    expect(chordOf(ev("ê", "KeyE"))).toEqual(c("KeyE"));
  });
  it("derives the code from the key when the event has none", () => {
    expect(chordOf(ev("b", ""))).toEqual(c("KeyB"));
    expect(chordOf(ev("B", "", { shiftKey: true }))).toEqual(c("KeyB", { shift: true }));
    expect(chordOf(ev("0", ""))).toEqual(c("Digit0"));
    expect(chordOf(ev("]", ""))).toEqual(c("BracketRight"));
    expect(chordOf(ev("-", ""))).toEqual(c("Minus"));
  });
  it("waits for a key when only modifiers are down, and says when ⌘ is missing", () => {
    expect(chordOf(ev("Meta", "MetaLeft"))).toBeNull();
    expect(chordOf(ev("Shift", "ShiftLeft", { shiftKey: true }))).toBeNull();
    expect(chordOf(ev("b", "KeyB", { metaKey: false, ctrlKey: true }))).toBe("no-meta");
  });
});

describe("formatChord", () => {
  it("writes macOS order then the key", () => {
    expect(formatChord(c("KeyE"))).toBe("⌘E");
    expect(formatChord(c("BracketLeft", { shift: true }))).toBe("⇧⌘[");
    expect(formatChord(c("Minus"))).toBe("⌘−");
    expect(formatChord(c("Equal"))).toBe("⌘=");
    expect(formatChord(c("Digit0"))).toBe("⌘0");
    expect(formatChord(c("KeyK", { ctrl: true, alt: true, shift: true }))).toBe("⌃⌥⇧⌘K");
  });
});

describe("reservedReason", () => {
  it("refuses what macOS and Herdr's fixed keys own", () => {
    expect(reservedReason(c("KeyQ"))).toBe("Reserved by macOS");
    expect(reservedReason(c("KeyH", { alt: true }))).toBe("Reserved by macOS");
    expect(reservedReason(c("KeyZ", { shift: true }))).toBe("Reserved by macOS");
    expect(reservedReason(c("Space"))).toBe("Reserved by macOS");
    expect(reservedReason(c("Comma"))).toBe("Reserved by Herdr: Settings");
    expect(reservedReason(c("KeyF"))).toBe("Reserved by Herdr: Find");
    expect(reservedReason(c("KeyG"))).toBe("Reserved by Herdr: Find next");
    expect(reservedReason(c("KeyG", { shift: true }))).toBe("Reserved by Herdr: Find previous");
    expect(reservedReason(c("KeyR"))).toBe("Reserved by Herdr: Reload");
  });
  it("leaves the rest free, including other modifiers on a reserved key", () => {
    expect(reservedReason(c("KeyE"))).toBeNull();
    expect(reservedReason(c("KeyR", { shift: true }))).toBeNull();
    expect(reservedReason(c("KeyQ", { alt: true }))).toBeNull();
  });
});

describe("sameChord / isChord", () => {
  it("compares every field and checks stored shapes", () => {
    expect(sameChord(c("KeyE"), c("KeyE"))).toBe(true);
    expect(sameChord(c("KeyE"), c("KeyE", { shift: true }))).toBe(false);
    expect(sameChord(null, c("KeyE"))).toBe(false);
    expect(isChord(c("KeyE"))).toBe(true);
    expect(isChord({ code: 3, shift: false, alt: false, ctrl: false })).toBe(false);
    expect(isChord({ code: "KeyE" })).toBe(false);
    expect(isChord(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/shortcuts/chord.test.ts`
Expected: FAIL: cannot resolve `./chord`.

- [ ] **Step 3: Implement `src/shortcuts/chord.ts`**

The exports are listed under Interfaces. The reserved table is the spec's Constraints list, matched exactly on all four fields. ⌘Tab is `{ code: "Tab" }` and ⌘` is `{ code: "Backquote" }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/shortcuts/chord.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shortcuts/chord.ts src/shortcuts/chord.test.ts
git commit -m "feat(shortcuts): chord helpers"
```

---

### Task 2: Action table, store, dispatch lookup

**Files:**
- Create: `src/shortcuts/actions.ts`, `src/shortcuts/store.ts`, `src/shortcuts/dispatch.ts`
- Test: `src/shortcuts/store.test.ts`, `src/shortcuts/dispatch.test.ts`

**Interfaces:**
- Consumes (Task 1): `Chord`, `chordOf`, `sameChord`, `isChord`, `reservedReason`, `formatChord`.
- Produces:
  - `actions.ts`: `type ActionId` (Global Constraints), `ACTIONS: readonly { id: ActionId; label: string; default: Chord }[]`, in the spec's order with the spec's labels and defaults.
  - `store.ts`:
    - `type Bindings = Record<ActionId, Chord | null>`
    - `DEFAULT_BINDINGS: Bindings`
    - `loadBindings(): Bindings`
    - `useShortcuts`: zustand store `{ bindings: Bindings; recording: boolean; set(id, chord: Chord | null): void; replace(id, chord: Chord): void; reset(id): void; resetAll(): void; setRecording(on: boolean): void }`
    - `checkChord(chord: Chord, bindings: Bindings, id: ActionId): { ok: true } | { refused: string } | { usedBy: ActionId }`
    - `useShortcutLabel(id: ActionId): string | null`
  - `dispatch.ts`: `actionFor(e: KeyboardEvent-like, bindings: Bindings): ActionId | null`

Load rules (spec, Storage):
- Only entries whose id is in `ACTIONS` and whose value is `null` or an `isChord` with no `reservedReason` are taken.
- Entries are applied in `ACTIONS` order. An entry whose chord an earlier action already holds is dropped, and its action (the later one) keeps its default.
- After applying, a default chord that collides with an overridden one goes to None on the action later in the table.

`checkChord`: `reservedReason` first; then another action holding the same chord gives `usedBy`; the action's own current chord is `ok`.

`actionFor`: `chordOf(e)`; non-Chord → null; the first action whose binding `sameChord`s it. One extra rule: when `bindings["font.bigger"]` is `⌘=` (`{ code: "Equal" }`, no modifiers), `⇧⌘=` also maps to `font.bigger`.

- [ ] **Step 1: Write the failing tests**

`src/shortcuts/store.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ACTIONS } from "./actions";
import type { Chord } from "./chord";
import { checkChord, DEFAULT_BINDINGS, loadBindings, useShortcutLabel, useShortcuts } from "./store";

const KEY = "herdr-app:settings";
const c = (code: string, m: Partial<Chord> = {}): Chord => ({ code, shift: false, alt: false, ctrl: false, ...m });
const s = () => useShortcuts.getState();

beforeEach(() => {
  localStorage.clear();
  useShortcuts.setState({ bindings: loadBindings(), recording: false });
});

describe("shortcuts store", () => {
  it("defaults to the spec's keys", () => {
    expect(ACTIONS.map((a) => a.id)).toEqual([
      "jump", "triage.next", "triage.prev", "board", "layout.sidebar", "layout.focus", "tab.new",
      "files.toggle", "files.goto", "item.remove", "item.prev", "item.next", "font.bigger", "font.smaller", "font.reset",
    ]);
    expect(DEFAULT_BINDINGS["files.toggle"]).toEqual(c("KeyE"));
    expect(DEFAULT_BINDINGS["item.prev"]).toEqual(c("BracketLeft", { shift: true }));
    expect(DEFAULT_BINDINGS["font.smaller"]).toEqual(c("Minus"));
    expect(ACTIONS.find((a) => a.id === "item.remove")!.label).toBe("Remove Open item");
  });

  it("saves only what differs from the defaults, next to the other settings", () => {
    localStorage.setItem(KEY, JSON.stringify({ hiddenFolders: ["out"] }));
    s().set("files.toggle", c("KeyL"));
    s().set("board", null);
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.hiddenFolders).toEqual(["out"]);
    expect(saved.shortcuts).toEqual({ "files.toggle": c("KeyL"), board: null });
    s().set("files.toggle", c("KeyE"));
    expect(JSON.parse(localStorage.getItem(KEY)!).shortcuts).toEqual({ board: null });
    expect(loadBindings().board).toBeNull();
  });

  it("drops unknown ids, broken and reserved chords, and later duplicates on load", () => {
    localStorage.setItem(KEY, JSON.stringify({ shortcuts: {
      nope: c("KeyL"),
      board: { code: 7 },
      "tab.new": c("KeyQ"),
      "files.goto": c("KeyL"),
      "files.toggle": c("KeyL"),
      "layout.sidebar": c("KeyE"),
    } }));
    const b = loadBindings();
    expect(b.board).toEqual(DEFAULT_BINDINGS.board);
    expect(b["tab.new"]).toEqual(DEFAULT_BINDINGS["tab.new"]);
    // files.toggle comes before files.goto in the table: it keeps ⌘L, files.goto keeps its default.
    expect(b["files.toggle"]).toEqual(c("KeyL"));
    expect(b["files.goto"]).toEqual(DEFAULT_BINDINGS["files.goto"]);
    expect(b["layout.sidebar"]).toEqual(c("KeyE"));
    expect(Object.values(b).filter((x) => x?.code === "KeyE")).toHaveLength(1);
  });

  it("survives settings that are not JSON", () => {
    localStorage.setItem(KEY, "{");
    expect(loadBindings()).toEqual(DEFAULT_BINDINGS);
  });

  it("checks a chord: reserved, used by another action, or fine", () => {
    const b = DEFAULT_BINDINGS;
    expect(checkChord(c("KeyQ"), b, "files.toggle")).toEqual({ refused: "Reserved by macOS" });
    expect(checkChord(c("KeyK"), b, "files.toggle")).toEqual({ usedBy: "jump" });
    expect(checkChord(c("KeyE"), b, "files.toggle")).toEqual({ ok: true });
    expect(checkChord(c("KeyL"), b, "files.toggle")).toEqual({ ok: true });
  });

  it("replace moves the chord and leaves the other action on None", () => {
    s().replace("files.toggle", c("KeyK"));
    expect(s().bindings["files.toggle"]).toEqual(c("KeyK"));
    expect(s().bindings.jump).toBeNull();
    s().reset("jump");
    expect(s().bindings.jump).toEqual(c("KeyK"));
    expect(s().bindings["files.toggle"]).toBeNull();
    s().resetAll();
    expect(s().bindings).toEqual(DEFAULT_BINDINGS);
    expect(JSON.parse(localStorage.getItem(KEY)!).shortcuts).toEqual({});
  });

  it("labels an action by its binding, null for None", () => {
    const { result } = renderHook(() => useShortcutLabel("layout.sidebar"));
    expect(result.current).toBe("⌘B");
    act(() => s().set("layout.sidebar", c("KeyB", { alt: true })));
    expect(result.current).toBe("⌥⌘B");
    act(() => s().set("layout.sidebar", null));
    expect(result.current).toBeNull();
  });
});
```

`reset(id)` gives back the default. If another action holds that default, the other action goes to None, as with `replace`; the test above pins this.

`src/shortcuts/dispatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Chord } from "./chord";
import { actionFor } from "./dispatch";
import { DEFAULT_BINDINGS } from "./store";

const ev = (key: string, code: string, m: Partial<Record<"metaKey" | "shiftKey" | "altKey" | "ctrlKey", boolean>> = {}) =>
  ({ key, code, metaKey: true, shiftKey: false, altKey: false, ctrlKey: false, ...m }) as KeyboardEvent;
const c = (code: string, m: Partial<Chord> = {}): Chord => ({ code, shift: false, alt: false, ctrl: false, ...m });

describe("actionFor", () => {
  it("maps the default keys", () => {
    expect(actionFor(ev("k", "KeyK"), DEFAULT_BINDINGS)).toBe("jump");
    expect(actionFor(ev("J", "KeyJ", { shiftKey: true }), DEFAULT_BINDINGS)).toBe("triage.prev");
    expect(actionFor(ev("e", "KeyE"), DEFAULT_BINDINGS)).toBe("files.toggle");
    expect(actionFor(ev("ê", "KeyE"), DEFAULT_BINDINGS)).toBe("files.toggle");
    expect(actionFor(ev("}", "BracketRight", { shiftKey: true }), DEFAULT_BINDINGS)).toBe("item.next");
    expect(actionFor(ev("0", "Digit0"), DEFAULT_BINDINGS)).toBe("font.reset");
  });
  it("takes ⌘+ as Bigger font only while it is on ⌘=", () => {
    expect(actionFor(ev("+", "Equal", { shiftKey: true }), DEFAULT_BINDINGS)).toBe("font.bigger");
    const moved = { ...DEFAULT_BINDINGS, "font.bigger": c("KeyU") };
    expect(actionFor(ev("+", "Equal", { shiftKey: true }), moved)).toBeNull();
    expect(actionFor(ev("u", "KeyU"), moved)).toBe("font.bigger");
  });
  it("follows a rebinding and a None", () => {
    const b = { ...DEFAULT_BINDINGS, "files.toggle": c("KeyL"), jump: null };
    expect(actionFor(ev("e", "KeyE"), b)).toBeNull();
    expect(actionFor(ev("l", "KeyL"), b)).toBe("files.toggle");
    expect(actionFor(ev("k", "KeyK"), b)).toBeNull();
  });
  it("ignores keys without ⌘ and unbound chords", () => {
    expect(actionFor(ev("e", "KeyE", { metaKey: false }), DEFAULT_BINDINGS)).toBeNull();
    expect(actionFor(ev("e", "KeyE", { altKey: true }), DEFAULT_BINDINGS)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/shortcuts/store.test.ts src/shortcuts/dispatch.test.ts`
Expected: FAIL: cannot resolve `./store` / `./dispatch`.

- [ ] **Step 3: Implement `actions.ts`, `store.ts`, `dispatch.ts`**

Follow the signatures and rules under Interfaces. `store.ts` keeps `readRaw` and `save` local, as `src/settings/hiddenFolders.ts` does. It writes the diff against `DEFAULT_BINDINGS` (compared with `sameChord`) on every change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/shortcuts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shortcuts
git commit -m "feat(shortcuts): action table, persisted bindings and lookup"
```

---

### Task 3: Dispatch in App, Toggle Files panel, Board search key

**Files:**
- Modify: `src/App.tsx:184-247` (the `onKey` effect)
- Modify: `src/dashboard/AgentDashboard.tsx:102-106`
- Modify: `src/settings/store.ts`: delete `fontZoomKey`, `FontZoom` stays (`zoomFont` uses it)
- Modify: `src/settings/store.test.ts`: delete the `fontZoomKey` tests
- Test: `src/App.test.tsx`, `src/dashboard/AgentDashboard.test.tsx`

**Interfaces:**
- Consumes (Task 2): `actionFor`, `useShortcuts` (`bindings`, `recording`), `ActionId`.
- Produces: no new exports. Behaviour per the spec's Code section:
  - The listener returns at once while `useShortcuts.getState().recording`.
  - `const action = actionFor(e, bindings)`. On a match, `e.preventDefault()`. Then:
    - `e.repeat` returns unless the action is `item.prev`, `item.next` or `font.*`.
    - If a `.overlay` is open, return for `files.toggle`, `files.goto`, `item.remove`, `item.prev` and `item.next`.
    - Run the action.
  - Actions:
    - `jump`: toggle the palette unless `dashboardOpen`.
    - `font.*`: today's `zoomFont` path. Without a selected open pane it does nothing and calls no `preventDefault`, as today.
    - `files.toggle`: shown = `!collapsed && layout !== "focus"`. Shown → `setCollapsed(true)`. Not shown → leave Focus with `toggle("focus")` if in it, then `focusTree()`.
    - Every other action keeps today's body.
  - `AgentDashboard`: `actionFor(e, useShortcuts.getState().bindings) === "jump"` replaces the ⌘K test. The `<kbd>` hint renders `useShortcutLabel("jump")` in one `<kbd>`, and is hidden when null.

- [ ] **Step 1: Write the failing tests** (append to `src/App.test.tsx`; import `useShortcuts`, `loadBindings` from `./shortcuts/store`, and reset in the file's top-level `beforeEach`: `localStorage.clear(); useShortcuts.setState({ bindings: loadBindings(), recording: false })`)

Inside `describe("open files")`, replace the two `⌘E` tests with:

```ts
    it("⌘E leaves Focus and opens the Files panel with the tree focused", () => {
      useLayout.setState({ layout: "focus" });
      useFilesPanel.setState({ collapsed: false });
      render(<App />);
      fireEvent.keyDown(window, { key: "e", code: "KeyE", metaKey: true });
      expect(useLayout.getState().layout).toBe("normal");
      expect(useFilesPanel.getState().collapsed).toBe(false);
      expect(useFilesPanel.getState().focusTick).toBe(1);
    });

    it("⌘E opens a collapsed Files panel and collapses a shown one", () => {
      useFilesPanel.setState({ collapsed: true });
      render(<App />);
      fireEvent.keyDown(window, { key: "e", code: "KeyE", metaKey: true });
      expect(useFilesPanel.getState().collapsed).toBe(false);
      expect(useFilesPanel.getState().focusTick).toBe(1);
      fireEvent.keyDown(window, { key: "e", code: "KeyE", metaKey: true });
      expect(useFilesPanel.getState().collapsed).toBe(true);
      expect(useFilesPanel.getState().focusTick).toBe(1);
    });

    it("⌘E works whatever character an input method puts on the key", () => {
      useFilesPanel.setState({ collapsed: true });
      render(<App />);
      fireEvent.keyDown(window, { key: "ê", code: "KeyE", metaKey: true });
      expect(useFilesPanel.getState().collapsed).toBe(false);
    });
```

Add a new top-level `describe("rebound shortcuts")`:

```ts
  describe("rebound shortcuts", () => {
    const key = (k: string, code: string, m: Record<string, boolean> = {}) => fireEvent.keyDown(window, { key: k, code, metaKey: true, ...m });

    it("runs the action on its new key, and the old key does nothing", () => {
      useLayout.setState({ layout: "normal" });
      act(() => useShortcuts.getState().set("layout.sidebar", { code: "KeyL", shift: false, alt: false, ctrl: false }));
      render(<App />);
      key("b", "KeyB");
      expect(useLayout.getState().layout).toBe("normal");
      key("l", "KeyL");
      expect(useLayout.getState().layout).toBe("sidebar-hidden");
    });

    it("a None action has no key", () => {
      act(() => useShortcuts.getState().set("board", null));
      render(<App />);
      key("D", "KeyD", { shiftKey: true });
      expect(useApp.getState().dashboardOpen).toBe(false);
    });

    it("runs nothing while Settings records a key", () => {
      useLayout.setState({ layout: "normal" });
      act(() => useShortcuts.getState().setRecording(true));
      render(<App />);
      key("b", "KeyB");
      expect(useLayout.getState().layout).toBe("normal");
    });

    it("a held ⌘K opens the palette once", () => {
      render(<App />);
      key("k", "KeyK");
      key("k", "KeyK", { repeat: true });
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("leaves ⌘P to an open dialog but still toggles the sidebar over one", () => {
      useLayout.setState({ layout: "normal" });
      render(<App />);
      key("k", "KeyK");
      expect(document.querySelector(".overlay")).toBeTruthy();
      const before = useFilesPanel.getState().gotoTick;
      key("p", "KeyP");
      expect(useFilesPanel.getState().gotoTick).toBe(before);
      key("b", "KeyB");
      expect(useLayout.getState().layout).toBe("sidebar-hidden");
    });
  });
```

In `src/dashboard/AgentDashboard.test.tsx`, add next to the existing ⌘K test (reuse that file's render setup):

```ts
  it("focuses its search with the Jump key, rebound or not", () => {
    act(() => useShortcuts.getState().set("jump", { code: "KeyL", shift: false, alt: false, ctrl: false }));
    renderDashboard(); // the helper the existing ⌘K test uses
    const search = screen.getByRole("searchbox");
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: "k", code: "KeyK", metaKey: true });
    expect(document.activeElement).not.toBe(search);
    fireEvent.keyDown(window, { key: "l", code: "KeyL", metaKey: true });
    expect(document.activeElement).toBe(search);
  });
```

(If the existing test renders inline rather than through a helper, use the same render call it uses; the search box role and name are those the existing ⌘K test queries.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/App.test.tsx src/dashboard/AgentDashboard.test.tsx`
Expected: FAIL. The rebound key does nothing, ⌘E only expands, and the dashboard ignores ⌘L.

- [ ] **Step 3: Rewrite the `onKey` effect in `src/App.tsx`, update `AgentDashboard.tsx`, delete `fontZoomKey` and its tests**

`run` is a `Record<ActionId, (e: KeyboardEvent) => void>` built inside the effect, so it closes over `setPaletteOpen`. The `.overlay` and repeat rules are two `Set<ActionId>` constants next to it.

- [ ] **Step 4: Run tests to verify they pass, then the whole frontend suite**

Run: `pnpm vitest run src/App.test.tsx src/dashboard/AgentDashboard.test.tsx src/settings/store.test.ts`
Expected: PASS, including every existing shortcut test (⌘B, ⇧⌘B, ⌘J, ⇧⌘D, ⌘W, ⌘P, ⇧⌘], ⌘+/⌘−).
Run: `pnpm test > /tmp/shortcuts-t3.log 2>&1; echo $?`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/dashboard src/settings/store.ts src/settings/store.test.ts
git commit -m "feat(shortcuts): dispatch through the bindings; ⌘E toggles the Files panel"
```

---

### Task 4: Hints follow the binding

**Files:**
- Modify:
  - `src/main/LayoutControls.tsx:45,54-55,67-68`
  - `src/files/GoToFile.tsx:60`
  - `src/main/TriageHud.tsx:48`
  - `src/App.tsx:89`
  - `src/settings/Settings.tsx`: the `Jump ⌘K` hint at ~460, `New tab (⌘T) opens` at ~52, the note at ~67, the font note `⌘+ / ⌘− / ⌘0` at ~146
- Modify: `docs/guide/01-files.md` (⌘E now shows and hides the panel), `CONTEXT.md` table row "Files panel" (`⌘E focuses it` → `⌘E shows and hides it`), `src/docs/uiMap.surfaces.ts:32` (same wording)
- Test: `src/main/LayoutControls.test.tsx`, `src/files/GoToFile.test.tsx`, `src/settings/Settings.test.tsx`

**Interfaces:**
- Consumes (Task 2): `useShortcutLabel(id): string | null`.
- Produces: no exports. Copy rules:
  - A hint with a key in parentheses drops the parentheses when the label is null: `Hide sidebar (⌘B) · Focus (⇧⌘B)` → `Hide sidebar · Focus`.
  - `Go to file…  ⌘P` → `Go to file…` when null.
  - TriageHud shows `<kbd>{next}</kbd> next` and `<kbd>{prev}</kbd> previous`, each part only when bound.
  - The empty state reads `Pick an agent from the list, or press <kbd>{jump}</kbd> to jump to any pane.`, and only `Pick an agent from the list.` when Jump is None.
  - Settings: `Jump <kbd>{jump}</kbd>` (the whole hint hidden when None), `New tab ({tab}) opens`, the note `{tab} opens a tab…`. The font note becomes `{bigger} / {smaller} / {reset} size the font…`; a None key is left out, and the note is hidden when all three are None.

- [ ] **Step 1: Write the failing tests**

`src/main/LayoutControls.test.tsx` (use the file's existing render and setup):

```ts
  it("names the sidebar keys from the bindings, and none when unbound", () => {
    act(() => useShortcuts.getState().set("layout.sidebar", { code: "KeyL", shift: false, alt: false, ctrl: false }));
    renderControls(); // the file's existing render
    expect(screen.getByRole("button", { name: "Hide sidebar" }).getAttribute("title")).toBe("Hide sidebar (⌘L) · Focus (⇧⌘B)");
    act(() => {
      useShortcuts.getState().set("layout.sidebar", null);
      useShortcuts.getState().set("layout.focus", null);
    });
    expect(screen.getByRole("button", { name: "Hide sidebar" }).getAttribute("title")).toBe("Hide sidebar · Focus");
  });
```

`src/files/GoToFile.test.tsx`:

```ts
  it("shows the Go to file key in its placeholder, and none when unbound", () => {
    renderGoTo(); // the file's existing render
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toBe("Go to file…  ⌘P");
    act(() => useShortcuts.getState().set("files.goto", null));
    expect(screen.getByRole("combobox").getAttribute("placeholder")).toBe("Go to file…");
  });
```

`src/settings/Settings.test.tsx`:

```ts
  it("names the current keys in its hints", () => {
    act(() => useShortcuts.getState().set("tab.new", { code: "KeyN", shift: true, alt: false, ctrl: false }));
    render(<Settings />);
    expect(document.querySelector(".settings-hint kbd")!.textContent).toBe("⌘K");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("New tab (⇧⌘N) opens")).toBeTruthy();
  });
```

Each test file resets the store in `beforeEach`: `localStorage.clear(); useShortcuts.setState({ bindings: loadBindings(), recording: false })`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/main/LayoutControls.test.tsx src/files/GoToFile.test.tsx src/settings/Settings.test.tsx`
Expected: FAIL. The titles and placeholders still name the hard-coded keys.

- [ ] **Step 3: Replace each hard-coded key with `useShortcutLabel`, applying the copy rules; update the three docs lines**

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/main src/files src/settings src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src docs CONTEXT.md
git commit -m "feat(shortcuts): key hints follow the bindings"
```

---

### Task 5: Settings → Shortcuts

**Files:**
- Create: `src/settings/ShortcutsSettings.tsx`
- Modify: `src/settings/Settings.tsx` (add `{ id: "shortcuts", label: "Shortcuts", Body: ShortcutsSettings }` after `files` in `SECTIONS`)
- Modify: `src/styles.css` (rows, the key button, the recording state, the error and conflict lines; reuse `.setting-row`, `.btn btn-xs`, `.icon-btn`, `.note`, and the `--err-fg` colour that `.hidden-folder-error` uses)
- Test: `src/settings/Settings.test.tsx`

**Interfaces:**
- Consumes (Task 1–2): `useShortcuts`, `checkChord`, `chordOf`, `formatChord`, `ACTIONS`, `DEFAULT_BINDINGS`, `sameChord`.
- Produces: `ShortcutsSettings` component. DOM contract the tests rely on:
  - Per action, a key button with accessible name `"<label>: <chord or None>"` (e.g. `"Toggle Files panel: ⌘E"`). While recording, its text is `Press keys…` and its name is `"<label>: Press keys…"`.
  - Under a row, a refusal is a `role="alert"` with the reason. A conflict is a `role="alert"` with `"<chord> is used by <label>"` plus a button named `Replace`.
  - A changed row has a button named `"Reset <label>"`. The footer has a button named `Reset all`.
  - Recording: `onKeyDown` on the key button with `stopPropagation()` and `preventDefault()` for every key, so the dialog's Escape handler and the browser never see them.
    - `Escape` cancels.
    - `Backspace` / `Delete` set None.
    - `chordOf` null waits.
    - `"no-meta"` shows `Include ⌘` and keeps listening.
    - A chord goes through `checkChord`.
  - `setRecording(true)` on start, `false` on end and on unmount. Blur cancels.

- [ ] **Step 1: Write the failing test** (in `src/settings/Settings.test.tsx`, with the store reset in `beforeEach` as in Task 4)

```ts
describe("Settings → Shortcuts", () => {
  const open = () => {
    render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Shortcuts" }));
  };
  const keyBtn = (name: RegExp) => screen.getByRole("button", { name });

  it("lists every action with its key", () => {
    open();
    expect(keyBtn(/^Toggle Files panel: ⌘E$/)).toBeTruthy();
    expect(keyBtn(/^Previous Open item: ⇧⌘\[$/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Reset all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("records a new key, and stops the app from acting on it meanwhile", () => {
    open();
    fireEvent.click(keyBtn(/^Toggle Files panel/));
    expect(keyBtn(/^Toggle Files panel: Press keys…$/)).toBeTruthy();
    expect(useShortcuts.getState().recording).toBe(true);
    fireEvent.keyDown(keyBtn(/^Toggle Files panel/), { key: "Meta", code: "MetaLeft", metaKey: true });
    expect(useShortcuts.getState().recording).toBe(true);
    fireEvent.keyDown(keyBtn(/^Toggle Files panel/), { key: "l", code: "KeyL", metaKey: true });
    expect(useShortcuts.getState().bindings["files.toggle"]).toEqual({ code: "KeyL", shift: false, alt: false, ctrl: false });
    expect(useShortcuts.getState().recording).toBe(false);
    expect(keyBtn(/^Toggle Files panel: ⌘L$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset Toggle Files panel" }));
    expect(keyBtn(/^Toggle Files panel: ⌘E$/)).toBeTruthy();
  });

  it("Esc cancels recording without closing Settings; ⌫ sets None", () => {
    open();
    fireEvent.click(keyBtn(/^Agent Board/));
    fireEvent.keyDown(keyBtn(/^Agent Board/), { key: "Escape", code: "Escape" });
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(keyBtn(/^Agent Board: ⇧⌘D$/)).toBeTruthy();
    fireEvent.click(keyBtn(/^Agent Board/));
    fireEvent.keyDown(keyBtn(/^Agent Board/), { key: "Backspace", code: "Backspace" });
    expect(keyBtn(/^Agent Board: None$/)).toBeTruthy();
    expect(useShortcuts.getState().bindings.board).toBeNull();
  });

  it("refuses a key without ⌘ or a reserved one and keeps listening", () => {
    open();
    fireEvent.click(keyBtn(/^Go to file/));
    fireEvent.keyDown(keyBtn(/^Go to file/), { key: "p", code: "KeyP", ctrlKey: true });
    expect(screen.getByRole("alert").textContent).toBe("Include ⌘");
    fireEvent.keyDown(keyBtn(/^Go to file/), { key: "q", code: "KeyQ", metaKey: true });
    expect(screen.getByRole("alert").textContent).toBe("Reserved by macOS");
    expect(keyBtn(/^Go to file: Press keys…$/)).toBeTruthy();
    expect(useShortcuts.getState().bindings["files.goto"]).toEqual({ code: "KeyP", shift: false, alt: false, ctrl: false });
  });

  it("offers Replace for a key another action uses", () => {
    open();
    fireEvent.click(keyBtn(/^Toggle Files panel/));
    fireEvent.keyDown(keyBtn(/^Toggle Files panel/), { key: "k", code: "KeyK", metaKey: true });
    expect(screen.getByRole("alert").textContent).toContain("⌘K is used by Jump to pane");
    expect(useShortcuts.getState().bindings["files.toggle"]).toEqual({ code: "KeyE", shift: false, alt: false, ctrl: false });
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(keyBtn(/^Toggle Files panel: ⌘K$/)).toBeTruthy();
    expect(keyBtn(/^Jump to pane: None$/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(keyBtn(/^Jump to pane: ⌘K$/)).toBeTruthy();
    expect(keyBtn(/^Toggle Files panel: ⌘E$/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/settings/Settings.test.tsx`
Expected: FAIL: no tab named Shortcuts.

- [ ] **Step 3: Implement `ShortcutsSettings`, register the section, add CSS**

Every text colour meets 4.5:1 in both themes: reuse the existing tokens (`--fg`, `--fg-3`, `--err-fg`) and no new colours.

- [ ] **Step 4: Run the whole gate**

Run: `mise run ci > /tmp/shortcuts-ci.log 2>&1; echo $?`
Expected: `0`; `grep -E "Tests |test result" /tmp/shortcuts-ci.log` shows no failures.

- [ ] **Step 5: Commit**

```bash
git add src/settings src/styles.css
git commit -m "feat(shortcuts): Settings → Shortcuts records, refuses and replaces keys"
```
