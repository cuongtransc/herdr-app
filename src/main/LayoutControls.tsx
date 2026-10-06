import { memo } from "react";
import { triageQueue } from "../dashboard/triage";
import { useLayout } from "../settings/layout";
import { useApp } from "../store/app";
import { SidebarIcon } from "../ui/icons";
import { useTriage } from "./triage";

/** Beside the traffic lights whatever the layout: the sidebar toggle and, in focus, the agents that need you (a click steps like ⌘J). */
export const LayoutControls = memo(function LayoutControls() {
  const layout = useLayout((s) => s.layout);
  const toggle = useLayout((s) => s.toggle);
  // "waiting:done" as one string, so the selector's value compares equal between renders.
  const counts = useApp((s) => {
    if (layout !== "focus") return "0:0";
    const q = triageQueue(s.machines, s.order, s.doneSeen, s.statusSince);
    const waiting = q.filter((c) => c.bucket === "attention").length;
    return `${waiting}:${q.length - waiting}`;
  });
  const [waiting, done] = counts.split(":").map(Number);
  const step = useTriage((s) => s.step);
  const shown = layout === "normal";
  return (
    <div className="layout-controls">
      <button
        type="button"
        className="icon-btn"
        aria-expanded={shown}
        aria-controls="sidebar"
        aria-label={shown ? "Hide sidebar" : "Show sidebar"}
        title={shown ? "Hide sidebar (⌘B) · Focus (⇧⌘B)" : "Show sidebar (⌘B)"}
        onClick={() => toggle("sidebar")}
      >
        <SidebarIcon />
      </button>
      {waiting + done > 0 && (
        <button
          type="button"
          className="waiting-pill"
          aria-label={`${[waiting && `${waiting} waiting`, done && `${done} done`].filter(Boolean).join(", ")}: go to the next agent that needs you (⌘J)`}
          title="Next agent that needs you (⌘J)"
          onClick={() => step(1)}
        >
          <span className="dot" aria-hidden="true" />
          {[waiting && `${waiting} waiting`, done && `${done} done`].filter(Boolean).join(" · ")}
        </button>
      )}
    </div>
  );
});
