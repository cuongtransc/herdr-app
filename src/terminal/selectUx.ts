import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Terminal } from "@xterm/xterm";
import { dismissToast, showToast } from "../ui/Toast";
import { COPY_NOTICE_MS, createCopyNotice } from "./copyNotice";
import { applyCopyOnSelect } from "./copyOnSelect";
import { applyDragHint, applyOptionCursor } from "./selectHint";

export const DRAG_HINT = "Hold ⌥ while dragging to select text";

const notifyCopied = createCopyNotice((text) => showToast(text, { alert: false, ms: COPY_NOTICE_MS }), dismissToast);

/** Writes the clipboard and confirms it with a toast; `what` names the source in the error log. */
export function copyText(text: string, what: string): void {
  writeText(text).then(
    () => notifyCopied(text),
    (e) => console.error(`${what} copy failed`, e),
  );
}

/**
 * How selecting works in a terminal shown in `host`: copy on release, the Option-drag hint when a
 * plain drag goes to the program, and the text cursor while Option is held. Returns a disposer.
 */
export function applySelectUx(host: HTMLElement, term: Terminal): () => void {
  const stops = [
    applyCopyOnSelect(host, term, (text) => copyText(text, "selection")),
    applyDragHint(
      host,
      () => term.modes.mouseTrackingMode !== "none",
      () => void showToast(DRAG_HINT, { alert: false }),
    ),
    applyOptionCursor(host),
  ];
  return () => stops.forEach((stop) => stop());
}
