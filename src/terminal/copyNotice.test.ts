import { describe, expect, it, vi } from "vitest";
import { copiedText, createCopyNotice } from "./copyNotice";

describe("copiedText", () => {
  it("counts characters, not UTF-16 units", () => {
    expect(copiedText("a")).toBe("Copied 1 character");
    expect(copiedText("hello")).toBe("Copied 5 characters");
    expect(copiedText("😀é")).toBe("Copied 2 characters");
  });
});

describe("createCopyNotice", () => {
  it("replaces the previous notice instead of stacking", () => {
    let id = 0;
    const show = vi.fn(() => ++id);
    const dismiss = vi.fn();
    const notice = createCopyNotice(show, dismiss);
    notice("hello");
    expect(show).toHaveBeenLastCalledWith("Copied 5 characters");
    expect(dismiss).not.toHaveBeenCalled();
    notice("hi");
    expect(dismiss).toHaveBeenCalledWith(1);
    expect(show).toHaveBeenLastCalledWith("Copied 2 characters");
  });
});
