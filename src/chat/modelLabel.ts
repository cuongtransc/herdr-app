import type { ChatMeta } from "../lib/types";

/** A token count, short: `950`, `48.6k`, `1.02M`. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${+(n / 1000).toFixed(n < 100_000 ? 1 : 0)}k`;
  return `${+(n / 1_000_000).toFixed(2)}M`;
}

/** The Composer's `model · effort · tokens` label; whichever is unknown is left out, null when all are.
 *  A pi alias reads as pi's footer has it: `label→model`, `label↓model` when a fallback served. */
export function modelLabel(meta: ChatMeta | undefined): string | null {
  const tokens = meta?.context_tokens ? formatTokens(meta.context_tokens) : null;
  const alias = meta?.alias;
  const model = alias ? (meta?.model ? `${alias.label}${alias.fallback ? "↓" : "→"}${meta.model}` : alias.label) : meta?.model;
  const parts = [model, meta?.effort, tokens].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The alias and its target in full, for the label's tooltip; null when the Model is no alias. */
export function aliasTitle(meta: ChatMeta | undefined): string | null {
  const alias = meta?.alias;
  if (!alias) return null;
  if (!meta?.model) return `${alias.name} (no reply yet)`;
  const target = alias.provider ? `${alias.provider}/${meta.model}` : meta.model;
  return `${alias.name} → ${target}${alias.fallback ? " (fallback: not the alias's first choice)" : ""}`;
}

/** Context windows by Model id prefix, from the largest contexts seen in Claude transcripts
 *  (opus/sonnet 5.x and opus 4.8 ran past 200k, opus-5-5 to 946k). Unknown Models get no meter. */
const WINDOWS: [RegExp, number][] = [
  [/^claude-haiku-/, 200_000],
  [/^claude-(opus|sonnet)-(4-8|5)/, 1_000_000],
];

export type ContextLevel = "low" | "mid" | "warn" | "crit";

export interface ContextMeter {
  tokens: number;
  window: number;
  pct: number;
  /** Under 50%: the count only; 50–75: the share; 75–90: amber; 90 and up: red. */
  level: ContextLevel;
}

/** How full the Model's context is, or null when the count or the Model's window is unknown. */
export function contextMeter(meta: ChatMeta | undefined): ContextMeter | null {
  const tokens = meta?.context_tokens;
  const model = meta?.model;
  if (!tokens || !model) return null;
  const window = WINDOWS.find(([re]) => re.test(model))?.[1];
  if (!window) return null;
  const pct = Math.round((tokens / window) * 100);
  const level: ContextLevel = pct >= 90 ? "crit" : pct >= 75 ? "warn" : pct >= 50 ? "mid" : "low";
  return { tokens, window, pct, level };
}
