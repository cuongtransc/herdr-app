import { tabRole } from "./agents/roles";

/** Who a pane belongs to, from herdr's point of view (ADR 0016): a dispatched lane, anything
 *  else herdr can see, or a tab outside herdr entirely (ccpoke only — herdr never sees `outside`). */
export type AlertRole = "lane" | "other" | "outside";

/** A pane's state as the attention rule cares about it: two states that reach the user, two
 *  that do not, and `unknown` when the source could not say. */
export type AlertStatus = "blocked" | "done" | "working" | "idle" | "unknown";

/** Whether the user is at the desk, so a blocked lane still reaches them through the Mac. */
export type Presence = "desk" | "away";

/** Which surfaces ADR 0016 says an alert should reach, once. */
export interface AlertDecision {
  desk: boolean;
  telegram: boolean;
}

/**
 * ADR 0016's one rule: a pane alerts when work stopped and needs the user — blocked anywhere,
 * finished only where nothing else reports it (never a lane: the orchestrator owns that).
 * The desk shows anything not `outside`; Telegram covers away, and `outside` always (no desk
 * notification can be attributed to it).
 */
export function shouldAlert(role: AlertRole, status: AlertStatus, presence: Presence): AlertDecision {
  const alerting = status === "blocked" || (status === "done" && role !== "lane");
  return {
    desk: alerting && role !== "outside",
    telegram: alerting && (presence === "away" || role === "outside"),
  };
}

/** The alert role of a tab label: `lane-` is a lane, everything else herdr can see is `other`. */
export function roleOfLabel(label: string | undefined): AlertRole {
  return label !== undefined && tabRole(label) === "lane" ? "lane" : "other";
}
