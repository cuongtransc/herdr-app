import { useEffect, useRef, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { PathInput } from "../ui/PathInput";
import { CheckIcon, LockIcon } from "../ui/icons";
import type { ProtectedPane } from "../agents/protect";

export interface MenuItem {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
  /** A toggle: shown with a check while on. */
  checked?: boolean;
  disabled?: boolean;
  /** Says why the item is disabled, under it. */
  note?: string;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="overlay clear" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <ul className="ctx-menu" role="menu" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
        {items.map((it) => (
          <li key={it.label} role="none">
            <button
              role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={it.checked}
              disabled={it.disabled}
              onClick={() => {
                onClose();
                it.onSelect();
              }}
            >
              <it.icon />
              {it.label}
              {it.checked && <CheckIcon className="icon ctx-check" />}
            </button>
            {it.note && <div className="ctx-note">{it.note}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  protectedPanes = [],
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  /** Protected panes the action would close: listed, and Cancel takes the focus. */
  protectedPanes?: ProtectedPane[];
}) {
  const guarded = protectedPanes.length > 0;
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      {guarded && (
        <>
          <p>{protectedPanes.length === 1 ? "It holds a protected pane, which closes too:" : `It holds ${protectedPanes.length} protected panes, which close too:`}</p>
          <ul className="protected-list">
            {protectedPanes.map((p) => (
              <li key={p.key}>
                <LockIcon className="icon" />
                {p.title}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="actions">
        <button className="btn" autoFocus={guarded} onClick={onClose}>Cancel</button>
        <button
          className="btn btn-danger"
          autoFocus={!guarded}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {guarded ? "Unprotect and close" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function TextDialog({
  title,
  initial,
  submitLabel,
  folderOn,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  /** Machine whose folders the field suggests, for a folder path. */
  folderOn?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  const submit = () => {
    onClose();
    onSubmit(value);
  };
  return (
    <Modal title={title} onClose={onClose}>
      {folderOn ? (
        <PathInput
          machineId={folderOn}
          inputRef={ref}
          autoFocus
          value={value}
          aria-label={title}
          onChange={setValue}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      ) : (
        <input
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          ref={ref}
          autoFocus
          value={value}
          aria-label={title}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      )}
      <div className="actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>{submitLabel}</button>
      </div>
    </Modal>
  );
}
