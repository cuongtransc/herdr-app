import { createContext } from "react";
import type { ChatItem, TaskEnd } from "../lib/types";

export interface BackgroundState { running: Set<string>; ends: Map<string, TaskEnd> }

export const BackgroundContext = createContext<BackgroundState>({ running: new Set(), ends: new Map() });

/** Every task end the transcript reported, by the call that started it. */
export function taskEnds(items: ChatItem[]): Map<string, TaskEnd> {
  const ends = new Map<string, TaskEnd>();
  for (const item of items) {
    if (item.kind === "system" && item.task) ends.set(item.task.call_id, item.task);
  }
  return ends;
}

/** The badge for a tool call: its end if it has one, else running, else none. */
export function taskBadge(callId: string, s: BackgroundState): { label: string; tone: "running" | "good" | "bad" | "neutral" } | null {
  const end = s.ends.get(callId);
  if (end) {
    if (end.exit_code !== undefined && end.exit_code !== 0) return { label: `exit ${end.exit_code}`, tone: "bad" };
    if (end.status === "completed") return { label: end.exit_code === 0 ? "exit 0" : "done", tone: "good" };
    // A notification without <status> still ended; do not paint it as a failure.
    if (!end.status) return { label: "ended", tone: "neutral" };
    return { label: end.status, tone: "bad" };
  }
  if (s.running.has(callId)) return { label: "background · running", tone: "running" };
  return null;
}

/** `prev` when `next` holds the same running ids and the same ends, so context consumers do not re-render on every append. */
export function stableBackground(prev: BackgroundState, next: BackgroundState): BackgroundState {
  if (prev.running.size !== next.running.size || prev.ends.size !== next.ends.size) return next;
  for (const id of next.running) if (!prev.running.has(id)) return next;
  for (const [id, e] of next.ends) {
    const p = prev.ends.get(id);
    if (!p || p.status !== e.status || p.exit_code !== e.exit_code) return next;
  }
  return prev;
}
