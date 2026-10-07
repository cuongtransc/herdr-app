import { memo } from "react";
import { herdrCall, sessionStart } from "../lib/ipc";
import { paneKey } from "../lib/types";
import type { AgentStatus, PaneView, SessionView, TabView, WorkspaceView } from "../lib/types";
import { useApp } from "../store/app";
import { stepTriage, triageQueue } from "../dashboard/triage";
import type { MenuItem } from "../sidebar/ContextMenu";
import { ActionsProvider, useActions } from "../sidebar/actions";
import { BotIcon, CheckIcon, ChevronIcon, CloseIcon, FolderOpenIcon, PencilIcon, PlusIcon, SplitDownIcon, SplitRightIcon, TabPlusIcon, TerminalIcon } from "../ui/icons";
import { folderName, suggestFolder, useFolder } from "../workspaces/folder";
import { AgentIcon } from "./AgentIcon";
import { AGENTS, openAgentTab } from "./openAgentTab";
import { useTabReorder } from "./tabDnd";

export interface PaneEntry {
  pane: PaneView;
  workspace: WorkspaceView;
  tab: TabView;
  /** The tab label when the workspace has several tabs, else "". */
  sub: string;
}

/** A session's workspaces in order, each with its panes (empty workspaces included). */
export function workspaceGroups(session: SessionView): { workspace: WorkspaceView; entries: PaneEntry[] }[] {
  return session.workspaces.map((workspace) => ({
    workspace,
    entries: workspace.tabs.flatMap((tab) =>
      tab.panes.map((pane) => ({ pane, workspace, tab, sub: workspace.tabs.length > 1 ? tab.label : "" })),
    ),
  }));
}

/** Splits a workspace's entries into consecutive runs sharing a tab. */
function tabRuns(entries: PaneEntry[]): PaneEntry[][] {
  const runs: PaneEntry[][] = [];
  for (const e of entries) {
    const last = runs[runs.length - 1];
    if (last && last[0].tab.tab_id === e.tab.tab_id) last.push(e);
    else runs.push([e]);
  }
  return runs;
}

/** What a row's accessible name says about its status; "" for a shell, which herdr reports none for. */
function statusWord(status: AgentStatus, seen: boolean): string {
  if (status === "blocked") return "needs input";
  if (status === "working") return "working";
  if (status === "done") return seen ? "done" : "done, not seen";
  if (status === "idle") return "idle";
  return "";
}

/** A pane's title when it is only the shell's name: such a shell has nothing to watch. */
const SHELL_NAMES = new Set(["sh", "bash", "zsh", "fish", "nu", "pwsh", "dash", "ksh", "tcsh"]);
const isPlainShell = (pane: PaneView) => !pane.agent && SHELL_NAMES.has(pane.title.trim().replace(/^-/, ""));

/** Where a pane goes in the column (docs/design/ui-ux-guidelines.md §7.1): shown, or folded as idle or shell. */
function placement(pane: PaneView, seen: boolean): "shown" | "idle" | "shell" {
  if (!pane.agent) return isPlainShell(pane) ? "shell" : "shown";
  if (pane.status === "blocked" || pane.status === "working") return "shown";
  if (pane.status === "done" && !seen) return "shown";
  return "idle";
}

/** The mark at a row's end: only the states that ask for a look carry one. */
function StatusMark({ status, seen }: { status: AgentStatus; seen: boolean }) {
  if (status === "blocked")
    return (
      <>
        <span className="agent-input">INPUT</span>
        <span className="mark mark-blocked" aria-hidden="true" />
      </>
    );
  if (status === "working") return <span className="mark mark-working" aria-hidden="true" />;
  if (status === "done" && !seen) return <CheckIcon className="icon mark-done" aria-hidden="true" />;
  return <span className="mark" aria-hidden="true" />;
}

type Reorder = ReturnType<typeof useTabReorder>;

