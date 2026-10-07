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
import { idleLabel, paneState, useMinuteClock, usePaneFilter } from "./paneFilter";
import { laneTitle, paneRoles, tabRole } from "./roles";
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

/** Splits a workspace's rows into consecutive runs sharing a tab. */
function tabRuns(rows: Row[]): Row[][] {
  const runs: Row[][] = [];
  for (const r of rows) {
    const last = runs[runs.length - 1];
    if (last && last[0].entry.tab.tab_id === r.entry.tab.tab_id) last.push(r);
    else runs.push([r]);
  }
  return runs;
}

/** What a row's accessible name says about its status; "" for a shell, which herdr reports none for. */
function statusWord(status: AgentStatus, seen: boolean, agent: boolean): string {
  if (status === "blocked") return "needs input";
  if (status === "working") return "working";
  if (status === "done") return seen ? "done" : "done, not seen";
  if (status === "idle") return "idle";
  return agent ? "state unknown" : "";
}

/** A pane with how Active treats it (paneFilter.ts). */
interface Row {
  entry: PaneEntry;
  /** The pane's store key (paneKey). */
  key: string;
  quiet: boolean;
  /** Set on an agent kept in Active for having gone idle recently. */
  idleFor: number | null;
  /** The workspace's orchestrator, or one of the lanes it dispatched (roles.ts). */
  role: "orch" | "lane" | null;
}

/** "1 working, 1 done, 1 needs input" over some lanes. */
function laneSummary(lanes: Row[]): string {
  const n = (s: AgentStatus) => lanes.filter((r) => r.entry.pane.status === s).length;
  const parts: [number, string][] = [[n("working"), "working"], [n("done"), "done"], [n("blocked"), "needs input"], [n("idle"), "idle"]];
  return parts.filter(([c]) => c > 0).map(([c, w]) => `${c} ${w}`).join(", ");
}

/** The mark at a row's end: only the states that ask for a look carry one. */
function StatusMark({ status, seen, agent }: { status: AgentStatus; seen: boolean; agent: boolean }) {
  if (status === "blocked")
    return (
      <>
        <span className="agent-input">INPUT</span>
        <span className="mark mark-blocked" aria-hidden="true" />
      </>
    );
  if (status === "working") return <span className="mark mark-working" aria-hidden="true" />;
  if (status === "done" && !seen) return <CheckIcon className="icon mark-done" aria-hidden="true" />;
  if (status === "unknown" && agent)
    return (
      <span className="mark-unknown" title="herdr can't read this agent's state (started through a wrapper?)">
        ?
      </span>
    );
  return <span className="mark" aria-hidden="true" />;
}

type Reorder = ReturnType<typeof useTabReorder>;

