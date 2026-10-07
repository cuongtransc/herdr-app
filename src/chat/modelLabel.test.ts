import { describe, expect, it } from "vitest";
import { contextMeter, formatTokens, modelLabel } from "./modelLabel";
describe("modelLabel", () => {
  it("joins the Model, effort and context size, or shows whichever is known", () => {
    expect(modelLabel({ model: "claude-opus-5-5", effort: "high", context_tokens: 48612 })).toBe("claude-opus-5-5 · high · 48.6k");
    expect(modelLabel({ model: "claude-opus-5-5", effort: "high", context_tokens: null })).toBe("claude-opus-5-5 · high");
    expect(modelLabel({ model: "claude-opus-5-5", effort: null, context_tokens: null })).toBe("claude-opus-5-5");
    expect(modelLabel({ model: null, effort: "off", context_tokens: null })).toBe("off");
    expect(modelLabel({ model: null, effort: null, context_tokens: 0 })).toBeNull();
    expect(modelLabel(undefined)).toBeNull();
  });
});
describe("formatTokens", () => {
  it("shortens to k and M", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(48612)).toBe("48.6k");
    expect(formatTokens(182400)).toBe("182k");
    expect(formatTokens(1_020_000)).toBe("1.02M");
  });
});
describe("contextMeter", () => {
  const meta = (model: string | null, context_tokens: number | null) => ({ model, effort: "high", context_tokens });
  it("reads the used share of the model's window, at the 50/75/90% levels", () => {
    expect(contextMeter(meta("claude-opus-5-5", 480_000))).toEqual({ tokens: 480_000, window: 1_000_000, pct: 48, level: "low" });
    expect(contextMeter(meta("claude-opus-5-5", 500_000))?.level).toBe("mid");
    expect(contextMeter(meta("claude-sonnet-5-5", 750_000))?.level).toBe("warn");
    expect(contextMeter(meta("claude-opus-4-8", 900_000))?.level).toBe("crit");
    expect(contextMeter(meta("claude-haiku-4-5-20251001", 190_000))).toEqual({ tokens: 190_000, window: 200_000, pct: 95, level: "crit" });
  });
  it("claims nothing for a model whose window it does not know, or without a count", () => {
    expect(contextMeter(meta("gpt-6-sol", 120_000))).toBeNull();
    expect(contextMeter(meta(null, 120_000))).toBeNull();
    expect(contextMeter(meta("claude-opus-5-5", null))).toBeNull();
    expect(contextMeter(undefined)).toBeNull();
  });
});
