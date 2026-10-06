import { memo } from "react";
import { waitingCount } from "../dashboard/buckets";
import { useLayout } from "../settings/layout";
import { useApp } from "../store/app";
import { SidebarIcon } from "../ui/icons";

/** Beside the traffic lights whatever the layout: the sidebar toggle and, in focus, the agents waiting for input. */
export const LayoutControls = memo(function LayoutControls() {
  const layout = useLayout((s) => s.layout);
  const toggle = useLayout((s) => s.toggle);
  const waiting = useApp((s) => (layout === "focus" ? waitingCount(s.machines) : 0));
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
      {waiting > 0 && (
        <button
          type="button"
          className="waiting-pill"
          aria-label={`${waiting} agent${waiting === 1 ? "" : "s"} waiting, show the sidebar`}
          onClick={() => toggle("sidebar")}
        >
          <span className="dot" aria-hidden="true" />
          {waiting} waiting
        </button>
      )}
    </div>
  );
});
