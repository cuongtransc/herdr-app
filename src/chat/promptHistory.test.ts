import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_MAX, HistoryCursor, readHistory, recordPrompt } from "./promptHistory";

beforeEach(() => localStorage.clear());

describe("promptHistory", () => {
  it("keeps sent prompts per scope, oldest first", () => {
    recordPrompt("m1:/app", "fix the bug");
    recordPrompt("m1:/app", "run the tests");
    recordPrompt("m1:/other", "hello");
    expect(readHistory("m1:/app")).toEqual(["fix the bug", "run the tests"]);
    expect(readHistory("m1:/other")).toEqual(["hello"]);
    expect(readHistory("m1:/none")).toEqual([]);
  });

  it("skips blank prompts and a repeat of the last one", () => {
    recordPrompt("s", "a");
    recordPrompt("s", "a");
    recordPrompt("s", "  ");
    recordPrompt("s", "b");
    recordPrompt("s", "a");
    expect(readHistory("s")).toEqual(["a", "b", "a"]);
  });

  it(`keeps the newest ${HISTORY_MAX}`, () => {
    for (let i = 0; i < HISTORY_MAX + 5; i++) recordPrompt("s", `p${i}`);
    const h = readHistory("s");
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0]).toBe("p5");
    expect(h[h.length - 1]).toBe(`p${HISTORY_MAX + 4}`);
  });

  it("reads a corrupt entry as empty", () => {
    localStorage.setItem("herdr-app:history:s", "{not json");
    expect(readHistory("s")).toEqual([]);
  });
});

describe("HistoryCursor", () => {
  const cursor = () => new HistoryCursor(() => ["one", "two", "three"]);

  it("steps back from the newest and returns the draft past it", () => {
    const c = cursor();
    expect(c.browsing).toBe(false);
    expect(c.back("my draft")).toBe("three");
    expect(c.browsing).toBe(true);
    expect(c.back("three")).toBe("two");
    expect(c.back("two")).toBe("one");
    expect(c.back("one")).toBeNull();
    expect(c.forward()).toBe("two");
    expect(c.forward()).toBe("three");
    expect(c.forward()).toBe("my draft");
    expect(c.browsing).toBe(false);
    expect(c.forward()).toBeNull();
  });

  it("hands back the draft on cancel", () => {
    const c = cursor();
    c.back("draft");
    c.back("three");
    expect(c.cancel()).toBe("draft");
    expect(c.browsing).toBe(false);
    expect(c.cancel()).toBeNull();
  });

  it("stops browsing on reset, so the next step back starts at the newest again", () => {
    const c = cursor();
    c.back("");
    c.back("three");
    c.reset();
    expect(c.browsing).toBe(false);
    expect(c.back("edited")).toBe("three");
    expect(c.forward()).toBe("edited");
  });

  it("does nothing with no history", () => {
    const c = new HistoryCursor(() => []);
    expect(c.back("draft")).toBeNull();
    expect(c.browsing).toBe(false);
  });
});
