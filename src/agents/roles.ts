import type { PaneView } from "../lib/types";

/**
 * A tab's role in the orchestrator/lane contract (ct-agent docs/10-lane.md): `orch-*` is the
 * orchestrator, `lane-<slug>` a worker it dispatched, `brief-*` a decision tab.
 */
export type TabRole = "orch" | "lane" | "brief" | null;

export function tabRole(label: string): TabRole {
  if (label.startsWith("orch-")) return "orch";
  if (label.startsWith("lane-")) return "lane";
  if (label.startsWith("brief-")) return "brief";
  return null;
}

/**
 * Per pane of one workspace (tab label and pane, in order): "orch" for the workspace's
 * orchestrator, "lane" for its workers, else null. Without an `orch-` tab, the first agent
 * outside a lane or brief tab is the orchestrator (tabs named before the contract). Without
 * an orchestrator, lanes are ordinary panes.
 */
export function paneRoles(panes: { tabLabel: string; pane: PaneView }[]): ("orch" | "lane" | null)[] {
  const roles = panes.map((p) => tabRole(p.tabLabel));
  if (!roles.includes("lane")) return roles.map(() => null);
  let orch = roles.findIndex((r, i) => r === "orch" && panes[i].pane.agent);
  if (orch < 0) orch = roles.findIndex((r, i) => r === null && panes[i].pane.agent);
  if (orch < 0) return roles.map(() => null);
  return roles.map((r, i) => (i === orch ? "orch" : r === "lane" ? "lane" : null));
}

/** A lane's or brief's title without the `lane: `/`brief: ` (or pi's `π - lane: `) prefix its place already says. */
export function laneTitle(title: string): string {
  return title.replace(/^(π - )?(lane|brief): /, "");
}
