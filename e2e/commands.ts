import type { BrowserCommand } from "vitest/node";

type Point = { x: number; y: number };

/** The test runs in an iframe; Playwright's mouse speaks page coordinates. */
async function toPage(ctx: Parameters<BrowserCommand<[]>>[0], p: Point): Promise<Point> {
  const box = await ctx.iframe.owner().boundingBox();
  if (!box) throw new Error("test iframe has no box");
  return { x: box.x + p.x, y: box.y + p.y };
}

/** A real (trusted) mouse drag from `from` to `to`, optionally with Option held. */
export const drag: BrowserCommand<[from: Point, to: Point, alt: boolean]> = async (ctx, from, to, alt) => {
  const a = await toPage(ctx, from);
  const b = await toPage(ctx, to);
  if (alt) await ctx.page.keyboard.down("Alt");
  await ctx.page.mouse.move(a.x, a.y);
  await ctx.page.mouse.down();
  await ctx.page.mouse.move(b.x, b.y, { steps: 8 });
  await ctx.page.mouse.up();
  if (alt) await ctx.page.keyboard.up("Alt");
};

/** A real double-click at `at`, optionally with Option held. */
export const doubleClick: BrowserCommand<[at: Point, alt: boolean]> = async (ctx, at, alt) => {
  const p = await toPage(ctx, at);
  // mouse.dblclick takes no modifiers; hold the key around it.
  if (alt) await ctx.page.keyboard.down("Alt");
  await ctx.page.mouse.dblclick(p.x, p.y);
  if (alt) await ctx.page.keyboard.up("Alt");
};

/** Moves the mouse to `at` without pressing. */
export const hover: BrowserCommand<[at: Point]> = async (ctx, at) => {
  const p = await toPage(ctx, at);
  await ctx.page.mouse.move(p.x, p.y);
};

/** Presses or releases a key (e.g. "Alt") with a real key event. */
export const key: BrowserCommand<[name: string, down: boolean]> = async (ctx, name, down) => {
  if (down) await ctx.page.keyboard.down(name);
  else await ctx.page.keyboard.up(name);
};
