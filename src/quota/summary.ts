import type { QuotaWindow } from "../lib/types";
import type { QuotaEntry } from "./entry";
import { tone } from "./format";
import type { Tone } from "./format";

/** A Provider's one window worth a line, with its tone; `stale` when only the last good numbers are left. */
export interface Headline {
  window: QuotaWindow;
  tone: Tone;
  stale: boolean;
}

/** The window that most needs a look: a warning one first (the fullest of them), else the fullest. */
export function headline(entry: QuotaEntry, now: number): Headline | null {
  const report = entry.kind === "ok" ? entry.report : entry.kind === "problem" ? entry.last : null;
  if (!report || report.windows.length === 0) return null;
  const byUse = [...report.windows].sort((a, b) => b.usedPercent - a.usedPercent);
  const window = byUse.find((w) => tone(w, now) === "warn") ?? byUse[0];
  const stale = entry.kind === "problem";
  return { window, tone: stale ? "muted" : tone(window, now), stale };
}
