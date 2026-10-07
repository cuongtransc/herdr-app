import { paneRoles } from "../agents/roles";
import { paneKey } from "../lib/types";
import type { MachineView, PaneRef, PaneView, SessionView } from "../lib/types";

/** What a project asks of the user, most urgent first; `quiet` only shows under All. */
export type ProjectState = "blocked" | "review" | "working" | "quiet";

/** A Workspace (the user's project) as a row under its Session in the sidebar. */
export interface ProjectRow {
  id: string;
  label: string;
  state: ProjectState;
  /** Panes in its `lane-*` tabs, when an orchestrator leads them. */
  lanes: number;
  /** The pane a click opens: the one asking, else the orchestrator, else the first agent or pane. */
  target: PaneRef | null;
}

/**
 * The Session's Workspaces with agent work: one blocked (a lane's question included), one with a
 * Done not yet seen (a lane's Done is its orchestrator's), one working. Under All, every Workspace.
 */
export function sessionProjects(machine: MachineView, session: SessionView, doneSeen: Record<string, true>, all: boolean): ProjectRow[] {
  if (machine.state !== "connected" || !session.running) return [];
  const ref = (p: PaneView): PaneRef => ({ machine_id: machine.id, session: session.name, pane_id: p.pane_id });
  return session.workspaces.flatMap((w) => {
    const panes = w.tabs.flatMap((t) => t.panes.map((pane) => ({ tabLabel: t.label, pane })));
    const roles = paneRoles(panes);
    const agents = panes.filter((p) => p.pane.agent);
    const blocked = agents.find((p) => p.pane.status === "blocked");
    const review = panes.find((p, i) => p.pane.agent && roles[i] !== "lane" && p.pane.status === "done" && !doneSeen[paneKey(ref(p.pane))]);
    const working = agents.some((p) => p.pane.status === "working");
    const state: ProjectState = blocked ? "blocked" : review ? "review" : working ? "working" : "quiet";
    if (state === "quiet" && !all) return [];
    const lead = panes[roles.indexOf("orch")] ?? agents[0] ?? panes[0];
    const target = (blocked ?? review ?? lead)?.pane;
    return [{ id: w.workspace_id, label: w.label, state, lanes: roles.filter((r) => r === "lane").length, target: target ? ref(target) : null }];
  });
}
