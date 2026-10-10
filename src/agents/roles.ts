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

/** One row of `ctc lane list --json`: the lane's pane and the pane that owns it, `<herdr session>/<pane id>`. */
export interface LaneRecord {
  lane_id: string;
  herdr_session: string | null;
  pane_id: string | null;
  owner: string | null;
}

/** A pane's role: an orchestrator, or a lane folded under `owner` (a pane id), or an `orphan` lane shown on its own. */
export interface PaneRole {
  role: "orch" | "lane" | null;
  owner?: string;
  orphan?: true;
}

type TabPane = { tabLabel: string; pane: PaneView };

/**
 * Roles across one session's workspaces (each a list of tab label and pane, in order). With the lane
 * store's records, a `lane-` tab folds under the pane its record names as owner, wherever that pane is in
 * the session, and that pane is the orchestrator; a lane whose owner is unknown, gone, elsewhere or itself a
 * lane is an orphan. Without records (`null`: no ctc, or one that reports no owner), each workspace's lanes
 * fold under its orchestrator as `paneRoles` picks it.
 */
export function sessionRoles(session: string, workspaces: TabPane[][], lanes: LaneRecord[] | null): PaneRole[][] {
  if (!lanes) {
    return workspaces.map((panes) => {
      const roles = paneRoles(panes);
      const orch = panes[roles.indexOf("orch")]?.pane.pane_id;
      return roles.map((r) => (r === "lane" && orch ? { role: "lane", owner: orch } : { role: r }));
    });
  }
  const labelOf = new Map(workspaces.flat().map((p) => [p.pane.pane_id, p.tabLabel]));
  const ownerOf = (paneId: string): string | null => {
    const owner = lanes.find((l) => l.herdr_session === session && l.pane_id === paneId)?.owner;
    const at = owner?.lastIndexOf("/") ?? -1;
    if (!owner || at < 0 || owner.slice(0, at) !== session) return null;
    const pane = owner.slice(at + 1);
    const label = labelOf.get(pane);
    return label !== undefined && tabRole(label) !== "lane" && pane !== paneId ? pane : null;
  };
  const owners = new Map<string, string | null>();
  for (const { tabLabel, pane } of workspaces.flat()) if (tabRole(tabLabel) === "lane") owners.set(pane.pane_id, ownerOf(pane.pane_id));
  const orchs = new Set([...owners.values()].filter((o): o is string => o !== null));
  return workspaces.map((panes) =>
    panes.map(({ pane }): PaneRole => {
      if (owners.has(pane.pane_id)) {
        const owner = owners.get(pane.pane_id);
        return owner ? { role: "lane", owner } : { role: "lane", orphan: true };
      }
      return { role: orchs.has(pane.pane_id) ? "orch" : null };
    }),
  );
}

/** A lane's or brief's title without the `lane: `/`brief: ` (or pi's `π - lane: `) prefix its place already says. */
export function laneTitle(title: string): string {
  return title.replace(/^(π - )?(lane|brief): /, "");
}
