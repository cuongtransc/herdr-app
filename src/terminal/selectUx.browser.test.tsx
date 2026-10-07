import "@xterm/xterm/css/xterm.css";
import "../styles.css";
import { Terminal } from "@xterm/xterm";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "vitest/browser";
import { Toasts } from "../ui/Toast";
import { applySelectUx, DRAG_HINT } from "./selectUx";

// Lets act() flush React updates without the "not configured to support act" warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writeText = vi.hoisted(() => vi.fn((_: string) => Promise.resolve()));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText }));

// What herdr turns on: button-event mouse tracking with SGR reports.
const MOUSE_ON = "\x1b[?1002h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1002l\x1b[?1006l";

let host: HTMLDivElement;
let term: Terminal;
let stop: () => void;
const sent: string[] = [];

const write = (data: string) => new Promise<void>((r) => term.write(data, r));

/** Viewport point at the middle of 0-based cell (col, row); a drag selects up to, not including, its end cell. */
function cell(col: number, row: number) {
  const r = host.querySelector(".xterm-screen")!.getBoundingClientRect();
  const w = r.width / term.cols;
  const h = r.height / term.rows;
  return { x: r.left + (col + 0.5) * w, y: r.top + (row + 0.5) * h };
}

const toasts = () => [...document.querySelectorAll(".toast")].map((t) => t.textContent);

beforeAll(async () => {
  const toastRoot = document.createElement("div");
  document.body.appendChild(toastRoot);
  act(() => createRoot(toastRoot).render(<Toasts />));
  const lens = document.createElement("div");
  lens.className = "term-lens";
  lens.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column";
  host = document.createElement("div");
  host.className = "term-host";
  lens.appendChild(host);
  document.body.appendChild(lens);
  localStorage.clear();
  term = new Terminal({ cols: 40, rows: 6, macOptionClickForcesSelection: true });
  term.open(host);
  term.onData((d) => sent.push(d));
  stop = applySelectUx(host, term);
  await write("hello world\r\nsecond line");
});

afterAll(() => {
  stop();
  term.dispose();
});

beforeEach(async () => {
  writeText.mockClear();
  sent.length = 0;
  term.clearSelection();
  await write(MOUSE_OFF);
});

describe("selecting in a terminal (real Chrome, real mouse)", () => {
  it("hints the Option drag when a plain drag goes to the program", async () => {
    await write(MOUSE_ON);
    await commands.drag(cell(0, 0), cell(5, 0), false);
    expect(sent.join("")).toMatch(/\x1b\[<32;\d+;\d+M/); // drag reports went to the program
    expect(term.getSelection()).toBe("");
    await expect.poll(toasts).toContain(DRAG_HINT);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies an Option drag the moment the mouse is released", async () => {
    await write(MOUSE_ON);
    await commands.drag(cell(0, 0), cell(5, 0), true);
    const released = performance.now();
    await expect.poll(() => writeText.mock.calls.length, { timeout: 1000, interval: 5 }).toBe(1);
    expect(performance.now() - released).toBeLessThan(100);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(sent.join("")).not.toMatch(/\x1b\[</); // nothing reached the program
    await expect.poll(toasts).toContain("Copied 5 characters");
  });

  it("copies a double-clicked word, without mouse reporting and with Option under it", async () => {
    await commands.doubleClick(cell(7, 0), false);
    await expect.poll(() => writeText.mock.lastCall?.[0]).toBe("world");
    await write(MOUSE_ON);
    await commands.doubleClick(cell(1, 1), true);
    await expect.poll(() => writeText.mock.lastCall?.[0]).toBe("second");
  });

  it("does not copy again on a click that leaves the selection in place", async () => {
    await commands.drag(cell(0, 0), cell(5, 0), false);
    await expect.poll(() => writeText.mock.calls.length).toBe(1);
    await write(MOUSE_ON);
    await commands.drag(cell(10, 1), cell(10, 1), false);
    await new Promise((r) => setTimeout(r, 100));
    expect(writeText).toHaveBeenCalledOnce();
  });

  it("shows one copy toast for a run of copies", async () => {
    await commands.drag(cell(0, 0), cell(5, 0), false);
    await commands.drag(cell(0, 1), cell(6, 1), false);
    await expect.poll(toasts).toContain("Copied 6 characters");
    expect(toasts().filter((t) => t?.startsWith("Copied"))).toHaveLength(1);
  });

  it("shows the text cursor while Option is held over a terminal in mouse mode", async () => {
    await write(MOUSE_ON);
    const at = cell(3, 0);
    await commands.hover(at);
    const cursor = () => getComputedStyle(document.elementFromPoint(at.x, at.y)!).cursor;
    expect(cursor()).toBe("default");
    await commands.key("Alt", true);
    expect(cursor()).toBe("text");
    await commands.key("Alt", false);
    expect(cursor()).toBe("default");
  });
});
