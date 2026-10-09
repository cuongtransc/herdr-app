import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paneKey, type Located, type MachineView, type PaneView } from "../lib/types";
import { useApp } from "../store/app";
import { forkBlocked, forkSession, useForks } from "./forkSession";

const orig = { machine_id: "local", session: "default", pane_id: "w1:p1" };
const claude = (status: PaneView["status"], extra: Partial<PaneView> = {}): PaneView =>
  ({ pane_id: "w1:p1", terminal_id: "t1", title: "Port Files panel", cwd: "/srv/app", agent: "claude", status, ...extra }) as PaneView;

const machine = (forkAgent: string | null): MachineView => ({
  id: "local", label: "local", kind: "local", state: "connected", error: null, version: "0.9.3", status: "idle",
  sessions: [{ name: "default", running: true, status: "idle", error: null, workspaces: [
    { workspace_id: "w1", label: "app", number: 1, status: "idle", tabs: [
      { tab_id: "w1:t1", label: "orch-app", number: 1, status: "idle", panes: [claude("idle")] },
      { tab_id: "w1:t9", label: "fork", number: 2, status: "idle", panes: [
        { pane_id: "w1:p9", terminal_id: "t9", title: "zsh", cwd: "/srv/app", agent: forkAgent, status: "idle" } ] },
    ] },
  ] }],
});
const ws = machine(null).sessions[0].workspaces[0];

const located = (over: Partial<Located> = {}): Located => ({ agent: "claude", path: "/h/.claude/projects/x/sid-1.jsonl", ambiguous: false, candidates: [], pending: false, ...over });

describe("forkBlocked", () => {
  it("allows a Claude pane that is idle or done", () => {
    expect(forkBlocked(claude("idle"))).toBeNull();
    expect(forkBlocked(claude("done"))).toBeNull();
  });

  it("says why a busy pane, another agent or a wrapped Claude cannot be forked", () => {
    expect(forkBlocked(claude("working"))).toBe("Busy: a fork now would run its unfinished command again. Fork once it finishes.");
    expect(forkBlocked(claude("blocked"))).toBe("Waiting for an answer: a fork now would run its unfinished command again. Answer it first.");
    expect(forkBlocked(claude("idle", { agent: "pi" }))).toBe("Only Claude sessions can be forked");
    expect(forkBlocked(claude("idle", { untracked: true }))).toBe("Herdr does not track this Claude session");
  });
});

describe("forkSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 16, 5));
    localStorage.clear();
    useForks.setState({ forks: {} });
    useApp.setState({ machines: {}, order: [], selected: null, lensOverride: {}, starting: {} });
    useApp.getState().upsertMachine(machine(null));
  });
  afterEach(() => vi.useRealTimers());

  const deps = (over: { session?: unknown; located?: Located } = {}) => {
    const call = vi.fn(async (method: string) => {
      if (method === "agent.get") return { agent: { agent: "claude", agent_session: "session" in over ? over.session : { agent: "claude", kind: "id", value: "sid-1" } } };
      if (method === "tab.create") return { root_pane: { pane_id: "w1:p9" } };
      if (method === "agent.start") {
        useApp.getState().upsertMachine(machine("claude"));
        return {};
      }
      return {};
    });
    const locate = vi.fn(async () => over.located ?? located());
    return { call, locate };
  };

  it("opens a tab beside it running claude on a fork of the session, named after it, and records where it came from", async () => {
    const d = deps();
    await forkSession(orig, ws, claude("idle"), { worktree: false }, d);
    expect(d.locate).toHaveBeenCalledWith(orig);
    expect(d.call).toHaveBeenCalledWith("agent.get", { target: "w1:p1" });
    expect(d.call).toHaveBeenCalledWith("tab.create", { workspace_id: "w1", cwd: "/srv/app", label: "fork", focus: false });
    expect(d.call).toHaveBeenCalledWith("agent.start", expect.objectContaining({
      kind: "claude", pane_id: "w1:p9",
      args: ["--resume", "sid-1", "--fork-session", "--name", "Fork · Port Files panel"],
    }));
    const fork = { machine_id: "local", session: "default", pane_id: "w1:p9" };
    expect(useApp.getState().selected).toEqual(fork);
    expect(useForks.getState().forks[paneKey(fork)]).toEqual({ of: orig, from: "Port Files panel", at: new Date(2026, 9, 9, 16, 5).getTime(), worktree: null });
  });

  it("forks into a new worktree named for the time", async () => {
    const d = deps();
    await forkSession(orig, ws, claude("done"), { worktree: true }, d);
    expect(d.call).toHaveBeenCalledWith("agent.start", expect.objectContaining({
      args: ["--resume", "sid-1", "--fork-session", "--name", "Fork · Port Files panel", "--worktree", "fork-20261009-1605"],
    }));
    expect(useForks.getState().forks["local/default/w1:p9"].worktree).toBe("fork-20261009-1605");
  });

  it("refuses before opening anything when the session has no transcript yet, is a guess, or herdr reports no id", async () => {
    for (const [over, msg] of [
      [{ located: located({ pending: true }) }, "Nothing to fork yet: send it a first message"],
      [{ located: located({ ambiguous: true }) }, "Herdr is not sure which session this pane runs, so it cannot fork it"],
      [{ session: null }, "Herdr has not reported this pane's session yet"],
    ] as const) {
      const d = deps(over);
      await expect(forkSession(orig, ws, claude("idle"), { worktree: false }, d)).rejects.toThrow(msg);
      expect(d.call).not.toHaveBeenCalledWith("tab.create", expect.anything());
    }
  });

  it("refuses a busy pane even when asked directly", async () => {
    const d = deps();
    await expect(forkSession(orig, ws, claude("working"), { worktree: false }, d)).rejects.toThrow(/^Busy/);
    expect(d.call).not.toHaveBeenCalled();
  });
});
