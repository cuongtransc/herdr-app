import { create } from "zustand";
import { paneKey } from "../lib/types";
import type { Located, PaneRef, PaneView, WorkspaceView } from "../lib/types";
import { newAgentOnTerminal } from "../settings/lens";
import { useApp } from "../store/app";
import { launchAgent } from "./launchAgent";

type Call = (method: string, params: unknown) => Promise<unknown>;

/** Resuming a long transcript takes longer than starting a fresh agent. */
const FORK_START_MS = 15000;

/**
 * Why `pane` cannot be forked now, or null. A fork of a turn still running sees its unfinished
 * tool call as cut off and runs it again (checked against claude 2.1.295, 2026-10-09), so only an
 * idle or done Claude pane forks.
 */
export function forkBlocked(pane: PaneView): string | null {
  if (pane.agent !== "claude") return "Only Claude sessions can be forked";
  if (pane.untracked) return "Herdr does not track this Claude session";
  if (pane.status === "working") return "Busy: a fork now would run its unfinished command again. Fork once it finishes.";
  if (pane.status === "blocked") return "Waiting for an answer: a fork now would run its unfinished command again. Answer it first.";
  return null;
}

export interface ForkOrigin {
  /** The pane it was forked from. */
  of: PaneRef;
  /** The forked pane's title. */
  from: string;
  /** When it was forked (ms). */
  at: number;
  /** The worktree Claude made for it, if any. */
  worktree: string | null;
}

const KEY = "herdr-app:forks";

function load(): Record<string, ForkOrigin> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, ForkOrigin>) : {};
  } catch {
    return {};
  }
}

/** By the fork's paneKey: where it came from, for the Chat lens banner. */
export const useForks = create<{ forks: Record<string, ForkOrigin>; add: (key: string, o: ForkOrigin) => void }>((set, get) => ({
  forks: load(),
  add: (key, o) => {
    const forks = { ...get().forks, [key]: o };
    try {
      localStorage.setItem(KEY, JSON.stringify(forks));
    } catch {
      /* ignore */
    }
    set({ forks });
  },
}));

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Opens a tab beside `ref` running `claude --resume <its session> --fork-session`, in a new
 * worktree when asked (Claude's `--worktree`). Refuses, before opening anything, a pane that
 * cannot fork, a session herdr has not reported, and one with no transcript yet or only a guessed one.
 */
export async function forkSession(
  ref: PaneRef,
  ws: WorkspaceView,
  pane: PaneView,
  { worktree }: { worktree: boolean },
  { call, locate }: { call: Call; locate: (p: PaneRef) => Promise<Located> },
): Promise<void> {
  const blocked = forkBlocked(pane);
  if (blocked) throw new Error(blocked);
  const got = (await call("agent.get", { target: ref.pane_id })) as { agent?: { agent_session?: { kind?: string; value?: string } | null } };
  const session = got?.agent?.agent_session;
  if (session?.kind !== "id" || !session.value) throw new Error("Herdr has not reported this pane's session yet");
  const where = await locate(ref);
  if (where.pending) throw new Error("Nothing to fork yet: send it a first message");
  if (where.ambiguous) throw new Error("Herdr is not sure which session this pane runs, so it cannot fork it");

  const now = new Date();
  const tree = worktree ? `fork-${stamp(now)}` : null;
  const res = (await call("tab.create", { workspace_id: ws.workspace_id, ...(pane.cwd ? { cwd: pane.cwd } : {}), label: "fork", focus: false })) as {
    root_pane: { pane_id: string };
  };
  const fork = { machine_id: ref.machine_id, session: ref.session, pane_id: res.root_pane.pane_id };
  useForks.getState().add(paneKey(fork), { of: ref, from: pane.title, at: now.getTime(), worktree: tree });
  if (newAgentOnTerminal()) useApp.getState().setLensOverride(paneKey(fork), "terminal");
  useApp.getState().select(fork);
  const args = ["--resume", session.value, "--fork-session", "--name", `Fork · ${pane.title}`, ...(tree ? ["--worktree", tree] : [])];
  await launchAgent(call, fork, "claude", { name: "fork", args, timeoutMs: FORK_START_MS });
}
