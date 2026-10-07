import "../styles.css";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { useQuickReplies } from "./quickReplies";
import { Settings, useSettingsOpen } from "./Settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const grip = (n: number) => document.querySelector<HTMLElement>(`[aria-label="Reorder quick reply ${n}"]`)!;
const centre = (el: Element) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

beforeEach(() => {
  document.body.innerHTML = "";
  useQuickReplies.setState({ show: true, replies: ["a", "b", "c", "d"] });
  const root = document.createElement("div");
  document.body.appendChild(root);
  act(() => createRoot(root).render(<Settings />));
  act(() => useSettingsOpen.getState().show());
  act(() => ([...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === "Chat") as HTMLElement).click());
});

it("drags a reply by its grip to a new place with a real mouse", async () => {
  const from = centre(grip(4));
  const to = { x: from.x, y: centre(grip(1)).y - 6 };
  await commands.drag(from, to, false);
  await expect.poll(() => useQuickReplies.getState().replies).toEqual(["d", "a", "b", "c"]);
  expect(document.querySelector(".quick-reply-row.dragging")).toBeNull();
});

it("drags down past the middle of the next row, and not before", async () => {
  const from = centre(grip(1));
  const row = grip(1).closest(".quick-reply-row")!.getBoundingClientRect();
  await commands.drag(from, { x: from.x, y: from.y + row.height * 0.3 }, false);
  expect(useQuickReplies.getState().replies).toEqual(["a", "b", "c", "d"]);
  await commands.drag(centre(grip(1)), { x: from.x, y: centre(grip(3)).y }, false);
  await expect.poll(() => useQuickReplies.getState().replies).toEqual(["b", "c", "a", "d"]);
});