/** `tabRow` when this card is its Tab's whole row (a single-pane Tab), so it is also the drop target. */
function AgentCard({
  machineId,
  session,
  row,
  reorder,
  tabRow,
  lanes,
}: {
  machineId: string;
  session: string;
  row: Row;
  reorder: Reorder;
  tabRow?: boolean;
  /** On the orchestrator's row: its lanes' toggle. */
  lanes?: { rows: Row[]; open: boolean; toggle: () => void };
}) {
  const { entry, quiet, idleFor } = row;
  const { pane, workspace: ws, tab } = entry;
  // A lane's place under its orchestrator already says "lane".
  const title = row.role === "lane" || tabRole(tab.label) === "brief" ? laneTitle(pane.title) : pane.title;
  const ref = { machine_id: machineId, session, pane_id: pane.pane_id };
  const active = useApp((s) => s.selected !== null && paneKey(s.selected) === paneKey(ref));
  const seen = useApp((s) => !!s.doneSeen[paneKey(ref)]);
  const word = statusWord(pane.status, seen, !!pane.agent);
  // The tab's name only when it says more than its number.
  const activity = pane.agent ? "" : (pane.activity ?? "");
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
      className={"agent-card-item" + (row.role === "lane" ? " lane-row" : "") + (lanes ? " has-lanes" : "") + (tabRow ? reorder.indicatorClass(tab.tab_id) : "")}
      {...(tabRow ? reorder.target(tab.tab_id) : {})}
    >
      <button
        {...reorder.source(tab.tab_id)}
        className={"agent-card" + (active ? " active" : "") + (pane.status === "blocked" ? " blocked" : "") + (pane.agent ? "" : " shell") + (quiet ? " quiet" : "")}
        aria-label={`${title}${activity ? ` · ${activity}` : ""}, ${pane.agent ?? "shell"}${word ? `, ${word}` : ""}`}
        aria-current={active ? "true" : undefined}
        onClick={() => select(ref)}
        onContextMenu={(e) => a?.menu(e, items)}
        // The tab's name and the folder live in the tooltip: on the row they crowded the title.
        title={[sub, pane.cwd].filter(Boolean).join(" · ") || undefined}
      >
        <AgentIcon agent={pane.agent} />
        <span className={"agent-card-title" + (activity ? " has-activity" : "")}>{title}</span>
        {activity && <span className="agent-card-activity">{activity}</span>}
        {!quiet && idleFor !== null && (
          <span className="row-age" title={`Idle for ${idleLabel(idleFor)}`}>
            {idleLabel(idleFor)}
          </span>
        )}
        <StatusMark status={pane.status} seen={seen} agent={!!pane.agent} />
      </button>
      {lanes && (
        <button className="lane-toggle" aria-expanded={lanes.open} title={laneSummary(lanes.rows)} onClick={lanes.toggle}>
          {lanes.rows.length} lanes
          <ChevronIcon className={"icon chev" + (lanes.open ? " open" : "")} />
        </button>
      )}
      <button className="agent-card-close" aria-label={`Close ${title}`} title="Close pane" onClick={() => a?.guard(close)}>
        <CloseIcon />
      </button>
    </li>
  );
}

function WorkspaceGroup({ machineId, session, workspace: ws, rows: all, active }: { machineId: string; session: string; workspace: WorkspaceView; rows: Row[]; active: boolean }) {
  const a = useActions();
  const ref = { machine_id: machineId, session, workspace_id: ws.workspace_id };
  const folder = useFolder(ref);
  const call = (method: string, params: unknown) => () => herdrCall(machineId, session, method, params);
  // The header folds the whole workspace (§7.1); Active leaves out the quiet panes.
  const foldKey = `ws:${machineId}/${session}/${ws.workspace_id}`;
  const open = useApp((s) => s.expanded[foldKey] ?? true);
  const toggle = useApp((s) => s.toggle);
  const selected = useApp((s) => (s.selected ? paneKey(s.selected) : null));
  const doneSeen = useApp((s) => s.doneSeen);
  const entries = all.map((r) => r.entry);
  const keyOf = (e: PaneEntry) => paneKey({ machine_id: machineId, session, pane_id: e.pane.pane_id });
  // The selected pane always shows, so ⌘J and the palette never land on a hidden row.
  // Lanes sit right under their orchestrator and fold behind it; one that needs input, or the
  // selected one, still shows.
  const lanesKey = `lanes:${machineId}/${session}/${ws.workspace_id}`;
  const lanesOpen = useApp((s) => s.expanded[lanesKey] ?? false);
  const laneRows = all.filter((r) => r.role === "lane");
  const orch = all.find((r) => r.role === "orch");
  const ordered = orch ? all.filter((r) => r.role !== "lane").flatMap((r) => (r === orch ? [r, ...laneRows] : [r])) : all;
  const inView = (r: Row) =>
    r.role === "lane" ? lanesOpen || r.entry.pane.status === "blocked" : !active || !r.quiet;
  const shown = ordered.filter((r) => r.key === selected || (open && inView(r)));
  const lanes = orch && { rows: laneRows, open: lanesOpen, toggle: () => toggle(lanesKey, lanesOpen) };
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
      {shown.length > 0 && rows(shown)}
    </section>
  );

  function rows(list: Row[]) {
    return (
        <ul className="agent-cards">
          {tabRuns(list).map((run) =>
            run.length > 1 ? (
              <li
                key={run[0].entry.tab.tab_id}
                role="group"
                aria-label={`Tab ${run[0].entry.tab.label}`}
                className={"tab-group" + reorder.indicatorClass(run[0].entry.tab.tab_id)}
                {...reorder.target(run[0].entry.tab.tab_id)}
              >
                <ul className="agent-cards">
                  {run.map((r) => (
                    <AgentCard key={r.entry.pane.pane_id} machineId={machineId} session={session} row={r} reorder={reorder} lanes={r === orch ? lanes || undefined : undefined} />
                  ))}
                </ul>
              </li>
            ) : (
              <AgentCard key={run[0].entry.pane.pane_id} machineId={machineId} session={session} row={run[0]} reorder={reorder} lanes={run[0] === orch ? lanes || undefined : undefined} tabRow />
            ),
          )}
        </ul>
    );
  }
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
  return <SessionPanes machineId={viewed.machine_id} session={session} />;
});

