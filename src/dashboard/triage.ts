import type { MachineView } from "../lib/types";
import { dashboardCards } from "./buckets";
import type { DashCard } from "./buckets";

/** The panes ⌘J walks: waiting for input first, longest waiting first, then Done and unseen,
 *  oldest first. A pane with no known status time comes after the timed ones of its kind. */
export function triageQueue(
  machines: Record<string, MachineView>,
  order: string[],
  doneSeen: Record<string, true>,
  since: Record<string, number>,
): DashCard[] {
  const cards = dashboardCards(machines, order, doneSeen, since);
  const oldest = (a: DashCard, b: DashCard) => (since[a.key] ?? Infinity) - (since[b.key] ?? Infinity);
  // Array.prototype.sort is stable, so untimed panes keep their sidebar order.
  return [
    ...cards.filter((c) => c.bucket === "attention").sort(oldest),
    ...cards.filter((c) => c.bucket === "done").sort(oldest),
  ];
}

/** The queue index a step lands on, or -1 when the queue is empty. `last` is the index the
 *  previous step landed on: when the selected pane has left the queue (a Done pane is seen once
 *  selected), stepping goes on from there rather than from the head. */
export function stepTriage(queue: string[], selected: string | null, last: number, dir: 1 | -1): number {
  const n = queue.length;
  if (n === 0) return -1;
  const at = selected === null ? -1 : queue.indexOf(selected);
  if (at >= 0) return (at + dir + n) % n;
  if (last < 0) return dir > 0 ? 0 : n - 1;
  // The pane that was at `last` is gone, so whatever slid into its place is the next one.
  return dir > 0 ? (last >= n ? 0 : last) : (Math.min(last, n) - 1 + n) % n;
}
