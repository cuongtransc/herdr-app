import type { AgentStatus, MachineView, PaneRef } from "../lib/types";
import { scoreFields } from "./fuzzy";

export interface PaneHit {
  ref: PaneRef;
  title: string;
  /** What a shell does now, shown after its title. */
  activity: string | null;
  /** "machine › session › workspace" */
  subtitle: string;
  agent: string | null;
  status: AgentStatus;
}

/** Where a match counts most: names the user typed or sees, then the agent and Machine, then paths. */
const WEIGHT = { title: 1, activity: 0.9, session: 1, workspace: 0.9, agent: 0.8, machine: 0.7, folder: 0.7, path: 0.5 };

const basename = (p: string) => p.replace(/\/+$/, "").split("/").pop() ?? "";

export function search(machines: MachineView[], query: string): PaneHit[] {
  const scored: { hit: PaneHit; score: number; i: number }[] = [];
  for (const m of machines) {
    for (const s of m.sessions) {
      for (const w of s.workspaces) {
        for (const t of w.tabs) {
          for (const p of t.panes) {
            const score = scoreFields(
              [
                { text: p.title, weight: WEIGHT.title },
                { text: p.activity ?? "", weight: WEIGHT.activity },
                { text: s.name, weight: WEIGHT.session },
                { text: w.label, weight: WEIGHT.workspace },
                { text: p.agent ?? "", weight: WEIGHT.agent },
                { text: m.label, weight: WEIGHT.machine },
                { text: basename(p.cwd ?? ""), weight: WEIGHT.folder },
                { text: p.cwd ?? "", weight: WEIGHT.path },
              ],
              query,
            );
            if (score === 0) continue;
            scored.push({
              score,
              i: scored.length,
              hit: {
                ref: { machine_id: m.id, session: s.name, pane_id: p.pane_id },
                title: p.title,
                activity: p.activity ?? null,
                subtitle: `${m.label} › ${s.name} › ${w.label}`,
                agent: p.agent,
                status: p.status,
              },
            });
          }
        }
      }
    }
  }
  // Better match first; between equal ones (an empty query included) panes waiting for input lead.
  const waiting = (h: PaneHit) => (h.status === "blocked" ? 0 : 1);
  return scored.sort((a, b) => b.score - a.score || waiting(a.hit) - waiting(b.hit) || a.i - b.i).map((x) => x.hit);
}
