import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ sessionStart: vi.fn().mockResolvedValue(undefined) }));
import { sessionStart } from "../lib/ipc";
import { useApp } from "../store/app";
import { EMPTY_LAYOUT, sessionKey, useLayout } from "./groups";
import { Sidebar } from "./Sidebar";
import { useSessionFilter, useViewOrigin } from "./activeFilter";
import type { MachineView } from "../lib/types";

const m: MachineView = {
  id: "box", label: "devtuf", kind: "ssh", state: "connected", error: null, version: "0.9.3", status: "working",
  sessions: [
    { name: "default", running: true, status: "working", error: null, workspaces: [
      { workspace_id: "w1", label: "herdr-app", number: 1, status: "working", tabs: [
        { tab_id: "w1:t1", label: "1", number: 1, status: "working", panes: [
          { pane_id: "w1:p1", terminal_id: "t", title: "Rewrite", cwd: "/x", agent: "claude", status: "working" } ] } ] } ] },
    { name: "ai-radar", running: false, status: "unknown", error: null, workspaces: [] },
  ],
};
const row = (name: string) => screen.getAllByText(name)[0].closest("button")!;
const work = { kind: "group" as const, id: "g1", label: "Work", children: [{ kind: "session" as const, key: sessionKey("box", "default") }] };

