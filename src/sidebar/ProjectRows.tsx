import { useMemo } from "react";
import type { MachineView, SessionView } from "../lib/types";
import { useApp } from "../store/app";
import { CheckIcon } from "../ui/icons";
import { useSessionFilter, useViewOrigin } from "./activeFilter";
import { sessionProjects } from "./projects";
import type { ProjectRow } from "./projects";

/** The word a project row carries: only the states that ask something of the user have one. */
const WORD: Partial<Record<ProjectRow["state"], string>> = { blocked: "Blocked", review: "Review" };

/** The Workspace holding the selected pane, when it is in this Session. */
function useSelectedWorkspace(machineId: string, session: SessionView): string | null {
  const selected = useApp((s) => (s.selected?.machine_id === machineId && s.selected.session === session.name ? s.selected.pane_id : null));
  return useMemo(
    () => (selected ? session.workspaces.find((w) => w.tabs.some((t) => t.panes.some((p) => p.pane_id === selected)))?.workspace_id ?? null : null),
    [selected, session],
  );
}

/** A Session's projects (its Workspaces with agent work; every one under All) as rows under it. */
export function useProjects(machine: MachineView, session: SessionView): { rows: ProjectRow[]; current: string | null } {
  const doneSeen = useApp((s) => s.doneSeen);
  const all = useSessionFilter((s) => s.filter === "all");
  const rows = useMemo(() => sessionProjects(machine, session, doneSeen, all), [machine, session, doneSeen, all]);
  const selectedWs = useSelectedWorkspace(machine.id, session);
  const fromTree = useViewOrigin((s) => s.from === "sessions");
  return { rows, current: fromTree && rows.some((r) => r.id === selectedWs) ? selectedWs : null };
}

export function ProjectRows({ rows, current }: { rows: ProjectRow[]; current: string | null }) {
  const select = useApp((s) => s.select);
  const setOrigin = useViewOrigin((s) => s.set);
  return (
    <ul className="project-list">
      {rows.map((r) => {
        const word = WORD[r.state];
        const lanes = r.state === "working" && r.lanes > 0 ? `${r.lanes} ${r.lanes === 1 ? "lane" : "lanes"}` : null;
        const open = () => {
          if (!r.target) return;
          setOrigin("sessions");
          select(r.target);
        };
        return (
          <li key={r.id}>
            <button
              type="button"
              className={"project-row " + r.state + (r.id === current ? " active" : "")}
              aria-current={r.id === current ? "true" : undefined}
              aria-label={[r.label, word?.toLowerCase(), lanes].filter(Boolean).join(", ")}
              onClick={open}
            >
              {r.state === "review" ? <CheckIcon className="icon mark-done" aria-hidden="true" /> : <span className="project-dot" aria-hidden="true" />}
              <span className="label">{r.label}</span>
              {word ? <span className={"project-word " + r.state}>{word}</span> : lanes && <span className="project-meta">{lanes}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
