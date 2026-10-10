import { memo, useLayoutEffect, useRef } from "react";
import { triageQueue } from "../dashboard/triage";
import { useLayout } from "../settings/layout";
import { useShortcutLabel } from "../shortcuts/store";
import { useApp } from "../store/app";
import { BoardIcon, SidebarIcon } from "../ui/icons";
import { useTriage } from "./triage";

/** Beside the traffic lights whatever the layout: the sidebar toggle and, in focus, the agents that need you (a click steps like ⌘J). */
/** " (⌘B)" after a name, or nothing when the action has no key. */
const keyHint = (label: string | null) => (label ? ` (${label})` : "");

export const LayoutControls = memo(function LayoutControls() {
  const layout = useLayout((s) => s.layout);
  const toggle = useLayout((s) => s.toggle);
  // "waiting:done" as one string, so the selector's value compares equal between renders.
  const counts = useApp((s) => {
    const q = triageQueue(s.machines, s.order, s.doneSeen, s.statusSince);
    const waiting = q.filter((c) => c.bucket === "attention").length;
    return `${waiting}:${q.length - waiting}`;
  });
  const [waiting, done] = counts.split(":").map(Number);
  const step = useTriage((s) => s.step);
  const boardOpen = useApp((s) => s.dashboardOpen);
  const setBoardOpen = useApp((s) => s.setDashboardOpen);
  const focus = layout === "focus";
  const sidebarKey = keyHint(useShortcutLabel("layout.sidebar"));
  const focusKey = keyHint(useShortcutLabel("layout.focus"));
  const boardKey = keyHint(useShortcutLabel("board"));
  const nextKey = keyHint(useShortcutLabel("triage.next"));
  // In focus the waiting pill carries the count; the Board shows it otherwise.
  const need = focus ? 0 : waiting + done;
  const shown = layout === "normal";
  // The first column's titlebar content starts past the traffic lights (78 px) and these controls,
  // whose width changes with the pill: published to the container as --lead.
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => host.style.setProperty("--lead", `${78 + Math.ceil(e.contentRect.width) + 10}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="layout-controls" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-expanded={shown}
        aria-controls="sidebar"
        aria-label={shown ? "Hide sidebar" : "Show sidebar"}
        title={shown ? `Hide sidebar${sidebarKey} · Focus${focusKey}` : `Show sidebar${sidebarKey}`}
        onClick={() => toggle("sidebar")}
      >
        <SidebarIcon />
      </button>
      <button
        type="button"
        className="board-btn"
        aria-pressed={boardOpen}
        aria-label={`Board${need ? `, ${need} ${need === 1 ? "needs" : "need"} you` : ""}${boardKey}`}
        title={`Agent Board: everything by status${boardKey}`}
        onClick={() => setBoardOpen(!boardOpen)}
      >
        <BoardIcon />
        {/* With the sidebar hidden the controls sit over the Agents column: the word gives way. */}
        {shown && "Board"}
        {need > 0 && <span className="need" aria-hidden="true">{need}</span>}
      </button>
      {focus && waiting + done > 0 && (
        <button
          type="button"
          className="waiting-pill"
          aria-label={`${[waiting && `${waiting} blocked`, done && `${done} review`].filter(Boolean).join(", ")}: go to the next one${nextKey}`}
          title={`Next Blocked or Review${nextKey}`}
          onClick={() => step(1)}
        >
          <span className="dot" aria-hidden="true" />
          {[waiting && `${waiting} blocked`, done && `${done} review`].filter(Boolean).join(" · ")}
        </button>
      )}
    </div>
  );
});
