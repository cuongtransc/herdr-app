import type { Chord } from "./chord";

export type ActionId =
  | "jump"
  | "triage.next"
  | "triage.prev"
  | "board"
  | "layout.sidebar"
  | "layout.focus"
  | "tabs.new"
  | "files.toggle"
  | "files.goto"
  | "item.remove"
  | "item.prev"
  | "item.next"
  | "font.bigger"
  | "font.smaller"
  | "font.reset";

const key = (code: string, shift = false): Chord => ({ code, shift, alt: false, ctrl: false });

/** Every Shortcut, in Settings' order; an earlier action wins a clash in stored settings. */
export const ACTIONS: readonly { id: ActionId; label: string; default: Chord }[] = [
  { id: "jump", label: "Jump to pane", default: key("KeyK") },
  { id: "triage.next", label: "Next Blocked or Review", default: key("KeyJ") },
  { id: "triage.prev", label: "Previous Blocked or Review", default: key("KeyJ", true) },
  { id: "board", label: "Agent Board", default: key("KeyD", true) },
  { id: "layout.sidebar", label: "Toggle sidebar", default: key("KeyB") },
  { id: "layout.focus", label: "Focus layout", default: key("KeyB", true) },
  { id: "tabs.new", label: "New tab", default: key("KeyT") },
  { id: "files.toggle", label: "Toggle Files panel", default: key("KeyE") },
  { id: "files.goto", label: "Go to file", default: key("KeyP") },
  { id: "item.remove", label: "Remove Open item", default: key("KeyW") },
  { id: "item.prev", label: "Previous Open item", default: key("BracketLeft", true) },
  { id: "item.next", label: "Next Open item", default: key("BracketRight", true) },
  { id: "font.bigger", label: "Bigger font", default: key("Equal") },
  { id: "font.smaller", label: "Smaller font", default: key("Minus") },
  { id: "font.reset", label: "Default font size", default: key("Digit0") },
];
