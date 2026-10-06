import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ sessionStart: vi.fn().mockResolvedValue(undefined) }));
import { sessionStart } from "../lib/ipc";
import { useApp } from "../store/app";
import { EMPTY_LAYOUT, sessionKey, useLayout } from "./groups";
import { Sidebar } from "./Sidebar";
import { useSessionFilter } from "./activeFilter";
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
  it("counts what needs the user on a session row, and nothing when all is calm", () => {
    const blocked = structuredClone(m);
    blocked.sessions[0].workspaces[0].tabs[0].panes[0].status = "blocked";
    useApp.setState({ machines: { box: blocked }, doneSeen: {} });
    render(<Sidebar />);
    expect(within(row("default")).getByLabelText("1 needs you")).toBeTruthy();
    expect(row("ai-radar").querySelector(".need")).toBeNull();
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
    expect(inTree.getAttribute("aria-current")).toBe("true");
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
    expect(screen.queryByText("herdr-app")).toBeNull();
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
    expect(row("default").className).toContain("active");
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
