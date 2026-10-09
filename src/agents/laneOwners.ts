import { useEffect } from "react";
import { create } from "zustand";
import { lanesList } from "../lib/ipc";
import type { LaneRecord } from "./roles";

/** How often the lane store is read again while a session with lanes is in view. */
const POLL_MS = 15_000;

interface LaneOwnersState {
  /** Per Machine: the lane store's records, or null (no ctc, an error, or a ctc that reports no owner). */
  byMachine: Record<string, LaneRecord[] | null>;
  refresh(machineId: string): Promise<void>;
}

export const useLaneOwners = create<LaneOwnersState>((set) => ({
  byMachine: {},
  refresh: async (machineId) => {
    // Any failure leaves the lanes folded by workspace, as before ctc reported owners.
    const records = await lanesList(machineId).catch(() => null);
    set((s) => ({ byMachine: { ...s.byMachine, [machineId]: records ?? null } }));
  },
}));

/**
 * The Machine's lane records while `lanePanes` (the session's lane tabs' pane ids, joined) is non-empty:
 * read now, again when a lane tab comes or goes, and every 15 s. Null until read, and on any failure.
 */
export function useLaneRecords(machineId: string, lanePanes: string): LaneRecord[] | null {
  useEffect(() => {
    if (!lanePanes) return;
    const refresh = () => void useLaneOwners.getState().refresh(machineId);
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [machineId, lanePanes]);
  return useLaneOwners((s) => s.byMachine[machineId] ?? null);
}
