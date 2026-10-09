import { useSecondClock } from "../dashboard/QuotaColumn";
import type { AgentStatus } from "../lib/types";
import { formatWorkDuration } from "./workBlocks";

// Sits between the transcript and the composer, outside the virtualized list, so it
// stays at the bottom without disturbing row measurement. The chat's one live signal:
// the work block above it scrolls away when open, so the spinner and clock live here.
export function WorkingIndicator({ status, start = null }: { status: AgentStatus; start?: string | null }) {
  if (status !== "working") return null;
  return (
    <div className="chat-working" role="status">
      <span className="spin" aria-hidden="true" />
      <Elapsed start={start} />
    </div>
  );
}

/** "Working 1m 23s", counted from the prompt each second; mounted only while working. */
function Elapsed({ start }: { start: string | null }) {
  const elapsed = formatWorkDuration(start, new Date(useSecondClock()).toISOString());
  return elapsed ? `Working ${elapsed}` : "Working…";
}
