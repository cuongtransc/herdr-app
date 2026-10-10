import { type KeyboardEvent, useEffect, useState } from "react";
import { ACTIONS, type ActionId } from "../shortcuts/actions";
import { type Chord, chordOf, formatChord, sameChord } from "../shortcuts/chord";
import { checkChord, DEFAULT_BINDINGS, useShortcuts } from "../shortcuts/store";

/** What went wrong with the last key pressed for one action: refused, or held by another action. */
type Issue = { id: ActionId; refused: string } | { id: ActionId; chord: Chord; usedBy: ActionId };

const labelOf = (id: ActionId) => ACTIONS.find((a) => a.id === id)?.label ?? id;

export function ShortcutsSettings() {
  const { bindings, set, replace, reset, resetAll, setRecording } = useShortcuts();
  const [recording, setRecordingId] = useState<ActionId | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const changed = ACTIONS.some((a) => !sameChord(bindings[a.id], a.default));

  // Leaving the section, or closing Settings, mid-recording gives the keys back to the app.
  useEffect(() => () => setRecording(false), [setRecording]);

  const start = (id: ActionId) => {
    setIssue(null);
    setRecordingId(id);
    setRecording(true);
  };
  const stop = () => {
    setRecordingId(null);
    setRecording(false);
  };

  const record = (id: ActionId, e: KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== id) return;
    // The key is the answer: neither the dialog (Esc closes it) nor the app's Shortcuts see it.
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setIssue(null);
      return stop();
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      setIssue(null);
      set(id, null);
      return stop();
    }
    const chord = chordOf(e.nativeEvent);
    if (chord === null) return;
    if (chord === "no-meta") return setIssue({ id, refused: "Include ⌘" });
    const check = checkChord(chord, bindings, id);
    if ("refused" in check) return setIssue({ id, refused: check.refused });
    if ("usedBy" in check) {
      setIssue({ id, chord, usedBy: check.usedBy });
      return stop();
    }
    setIssue(null);
    set(id, chord);
    stop();
  };

  return (
    <>
      <p className="note">Click a key to record a new one: Esc keeps the old key, ⌫ leaves the action without one. Every Shortcut includes ⌘.</p>
      <div className="shortcut-list">
        {ACTIONS.map((a) => {
          const chord = bindings[a.id];
          const isRecording = recording === a.id;
          const text = isRecording ? "Press keys…" : chord ? formatChord(chord) : "None";
          const rowIssue = issue?.id === a.id ? issue : null;
          return (
            <div key={a.id} className="shortcut-item">
              <div className="setting-row">
                <span>{a.label}</span>
                <div className="shortcut-controls">
                  {!sameChord(chord, DEFAULT_BINDINGS[a.id]) && (
                    <button className="icon-btn" aria-label={`Reset ${a.label}`} title="Back to the default key" onClick={() => reset(a.id)}>
                      ↺
                    </button>
                  )}
                  <button
                    className={"shortcut-key" + (isRecording ? " recording" : "") + (chord || isRecording ? "" : " none")}
                    aria-label={`${a.label}: ${text}`}
                    onClick={() => (isRecording ? undefined : start(a.id))}
                    onKeyDown={(e) => record(a.id, e)}
                    onBlur={() => {
                      if (!isRecording) return;
                      if (rowIssue && "refused" in rowIssue) setIssue(null);
                      stop();
                    }}
                  >
                    {text}
                  </button>
                </div>
              </div>
              {rowIssue && "refused" in rowIssue && (
                <p className="note shortcut-issue" role="alert">
                  {rowIssue.refused}
                </p>
              )}
              {rowIssue && "usedBy" in rowIssue && (
                <p className="note shortcut-issue" role="alert">
                  {formatChord(rowIssue.chord)} is used by {labelOf(rowIssue.usedBy)}{" "}
                  <button
                    className="btn btn-xs"
                    onClick={() => {
                      replace(a.id, rowIssue.chord);
                      setIssue(null);
                    }}
                  >
                    Replace
                  </button>
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="settings-foot">
        <button className="btn btn-xs" disabled={!changed} onClick={resetAll}>
          Reset all
        </button>
      </div>
    </>
  );
}
