import type { Terminal } from "@xterm/xterm";

/**
 * Copies a selection the moment the mouse is released (Option+drag, double-click), so no Cmd+C is
 * needed. Only a selection that changed during a press in `host` is copied: a drag writes the
 * clipboard once, and a click that leaves an old selection in place does not copy it again.
 * Returns a disposer.
 */
export function applyCopyOnSelect(host: HTMLElement, term: Terminal, write: (text: string) => void): () => void {
  let pressed = false;
  let changed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onDown = () => {
    pressed = true;
    changed = false;
  };
  const sub = term.onSelectionChange(() => {
    if (pressed) changed = true;
  });
  const onUp = () => {
    if (!pressed) return;
    // Decide after xterm's own mouseup handler, which runs later in this dispatch and is where it
    // reports the finished selection.
    clearTimeout(timer);
    timer = setTimeout(() => {
      pressed = false;
      const text = changed ? term.getSelection() : "";
      if (text) write(text);
    }, 0);
  };
  host.addEventListener("mousedown", onDown, true);
  window.addEventListener("mouseup", onUp, true);
  return () => {
    clearTimeout(timer);
    sub.dispose();
    host.removeEventListener("mousedown", onDown, true);
    window.removeEventListener("mouseup", onUp, true);
  };
}
