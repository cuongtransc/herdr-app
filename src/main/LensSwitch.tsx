import { memo } from "react";
import { chosenLens, selectedPane, useApp } from "../store/app";
import type { Lens } from "../store/app";
import { paneKey } from "../lib/types";
import { defaultLens } from "../lens";
import { ChatIcon, TerminalIcon } from "../ui/icons";
import { useShallow } from "zustand/react/shallow";

// Terminal | Chat for the selected pane, as two icons named by their tooltip: the top bar's room
// goes to the tabs. Takes no props: memo keeps it out of App's re-renders; it reads the store itself.
export const LensSwitch = memo(function LensSwitch() {
  const sel = useApp(useShallow(selectedPane));
  const remembered = useApp((s) => (s.selected ? chosenLens(s, paneKey(s.selected)) : undefined));
  const setLens = useApp((s) => s.setLens);
  if (!sel) return null;
  const lens = defaultLens(sel.pane, remembered);
  const key = paneKey({ machine_id: sel.machine.id, session: sel.session.name, pane_id: sel.pane.pane_id });
  return (
    <div className={"seg seg-icons" + (lens === "chat" ? " seg-right" : "")} role="group" aria-label="Lens">
      <span className="seg-thumb" aria-hidden="true" />
      {(["terminal", "chat"] as Lens[]).map((l) => {
        const name = l === "terminal" ? "Terminal" : "Chat";
        const off = l === "chat" && !sel.pane.agent;
        return (
          <button key={l} aria-pressed={lens === l} aria-label={name} disabled={off} title={off ? "No agent in this pane" : name} onClick={() => setLens(key, l)}>
            {l === "terminal" ? <TerminalIcon /> : <ChatIcon />}
          </button>
        );
      })}
    </div>
  );
});
