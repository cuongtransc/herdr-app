import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { filesChanged } from "../lib/ipc";
import type { Changed } from "../lib/types";
import { latestOnly, STALE } from "./latest";

/** A burst of writes (an agent saving many files, a checkout) is read once it settles. */
const SETTLE_MS = 500;

/**
 * The CHANGED group's git status under `root`: read on mount and on each `reloadKey`, and once
 * a burst of `touched()` calls (the Files watch reporting changes) settles. A failed read keeps
 * the last list.
 */
export function useChanged(machineId: string, root: string, reloadKey: number): { changed: Changed | null; touched: () => void } {
  const [changed, setChanged] = useState<Changed | null>(null);
  const read = useMemo(() => latestOnly(filesChanged), []);
  const fetch = useCallback(() => {
    read(machineId, root).then(
      (c) => c !== STALE && setChanged(c),
      () => {},
    );
  }, [read, machineId, root]);
  useEffect(fetch, [fetch, reloadKey]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const touched = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fetch, SETTLE_MS);
  }, [fetch]);
  return { changed, touched };
}
