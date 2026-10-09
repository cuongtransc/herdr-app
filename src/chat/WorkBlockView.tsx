import { memo } from "react";
import { useSecondClock } from "../dashboard/QuotaColumn";
import { ChevronIcon } from "../ui/icons";
import { ChatItemView } from "./ChatItemView";
import { SkillChips, turnSkills } from "./skills";
import { formatWorkDuration, workSummary, type ToolResult, type WorkBlock } from "./workBlocks";

/**
 * One turn's work under one header ("Worked for 7s · 1 edit"). Controlled: the Chat lens keeps
 * open/closed, since a virtualized row unmounts when it scrolls away.
 */
export const WorkBlockView = memo(function WorkBlockView({
  block,
  results,
  open,
  onToggle,
  live,
}: {
  block: WorkBlock;
  results: Map<string, ToolResult>;
  open: boolean;
  /** Called with this block's id and its open state, so a stable callback keeps memo working. */
  onToggle: (id: string, open: boolean) => void;
  live: boolean;
}) {
  const duration = formatWorkDuration(block.start, block.end);
  const title = duration ? `Worked for ${duration}` : "Worked";
  const summary = workSummary(block.items, results);
  return (
    <div className="chat-row chat-work">
      <button className="chat-work-head" aria-expanded={open} onClick={() => onToggle(block.id, open)}>
        <ChevronIcon className={"icon chev" + (open ? " open" : "")} />
        {live && <span className="spin" aria-hidden="true" />}
        <span className="chat-work-title">{live ? <LiveTitle start={block.start} /> : title}</span>
        {summary && (
          <>
            {" · "}
            <span className="chat-work-summary">{summary}</span>
          </>
        )}
      </button>
      <SkillChips chips={turnSkills(block.items, results)} />
      {open && (
        <div className="chat-work-rows">
          {block.items.map((it, i) => (
            <div key={i} className={it.kind === "assistant_text" ? "chat-narration" : undefined}>
              <ChatItemView item={it} result={it.kind === "tool_call" ? results.get(it.id) : undefined} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

/** "Working 1m 23s", counted from the prompt each second; mounted only while live, so only it re-renders. */
function LiveTitle({ start }: { start: string | null }) {
  const elapsed = formatWorkDuration(start, new Date(useSecondClock()).toISOString());
  return elapsed ? `Working ${elapsed}` : "Working…";
}
