import { useSecondClock } from "../dashboard/QuotaColumn";
import type { BackgroundTask } from "../lib/types";
import { formatWorkDuration } from "./workBlocks";

// Shells and sub-Agents Claude started in the background and has not finished: they outlive the
// turn, so they sit above the Composer until their end lands in the transcript.
export function BackgroundTasks({ tasks, onJump }: { tasks: BackgroundTask[]; onJump: (callId: string) => void }) {
  if (tasks.length === 0) return null;
  return <Rows tasks={tasks} onJump={onJump} />;
}

/** Split out so the second clock ticks only while there are rows. */
function Rows({ tasks, onJump }: { tasks: BackgroundTask[]; onJump: (callId: string) => void }) {
  const now = new Date(useSecondClock()).toISOString();
  return (
    <ul className="chat-background" role="list" aria-label="Background tasks">
      {tasks.map((t) => (
        <li key={t.call_id}>
          <button type="button" className="chat-background-row" onClick={() => onJump(t.call_id)}>
            <span className="spin" aria-hidden="true" />
            <span className="chat-background-kind">{t.kind === "agent" ? "Agent" : "Shell"}</span>
            <span className="chat-background-desc">{t.description}</span>
            <span className="chat-background-time">{formatWorkDuration(t.started, now)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