/** `tabRow` when this card is its Tab's whole row (a single-pane Tab), so it is also the drop target. */
function AgentCard({ machineId, session, entry, reorder, tabRow }: { machineId: string; session: string; entry: PaneEntry; reorder: Reorder; tabRow?: boolean }) {
  const { pane, workspace: ws, tab } = entry;
  const ref = { machine_id: machineId, session, pane_id: pane.pane_id };
  const active = useApp((s) => s.selected !== null && paneKey(s.selected) === paneKey(ref));
  const seen = useApp((s) => !!s.doneSeen[paneKey(ref)]);
  const word = statusWord(pane.status, seen);
  // The tab's name only when it says more than its number.
  const sub = entry.sub && !/^\d+$/.test(entry.sub) ? entry.sub : "";
  const select = useApp((s) => s.select);
  const a = useActions();
  const call = (method: string, params: unknown) => () => herdrCall(machineId, session, method, params);
  const close = call("pane.close", { pane_id: pane.pane_id });
  const items: MenuItem[] = a
    ? [
        { label: "Rename…", icon: PencilIcon, onSelect: () => a.rename("Rename pane", pane.title, (label) => call("pane.rename", { pane_id: pane.pane_id, label })()) },
        { label: "Split right", icon: SplitRightIcon, onSelect: () => a.guard(call("pane.split", { target_pane_id: pane.pane_id, direction: "right" })) },
        { label: "Split down", icon: SplitDownIcon, onSelect: () => a.guard(call("pane.split", { target_pane_id: pane.pane_id, direction: "down" })) },
        { label: "Close pane", icon: CloseIcon, onSelect: () => a.guard(close) },
        { label: "New tab", icon: TabPlusIcon, onSelect: () => a.guard(call("tab.create", { workspace_id: ws.workspace_id })) },
        { label: "Rename tab…", icon: PencilIcon, onSelect: () => a.rename("Rename tab", tab.label, (label) => call("tab.rename", { tab_id: tab.tab_id, label })()) },
        { label: "Close tab", icon: CloseIcon, onSelect: () => a.confirm("Close tab", `Close tab "${tab.label}" and all its panes?`, "Close", call("tab.close", { tab_id: tab.tab_id })) },
      ]
    : [];
  return (
    <li
      className={"agent-card-item" + (tabRow ? reorder.indicatorClass(tab.tab_id) : "")}
      {...(tabRow ? reorder.target(tab.tab_id) : {})}
    >
      <button
        {...reorder.source(tab.tab_id)}
        className={"agent-card" + (active ? " active" : "") + (pane.status === "blocked" ? " blocked" : "") + (pane.agent ? "" : " shell")}
        aria-label={`${pane.title}, ${pane.agent ?? "shell"}${word ? `, ${word}` : ""}`}
        aria-current={active ? "true" : undefined}
        onClick={() => select(ref)}
        onContextMenu={(e) => a?.menu(e, items)}
        title={pane.cwd ?? undefined}
      >
        <AgentIcon agent={pane.agent} />
        <span className="agent-card-title">{pane.title}</span>
        {sub && <span className="agent-card-sub">{sub}</span>}
        <StatusMark status={pane.status} seen={seen} />
      </button>
      <button className="agent-card-close" aria-label={`Close ${pane.title}`} title="Close pane" onClick={() => a?.guard(close)}>
        <CloseIcon />
      </button>
    </li>
  );
}

