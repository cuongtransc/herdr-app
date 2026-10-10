import { ACTIONS, type ActionId } from "./actions";
import { type Chord, chordOf, codeFromKey, sameChord } from "./chord";
import type { Bindings } from "./store";

const PLAIN_EQUAL = { code: "Equal", shift: false, alt: false, ctrl: false };

/** The action a keydown runs, or null. Bigger font on ⌘= also takes ⇧⌘= (⌘+). */
export function actionFor(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "shiftKey" | "altKey" | "ctrlKey">, bindings: Bindings): ActionId | null {
  const chord = chordOf(e);
  if (!chord || chord === "no-meta") return null;
  const hit = lookup(chord, bindings);
  if (hit) return hit;
  // A physical key bound to nothing falls back to its character, as the keys matched before
  // Shortcuts could be changed: the numpad's + − 0, and ⌘+ on layouts where + has its own key.
  const byKey = codeFromKey(e.key);
  return byKey && byKey !== chord.code ? lookup({ ...chord, code: byKey }, bindings) : null;
}

function lookup(chord: Chord, bindings: Bindings): ActionId | null {
  const hit = ACTIONS.find((a) => sameChord(bindings[a.id], chord));
  if (hit) return hit.id;
  if (sameChord(bindings["font.bigger"], PLAIN_EQUAL) && sameChord(chord, { ...PLAIN_EQUAL, shift: true })) return "font.bigger";
  return null;
}
