import "../styles.css";
import { beforeEach, expect, it } from "vitest";

// The working spinner (one ring for the agent list, the live work block and the working line):
// it turns, and the agent row's ring keeps the 8px footprint of the dot it replaced.
function mount(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

it("turns the agent row's working mark in the dot's 8px slot", () => {
  const host = mount('<button class="agent-card"><span class="mark mark-working"></span></button>');
  const mark = getComputedStyle(host.querySelector(".mark-working")!);
  expect(mark.animationName).toBe("spin");
  expect(parseFloat(mark.width) + parseFloat(mark.marginLeft) + parseFloat(mark.marginRight)).toBe(8);
});

it("turns the chat's ring", () => {
  const host = mount('<span class="spin"></span>');
  expect(getComputedStyle(host.querySelector(".spin")!).animationName).toBe("spin");
});
