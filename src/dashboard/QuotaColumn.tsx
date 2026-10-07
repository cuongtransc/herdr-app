import { useEffect, useState } from "react";
import { AgentIcon } from "../agents/AgentIcon";
import type { QuotaWindow } from "../lib/types";
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

function Body({ entry, now }: { entry: QuotaEntry; now: number }) {
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
            {entry.last ? `${entry.message} · ${updatedAgo(entry.last.fetchedAt, now)}` : entry.message}
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

/** The Quota head (title and refresh) and one card per Provider; `signedInOnly` folds the others into one line. */
export function QuotaDetail({ now, signedInOnly = false }: { now: number; signedInOnly?: boolean }) {
  const slots = useQuota((s) => s.slots);
  const refresh = useQuota((s) => s.refresh);
  const busy = QUOTA_PROVIDERS.some((p) => slots[p].inFlight);
  const out = signedInOnly ? QUOTA_PROVIDERS.filter((p) => slots[p].entry.kind === "notSignedIn") : [];
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
        {QUOTA_PROVIDERS.filter((p) => !out.includes(p)).map((p) => (
          <li key={p} className="dash-quota-card">
            <span className="dash-card-head">
              <AgentIcon agent={PROVIDER_INFO[p].agent} />
              <span className="dash-card-title">{PROVIDER_INFO[p].name}</span>
            </span>
            <Body entry={slots[p].entry} now={now} />
          </li>
        ))}
      </ul>
      {out.length > 0 && <p className="dash-quota-note quota-out">Not signed in: {out.map((p) => PROVIDER_INFO[p].name).join(", ")}</p>}
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
