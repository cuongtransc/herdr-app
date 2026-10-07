import "@xterm/xterm/css/xterm.css";
import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it } from "vitest";
import { TERM_MIN_CONTRAST, TERM_THEME, TERM_THEME_LIGHT } from "./theme";

let term: Terminal | undefined;
afterEach(() => {
  term?.dispose();
  document.body.innerHTML = "";
});

function rgb(css: string): [number, number, number] {
  const m = css.match(/\d+(\.\d+)?/g);
  if (!m) throw new Error(`not a colour: ${css}`);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
function hexRgb(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Renders one line per sample with the app's options and returns the drawn span for each label. */
async function render(theme: typeof TERM_THEME, lines: string[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  term = new Terminal({ cols: 40, rows: lines.length + 1, theme, minimumContrastRatio: TERM_MIN_CONTRAST });
  term.open(host);
  await new Promise<void>((r) => term!.write(lines.join("\r\n"), r));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return (label: string) => {
    const span = [...host.querySelectorAll(".xterm-rows span")].find((s) => s.textContent?.includes(label));
    if (!span) throw new Error(`no span for ${label}`);
    return span as HTMLElement;
  };
}

const SAMPLES = [
  ["white", "\x1b[37mwhite\x1b[0m"],
  ["brightWhite", "\x1b[97mbrightWhite\x1b[0m"],
  ["grey250", "\x1b[38;5;250mgrey250\x1b[0m"],
  ["brightBlack", "\x1b[90mbrightBlack\x1b[0m"],
  ["truecolor", "\x1b[38;2;240;240;240mtruecolor\x1b[0m"],
] as const;

describe.each([
  ["light", TERM_THEME_LIGHT],
  ["dark", TERM_THEME],
])("%s terminal, as drawn in Chrome", (_, theme) => {
  it.each(SAMPLES.map(([label]) => label))("%s reads at 4.5:1 or more", async (label) => {
    const span = await render(theme, SAMPLES.map(([, line]) => line));
    const fg = rgb(getComputedStyle(span(label)).color);
    expect(contrast(fg, hexRgb(theme.background!))).toBeGreaterThanOrEqual(4.5);
  });
});

it("keeps a light background a program paints, and keeps its text readable on it", async () => {
  const span = await render(TERM_THEME_LIGHT, ["\x1b[30;47mon white\x1b[0m"]);
  const s = getComputedStyle(span("on white"));
  expect(rgb(s.backgroundColor)).toEqual(hexRgb(TERM_THEME_LIGHT.white!));
  expect(contrast(rgb(s.color), rgb(s.backgroundColor))).toBeGreaterThanOrEqual(4.5);
});