function WorkspaceGroup({ machineId, session, workspace: ws, entries }: { machineId: string; session: string; workspace: WorkspaceView; entries: PaneEntry[] }) {
  const a = useActions();
  const ref = { machine_id: machineId, session, workspace_id: ws.workspace_id };
  const folder = useFolder(ref);
  const call = (method: string, params: unknown) => () => herdrCall(machineId, session, method, params);
  // Folding (§7.1): the header folds the whole workspace; idle agents and plain shells always sit behind a line.
  const foldKey = `ws:${machineId}/${session}/${ws.workspace_id}`;
  const quietKey = `quiet:${machineId}/${session}/${ws.workspace_id}`;
  const open = useApp((s) => s.expanded[foldKey] ?? true);
  const quietOpen = useApp((s) => s.expanded[quietKey] ?? false);
  const toggle = useApp((s) => s.toggle);
  const selected = useApp((s) => (s.selected ? paneKey(s.selected) : null));
  const doneSeen = useApp((s) => s.doneSeen);
  const keyOf = (e: PaneEntry) => paneKey({ machine_id: machineId, session, pane_id: e.pane.pane_id });
  const place = (e: PaneEntry) => placement(e.pane, !!doneSeen[keyOf(e)]);
  // The selected pane always shows, so ⌘J and the palette never land on a hidden row.
  const visible = (e: PaneEntry) => keyOf(e) === selected || (open && (quietOpen || place(e) === "shown"));
  const idle = entries.filter((e) => place(e) === "idle").length;
  const shells = entries.filter((e) => place(e) === "shell").length;
  const quietLabel = [idle && `${idle} idle`, shells && `${shells} ${shells === 1 ? "shell" : "shells"}`].filter(Boolean).join(" · ");
  const need = entries.filter((e) => {
    if (!e.pane.agent) return false;
    return e.pane.status === "blocked" || (e.pane.status === "done" && !doneSeen[keyOf(e)]);
  }).length;
  const reorder = useTabReorder(
    ws.tabs.map((t) => t.tab_id),
    (tab_id, insert_index) => a?.guard(call("tab.move", { tab_id, insert_index })),
  );
  const items: MenuItem[] = a
    ? [
        // Starts straight away in the workspace folder (else a pane's cwd, else herdr's default).
        ...AGENTS.map((agent) => ({
          label: `New ${agent}`,
          icon: agent === "shell" ? TerminalIcon : BotIcon,
          onSelect: () => a.guard(() => openAgentTab(machineId, session, ws.workspace_id, agent, folder ?? suggestFolder(ws))),
        })),
        { label: "Change folder…", icon: FolderOpenIcon, onSelect: () => a.changeFolder(ref, folder ?? suggestFolder(ws)) },
        { label: "Rename workspace…", icon: PencilIcon, onSelect: () => a.rename("Rename workspace", ws.label, (label) => call("workspace.rename", { workspace_id: ws.workspace_id, label })()) },
        { label: "Close workspace", icon: CloseIcon, onSelect: () => a.confirm("Close workspace", `Close workspace "${ws.label}" and all its panes?`, "Close", call("workspace.close", { workspace_id: ws.workspace_id })) },
      ]
    : [];
  return (
    <section role="group" aria-label={ws.label} className="ws-group">
      <div className="ws-head" onContextMenu={(e) => a?.menu(e, items)}>
        <button
          className="ws-label"
          aria-expanded={open}
          aria-label={!open && need ? `${ws.label}, ${need} ${need === 1 ? "needs" : "need"} you` : undefined}
          onClick={() => toggle(foldKey, open)}
        >
          {ws.label}
        </button>
        {folder && <span className="ws-folder" title={folder}>{folderName(folder)}</span>}
        {!open && need > 0 && <span className="need" aria-hidden="true">{need}</span>}
        <button className="ws-add" aria-label={`New agent in ${ws.label}`} onClick={() => a?.newAgent(machineId, session, ws)}>
          <PlusIcon />
        </button>
      </div>
      {entries.some(visible) && (
        <ul className="agent-cards">
          {tabRuns(entries.filter(visible)).map((run) =>
            run.length > 1 ? (
              <li
                key={run[0].tab.tab_id}
                role="group"
                aria-label={`Tab ${run[0].tab.label}`}
                className={"tab-group" + reorder.indicatorClass(run[0].tab.tab_id)}
                {...reorder.target(run[0].tab.tab_id)}
              >
                <ul className="agent-cards">
                  {run.map((e) => (
                    <AgentCard key={e.pane.pane_id} machineId={machineId} session={session} entry={e} reorder={reorder} />
                  ))}
                </ul>
              </li>
            ) : (
              <AgentCard key={run[0].pane.pane_id} machineId={machineId} session={session} entry={run[0]} reorder={reorder} tabRow />
            ),
          )}
        </ul>
      )}
      {open && quietLabel && (
        <button className="ws-quiet" aria-expanded={quietOpen} onClick={() => toggle(quietKey, quietOpen)}>
          <ChevronIcon className={"icon chev" + (quietOpen ? " open" : "")} />
          {quietLabel}
        </button>
      )}
    </section>
  );
}