/** The PANES header (All | Active N, as in the sidebar's Sessions section). */
function PanesHeader({ active, count }: { active: boolean; count: number }) {
  const setFilter = usePaneFilter((s) => s.setFilter);
  return (
    <div className="section-head panes-head">
      <span className="section-label">Panes</span>
      <div className={"seg seg-sm" + (active ? " seg-right" : "")} role="group" aria-label="Show panes">
        <span className="seg-thumb" aria-hidden="true" />
        <button type="button" aria-pressed={!active} onClick={() => setFilter("all")}>All</button>
        <button type="button" aria-pressed={active} onClick={() => setFilter("active")}>Active {count}</button>
      </div>
    </div>
  );
}

function SessionPanes({ machineId, session }: { machineId: string; session: SessionView }) {
  const active = usePaneFilter((s) => s.filter === "active");
  const doneSeen = useApp((s) => s.doneSeen);
  const since = useApp((s) => s.statusSince);
  const selected = useApp((s) => (s.selected ? paneKey(s.selected) : null));
  const now = useMinuteClock();
  const groups = workspaceGroups(session).map((g) => ({
    workspace: g.workspace,
    rows: ((roles) =>
      g.entries.map((entry, i): Row => {
        const key = paneKey({ machine_id: machineId, session: session.name, pane_id: entry.pane.pane_id });
        return { entry, key, role: roles[i], ...paneState(entry.pane, !!doneSeen[key], since[key], now) };
      }))(paneRoles(g.entries.map((e) => ({ tabLabel: e.tab.label, pane: e.pane })))),
  }));
  // A lane counts only while it needs the user: the rest is its orchestrator's.
  const kept = (r: Row) => r.key === selected || (r.role === "lane" ? r.entry.pane.status === "blocked" : !r.quiet);
  const count = groups.reduce((n, g) => n + g.rows.filter(kept).length, 0);
  // Active drops a workspace whose panes it all leaves out; an empty one stays, to add to it.
  const visible = active ? groups.filter((g) => g.rows.length === 0 || g.rows.some(kept)) : groups;
  return (
    <ActionsProvider>
      <div className="agents-head" data-tauri-drag-region>
        <span className="agents-title">{session.name}</span>
        <SessionQueueChip machineId={machineId} session={session.name} />
        {session.running && <NewWorkspaceButton machineId={machineId} session={session.name} />}
      </div>
      {session.running && groups.length > 0 && <PanesHeader active={active} count={count} />}
      {/* Only the list scrolls, so the head needs no background of its own: a second layer of the
          translucent chrome would darken it against the column. */}
      <div className="agents-list">
        {!session.running ? (
          <StoppedSession machineId={machineId} session={session.name} />
        ) : groups.length === 0 ? (
          <p className="agents-empty">No panes</p>
        ) : visible.length === 0 ? (
          <p className="agents-empty">Nothing active</p>
        ) : (
          visible.map((g) => (
            <WorkspaceGroup key={g.workspace.workspace_id} machineId={machineId} session={session.name} workspace={g.workspace} rows={g.rows} active={active} />
          ))
        )}
      </div>
    </ActionsProvider>
  );
}
