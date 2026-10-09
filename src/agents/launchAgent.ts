import type { PaneRef } from "../lib/types";
import { paneKey } from "../lib/types";
import { findPane, useApp } from "../store/app";
import { startAgent } from "./startAgent";

type Call = (method: string, params: unknown) => Promise<unknown>;

const LAUNCH_TIMEOUT_MS = 5000;

/**
 * Starts `kind` in a just-created pane under the Terminal's loading overlay, and resolves once
 * herdr reports the agent running there. Gives up after 5s, so the overlay never hides the
 * terminal for longer: the caller reports the error and the user sees what the shell did.
 */
export async function launchAgent(
  call: Call,
  pane: PaneRef,
  kind: string,
  { name = kind, args, timeoutMs = LAUNCH_TIMEOUT_MS }: { name?: string; args?: string[]; timeoutMs?: number } = {},
): Promise<void> {
  const key = paneKey(pane);
  const { setStarting } = useApp.getState();
  const deadline = Date.now() + timeoutMs;
  setStarting(key, { agent: kind, phase: "shell" });
  try {
    await startAgent(call, { name, kind, pane_id: pane.pane_id, ...(args ? { args } : {}) }, { timeoutMs });
    setStarting(key, { agent: kind, phase: "agent" });
    await agentReported(pane, kind, deadline - Date.now(), timeoutMs);
  } finally {
    setStarting(key, null);
  }
}

function agentReported(pane: PaneRef, kind: string, timeoutMs: number, totalMs: number): Promise<void> {
  const running = () => findPane(useApp.getState().machines, pane)?.agent === kind;
  if (running()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const unsubscribe = useApp.subscribe(() => {
      if (!running()) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`${kind} did not start within ${totalMs / 1000}s`));
    }, Math.max(0, timeoutMs));
  });
}
