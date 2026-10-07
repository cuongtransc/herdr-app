import type { QuotaWindow } from "../lib/types";
import type { QuotaEntry } from "./entry";
import { agoShort, tone } from "./format";
import type { Tone } from "./format";
import { STALE_POLL_MS } from "./cta";
import type { QuotaItem } from "./view";

/** A Provider's one window worth a line, with its tone; `stale` when only the last good numbers are left. */
export interface Headline {
  window: QuotaWindow;
  tone: Tone;
  stale: boolean;
}

/** The window that most needs a look: a warning one first (the fullest of them), else the fullest. */
export function headline(entry: QuotaEntry, now: number): Headline | null {
  const report = entry.kind === "ok" ? entry.report : entry.kind === "problem" ? entry.last : null;
  if (!report) return null;
  const live = report.windows.filter((w) => w.resetsAt === null || w.resetsAt > now);
  if (live.length === 0) return null;
  const byUse = [...live].sort((a, b) => b.usedPercent - a.usedPercent);
  const window = byUse.find((w) => tone(w, now) === "warn") ?? byUse[0];
  const stale = entry.kind === "problem";
  return { window, tone: stale ? "muted" : tone(window, now), stale };
}

/** A card the Sidebar strip leaves out: its trouble has lasted this long. */
export const HIDE_AFTER_MS = 86_400_000;

/** Why a card's numbers cannot be trusted: `reason` fits the strip, `message` the detail; `at` is the last good poll or numbers. */
export interface Trouble {
  reason: string;
  message: string;
  at: number | null;
  /** cta still says ok, but has stopped polling the account: usually a sign-in that is gone. */
  notPolled: boolean;
}

export function trouble(item: QuotaItem, now: number): Trouble | null {
  const { entry } = item;
  if (entry.kind === "problem") {
    const at = item.fromCta ? item.polledAt : entry.last?.fetchedAt ?? null;
    const reason = entry.message.match(/^HTTP \d+/)?.[0] ?? entry.message.split(" — ")[0];
    return { reason, message: entry.message, at, notPolled: false };
  }
  if (item.fromCta && item.polledAt !== null && now - item.polledAt > STALE_POLL_MS) {
    return { reason: "not polled", message: `Not polled for ${agoShort(item.polledAt, now)}`, at: item.polledAt, notPolled: true };
  }
  return null;
}
