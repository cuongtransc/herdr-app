import { describe, expect, it } from "vitest";
import { scoreFields, scoreText, TIER } from "./fuzzy";

describe("scoreText", () => {
  it("orders the tiers exact > prefix > word start > substring > scattered", () => {
    const s = (t: string) => scoreText(t, "mono");
    expect(s("mono")).toBe(TIER.exact);
    expect(s("mono-repo")).toBeGreaterThan(s("ca-mono"));
    expect(s("ca-mono")).toBeGreaterThan(s("camono"));
    expect(s("camono")).toBeGreaterThan(s("m-o-n-o"));
    expect(s("m-o-n-o")).toBeGreaterThan(0);
    expect(s("mon")).toBe(0);
  });

  it("scores scattered letters by fzf's rules: initials and runs beat letters buried in words", () => {
    expect(scoreText("fix login flow", "flf")).toBeGreaterThan(scoreText("fluffiest", "flf"));
    expect(scoreText("rewrite ui", "rwui")).toBeGreaterThan(0);
    // The shortest window counts: "ab" right next to each other beats them far apart.
    expect(scoreText("a....ab", "ab")).toBeGreaterThan(scoreText("a.....b", "ab"));
  });
});

describe("scoreFields", () => {
  it("needs every word and weighs where it matched", () => {
    const fields = [
      { text: "Fix login", weight: 1 },
      { text: "/srv/billing", weight: 0.5 },
    ];
    expect(scoreFields(fields, "fix billing")).toBeGreaterThan(0);
    expect(scoreFields(fields, "fix payments")).toBe(0);
    expect(scoreFields([{ text: "billing", weight: 1 }], "billing")).toBeGreaterThan(scoreFields([{ text: "billing", weight: 0.5 }], "billing"));
    expect(scoreFields(fields, "  ")).toBe(1);
  });
});