describe("Sidebar", () => {
  beforeEach(() => {
    useApp.setState({ machines: { box: m }, order: ["box"], selected: null, viewed: null, expanded: {} });
    useLayout.setState({ layout: EMPTY_LAYOUT });
    useSessionFilter.setState({ filter: "all" });
  });
  it("names the machine of remote sessions only", () => {
    const local = { ...m, id: "local", label: "local", kind: "local" as const };
    useApp.setState({ machines: { local }, order: ["local"] });
    render(<Sidebar />);
    expect(row("default").querySelector(".badge-label")).toBeNull();
  });
  it("counts what needs the user on a bookmarked session; in the tree its project rows say it", () => {
    const blocked = structuredClone(m);
    blocked.sessions[0].workspaces[0].tabs[0].panes[0].status = "blocked";
    useApp.setState({ machines: { box: blocked }, doneSeen: {} });
    useLayout.setState({ layout: { tree: [], bookmarks: [sessionKey("box", "default")] } });
    render(<Sidebar />);
    const bm = within(screen.getByRole("region", { name: "Bookmarks" })).getByText("default").closest("button")!;
    expect(within(bm).getByLabelText("1 needs you")).toBeTruthy();
    const tree = screen.getByRole("region", { name: "Sessions" });
    expect(within(tree).getByText("default").closest("button")!.querySelector(".need")).toBeNull();
    expect(within(tree).getByRole("button", { name: "herdr-app, blocked" })).toBeTruthy();
    expect(row("ai-radar").querySelector(".need")).toBeNull();
  });
  it("Active keeps a session and its project for 30 minutes after its agent stopped, saying how long ago", () => {
    const idle = structuredClone(m);
    idle.sessions[0].workspaces[0].tabs[0].panes[0].status = "idle";
    useApp.setState({ machines: { box: idle }, doneSeen: {}, statusSince: { "box/default/w1:p1": Date.now() - 12 * 60_000 } });
    useSessionFilter.setState({ filter: "active" });
    render(<Sidebar />);
    const project = screen.getByRole("button", { name: "herdr-app, idle 12m" });
    expect(project.className).toContain("recent");
    expect(project.textContent).toBe("herdr-app12m");
    useApp.setState({ statusSince: {} });
  });
  it("lists a session's projects under it: Blocked, Review, the lanes of one in progress", () => {
    const s = structuredClone(m);
    const p = (pane_id: string, status: "working" | "blocked" | "done" | "idle") => ({ pane_id, terminal_id: "t" + pane_id, title: pane_id, cwd: "/x", agent: "claude", status });
    const t = (label: string, pane: ReturnType<typeof p>) => ({ tab_id: label, label, number: 1, status: pane.status, panes: [pane] });
    s.sessions[0].workspaces = [
      { workspace_id: "w1", label: "herdr-app", number: 1, status: "working", tabs: [t("orch-ux", p("o", "idle")), t("lane-a", p("a", "working")), t("lane-b", p("b", "working"))] },
      { workspace_id: "w2", label: "ccpoke", number: 2, status: "blocked", tabs: [t("1", p("c", "blocked"))] },
      { workspace_id: "w3", label: "history", number: 3, status: "done", tabs: [t("1", p("h", "done"))] },
      { workspace_id: "w4", label: "journal", number: 4, status: "idle", tabs: [t("1", p("j", "idle"))] },
    ];
    useApp.setState({ machines: { box: s }, doneSeen: {} });
    useSessionFilter.setState({ filter: "active" });
    render(<Sidebar />);
    const tree = screen.getByRole("region", { name: "Sessions" });
    const rows = within(tree).getAllByRole("button", { name: /^(herdr-app|ccpoke|history|journal)/ });
    expect(rows.map((b) => b.textContent)).toEqual(["herdr-app2 lanes", "ccpokeBlocked", "historyReview"]);
    fireEvent.click(rows[1]);
    expect(useApp.getState().selected).toEqual({ machine_id: "box", session: "default", pane_id: "c" });
    expect(rows[1].getAttribute("aria-current")).toBe("true");
    expect(within(tree).getByText("default").closest("button")!.getAttribute("aria-current")).toBeNull();
    fireEvent.click(rows[0]);
    expect(useApp.getState().selected?.pane_id).toBe("o");
    // All lists the quiet projects too.
    fireEvent.click(screen.getByRole("button", { name: /^Active/ }));
    expect(within(tree).getByRole("button", { name: "journal" }).className).toContain("quiet");
  });
  it("puts Bookmarks first as its own section, flush, and lights only the row that was clicked", () => {
    const k = sessionKey("box", "default");
    useLayout.setState({ layout: { tree: [work], bookmarks: [k] } });
    render(<Sidebar />);
    const sections = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(sections.indexOf("Bookmarks")).toBeLessThan(sections.indexOf("Sessions"));
    const bm = within(screen.getByRole("region", { name: "Bookmarks" })).getByText("default").closest("button")!;
    expect(bm.closest(".children")).toBeNull();
    const inTree = within(screen.getByRole("region", { name: "Sessions" })).getByText("default").closest("button")!;
    fireEvent.click(bm);
    expect(bm.getAttribute("aria-current")).toBe("true");
    expect(inTree.getAttribute("aria-current")).toBeNull();
    expect(inTree.className).toContain("current");
    // The star travels with the name, not with the right-hand chips.
    expect(inTree.querySelector(".session-name > [aria-label='bookmarked']")).toBeTruthy();
    fireEvent.click(inTree);
    // In the tree the project holding the opened pane is the lit row.
    expect(screen.getByRole("button", { name: "herdr-app" }).getAttribute("aria-current")).toBe("true");
    expect(inTree.getAttribute("aria-current")).toBeNull();
    expect(bm.getAttribute("aria-current")).toBeNull();
  });
  it("lists sessions no group holds before the groups", () => {
    useLayout.setState({ layout: { tree: [work], bookmarks: [] } });
    render(<Sidebar />);
    const labels = [...within(screen.getByRole("region", { name: "Sessions" })).getAllByRole("list")[0].children].map((li) => li.textContent);
    expect(labels[0]).toContain("ai-radar");
    expect(labels[1]).toContain("Work");
  });
  it("folds Machines by default once there is more than one", () => {
    const local = { ...m, id: "local", label: "local", kind: "local" as const, sessions: [] };
    useApp.setState({ machines: { box: m, local }, order: ["local", "box"] });
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: /Machines/ }).getAttribute("aria-expanded")).toBe("false");
  });
  it("Active shows only sessions with agent work, keeps the viewed one, and Show brings the rest back", () => {
    render(<Sidebar />);
    expect(row("ai-radar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Active 1" }));
    expect(screen.queryByText("ai-radar")).toBeNull();
    expect(row("default")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("herdr-app:settings")!).sessionFilter).toBe("active");
    expect(screen.getByText("1 hidden · idle or stopped")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(row("ai-radar")).toBeTruthy();
    expect(useSessionFilter.getState().filter).toBe("all");
  });
  it("Active keeps the session being viewed whatever its state", () => {
    useApp.setState({ viewed: { machine_id: "box", session: "ai-radar" } });
    useSessionFilter.setState({ filter: "active" });
    render(<Sidebar />);
    expect(row("ai-radar")).toBeTruthy();
    expect(screen.queryByText(/hidden · idle or stopped/)).toBeNull();
  });
  it("shows sessions with a machine badge and machines without sessions", () => {
    render(<Sidebar />);
    expect(row("default").querySelector(".badge-label")?.textContent).toBe("devtuf");
    const machines = screen.getByRole("region", { name: "Machines" });
    expect(within(machines).getByText("devtuf")).toBeTruthy();
    expect(within(machines).queryByText("default")).toBeNull();
    expect(within(machines).queryByText("herdr-app")).toBeNull();
    expect(screen.queryByRole("region", { name: "Bookmarks" })).toBeNull();
  });
  it("renders sessions inside their group and collapses it", () => {
    useLayout.setState({ layout: { tree: [work], bookmarks: [] } });
    render(<Sidebar />);
    expect(row("default").closest("li.group")?.textContent).toContain("Work");
    fireEvent.click(screen.getByText("Work"));
    expect(useApp.getState().expanded["group:g1"]).toBe(false);
    expect(screen.queryByText("default")).toBeNull();
    expect(screen.getByText("ai-radar")).toBeTruthy();
  });
  it("shows a bookmarked session in Bookmarks and in its place", () => {
    useLayout.setState({ layout: { tree: [work], bookmarks: [sessionKey("box", "default")] } });
    render(<Sidebar />);
    const bm = screen.getByRole("region", { name: "Bookmarks" });
    expect(within(bm).getByText("default")).toBeTruthy();
    expect(screen.getAllByText("default")).toHaveLength(2);
  });
  it("views a running session on click", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("default"));
    expect(useApp.getState().viewed).toEqual({ machine_id: "box", session: "default" });
    // The pane it opened is in herdr-app: that project's row is the one lit.
    expect(screen.getByRole("button", { name: "herdr-app" }).className).toContain("active");
  });
  it("selecting a pane views its session", () => {
    useApp.getState().select({ machine_id: "box", session: "default", pane_id: "w1:p1" });
    expect(useApp.getState().viewed).toEqual({ machine_id: "box", session: "default" });
  });
  it("starts and views a stopped session on click", async () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByText("ai-radar"));
    expect(sessionStart).toHaveBeenCalledWith("box", "ai-radar");
    await waitFor(() => expect(useApp.getState().viewed).toEqual({ machine_id: "box", session: "ai-radar" }));
  });
  it("ignores clicks on sessions of a machine that is not connected", () => {
    useApp.setState({ machines: { box: { ...m, state: "disconnected" } } });
    render(<Sidebar />);
    fireEvent.click(screen.getByText("default"));
    expect(useApp.getState().viewed).toBeNull();
    expect(row("default").getAttribute("aria-disabled")).toBe("true");
    fireEvent.contextMenu(screen.getByText("default"));
    expect(screen.getByRole("menuitem", { name: "Bookmark" })).toBeTruthy();
    for (const name of ["Delete session…", "Start session", "Stop session", "New workspace…"])
      expect(screen.queryByRole("menuitem", { name })).toBeNull();
  });
});

