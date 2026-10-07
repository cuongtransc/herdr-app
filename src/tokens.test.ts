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

describe.each([
  ["dark", dark],
  ["light", light],
])("%s theme", (_, t) => {
  it.each(["--fg", "--fg-2", "--fg-3", "--amber-text", "--green-text"])("%s reads at 4.5:1 on the base surfaces", (fg) => {
    for (const bg of ["--surface-0", "--surface-1"]) {
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
