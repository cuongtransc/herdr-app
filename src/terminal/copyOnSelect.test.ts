import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCopyOnSelect } from "./copyOnSelect";

// jsdom has no matchMedia; xterm's renderer watches the device pixel ratio through it.
window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;

afterEach(() => vi.useRealTimers());

async function setup(text: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const term = new Terminal({ cols: 40, rows: 5 });
  // Selection lives in the renderer side, which exists only once the terminal is opened.
  term.open(host);
  await new Promise<void>((r) => term.write(text, r));
  vi.useFakeTimers();
  const write = vi.fn();
  const dispose = applyCopyOnSelect(host, term, write);
  return { host, term, write, dispose };
}

const down = (el: HTMLElement) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
const up = () => window.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));

describe("applyCopyOnSelect", () => {
  it("copies the selection as soon as the mouse is released, once", async () => {
    const { host, term, write } = await setup("hello world");
    down(host);
    term.select(0, 0, 3);
    term.select(0, 0, 5);
    expect(write).not.toHaveBeenCalled();
    up();
    vi.advanceTimersByTime(0);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith("hello");
    term.dispose();
  });

  it("copies a selection xterm reports only from its own mouseup, after ours", async () => {
    const { host, term, write } = await setup("hello world");
    down(host);
    up();
    term.select(0, 0, 5);
    vi.advanceTimersByTime(0);
    expect(write).toHaveBeenCalledWith("hello");
    term.dispose();
  });

  it("does not copy again when a press leaves an old selection unchanged", async () => {
    const { host, term, write } = await setup("hello");
    term.select(0, 0, 5);
    down(host);
    up();
    vi.advanceTimersByTime(0);
    expect(write).not.toHaveBeenCalled();
    term.dispose();
  });

  it("does not copy a cleared selection or one made without a press in this terminal", async () => {
    const { host, term, write } = await setup("hello");
    down(host);
    term.select(0, 0, 5);
    term.clearSelection();
    up();
    vi.advanceTimersByTime(0);
    term.select(0, 0, 5);
    up();
    vi.advanceTimersByTime(0);
    expect(write).not.toHaveBeenCalled();
    term.dispose();
  });

  it("stops copying once disposed", async () => {
    const { host, term, write, dispose } = await setup("hello");
    down(host);
    term.select(0, 0, 5);
    dispose();
    up();
    vi.advanceTimersByTime(0);
    expect(write).not.toHaveBeenCalled();
    term.dispose();
  });
});
