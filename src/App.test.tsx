import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]), Channel: class {} }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
// xterm needs a real window; the Terminal lens is stood in for by its loading overlay.
vi.mock("./terminal/TerminalLens", async () => {
  const { StartingOverlay } = await import("./terminal/StartingOverlay");
  return { TerminalLens: ({ pane }: { pane: import("./lib/types").PaneRef }) => <StartingOverlay pane={pane} /> };
});

import App from "./App";
import { useSettingsOpen } from "./settings/Settings";
import { useApp } from "./store/app";
import { useLensSettings } from "./settings/lens";
import { useLayout } from "./settings/layout";
import { DEFAULTS as FONT_DEFAULTS, useSettings } from "./settings/store";
import { initialSlots, useQuota } from "./quota/store";

describe("App shell", () => {
  it("opens Settings from the app menu's Settings… ⌘,", async () => {
    const { listen } = await import("@tauri-apps/api/event");
    render(<App />);
    const call = vi.mocked(listen).mock.calls.find(([name]) => name === "menu://settings");
    expect(call).toBeTruthy();
    act(() => void (call![1] as (e: unknown) => void)({ payload: null }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    act(() => useSettingsOpen.getState().hide());
  });

  it("renders the sidebar and the empty main area", () => {
    render(<App />);
    expect(screen.getByRole("navigation", { name: "Machines" })).toBeTruthy();
    expect(screen.getByText("Select a pane")).toBeTruthy();
  });

  it("offers to start the default session when local has none running", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockResolvedValueOnce([{ id: "local", label: "local", kind: "local", state: "connected", error: null, version: "0.9.3", status: "unknown",
      sessions: [{ name: "default", running: false, status: "unknown", error: null, workspaces: [] }] }]);
    render(<App />);
    expect(await screen.findByRole("button", { name: "Start default session" })).toBeTruthy();
  });

  it("shows a toast when starting the default session fails", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockResolvedValueOnce([{ id: "local", label: "local", kind: "local", state: "connected", error: null, version: "0.9.3", status: "unknown",
      sessions: [{ name: "default", running: false, status: "unknown", error: null, workspaces: [] }] }]);
    render(<App />);
    const start = await screen.findByRole("button", { name: "Start default session" });
    (invoke as any).mockImplementation((cmd: string) => (cmd === "session_start" ? Promise.reject({ code: "timeout", message: "did not start" }) : Promise.resolve([])));
    fireEvent.click(start);
    expect(await screen.findByText("Could not start the default session: did not start")).toBeTruthy();
    (invoke as any).mockImplementation(() => Promise.resolve([]));
  });

  it("explains when herdr is missing", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockResolvedValueOnce([{ id: "local", label: "local", kind: "local", state: "error", error: { code: "herdr_not_found", message: "herdr not found" }, version: null, status: "unknown", sessions: [] }]);
    render(<App />);
    expect(await screen.findByText("herdr is not installed on this Mac")).toBeTruthy();
  });

  it("opens the Agent Board from the titlebar, keeping the main area mounted", () => {
    useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false });
    render(<App />);
    expect(screen.queryByRole("button", { name: /agent dashboard/i })).toBeNull();
    const board = screen.getByRole("button", { name: /^Board/ });
    expect(board.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(board);
    expect(board.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Agent Dashboard" })).toBeTruthy();
    expect(screen.getByText("Select a pane")).toBeTruthy();
    // ⌘K searches the dashboard instead of opening the palette.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Agent Dashboard" })).toBeNull();
  });

  it("⌘E with no selection toasts, with a selection toggles the Files overlay", () => {
    useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false, filesOverlay: null });
    render(<App />);
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(screen.getByText("Select a workspace first")).toBeTruthy();
    useApp.setState({
      machines: { local: { id: "local", label: "local", kind: "local", state: "connected", error: null, version: null, status: "idle", sessions: [{ name: "default", running: true, status: "idle", error: null, workspaces: [
        { workspace_id: "w1", label: "app", number: 1, status: "idle", tabs: [{ tab_id: "t1", label: "t", panes: [{ pane_id: "p1", cwd: "/r" }] }] },
      ] }] } } as never,
      selected: { machine_id: "local", session: "default", pane_id: "p1" },
    });
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(useApp.getState().filesOverlay).toMatchObject({ workspace_id: "w1" });
    fireEvent.keyDown(window, { key: "e", metaKey: true });
    expect(useApp.getState().filesOverlay).toBeNull();
  });

  it("⌘+ and ⌘− size the open terminal's font, and leave the page alone without a pane", () => {
    const pane = { machine_id: "local", session: "default", pane_id: "w1:p7" };
    useSettings.setState({ ...FONT_DEFAULTS });
    useApp.setState({
      machines: { local: { id: "local", label: "local", kind: "local", state: "connected", error: null, version: "0.9.3", status: "idle",
        sessions: [{ name: "default", running: true, status: "idle", error: null, workspaces: [
          { workspace_id: "w1", label: "x", number: 1, status: "idle", tabs: [
            { tab_id: "w1:t1", label: "1", number: 1, status: "idle", panes: [
              { pane_id: "w1:p7", terminal_id: "t7", title: "sh", cwd: null, agent: null, status: "idle" } ] } ] } ] }] } },
      order: ["local"], selected: pane, dashboardOpen: false, lens: {}, lensOverride: {},
    });
    render(<App />);
    fireEvent.keyDown(window, { key: "+", code: "Equal", metaKey: true, shiftKey: true });
    expect(useSettings.getState().terminalFontSize).toBe(FONT_DEFAULTS.terminalFontSize + 0.5);
    fireEvent.keyDown(window, { key: "-", code: "Minus", metaKey: true });
    fireEvent.keyDown(window, { key: "-", code: "Minus", metaKey: true });
    expect(useSettings.getState().terminalFontSize).toBe(FONT_DEFAULTS.terminalFontSize - 0.5);
    useApp.setState({ machines: {}, order: [], selected: null });
    expect(fireEvent.keyDown(window, { key: "=", code: "Equal", metaKey: true })).toBe(true);
    useSettings.setState({ ...FONT_DEFAULTS });
  });

  it("⌘T closes the Files overlay", () => {
    useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false, filesOverlay: { machine_id: "local", session: "default", workspace_id: "w1" } });
    render(<App />);
    fireEvent.keyDown(window, { key: "t", metaKey: true });
    expect(useApp.getState().filesOverlay).toBeNull();
  });

  it("shows the loading overlay, not the empty state, while a new pane's agent starts before herdr reports the pane", () => {
    const pane = { machine_id: "local", session: "default", pane_id: "w1:p7" };
    useApp.setState({ machines: {}, order: [], selected: pane, dashboardOpen: false, starting: { "local/default/w1:p7": { agent: "claude", phase: "shell" } } });
    render(<App />);
    expect(screen.getByText("Waiting for the shell…")).toBeTruthy();
    expect(screen.queryByText("Select a pane")).toBeNull();
    useApp.setState({ selected: null, starting: {} });
  });

  it("keeps the loading overlay up while a new agent starts, even when new agents open on Chat", async () => {
    useLensSettings.setState({ newAgentLens: "chat" });
    const pane = { machine_id: "local", session: "default", pane_id: "w1:p7" };
    useApp.setState({
      machines: { local: { id: "local", label: "local", kind: "local", state: "connected", error: null, version: "0.9.3", status: "idle",
        sessions: [{ name: "default", running: true, status: "idle", error: null, workspaces: [
          { workspace_id: "w1", label: "x", number: 1, status: "idle", tabs: [
            { tab_id: "w1:t1", label: "1", number: 1, status: "idle", panes: [
              { pane_id: "w1:p7", terminal_id: "t7", title: "sh", cwd: null, agent: null, status: "unknown" } ] } ] } ] }] } },
      order: ["local"], selected: pane, dashboardOpen: false, lens: {}, lensOverride: {},
      starting: { "local/default/w1:p7": { agent: "claude", phase: "agent" } },
    });
    render(<App />);
    expect(await screen.findByText("Starting claude…")).toBeTruthy();
    useApp.setState({ machines: {}, order: [], selected: null, starting: {} });
    useLensSettings.setState({ newAgentLens: "terminal" });
  });

  it("keeps file drops from navigating the webview, leaving sidebar drags alone", () => {
    render(<App />);
    expect(fireEvent.dragOver(document, { dataTransfer: { types: ["Files"] } })).toBe(false);
    expect(fireEvent.drop(document, { dataTransfer: { types: ["Files"] } })).toBe(false);
    expect(fireEvent.dragOver(document, { dataTransfer: { types: ["application/x-herdr-node"] } })).toBe(true);
    expect(fireEvent.drop(document, { dataTransfer: { types: ["application/x-herdr-node"] } })).toBe(true);
  });

  describe("focus-return Done acknowledgement", () => {
    const ref = { machine_id: "local", session: "default", pane_id: "w1:p1" };
    const machine = (status: "working" | "done") => ({
      id: "local", label: "local", kind: "local" as const, state: "connected" as const, error: null, version: "0.9.3", status,
      sessions: [{ name: "default", running: true, status, error: null, workspaces: [
        { workspace_id: "w1", label: "app", number: 1, status, tabs: [
          { tab_id: "w1:t1", label: "agent", number: 1, status, panes: [
            { pane_id: "w1:p1", terminal_id: "t1", title: "agent", cwd: "/r", agent: "claude", status },
          ] },
        ] },
      ] }],
    });

    it("acknowledges a selected Done pane on focus return without another snapshot, once", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const focused = vi.spyOn(document, "hasFocus").mockReturnValue(false);
      try {
        useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false, filesOverlay: null, doneSeen: {}, lens: { "local/default/w1:p1": "terminal" } });
        render(<App />);
        useApp.getState().upsertMachine(machine("working"));
        useApp.getState().select(ref);
        useApp.getState().upsertMachine(machine("done"));
        expect(useApp.getState().doneSeen).toEqual({});
        expect((invoke as any).mock.calls.filter(([cmd]: [string]) => cmd === "herdr_call")).toHaveLength(0);

        focused.mockReturnValue(true);
        fireEvent.focus(window);
        expect(useApp.getState().doneSeen).toEqual({ "local/default/w1:p1": true });
        expect((invoke as any).mock.calls.filter(([cmd]: [string]) => cmd === "herdr_call")).toEqual([
          ["herdr_call", { machineId: "local", session: "default", method: "pane.focus", params: { pane_id: "w1:p1" } }],
        ]);
        fireEvent.focus(window);
        expect((invoke as any).mock.calls.filter(([cmd]: [string]) => cmd === "herdr_call")).toHaveLength(1);
      } finally {
        focused.mockRestore();
      }
    });

    it("leaves the selected Done pane unseen on focus return while the dashboard covers it", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const focused = vi.spyOn(document, "hasFocus").mockReturnValue(false);
      try {
        useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false, filesOverlay: null, doneSeen: {}, lens: { "local/default/w1:p1": "terminal" } });
        render(<App />);
        useApp.getState().upsertMachine(machine("working"));
        useApp.getState().select(ref);
        useApp.getState().setDashboardOpen(true);
        useApp.getState().upsertMachine(machine("done"));
        focused.mockReturnValue(true);
        fireEvent.focus(window);
        expect(useApp.getState().doneSeen).toEqual({});
        expect((invoke as any).mock.calls.filter(([cmd]: [string]) => cmd === "herdr_call")).toHaveLength(0);
      } finally {
        focused.mockRestore();
      }
    });
  });

  describe("layout", () => {
    const blockedMachine = {
      id: "local", label: "local", kind: "local" as const, state: "connected" as const, error: null, version: "0.9.3", status: "blocked" as const,
      sessions: [{ name: "default", running: true, status: "blocked" as const, error: null, workspaces: [
        { workspace_id: "w1", label: "x", number: 1, status: "blocked" as const, tabs: [
          { tab_id: "w1:t1", label: "1", number: 1, status: "blocked" as const, panes: [
            { pane_id: "w1:p1", terminal_id: "t1", title: "fix", cwd: null, agent: "claude", status: "blocked" as const } ] } ] } ] }],
    };
    const machinesNav = () => screen.queryByRole("navigation", { name: "Machines" });
    const agentsCol = () => screen.queryByRole("complementary", { name: "Agents" });

    it("⌘B hides and shows the sidebar, keeping the Agents column", () => {
      useLayout.setState({ layout: "normal" });
      useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false });
      render(<App />);
      expect(screen.getByRole("button", { name: "Hide sidebar" }).getAttribute("aria-expanded")).toBe("true");
      fireEvent.keyDown(window, { key: "b", metaKey: true });
      expect(machinesNav()).toBeNull();
      expect(agentsCol()).toBeTruthy();
      expect(screen.getByRole("button", { name: "Show sidebar" }).getAttribute("aria-expanded")).toBe("false");
      fireEvent.keyDown(window, { key: "b", metaKey: true });
      expect(machinesNav()).toBeTruthy();
    });

    it("⌘⇧B hides both columns and shows how many agents wait; the pill goes to the next one", () => {
      useLayout.setState({ layout: "normal" });
      useApp.setState({ machines: { local: blockedMachine }, order: ["local"], selected: null, dashboardOpen: false });
      render(<App />);
      expect(screen.queryByRole("button", { name: /go to the next one \(⌘J\)/ })).toBeNull();
      fireEvent.keyDown(window, { key: "B", metaKey: true, shiftKey: true });
      expect(machinesNav()).toBeNull();
      expect(agentsCol()).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "1 blocked: go to the next one (⌘J)" }));
      expect(useApp.getState().selected).toEqual({ machine_id: "local", session: "default", pane_id: "w1:p1" });
      expect(useLayout.getState().layout).toBe("focus");
      useApp.setState({ selected: null });
    });

    it("the toggle button shows the sidebar again from focus", () => {
      useLayout.setState({ layout: "focus" });
      useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false });
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Show sidebar" }));
      expect(machinesNav()).toBeTruthy();
      expect(agentsCol()).toBeTruthy();
    });
  });

  describe("⌘J", () => {
    const p = (id: string, status: "blocked" | "done" | "working") =>
      ({ pane_id: id, terminal_id: "t" + id, title: "pane " + id, cwd: null, agent: "claude", status });
    const m = (id: string, panes: ReturnType<typeof p>[]) => ({
      id, label: id, kind: "local" as const, state: "connected" as const, error: null, version: "0.9.3", status: "idle" as const,
      sessions: [{ name: "s", running: true, status: "idle" as const, error: null, workspaces: [
        { workspace_id: "w1", label: "ws", number: 1, status: "idle" as const, tabs: [
          { tab_id: "w1:t1", label: "1", number: 1, status: "idle" as const, panes } ] } ] }],
    });
    const ref = (machine: string, pane: string) => ({ machine_id: machine, session: "s", pane_id: pane });
    const hud = () => screen.queryByRole("status", { name: "Queue" });

    it("walks the agents that need you across machines and shows where it is", () => {
      useLayout.setState({ layout: "normal" });
      useApp.setState({
        machines: { a: m("a", [p("x", "blocked"), p("y", "working")]), b: m("b", [p("z", "blocked")]) },
        order: ["a", "b"], selected: null, dashboardOpen: false, doneSeen: {}, statusSince: { "b/s/z": 1, "a/s/x": 2 },
      });
      render(<App />);
      fireEvent.keyDown(window, { key: "j", metaKey: true });
      expect(useApp.getState().selected).toEqual(ref("b", "z"));
      expect(hud()?.textContent).toContain("1 of 2");
      fireEvent.keyDown(window, { key: "j", metaKey: true });
      expect(useApp.getState().selected).toEqual(ref("a", "x"));
      fireEvent.keyDown(window, { key: "J", metaKey: true, shiftKey: true });
      expect(useApp.getState().selected).toEqual(ref("b", "z"));
      fireEvent.keyDown(window, { key: "Escape" });
      expect(hud()).toBeNull();
      useApp.setState({ selected: null });
    });

    it("says so when nothing needs you", () => {
      useApp.setState({ machines: { a: m("a", [p("y", "working")]) }, order: ["a"], selected: null, dashboardOpen: false });
      render(<App />);
      fireEvent.keyDown(window, { key: "j", metaKey: true });
      expect(hud()?.textContent).toContain("Nothing blocked or to review");
      expect(useApp.getState().selected).toBeNull();
    });
  });

  describe("Board", () => {
    const blockedMachine = {
      id: "local", label: "local", kind: "local" as const, state: "connected" as const, error: null, version: "0.9.3", status: "blocked" as const,
      sessions: [{ name: "default", running: true, status: "blocked" as const, error: null, workspaces: [
        { workspace_id: "w1", label: "x", number: 1, status: "blocked" as const, tabs: [
          { tab_id: "w1:t1", label: "1", number: 1, status: "blocked" as const, panes: [
            { pane_id: "w1:p1", terminal_id: "t1", title: "fix", cwd: null, agent: "claude", status: "blocked" as const } ] } ] } ] }],
    };
    it("carries how many need you, and ⇧⌘D opens and closes it", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      // The Board's quota column fetches on open; give it an outcome rather than the default [].
      (invoke as any).mockImplementation((cmd: string) => Promise.resolve(cmd === "quota_fetch" ? { kind: "notSignedIn" } : []));
      // An earlier test opened the Board while every call answered []; its quota slots are not outcomes.
      useQuota.setState({ slots: initialSlots() });
      useLayout.setState({ layout: "normal" });
      useApp.setState({ machines: { local: blockedMachine }, order: ["local"], selected: null, dashboardOpen: false, doneSeen: {} });
      render(<App />);
      expect(screen.getByRole("button", { name: "Board, 1 needs you (⇧⌘D)" })).toBeTruthy();
      fireEvent.keyDown(window, { key: "D", metaKey: true, shiftKey: true });
      expect(screen.getByRole("dialog", { name: "Agent Dashboard" })).toBeTruthy();
      fireEvent.keyDown(window, { key: "D", metaKey: true, shiftKey: true });
      expect(screen.queryByRole("dialog", { name: "Agent Dashboard" })).toBeNull();
      (invoke as any).mockImplementation(() => Promise.resolve([]));
    });
    it("drops its word when the sidebar is hidden, keeping the count and its name", () => {
      useLayout.setState({ layout: "sidebar-hidden" });
      useApp.setState({ machines: { local: blockedMachine }, order: ["local"], selected: null, dashboardOpen: false, doneSeen: {} });
      render(<App />);
      const board = screen.getByRole("button", { name: "Board, 1 needs you (⇧⌘D)" });
      expect(board.textContent).toBe("1");
      useLayout.setState({ layout: "normal" });
    });
    it("leaves the count to the waiting pill in focus", () => {
      useLayout.setState({ layout: "focus" });
      useApp.setState({ machines: { local: blockedMachine }, order: ["local"], selected: null, dashboardOpen: false, doneSeen: {} });
      render(<App />);
      expect(screen.getByRole("button", { name: "Board (⇧⌘D)" })).toBeTruthy();
      useLayout.setState({ layout: "normal" });
    });
  });
});
