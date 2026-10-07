import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/ipc", () => ({ herdrCall: vi.fn().mockResolvedValue(undefined) }));
import { herdrCall } from "../lib/ipc";
import { useApp } from "../store/app";
import { setFolder } from "../workspaces/folder";
import { AgentList, workspaceGroups } from "./AgentList";
import { usePaneFilter } from "./paneFilter";
import type { MachineView, PaneView } from "../lib/types";

const pane = (id: string, title: string, agent: string | null, status: PaneView["status"]): PaneView => ({
  pane_id: id, terminal_id: "t" + id, title, cwd: "/x", agent, status,
});

const m: MachineView = {
  id: "local", label: "local", kind: "local", state: "connected", error: null, version: "0.9.3", status: "working",
  sessions: [
    { name: "default", running: true, status: "working", error: null, workspaces: [
      { workspace_id: "w1", label: "checkout-api", number: 1, status: "done", tabs: [
        { tab_id: "w1:t1", label: "1", number: 1, status: "done", panes: [pane("p1", "Idempotent payments", "claude", "done")] } ] },
      { workspace_id: "w2", label: "web", number: 2, status: "blocked", tabs: [
        { tab_id: "w2:t1", label: "ui", number: 1, status: "blocked", panes: [pane("p2", "Guard export", "codex", "blocked")] },
        { tab_id: "w2:t2", label: "release", number: 2, status: "idle", panes: [pane("p3", "Tag v1.4.0", null, "unknown"), pane("p4", "Ship flag", "pi", "idle")] } ] },
      { workspace_id: "w3", label: "empty", number: 3, status: "unknown", tabs: [] } ] },
    { name: "other", running: true, status: "idle", error: null, workspaces: [
      { workspace_id: "w9", label: "infra", number: 1, status: "idle", tabs: [
        { tab_id: "w9:t1", label: "1", number: 1, status: "idle", panes: [pane("p9", "Backup", "mystery", "working")] } ] } ] },
  ],
};

describe("workspaceGroups", () => {
  it("groups panes by workspace, naming the tab only when a workspace has several", () => {
    const groups = workspaceGroups(m.sessions[0]);
    expect(groups.map((g) => [g.workspace.workspace_id, g.entries.map((e) => [e.pane.pane_id, e.sub])])).toEqual([
      ["w1", [["p1", ""]]],
      ["w2", [["p2", "ui"], ["p3", "release"], ["p4", "release"]]],
      ["w3", []],
    ]);
  });
});