describe("Sidebar tree", () => {
  const p = (pane_id: string, status: "working" | "blocked" | "done" | "idle") => ({ pane_id, terminal_id: "t" + pane_id, title: pane_id, cwd: "/x", agent: "claude", status });
  const t = (label: string, pane: ReturnType<typeof p>) => ({ tab_id: label, label, number: 1, status: pane.status, panes: [pane] });
  const projects = () => {
    const s = structuredClone(m);
    s.sessions[0].workspaces = [
      { workspace_id: "w1", label: "herdr-app", number: 1, status: "working", tabs: [t("1", p("o", "working"))] },
      { workspace_id: "w2", label: "ccpoke", number: 2, status: "blocked", tabs: [t("1", p("c", "blocked"))] },
      { workspace_id: "w3", label: "journal", number: 3, status: "idle", tabs: [t("1", p("j", "idle"))] },
    ];
    return s;
  };
  beforeEach(() => {
    useApp.setState({ machines: { box: projects() }, order: ["box"], selected: null, viewed: null, expanded: {}, doneSeen: {} });
    useLayout.setState({ layout: EMPTY_LAYOUT });
    useSessionFilter.setState({ filter: "all" });
  });
  const tree = () => screen.getByRole("region", { name: "Sessions" });
  const projectNames = () => [...tree().querySelectorAll(".project-row")].map((b) => b.textContent);

  it("folds a Session's projects, keeping the one that asks, and counts the rest in a row that unfolds it", () => {
    render(<Sidebar />);
    const fold = within(tree()).getByRole("button", { name: "Fold default" });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(fold);
    expect(useApp.getState().expanded[`session:${sessionKey("box", "default")}`]).toBe(false);
    expect(projectNames()).toEqual(["ccpokeBlocked", "2 more"]);
    expect(within(tree()).getByRole("button", { name: "Unfold default" }).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(within(tree()).getByRole("button", { name: "2 more" }));
    expect(projectNames()).toEqual(["herdr-app", "ccpokeBlocked", "journal"]);
  });

  it("folded, still shows the project holding the selected pane", () => {
    useApp.setState({ expanded: { [`session:${sessionKey("box", "default")}`]: false }, selected: { machine_id: "box", session: "default", pane_id: "j" } });
    useViewOrigin.setState({ from: "sessions" });
    render(<Sidebar />);
    expect(projectNames()).toEqual(["ccpokeBlocked", "journal", "1 more"]);
  });

  it("folds and unfolds a Session row with the arrow keys", () => {
    render(<Sidebar />);
    const session = within(tree()).getByText("default").closest("button")!;
    fireEvent.keyDown(session, { key: "ArrowLeft" });
    expect(projectNames()).toEqual(["ccpokeBlocked", "2 more"]);
    fireEvent.keyDown(session, { key: "ArrowRight" });
    expect(projectNames()).toHaveLength(3);
  });

  it("gives no fold control to a Session without projects", () => {
    render(<Sidebar />);
    expect(within(tree()).queryByRole("button", { name: /fold ai-radar/i })).toBeNull();
  });

  it("filters with one Active toggle that names how many sessions it keeps", () => {
    render(<Sidebar />);
    const active = within(tree()).getByRole("button", { name: "Active 1" });
    expect(active.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(active);
    expect(useSessionFilter.getState().filter).toBe("active");
    expect(active.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(active);
    expect(useSessionFilter.getState().filter).toBe("all");
  });

  it("marks a Bookmark row with its Session's status", () => {
    useLayout.setState({ layout: { tree: [], bookmarks: [sessionKey("box", "default")] } });
    render(<Sidebar />);
    const bm = within(screen.getByRole("region", { name: "Bookmarks" })).getByText("default").closest("button")!;
    expect(bm.querySelector(".slot .dot")!.className).toContain("dot-working");
  });
});
