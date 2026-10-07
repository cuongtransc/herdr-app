import { useEffect, useState } from "react";
import { AgentIcon } from "../agents/AgentIcon";
import type { QuotaWindow } from "../lib/types";
import { ctaCards, staleNote } from "../quota/cta";
import { PROVIDER_INFO, QUOTA_PROVIDERS } from "../quota/entry";
import type { QuotaEntry } from "../quota/entry";
import { WARN_PERCENT, elapsedFraction, percent, tone, untilReset, updatedAgo } from "../quota/format";
import { useQuota } from "../quota/store";
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

/** Quota cards are independent of the agent search and filters. */
export function QuotaColumn() {
  const slots = useQuota((s) => s.slots);
  const source = useQuota((s) => s.source);
  const cta = useQuota((s) => s.cta);
  const refresh = useQuota((s) => s.refresh);
  const [now, setNow] = useState(() => Date.now());
  const busy = cta.inFlight || QUOTA_PROVIDERS.some((p) => slots[p].inFlight);

  useEffect(() => {
    void refresh("shown");
    const poll = setInterval(() => void refresh("tick"), 30_000);
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

  return (
    <section className="dash-col dash-col-quota" role="region" aria-label="Quota">
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
        {source === "cta" && cta.result?.kind === "ok" ? (
          cta.result.accounts.length === 0 ? (
            <li className="dash-quota-card">
              <span className="dash-card-head"><span className="dash-card-title">cta</span></span>
              <p className="dash-quota-note">no accounts — run cta ledger quota poll</p>
            </li>
          ) : ctaCards(cta.result.accounts).map((card) => {
            const note = staleNote(card.polledAt, now);
            return (
              <li key={card.key} className="dash-quota-card">
                <span className="dash-card-head">
                  <AgentIcon agent={card.agent} />
                  <span className="dash-card-title">{card.name}</span>
                  {card.account !== null && <span className="dash-quota-account">{card.account}</span>}
                </span>
                <Body entry={card.entry} now={now} showProblemAge={false} />
                {note !== null && <p className="dash-quota-note">{note}</p>}
              </li>
            );
          })
        ) : source === "cta" && cta.result?.kind === "failed" ? (
          <li className="dash-quota-card">
            <span className="dash-card-head"><span className="dash-card-title">cta</span></span>
            <p className="dash-quota-note">{cta.result.reason}</p>
          </li>
        ) : QUOTA_PROVIDERS.map((p) => (
          <li key={p} className="dash-quota-card">
            <span className="dash-card-head">
              <AgentIcon agent={PROVIDER_INFO[p].agent} />
              <span className="dash-card-title">{PROVIDER_INFO[p].name}</span>
            </span>
            <Body entry={slots[p].entry} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
