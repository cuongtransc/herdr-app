import { useSyncExternalStore } from "react";
import { AlertIcon } from "./icons";

export interface ToastItem {
  id: number;
  text: string;
  /** A warning shows the alert icon; plain information does not. */
  alert: boolean;
}

const DISMISS_MS = 5000;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Show a toast that dismisses itself after `ms` (5 s by default); returns its id for dismissToast. */
export function showToast(text: string, { alert = true, ms = DISMISS_MS }: { alert?: boolean; ms?: number } = {}): number {
  const id = nextId++;
  items = [...items, { id, text, alert }];
  emit();
  setTimeout(() => dismissToast(id), ms);
  return id;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const snapshot = () => items;

export function Toasts() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (list.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          {t.alert && <AlertIcon />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
