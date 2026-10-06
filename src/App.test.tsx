import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]), Channel: class {} }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
// xterm needs a real window; the Terminal lens is stood in for by its loading overlay.
vi.mock("./terminal/TerminalLens", async () => {
  const { StartingOverlay } = await import("./terminal/StartingOverlay");
  return { TerminalLens: ({ pane }: { pane: import("./lib/types").PaneRef }) => <StartingOverlay pane={pane} /> };
});

import App from "./App";
import { useApp } from "./store/app";
import { useLensSettings } from "./settings/lens";
import { useLayout } from "./settings/layout";

describe("App shell", () => {
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

  it("opens the Agent Dashboard over the main area from the sidebar, keeping the main area mounted", () => {
    useApp.setState({ machines: {}, order: [], selected: null, dashboardOpen: false });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /agent dashboard/i }));
    expect(screen.getByRole("dialog", { name: "Agent Dashboard" })).toBeTruthy();
    expect(screen.getByText("Select a pane")).toBeTruthy();
    // ⌘K searches the dashboard instead of opening the palette.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Agent Dashboard" })).toBeNull();
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

    it("⌘⇧B hides both columns and shows how many agents wait; the pill brings them back", () => {
      useLayout.setState({ layout: "normal" });
      useApp.setState({ machines: { local: blockedMachine }, order: ["local"], selected: null, dashboardOpen: false });
      render(<App />);
      expect(screen.queryByRole("button", { name: /waiting/ })).toBeNull();
      fireEvent.keyDown(window, { key: "B", metaKey: true, shiftKey: true });
      expect(machinesNav()).toBeNull();
      expect(agentsCol()).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "1 agent waiting, show the sidebar" }));
      expect(machinesNav()).toBeTruthy();
      expect(agentsCol()).toBeTruthy();
      expect(useLayout.getState().layout).toBe("normal");
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
});