function StoppedSession({ machineId, session }: { machineId: string; session: string }) {
  const a = useActions();
  return (
    <div className="agents-stopped">
      <span>Stopped</span>
      <button className="btn btn-xs" aria-label={`Start ${session}`} onClick={() => a?.guard(() => sessionStart(machineId, session))}>
        Start
      </button>
    </div>
  );
}

/** The ⌘J queue (triage.ts) narrowed to one session. */
function sessionQueue(s: ReturnType<typeof useApp.getState>, machineId: string, session: string) {
  const machine = s.machines[machineId];
  if (!machine) return [];
  return triageQueue({ [machineId]: machine }, [machineId], s.doneSeen, s.statusSince).filter((c) => c.ref.session === session);
}

/** "1 waiting · 2 done" for the viewed session: a click selects the next of them, waiting first. */
function SessionQueueChip({ machineId, session }: { machineId: string; session: string }) {
  // "waiting:done" as one string, so the selector's value compares equal between renders.
  const counts = useApp((s) => {
    const q = sessionQueue(s, machineId, session);
    const waiting = q.filter((c) => c.bucket === "attention").length;
    return `${waiting}:${q.length - waiting}`;
  });
  const [waiting, done] = counts.split(":").map(Number);
  if (!waiting && !done) return null;
  const parts = [waiting && `${waiting} waiting`, done && `${done} done`].filter(Boolean) as string[];
  const next = () => {
    const s = useApp.getState();
    const q = sessionQueue(s, machineId, session);
    const at = stepTriage(q.map((c) => c.key), s.selected ? paneKey(s.selected) : null, -1, 1);
    if (at >= 0) s.select(q[at].ref);
  };
  return (
    <button
      type="button"
      className="need-chip"
      aria-label={`${parts.join(", ")}: go to the next one in this session`}
      title="Go to the next agent that needs you in this session"
      onClick={next}
    >
      {waiting > 0 && <span className="need-waiting">{waiting} waiting</span>}
      {waiting > 0 && done > 0 && " · "}
      {done > 0 && <span className="need-done">{done} done</span>}
    </button>
  );
}

function NewWorkspaceButton({ machineId, session }: { machineId: string; session: string }) {
  const a = useActions();
  return (
    <button className="ws-add" aria-label="New workspace" title="New workspace" onClick={() => a?.newWorkspace(machineId, session)}>
      <PlusIcon />
    </button>
  );
}

// Takes no props: memo keeps it out of App's re-renders; it reads the store itself.
export const AgentList = memo(function AgentList() {
  const viewed = useApp((s) => s.viewed);
  const session = useApp((s) =>
    s.viewed ? s.machines[s.viewed.machine_id]?.sessions.find((x) => x.name === s.viewed!.session) : undefined,
  );
  if (!viewed || !session)
    return (
      <>
        <div className="agents-head" data-tauri-drag-region />
        <p className="agents-empty">Select a session</p>
      </>
    );
  const groups = workspaceGroups(session);
  return (
    <ActionsProvider>
      <div className="agents-head" data-tauri-drag-region>
        <span className="agents-title">{session.name}</span>
        <SessionQueueChip machineId={viewed.machine_id} session={session.name} />
        {session.running && <NewWorkspaceButton machineId={viewed.machine_id} session={session.name} />}
      </div>
      {/* Only the list scrolls, so the head needs no background of its own: a second layer of the
          translucent chrome would darken it against the column. */}
      <div className="agents-list">
        {!session.running ? (
          <StoppedSession machineId={viewed.machine_id} session={session.name} />
        ) : groups.length === 0 ? (
          <p className="agents-empty">No panes</p>
        ) : (
          groups.map((g) => (
            <WorkspaceGroup key={g.workspace.workspace_id} machineId={viewed.machine_id} session={session.name} workspace={g.workspace} entries={g.entries} />
          ))
        )}
      </div>
    </ActionsProvider>
  );
});
