import "../styles.css";
import { beforeEach, expect, it } from "vitest";

// The chat column at each Settings › Chat width, in a pane wider than all of them.
function columns(width: string | undefined) {
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  const lens = document.createElement("div");
  lens.className = "chat-lens";
  lens.style.width = "1800px";
  if (width) lens.dataset.width = width;
  lens.innerHTML = '<div class="chat-main"><div class="chat-scroll"><div><div style="width:100%"><div class="chat-row">x</div></div></div></div><div class="chat-working">x</div><div class="composer">x</div></div>';
  document.body.appendChild(lens);
  return [".chat-row", ".chat-working", ".composer"].map((sel) => Math.round(lens.querySelector(sel)!.getBoundingClientRect().width));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

it("keeps the messages, the working line and the composer one width at every setting", () => {
  expect(columns(undefined)).toEqual([840, 840, 840]);
  expect(columns("comfortable")).toEqual([840, 840, 840]);
  expect(columns("wide")).toEqual([1280, 1280, 1280]);
  expect(columns("full")).toEqual([1800, 1800, 1800]);
});
