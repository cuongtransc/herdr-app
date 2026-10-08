import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(async () => ({})), render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 4 2"></svg>' })) }));
vi.mock("mermaid", () => ({ default: mermaid }));
const { MermaidBlock } = await import("./MermaidBlock");

// A diagram clicked as soon as it shows, before React has run the effects of the commit that
// drew it (a busy machine widens that gap): the click must still open it.
it("opens a diagram clicked before the effects of the render that drew it have run", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<MermaidBlock source="graph TD; A-->B">src</MermaidBlock>));
  const button = await vi.waitFor(() => {
    const b = host.querySelector<HTMLElement>('[aria-label="Zoom diagram"]');
    if (!b) throw new Error("no diagram yet");
    return b;
  }, { timeout: 3000, interval: 1 });
  flushSync(() => button.click());
  await new Promise((r) => setTimeout(r, 50));
  expect(document.querySelector('[role="dialog"][aria-label="Diagram"]')).not.toBeNull();
  root.unmount();
});
