import "../styles.css";
import { expect, it } from "vitest";

// Radii come from the scale only (docs/design/ui-ux-guidelines.md §3.4): --r-sm, --r-md, --r-lg, 999.
it("rounds the small button with --r-sm, like every other button", () => {
  document.body.innerHTML = '<button class="btn">Cancel</button><button class="btn btn-xs">Show screen</button>';
  const [btn, xs] = [...document.querySelectorAll("button")].map((b) => getComputedStyle(b).borderTopLeftRadius);
  expect(xs).toBe("6px");
  expect(xs).toBe(btn);
});

it("uses no radius off the scale anywhere in the stylesheet", () => {
  const off: string[] = [];
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSStyleRule)) continue;
      for (const prop of ["border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius"]) {
        if (/(^|\s)[357]px\b/.test(rule.style.getPropertyValue(prop))) off.push(`${rule.selectorText}: ${prop}`);
      }
    }
  }
  expect(off).toEqual([]);
});
