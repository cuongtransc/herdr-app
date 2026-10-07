import { useEffect, useState } from "react";
import { AgentIcon } from "../agents/AgentIcon";
import type { QuotaWindow } from "../lib/types";
import { staleNote } from "../quota/cta";
import { QUOTA_PROVIDERS } from "../quota/entry";
import type { QuotaEntry } from "../quota/entry";
import { WARN_PERCENT, elapsedFraction, percent, tone, untilReset, updatedAgo } from "../quota/format";
import { useQuota } from "../quota/store";
import { quotaView } from "../quota/view";
import { RefreshIcon } from "../ui/icons";

function WindowRow({ w, now }: { w: QuotaWindow; now: number }) {
  const frac = elapsedFraction(w.resetsAt, w.durationSecs, now);
  const reset = untilReset(w.resetsAt, now);
  const pct = Math.min(100, Math.max(0, w.usedPercent));
  return (
    <div className={"dash-quota-window tone-" + tone(w, now)}>
      <span className="label">{w.label}</span>
      <span className="dash-quota-bar">
        <span className="fill" style={{ width: pct + "%" }} />
        {frac !== null && <span className="tick" style={{ left: frac * 100 + "%" }} />}
      </span>
      <span className="value">
        <span className={w.usedPercent >= WARN_PERCENT ? "strong" : undefined}>{percent(w.usedPercent)}</span>
        {reset !== null && <span className="reset">{" · " + reset}</span>}
      </span>
    </div>
  );
}

/** `showProblemAge` is off for a `cta` card, whose age is its poll time, shown below it. */
function Body({ entry, now, showProblemAge = true }: { entry: QuotaEntry; now: number; showProblemAge?: boolean }) {
  switch (entry.kind) {
    case "loading":
      return null;
    case "notSignedIn":
      return <p className="dash-quota-note">not signed in</p>;
    case "ok":
      return <>{entry.report.windows.map((w, i) => <WindowRow key={`${i}-${w.label}`} w={w} now={now} />)}</>;
    case "problem":
      return (
        <>
          <p className="dash-quota-note">
            {entry.last && showProblemAge ? `${entry.message} · ${updatedAgo(entry.last.fetchedAt, now)}` : entry.message}
          </p>
          {entry.last && (
            <div className="dash-quota-stale">
              {entry.last.windows.map((w, i) => <WindowRow key={`${i}-${w.label}`} w={w} now={now} />)}
            </div>
          )}
        </>
      );
  }
}

/** Fetches the quota while mounted: once now, then on the schedule (`isDue`), skipped while the window is hidden. */
export function useQuotaPolling(): void {
  const refresh = useQuota((s) => s.refresh);
  useEffect(() => {
    void refresh("shown");
    const poll = setInterval(() => {
      if (!document.hidden) void refresh("tick");
    }, 30_000);
    const shown = () => {
      if (!document.hidden) void refresh("shown");
    };
    document.addEventListener("visibilitychange", shown);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [refresh]);
}

/** The current time, every second while mounted: reset countdowns tick. */
export function useSecondClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(clock);
  }, []);
  return now;
}

/** The Quota head (title and refresh) and one card per Provider or `cta` account; `signedInOnly` folds the others into one line. */
export function QuotaDetail({ now, signedInOnly = false }: { now: number; signedInOnly?: boolean }) {
  const slots = useQuota((s) => s.slots);
  const source = useQuota((s) => s.source);
  const cta = useQuota((s) => s.cta);
  const refresh = useQuota((s) => s.refresh);
  const busy = cta.inFlight || QUOTA_PROVIDERS.some((p) => slots[p].inFlight);
  const view = quotaView({ source, cta, slots });
  const items = view.kind === "items" ? view.items : [];
  const out = signedInOnly ? items.filter((i) => i.entry.kind === "notSignedIn") : [];
  return (
    <>
      <div className="dash-col-head">
        <span className="dash-col-title">Quota</span>
        <button
          className={"icon-btn dash-quota-refresh" + (busy ? " spinning" : "")}
          aria-label="Refresh quota"
          onClick={() => void refresh("manual")}
        >
          <RefreshIcon />
        </button>
      </div>
      <ul className="dash-cards">
        {view.kind === "ctaNote" && (
          <li className="dash-quota-card">
            <span className="dash-card-head"><span className="dash-card-title">cta</span></span>
            <p className="dash-quota-note">{view.message}</p>
          </li>
        )}
        {items.filter((i) => !out.includes(i)).map((i) => {
          const note = i.fromCta ? staleNote(i.polledAt, now) : null;
          return (
            <li key={i.key} className="dash-quota-card">
              <span className="dash-card-head">
                <AgentIcon agent={i.agent} />
                <span className="dash-card-title">{i.name}</span>
                {i.account !== null && <span className="dash-quota-account">{i.account}</span>}
              </span>
              <Body entry={i.entry} now={now} showProblemAge={!i.fromCta} />
              {note !== null && <p className="dash-quota-note">{note}</p>}
            </li>
          );
        })}
      </ul>
      {out.length > 0 && <p className="dash-quota-note quota-out">Not signed in: {out.map((i) => i.name).join(", ")}</p>}
    </>
  );
}

/** One card per Provider with its usage windows; independent of the agent search and filters. */
export function QuotaColumn() {
  useQuotaPolling();
  const now = useSecondClock();
  return (
    <section className="dash-col dash-col-quota" role="region" aria-label="Quota">
      <QuotaDetail now={now} />
    </section>
  );
}
