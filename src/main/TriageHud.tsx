import { useEffect } from "react";
import { useTriage } from "./triage";

const SHOWN_MS = 2000;

function age(since: number | null, now: number): string {
  if (since === null) return "";
  const m = Math.floor((now - since) / 60000);
  return m < 1 ? " · now" : m < 60 ? ` · ${m}m` : ` · ${Math.floor(m / 60)}h`;
}

/** The queue ⌘J walks, shown for a moment after each step; Esc hides it. */
export function TriageHud() {
  const hud = useTriage((s) => s.hud);
  const hide = useTriage((s) => s.hide);
  useEffect(() => {
    if (!hud) return;
    const t = setTimeout(hide, SHOWN_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [hud, hide]);
  if (!hud) return null;
  const { entries, at, shownAt } = hud;
  return (
    <div className="triage-hud" role="status" aria-label="Queue">
      <div className="triage-head">
        <span>{entries.length ? `Queue · ${at + 1} of ${entries.length}` : "Nothing blocked or to review"}</span>
        {entries.length > 0 && <span className="triage-scope">all machines</span>}
      </div>
      {entries.length > 0 && (
        <ol className="triage-list">
          {entries.map((e, i) => (
            <li key={e.key} className={(i === at ? "current " : "") + (e.waiting ? "waiting" : "done")}>
              <span className="dot" aria-hidden="true" />
              <span className="triage-text">
                <span className="triage-title">{e.title}</span>
                <span className="triage-where">{e.where}{e.agent && ` · ${e.agent}`}</span>
              </span>
              <span className="triage-badge">{(e.waiting ? "BLOCKED" : "REVIEW") + age(e.since, shownAt)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="triage-keys"><span><kbd>⌘</kbd><kbd>J</kbd> next</span><span><kbd>⇧</kbd><kbd>⌘</kbd><kbd>J</kbd> previous</span><span className="grow" /><span><kbd>Esc</kbd></span></div>
    </div>
  );
}
