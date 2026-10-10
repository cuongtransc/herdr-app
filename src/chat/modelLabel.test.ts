import { describe, expect, it } from "vitest";
import { aliasTitle, contextMeter, formatTokens, modelLabel } from "./modelLabel";
describe("modelLabel", () => {
  const alias = { name: "implementer-medium", label: "impl-m", provider: "openai-codex", fallback: false };
  it("names a pi alias as pi's footer does: label→model, label↓model on a fallback", () => {
    const meta = { model: "gpt-6-sol", effort: "low", context_tokens: 53_000, alias };
    expect(modelLabel(meta)).toBe("impl-m→gpt-6-sol · low · 53k");
    expect(modelLabel({ ...meta, alias: { ...alias, fallback: true } })).toBe("impl-m↓gpt-6-sol · low · 53k");
    // Before the first reply only the alias is known.
    expect(modelLabel({ ...meta, model: null })).toBe("impl-m · low · 53k");
  });
  it("spells the alias and its target out in full for the tooltip", () => {
    const meta = { model: "gpt-6-sol", effort: "low", context_tokens: null, alias };
    expect(aliasTitle(meta)).toBe("implementer-medium → openai-codex/gpt-6-sol");
    expect(aliasTitle({ ...meta, alias: { ...alias, fallback: true } })).toBe(
      "implementer-medium → openai-codex/gpt-6-sol (fallback: not the alias's first choice)",
    );
    expect(aliasTitle({ ...meta, model: null })).toBe("implementer-medium (no reply yet)");
    expect(aliasTitle({ ...meta, alias: null })).toBeNull();
    expect(aliasTitle(undefined)).toBeNull();
  });
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
