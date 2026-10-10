import { ACTIONS, type ActionId } from "./actions";
import { chordOf, sameChord } from "./chord";
import type { Bindings } from "./store";

const PLAIN_EQUAL = { code: "Equal", shift: false, alt: false, ctrl: false };

/** The action a keydown runs, or null. Bigger font on ⌘= also takes ⇧⌘= (⌘+). */
export function actionFor(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "shiftKey" | "altKey" | "ctrlKey">, bindings: Bindings): ActionId | null {
  const chord = chordOf(e);
  if (!chord || chord === "no-meta") return null;
  const hit = ACTIONS.find((a) => sameChord(bindings[a.id], chord));
  if (hit) return hit.id;
  if (sameChord(bindings["font.bigger"], PLAIN_EQUAL) && sameChord(chord, { ...PLAIN_EQUAL, shift: true })) return "font.bigger";
  return null;
}