describe("AgentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useApp.setState({ machines: { local: m }, order: ["local"], selected: null, viewed: { machine_id: "local", session: "default" }, expanded: {}, doneSeen: {}, statusSince: {} });
    usePaneFilter.setState({ filter: "active" });
  });

  const ago = (ms: number) => Date.now() - ms;
  const MIN = 60_000;
  const rowsOf = (group: string) =>
    [...screen.getByRole("group", { name: group }).querySelectorAll(".agent-card")].map((b) => b.getAttribute("aria-label"));

  it("shows, in Active, the panes that need a look as one-line rows named by their status", () => {
    render(<AgentList />);
    expect(screen.getByRole("button", { name: "Idempotent payments, claude, review" })).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "Idempotent payments, claude, review" })).getByText("Review")).toBeTruthy();
    const input = screen.getByRole("button", { name: "Guard export, codex, blocked" });
    expect(within(input).getByText("Blocked")).toBeTruthy();
    // A shell running something (its title is not a shell's name) stays, unmarked.
    expect(screen.getByRole("button", { name: "Tag v1.4.0, shell" })).toBeTruthy();
    // Idle with no recent change: hidden, and no per-workspace fold line names it.
    expect(screen.queryByText("Ship flag")).toBeNull();
    expect(document.querySelector(".ws-quiet")).toBeNull();
    expect(screen.queryByText(/^(DONE|IDLE|WORKING)$/)).toBeNull();
  });

  it("heads the panes with All | Active N, Active by default, like the Sessions section", () => {
    render(<AgentList />);
    const seg = screen.getByRole("group", { name: "Show panes" });
    expect(within(seg).getByRole("button", { name: "Active 3" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(seg).getByRole("button", { name: "All" }));
    expect(rowsOf("web")).toEqual(["Guard export, codex, blocked", "Tag v1.4.0, shell", "Ship flag, pi, idle"]);
    expect(screen.getByRole("button", { name: "Ship flag, pi, idle" }).className).toContain("quiet");
    expect(screen.getByRole("button", { name: "Guard export, codex, blocked" }).className).not.toContain("quiet");
    expect(JSON.parse(localStorage.getItem("herdr-app:settings")!).paneFilter).toBe("all");
  });

  it("keeps an agent idle under 30 minutes in Active, with its idle time", () => {
    useApp.setState({ statusSince: { "local/default/p4": ago(12 * MIN) } });
    render(<AgentList />);
    const row = screen.getByRole("button", { name: "Ship flag, pi, idle" });
    expect(within(row).getByText("12m").getAttribute("title")).toBe("Idle for 12m");
  });

  it("hides an agent idle for more than 30 minutes", () => {
    useApp.setState({ statusSince: { "local/default/p4": ago(31 * MIN) } });
    render(<AgentList />);
    expect(screen.queryByText("Ship flag")).toBeNull();
  });

  it("names a pane's tab only in its tooltip", () => {
    render(<AgentList />);
    const guard = screen.getByRole("button", { name: "Guard export, codex, blocked" });
    expect(guard.querySelector(".agent-card-sub")).toBeNull();
    expect(guard.getAttribute("title")).toBe("ui · /x");
  });

  it("never hides the selected pane", () => {
    useApp.setState({ selected: { machine_id: "local", session: "default", pane_id: "p4" } });
    render(<AgentList />);
    expect(screen.getByRole("button", { name: "Ship flag, pi, idle" }).getAttribute("aria-current")).toBe("true");
  });

  it("hides a workspace whose panes are all hidden, but not an empty one", () => {
    useApp.setState({ viewed: { machine_id: "local", session: "other" } });
    const quiet = structuredClone(m);
    quiet.sessions[1].workspaces[0].tabs[0].panes[0].status = "idle";
    useApp.setState({ machines: { local: quiet } });
    render(<AgentList />);
    expect(screen.queryByRole("group", { name: "infra" })).toBeNull();
    expect(screen.getByRole("button", { name: "Active 0" })).toBeTruthy();
  });

  it("hides a plain shell", () => {
    const shell = structuredClone(m);
    shell.sessions[0].workspaces[1].tabs[1].panes[0].title = "zsh";
    useApp.setState({ machines: { local: shell } });
    render(<AgentList />);
    expect(screen.queryByText("zsh")).toBeNull();
  });

  it("keeps an agent herdr cannot read in view, marked unknown", () => {
    // Started through a wrapper: herdr names the agent from its session but reports no state.
    const mm = structuredClone(m);
    Object.assign(mm.sessions[0].workspaces[1].tabs[1].panes[0], { agent: "claude", status: "unknown", busy: null });
    useApp.setState({ machines: { local: mm } });
    render(<AgentList />);
    const row = screen.getByRole("button", { name: "Tag v1.4.0, claude, state unknown" });
    expect(row.querySelector(".mark-unknown")?.getAttribute("title")).toMatch(/can't read/);
  });

  it("hides an untitled shell (herdr's \"Terminal\") like a named one", () => {
    const shell = structuredClone(m);
    shell.sessions[0].workspaces[1].tabs[1].panes[0].title = "Terminal";
    useApp.setState({ machines: { local: shell } });
    render(<AgentList />);
    expect(screen.queryByText("Terminal")).toBeNull();
  });

  it("reads a shell's state from its process, not its title, once herdr reported it", () => {
    const shell = structuredClone(m);
    const pane = shell.sessions[0].workspaces[1].tabs[1].panes[0];
    // Idle at its prompt though a program left its title behind.
    Object.assign(pane, { title: "Tag v1.4.0", busy: false });
    useApp.setState({ machines: { local: shell } });
    const { unmount } = render(<AgentList />);
    expect(screen.queryByText("Tag v1.4.0")).toBeNull();
    unmount();
    // Running a command though untitled.
    Object.assign(pane, { title: "Terminal", busy: true });
    useApp.setState({ machines: { local: structuredClone(shell) } });
    render(<AgentList />);
    expect(screen.getByRole("button", { name: "Terminal, shell" })).toBeTruthy();
  });

  it("shows what a shell does after its name, muted, and names it in the row's label", () => {
    const shell = structuredClone(m);
    Object.assign(shell.sessions[0].workspaces[1].tabs[1].panes[0], { title: "dev", activity: "pnpm vite --port 1441", busy: true });
    useApp.setState({ machines: { local: shell } });
    render(<AgentList />);
    const row = screen.getByRole("button", { name: "dev · pnpm vite --port 1441, shell" });
    expect(within(row).getByText("dev").className).toContain("has-activity");
    const activity = within(row).getByText("pnpm vite --port 1441");
    expect(activity.className).toBe("agent-card-activity");
    expect(activity.previousElementSibling?.textContent).toBe("dev");
  });

  it("shows no activity for a shell without one, or for an agent", () => {
    const shell = structuredClone(m);
    Object.assign(shell.sessions[0].workspaces[1].tabs[1].panes[0], { title: "dev", activity: null, busy: true });
    useApp.setState({ machines: { local: shell } });
    const { container } = render(<AgentList />);
    expect(screen.getByRole("button", { name: "dev, shell" })).toBeTruthy();
    expect(container.querySelector(".agent-card-activity")).toBeNull();
  });

  it("folds a workspace from its header, keeping what needs the user counted on it", () => {
    render(<AgentList />);
    const head = screen.getByRole("button", { name: "web" });
    expect(head.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(head);
    expect(screen.getByRole("button", { name: "web, 1 needs you" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Guard export")).toBeNull();
  });

  it("heads the column with what waits and what is done, and steps through them in this session", () => {
    render(<AgentList />);
    expect(document.querySelector(".agents-head .count")).toBeNull();
    const chip = screen.getByRole("button", { name: "1 blocked, 1 review: go to the next one in this session" });
    expect(chip.textContent).toBe("1 blocked · 1 review");
    // Waiting for input first, then Done and unseen.
    fireEvent.click(chip);
    expect(useApp.getState().selected).toEqual({ machine_id: "local", session: "default", pane_id: "p2" });
    fireEvent.click(screen.getByRole("button", { name: /in this session/ }));
    expect(useApp.getState().selected).toEqual({ machine_id: "local", session: "default", pane_id: "p1" });
  });

  it("starts a stopped session from the column", () => {
    useApp.setState({ machines: { local: { ...m, sessions: [{ ...m.sessions[0], running: false, workspaces: [] }] } } });
    render(<AgentList />);
    expect(screen.getByText("Stopped")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start default" })).toBeTruthy();
  });

  it("falls back to a monogram for an unknown agent", () => {
    useApp.setState({ viewed: { machine_id: "local", session: "other" } });
    render(<AgentList />);
    expect(screen.getByRole("img", { name: "mystery" }).textContent).toBe("M");
    expect(screen.getByRole("button", { name: "Backup, mystery, in progress" })).toBeTruthy();
  });

  it("selects a pane on click and marks it active", () => {
    render(<AgentList />);
    fireEvent.click(screen.getByText("Guard export"));
    expect(useApp.getState().selected).toEqual({ machine_id: "local", session: "default", pane_id: "p2" });
    expect(screen.getByText("Guard export").closest("button")?.className).toContain("active");
  });

  it("shows a header per workspace with its folder, empty workspaces included", () => {
    setFolder({ machine_id: "local", session: "default", workspace_id: "w1" }, "/Users/me/checkout-api/");
    render(<AgentList />);
    const w1 = screen.getByRole("group", { name: "checkout-api" });
    expect(within(w1).getByText("checkout-api", { selector: ".ws-folder" })).toBeTruthy();
    expect(within(w1).getByText("Idempotent payments")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "web" })).getAllByRole("listitem")).toHaveLength(2);
    // An absent folder is not labelled.
    expect(screen.queryByText("no folder")).toBeNull();
    expect(screen.getByRole("group", { name: "empty" }).querySelector(".ws-folder")).toBeNull();
    expect(screen.getByRole("button", { name: "New agent in empty" })).toBeTruthy();
  });

  it("keeps the panes of a multi-pane tab together, leaving single-pane tabs bare", () => {
    // Both panes of the "release" tab shown: one working agent, one shell running something.
    const busy = structuredClone(m);
    busy.sessions[0].workspaces[1].tabs[1].panes[1].status = "working";
    useApp.setState({ machines: { local: busy } });
    render(<AgentList />);
    const tab = screen.getByRole("group", { name: "Tab release" });
    expect(tab.className).toContain("tab-group");
    expect(within(tab).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Tag v1.4.0"),
      expect.stringContaining("Ship flag"),
    ]);
    expect(screen.queryByRole("group", { name: "Tab ui" })).toBeNull();
    expect(screen.getByText("Guard export").closest(".tab-group")).toBeNull();
  });

  it("opens the new agent dialog from the header button", () => {
    render(<AgentList />);
    fireEvent.click(screen.getByRole("button", { name: "New agent in web" }));
    expect(screen.getByRole("dialog", { name: "New agent" })).toBeTruthy();
    expect(screen.getByText("New agent in web", { selector: "h3" })).toBeTruthy();
  });

  it("opens the new workspace dialog from the session header", () => {
    render(<AgentList />);
    fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
    expect(screen.getByRole("dialog", { name: "New workspace" })).toBeTruthy();
    expect(screen.getByText("New workspace in default", { selector: "h3" })).toBeTruthy();
  });

  it("offers no new workspace button on a stopped session", () => {
    useApp.setState({ machines: { local: { ...m, sessions: [{ ...m.sessions[0], running: false }] } } });
    render(<AgentList />);
    expect(screen.queryByRole("button", { name: "New workspace" })).toBeNull();
  });

  it("changes the folder from the header menu", () => {
    render(<AgentList />);
    fireEvent.contextMenu(screen.getByText("web", { selector: ".ws-label" }));
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["New claude", "New pi", "New shell", "Change folder…", "Rename workspace…", "Close workspace"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Change folder…" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "/srv/web" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(within(screen.getByRole("group", { name: "web" })).getByText("web", { selector: ".ws-folder" })).toBeTruthy();
  });

  it("starts an agent from the header menu in the workspace folder", () => {
    setFolder({ machine_id: "local", session: "default", workspace_id: "w2" }, "/srv/web");
    render(<AgentList />);
    fireEvent.contextMenu(screen.getByText("web", { selector: ".ws-label" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New pi" }));
    expect(herdrCall).toHaveBeenCalledWith("local", "default", "tab.create", { workspace_id: "w2", cwd: "/srv/web", label: "pi", focus: false });
  });

  it("offers pane and tab actions in the card menu", () => {
    render(<AgentList />);
    fireEvent.contextMenu(screen.getByText("Tag v1.4.0"));
    const names = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(names).toEqual(["Rename…", "Split right", "Split down", "Close pane", "New tab", "Rename tab…", "Close tab"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Split right" }));
    expect(herdrCall).toHaveBeenCalledWith("local", "default", "pane.split", { target_pane_id: "p3", direction: "right" });
  });

  it("closes a pane from its card button without asking", () => {
    render(<AgentList />);
    fireEvent.click(screen.getByRole("button", { name: "Close Tag v1.4.0" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(herdrCall).toHaveBeenCalledWith("local", "default", "pane.close", { pane_id: "p3" });
  });

  it("asks for a session when none is viewed", () => {
    useApp.setState({ viewed: null });
    render(<AgentList />);
    expect(screen.getByText("Select a session")).toBeTruthy();
  });
});

describe("AgentList lanes", () => {
  const tab = (id: string, label: string, panes: PaneView[]) => ({ tab_id: id, label, number: 1, status: "idle" as const, panes });
  const lanes: MachineView = {
    ...m,
    sessions: [
      { name: "default", running: true, status: "working", error: null, workspaces: [
        { workspace_id: "w1", label: "bmf-oms", number: 1, status: "working", tabs: [
          tab("t1", "main-orches", [pane("o", "BMF-OMS review", "claude", "working")]),
          tab("t2", "lane-caps", [pane("l1", "π - lane: caps — Wave 2", "pi", "working")]),
          tab("t3", "lane-search", [pane("l2", "π - lane: search — Wave 2", "pi", "done")]),
          tab("t4", "lane-ipscope", [pane("l3", "lane: ipscope — Wave 2", "claude", "blocked")]),
          tab("t5", "2", [pane("s", "cargo watch", null, "unknown")]),
        ] } ] },
    ],
  };
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useApp.setState({ machines: { local: lanes }, order: ["local"], selected: null, viewed: { machine_id: "local", session: "default" }, expanded: {}, doneSeen: {}, statusSince: {} });
    usePaneFilter.setState({ filter: "active" });
  });
  const rows = () => [...document.querySelectorAll(".agent-card")].map((b) => b.getAttribute("aria-label"));

  it("folds lanes under their orchestrator, surfacing only a lane that needs input", () => {
    render(<AgentList />);
    expect(rows()).toEqual(["BMF-OMS review, claude, in progress", "ipscope — Wave 2, claude, blocked", "cargo watch, shell"]);
    const toggle = screen.getByRole("button", { name: "3 lanes" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("title")).toBe("1 in progress, 1 done, 1 blocked");
    expect(screen.getByRole("button", { name: "ipscope — Wave 2, claude, blocked" }).closest("li")?.className).toContain("lane-row");
  });

  it("keeps the lane toggle clear of the row's age and status word: they sit left of its slot", () => {
    const idle = structuredClone(lanes);
    idle.sessions[0].workspaces[0].tabs[0].panes[0].status = "idle";
    useApp.setState({ machines: { local: idle }, statusSince: { "local/default/o": Date.now() - 5 * 60_000 } });
    const { unmount } = render(<AgentList />);
    const card = screen.getByRole("button", { name: /^BMF-OMS review/ });
    const order = [...card.children].map((c) => c.className);
    const slot = order.findIndex((c) => c.includes("lane-slot"));
    expect(slot).toBeGreaterThan(order.findIndex((c) => c.includes("row-age")));
    expect(card.querySelector(".lane-slot")?.textContent).toBe(screen.getByRole("button", { name: "3 lanes" }).textContent);
    unmount();
    const blocked = structuredClone(lanes);
    blocked.sessions[0].workspaces[0].tabs[0].panes[0].status = "blocked";
    useApp.setState({ machines: { local: blocked } });
    render(<AgentList />);
    const b = [...screen.getByRole("button", { name: /^BMF-OMS review/ }).children].map((c) => c.className);
    expect(b.findIndex((c) => c.includes("lane-slot"))).toBeGreaterThan(b.findIndex((c) => c.includes("agent-input")));
    expect(b.findIndex((c) => c.includes("lane-slot"))).toBeLessThan(b.findIndex((c) => c.includes("mark-blocked")));
  });

  it("opens every lane under the orchestrator, in tab order", () => {
    render(<AgentList />);
    fireEvent.click(screen.getByRole("button", { name: "3 lanes" }));
    expect(rows()).toEqual([
      "BMF-OMS review, claude, in progress",
      "caps — Wave 2, pi, in progress",
      "search — Wave 2, pi, review",
      "ipscope — Wave 2, claude, blocked",
      "cargo watch, shell",
    ]);
  });

  it("keeps a selected lane in view while folded", () => {
    useApp.setState({ selected: { machine_id: "local", session: "default", pane_id: "l1" } });
    render(<AgentList />);
    expect(rows()).toContain("caps — Wave 2, pi, in progress");
  });

  it("leaves a lane's done to the orchestrator: the head chip counts only what waits on the user", () => {
    render(<AgentList />);
    expect(screen.getByRole("button", { name: /go to the next one/ }).textContent).toBe("1 blocked");
    expect(screen.getByRole("button", { name: "Active 3" })).toBeTruthy();
  });
});

describe("AgentList tab reordering", () => {
  const dt = () => {
    const data: Record<string, string> = {};
    return { data, types: [] as string[], effectAllowed: "", dropEffect: "",
      setData(t: string, v: string) { data[t] = v; this.types.push(t); }, getData: (t: string) => data[t] ?? "", setDragImage() {} };
  };
  const card = (title: string) => screen.getByText(title).closest("button")!;
  const drag = (from: HTMLElement, to: HTMLElement) => {
    const dataTransfer = dt();
    fireEvent.dragStart(from, { dataTransfer });
    fireEvent.dragEnter(to, { dataTransfer });
    fireEvent.dragOver(to, { dataTransfer });
    fireEvent.drop(to, { dataTransfer });
    fireEvent.dragEnd(from, { dataTransfer });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useApp.setState({ machines: { local: m }, order: ["local"], selected: null, viewed: { machine_id: "local", session: "default" }, doneSeen: {}, expanded: {}, statusSince: {} });
    // The idle "Ship flag" is hidden in Active; these tests drag onto it.
    usePaneFilter.setState({ filter: "all" });
  });

  it("moves a tab after the tab it is dropped on", () => {
    render(<AgentList />);
    // jsdom rects are empty, so every drop lands after the target.
    drag(card("Guard export"), card("Ship flag"));
    expect(herdrCall).toHaveBeenCalledWith("local", "default", "tab.move", { tab_id: "w2:t1", insert_index: 2 });
    expect(document.querySelector(".drop-before, .drop-after")).toBeNull();
  });

  it("shows the indicator on the whole tab while dragging over one of its panes", () => {
    const busy = structuredClone(m);
    busy.sessions[0].workspaces[1].tabs[1].panes[1].status = "working";
    useApp.setState({ machines: { local: busy } });
    render(<AgentList />);
    const dataTransfer = dt();
    fireEvent.dragStart(card("Guard export"), { dataTransfer });
    fireEvent.dragOver(card("Tag v1.4.0"), { dataTransfer });
    expect(screen.getByRole("group", { name: "Tab release" }).className).toContain("drop-after");
  });

  it("does nothing when the drop leaves the tab in place", () => {
    render(<AgentList />);
    drag(card("Tag v1.4.0"), card("Ship flag"));
    drag(card("Guard export"), card("Guard export"));
    expect(herdrCall).not.toHaveBeenCalled();
  });

  it("refuses a drop on another workspace", () => {
    render(<AgentList />);
    drag(card("Idempotent payments"), card("Guard export"));
    expect(herdrCall).not.toHaveBeenCalled();
    expect(document.querySelector(".drop-before, .drop-after")).toBeNull();
  });
});
