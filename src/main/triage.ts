import { create } from "zustand";
import { stepTriage, triageQueue } from "../dashboard/triage";
import { paneKey } from "../lib/types";
import type { PaneRef } from "../lib/types";
import { useApp } from "../store/app";

export interface TriageEntry {
  key: string;
  ref: PaneRef;
  title: string;
  where: string;
  agent: string;
  waiting: boolean;
  since: number | null;
}

interface TriageStore {
  /** The queue as it was at the last step (selecting a Done pane takes it out of the live one), and where that step landed. */
  hud: { entries: TriageEntry[]; at: number; shownAt: number } | null;
  last: number;
  step: (dir: 1 | -1) => void;
  hide: () => void;
}

/** ⌘J / ⇧⌘J: select the next or previous agent that needs you and show the queue. */
export const useTriage = create<TriageStore>((set, get) => ({
  hud: null,
  last: -1,
  step: (dir) => {
    const s = useApp.getState();
    const queue = triageQueue(s.machines, s.order, s.doneSeen, s.statusSince);
    const at = stepTriage(queue.map((c) => c.key), s.selected ? paneKey(s.selected) : null, get().last, dir);
    const entries = queue.map((c) => ({
      key: c.key,
      ref: c.ref,
      title: c.pane.title,
      where: `${c.machine.label} › ${c.session.name} › ${c.workspace.label}`,
      agent: c.pane.agent ?? "",
      waiting: c.bucket === "attention",
      since: s.statusSince[c.key] ?? null,
    }));
    set({ hud: { entries, at, shownAt: Date.now() }, last: at });
    if (at >= 0) s.select(entries[at].ref);
  },
  hide: () => set({ hud: null }),
}));
