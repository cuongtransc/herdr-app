import type { Changed } from "../lib/types";

interface Props {
  changed: Changed | null;
  /** The open file, marked in the list. */
  active?: string | null;
  onOpen: (rel: string, pin: boolean) => void;
}

/** Git's two-column code as one letter: `?` untracked, else the first of index or worktree. */
function letter(code: string): string {
  if (code === "??") return "?";
  return code.trim()[0] ?? "";
}

const KIND: Record<string, string> = { A: "added", "?": "untracked", D: "deleted" };

/** The files git reports changed under the root, above the tree: what an agent touched. */
export function ChangedList({ changed, active, onOpen }: Props) {
  if (!changed?.repo || changed.total === 0) return null;
  return (
    <div className="files-changed">
      <div className="files-changed-head">
        CHANGED ({changed.total}){changed.total > changed.changes.length && ` · first ${changed.changes.length}`}
      </div>
      {changed.changes.map((c) => {
        const l = letter(c.code);
        const cut = c.path.lastIndexOf("/");
        return (
          <button
            key={c.path}
            type="button"
            title={c.path}
            className={"files-changed-row" + (c.path === active ? " sel" : "")}
            onClick={() => onOpen(c.path, false)}
            onDoubleClick={() => onOpen(c.path, true)}
          >
            <span className={"files-changed-code " + (KIND[l] ?? "modified")}>{l}</span>
            <span className="files-changed-path">
              {c.path.slice(cut + 1)}
              {cut > 0 && <span className="files-changed-dir"> {c.path.slice(0, cut)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
