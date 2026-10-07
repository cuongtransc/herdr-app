/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/design/ui-ux-guidelines.md §3.5: text stays at 4.5:1 or more against the surfaces it sits on.
// Read from disk: the test environment hands CSS imports over empty, `?raw` included.
const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  return css.slice(start, css.indexOf("\n}", start));
}

function tokens(...blocks: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks) for (const m of b.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const dark = tokens(block(":root"));
const light = tokens(block(":root"), block(':root[data-theme="light"]'));

function hex(t: Record<string, string>, name: string): string {
  let v = t[name];
  for (let i = 0; v?.startsWith("var("); i++) {
    if (i > 5) throw new Error(`${name} does not resolve`);
    v = t[v.slice(4, -1).trim()];
  }
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a #rrggbb colour: ${v}`);
  return v;
}

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every token used as a text colour; a new one belongs here. */
const TEXT = [
  "--fg", "--fg-2", "--fg-3", "--accent", "--err", "--err-fg", "--diff-del", "--diff-add",
  "--amber-text", "--green-text", "--blue-text",
  "--hl-fg", "--hl-comment", "--hl-keyword", "--hl-string", "--hl-number", "--hl-title", "--hl-type", "--hl-attr", "--hl-meta",
];

/** The opaque surfaces text sits on; --surface-3 (toasts, hover) is the darkest in light, lightest in dark. */
const SURFACES = ["--surface-0", "--surface-1", "--surface-2", "--surface-3", "--surface-code"];

describe.each([
  ["dark", dark],
  ["light", light],
])("%s theme", (_, t) => {
  it.each(TEXT)("%s reads at 4.5:1 on every surface", (fg) => {
    for (const bg of SURFACES) {
      expect(contrast(hex(t, fg), hex(t, bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("idle grey is the quiet text colour, not a dimmer one", () => {
    expect(hex(t, "--grey")).toBe(hex(t, "--fg-3"));
  });
});

it("light raised surfaces differ from the window background", () => {
  expect(hex(light, "--surface-2")).not.toBe(hex(light, "--surface-0"));
});

it("stopped and offline sessions are quiet by colour, not by opacity", () => {
  const rules = css.match(/\.session\.(offline|stopped)[^{]*\{[^}]*\}/g) ?? [];
  expect(rules.length).toBeGreaterThan(0);
  for (const r of rules) expect(r, r).not.toMatch(/opacity/);
});

it("text takes the -text variant of a mark colour; only icons use the mark colour itself", () => {
  const icons = new Set([".project-row .mark-done", ".agent-card .mark-done"]);
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, , body]) => /(^|[;\s])color:\s*var\(--(amber|green|blue)\)/.test(body));
  for (const [, selector] of rules) expect(icons.has(selector.trim()), selector.trim()).toBe(true);
});
