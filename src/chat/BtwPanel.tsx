import { herdrCall } from "../lib/ipc";
import { paneKey, type PaneRef } from "../lib/types";
import { useApp } from "../store/app";
import { CloseIcon } from "../ui/icons";
import { closeBtw, useBtw } from "./btw";
import { CopyButton } from "./CopyButton";

/**
 * The answer to the pane's last `/btw`, above the Composer. Claude draws it over its terminal and
 * keeps it out of the transcript, so this is the only place the Chat lens shows it.
 */
export function BtwPanel({ pane }: { pane: PaneRef }) {
  const key = paneKey(pane);
  const aside = useBtw((s) => s.asides[key]);
  const setLens = useApp((s) => s.setLens);
  if (!aside) return null;
  const close = () => void closeBtw(pane, (m, p) => herdrCall(pane.machine_id, pane.session, m, p));

  return (
    <section className="btw-panel" role="region" aria-label="Side question">
      <header className="btw-head">
        <span className="btw-tag">/btw</span>
        <span className="btw-question" title={aside.question}>{aside.question}</span>
        {aside.phase === "done" && aside.answer && <CopyButton text={aside.answer} />}
        {aside.phase === "asking" ? (
          <button type="button" className="btn btn-xs" onClick={close}>Cancel</button>
        ) : (
          <button type="button" className="chat-copy btw-close" aria-label="Close" title="Close" onClick={close}>
            <CloseIcon />
          </button>
        )}
      </header>
      {aside.phase === "asking" && <div className="btw-status" role="status">Answering…</div>}
      {aside.phase === "done" && <pre className="btw-answer">{aside.answer || "(empty answer)"}</pre>}
      {aside.phase === "failed" && (
        <div className="btw-error" role="alert">
          <span>Could not read the answer: {aside.error}</span>
          <button
            type="button"
            className="btn btn-xs"
            onClick={() => {
              setLens(key, "terminal");
              close();
            }}
          >
            Open terminal
          </button>
        </div>
      )}
    </section>
  );
}
