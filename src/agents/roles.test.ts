import { describe, expect, it } from "vitest";
import type { PaneView } from "../lib/types";
import { laneTitle, paneRoles, tabRole } from "./roles";

const p = (agent: string | null): PaneView => ({ pane_id: "x", terminal_id: "t", title: "x", cwd: null, agent, status: "idle" });

describe("roles", () => {
  it("reads a tab's role from its label", () => {
    expect([tabRole("orch-herdr-app"), tabRole("lane-caps"), tabRole("brief-pricing"), tabRole("1"), tabRole("main-orches")]).toEqual([
      "orch", "lane", "brief", null, null,
    ]);
  });
  it("puts lanes under the orch- tab's agent", () => {
    expect(paneRoles([{ tabLabel: "1", pane: p("claude") }, { tabLabel: "orch-x", pane: p("claude") }, { tabLabel: "lane-a", pane: p("pi") }])).toEqual([
      null, "orch", "lane",
    ]);
  });
  it("takes the first agent outside lanes and briefs when no tab is named orch-", () => {
    expect(paneRoles([{ tabLabel: "1", pane: p(null) }, { tabLabel: "brief-q", pane: p("claude") }, { tabLabel: "main-orches", pane: p("claude") }, { tabLabel: "lane-a", pane: p("pi") }])).toEqual([
      null, null, "orch", "lane",
    ]);
  });
  it("leaves lanes ordinary panes without an orchestrator, and a workspace without lanes alone", () => {
    expect(paneRoles([{ tabLabel: "lane-a", pane: p("pi") }, { tabLabel: "1", pane: p(null) }])).toEqual([null, null]);
    expect(paneRoles([{ tabLabel: "orch-x", pane: p("claude") }])).toEqual([null]);
  });
  it("drops the lane prefix from a title", () => {
    expect(laneTitle("π - lane: caps — Wave 2")).toBe("caps — Wave 2");
    expect(laneTitle("lane: ipscope — Wave 2")).toBe("ipscope — Wave 2");
    expect(laneTitle("brief: pricing — fee model")).toBe("pricing — fee model");
    expect(laneTitle("Orchestrator")).toBe("Orchestrator");
  });
});
