import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ContextMenu } from "../sidebar/ContextMenu";
import { useApp } from "../store/app";
import { FolderIcon } from "../ui/icons";
import type { WorkspaceRef } from "../workspaces/folder";

/**
 * The open file's path in the Files header: each folder opens as its own item, the file name is
 * text. Short of room, leading folders fold into "…" (a menu of them) before the name is cut; the
 * nearest folder always stays.
 */
export function Crumbs({ ws, root, rel, title }: { ws: WorkspaceRef; root: string; rel: string; title?: string }) {
  const parts = rel.split("/");
  const name = parts.pop()!;
  const dirs = parts.map((dir, i) => ({ dir, rel: parts.slice(0, i + 1).join("/") }));
  const ref = useRef<HTMLSpanElement>(null);
  const [folded, setFolded] = useState(0);
  const [width, setWidth] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.parentElement?.clientWidth ?? 0));
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, []);
  // A new path or width starts unfolded; each pass folds one more folder while the path overflows.
  useLayoutEffect(() => setFolded(0), [rel, width]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.scrollWidth > el.clientWidth && folded < dirs.length - 1) setFolded(folded + 1);
  }, [folded, dirs.length, rel, width]);

  const open = (dirRel: string) => useApp.getState().openFile(ws, root, dirRel, { pin: false });
  const hidden = dirs.slice(0, folded);
  const sep = <span className="files-crumb-sep">/</span>;
  return (
    <span ref={ref} className="files-crumb-path" title={title}>
      {folded > 0 && (
        <>
          <button
            type="button"
            className="files-crumb-dir"
            aria-label="Hidden folders"
            aria-haspopup="menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 2 });
            }}
          >
            …
          </button>
          {sep}
        </>
      )}
      {dirs.slice(folded).map((d) => (
        <span key={d.rel} className="files-crumb-step">
          <button type="button" className="files-crumb-dir" title={d.rel} onClick={() => open(d.rel)}>
            {d.dir}
          </button>
          {sep}
        </span>
      ))}
      <span className={folded >= dirs.length - 1 ? "files-crumb-leaf cut" : "files-crumb-leaf"}>{name}</span>
      {menu &&
        createPortal(
          <ContextMenu
            x={menu.x}
            y={menu.y}
            items={hidden.map((d) => ({ label: d.dir, icon: FolderIcon, onSelect: () => open(d.rel) }))}
            onClose={() => setMenu(null)}
          />,
          document.body,
        )}
    </span>
  );
}
