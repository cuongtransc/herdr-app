/** How long the copy confirmation stays: long enough to read, short enough not to cover output. */
export const COPY_NOTICE_MS = 1500;

export function copiedText(text: string): string {
  const n = [...text].length;
  return `Copied ${n} character${n === 1 ? "" : "s"}`;
}

/**
 * Confirms each clipboard write, which otherwise happens with no visible sign. A new copy replaces
 * the previous notice, so a run of copies shows one toast, not a stack.
 */
export function createCopyNotice(show: (text: string) => number, dismiss: (id: number) => void): (text: string) => void {
  let last: number | undefined;
  return (text) => {
    if (last !== undefined) dismiss(last);
    last = show(copiedText(text));
  };
}
