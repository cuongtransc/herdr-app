import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { AgentIcon } from "../agents/AgentIcon";
import { useSecondClock } from "../dashboard/QuotaColumn";
import type { QuotaWindow } from "../lib/types";
import { QUOTA_PROVIDERS } from "../quota/entry";
import { elapsedFraction, percent, tone, untilReset, updatedAgo } from "../quota/format";
import { useQuota } from "../quota/store";
import { trouble, type Trouble } from "../quota/summary";
import { quotaView, type QuotaItem } from "../quota/view";
import { RefreshIcon } from "../ui/icons";

/** Known window labels get a column each, in this order; the rest share "Other". */
const COLUMNS: [string, string][] = [["5h", "5 hours"], ["week", "Week"], ["month", "Month"]];
const KNOWN = new Set(COLUMNS.map(([label]) => label));
const PANEL_WIDTH = 720;
const GAP = 8;

export function itemLabel(item: QuotaItem): string {
  return item.account !== null ? `${item.short} ${item.account}` : item.short;
}

function clock(at: number, now: number): string {
  const time = { hour: "2-digit", minute: "2-digit" } as const;
  return now - at < 86_400_000
    ? new Date(at).toLocaleTimeString([], time)
    : new Date(at).toLocaleString([], { month: "short", day: "numeric", ...time });
}

function Cell({ windows, now, tag = false }: { windows: QuotaWindow[]; now: number; tag?: boolean }) {
  if (windows.length === 0) return <div role="cell" className="qp-cell empty">—</div>;
  return (
    <div role="cell" className="qp-cell">
      {windows.map((w) => {
        const frac = elapsedFraction(w.resetsAt, w.durationSecs, now);
        const reset = untilReset(w.resetsAt, now);
        return (
          <div key={w.label} className={"qp-window tone-" + tone(w, now)}>
            <div className="qp-num">
              <b>
                {tag && <span className="qp-tag">{w.label.replace(/^week · /, "")} </span>}
                {w.usedPercent >= 100 ? "full" : percent(w.usedPercent)}
              </b>
              {reset !== null && <span className="qp-reset" title="Resets in">↻ {reset}</span>}
            </div>
            <span className="dash-quota-bar" aria-hidden="true">
              <span className="fill" style={{ width: Math.min(100, Math.max(0, w.usedPercent)) + "%" }} />
              {frac !== null && <span className="tick" style={{ left: frac * 100 + "%" }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** What went wrong and what to do about it, across all window columns. */
function TroubleCell({ item, t, now }: { item: QuotaItem; t: Trouble; now: number }) {
  const signIn = item.cli !== null ? <>Sign in again with <code>{item.cli}</code></> : <>Sign in again</>;
  let hint: React.ReactNode = null;
  if (t.notPolled && t.at !== null) hint = <>cta has not polled this account since {clock(t.at, now)}. {signIn}, or remove the account from cta.</>;
  else if (item.fromCta && t.at !== null) hint = <>Last tried {clock(t.at, now)}.{/^HTTP 40[13]/.test(t.reason) && <> {signIn}.</>}</>;
  else if (t.at !== null) hint = <>Last numbers from {clock(t.at, now)}.</>;
  return (
    <div role="cell" className="qp-trouble">
      <span><b>{t.message}.</b> {hint}</span>
    </div>
  );
}

/** The latest poll or fetch behind the numbers, for the head line. */
function freshest(items: QuotaItem[]): number | null {
  const times = items.flatMap((i) => i.fromCta ? (i.polledAt !== null ? [i.polledAt] : []) : i.entry.kind === "ok" ? [i.entry.report.fetchedAt] : []);
  return times.length > 0 ? Math.max(...times) : null;
}

/**
 * The Quota detail, opened from the Sidebar strip: a table of accounts by window, beside the strip.
 * Escape, the scrim or the close button close it.
 */
export function QuotaPanel({ anchor, onClose }: { anchor: RefObject<HTMLElement | null>; onClose: () => void }) {
  const now = useSecondClock();
  const slots = useQuota((s) => s.slots);
  const source = useQuota((s) => s.source);
  const cta = useQuota((s) => s.cta);
  const refresh = useQuota((s) => s.refresh);
  const busy = cta.inFlight || QUOTA_PROVIDERS.some((p) => slots[p].inFlight);
  const view = quotaView({ source, cta, slots });
  const items = view.kind === "items" ? view.items : [];
  const out = items.filter((i) => i.entry.kind === "notSignedIn" || i.entry.kind === "loading");
  const shown = items.filter((i) => !out.includes(i));
  const rows = shown.map((item) => {
    const t = trouble(item, now);
    const windows = !t && item.entry.kind === "ok" ? item.entry.report.windows : [];
    return { item, t, windows };
  });
  const all = rows.flatMap((r) => r.windows);
  const columns = COLUMNS.filter(([label]) => all.some((w) => w.label === label));
  const other = all.some((w) => !KNOWN.has(w.label));
  const latest = freshest(shown);

  const [place, setPlace] = useState<React.CSSProperties>({});
  useLayoutEffect(() => {
    const measure = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const left = r.right + GAP;
      setPlace({ left, bottom: Math.max(GAP, window.innerHeight - r.bottom), width: Math.min(PANEL_WIDTH, window.innerWidth - left - GAP), maxHeight: r.bottom - GAP });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="quota-scrim" onMouseDown={onClose} />
      <div className="quota-panel" role="dialog" aria-label="Quota" style={place}>
        <header className="qp-head">
          <h2>Quota</h2>
          {latest !== null && <span className="qp-src">{(source === "cta" ? "from cta · " : "") + updatedAgo(latest, now)}</span>}
          <button type="button" className={"qp-btn" + (busy ? " spinning" : "")} onClick={() => void refresh("manual")}>
            <RefreshIcon /> Refresh
          </button>
          <button type="button" className="icon-btn qp-close" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="qp-table" role="table" style={{ gridTemplateColumns: `130px repeat(${columns.length + (other ? 1 : 0)}, minmax(0, 1fr))` }}>
          <div role="row" className="qp-row">
            <div role="columnheader">Account</div>
            {columns.map(([label, title]) => <div key={label} role="columnheader">{title}</div>)}
            {other && <div role="columnheader">Other</div>}
          </div>
          {rows.map(({ item, t, windows }) => (
            <div key={item.key} role="row" aria-label={itemLabel(item)} className={"qp-row" + (t ? " problem" : "")}>
              <div role="rowheader" className="qp-who">
                <AgentIcon agent={item.agent} />
                <span className="qp-names">
                  <span className="qp-name">{itemLabel(item)}</span>
                  {item.accountId !== null && <span className="qp-id">{item.accountId}</span>}
                </span>
              </div>
              {t ? (
                <TroubleCell item={item} t={t} now={now} />
              ) : (
                <>
                  {columns.map(([label]) => <Cell key={label} windows={windows.filter((w) => w.label === label)} now={now} />)}
                  {other && <Cell windows={windows.filter((w) => !KNOWN.has(w.label))} now={now} tag />}
                </>
              )}
            </div>
          ))}
        </div>
        <footer className="qp-foot">
          <span><i className="qp-tick" />how far through the window</span>
          <span className="qp-warn">amber: on pace to run out</span>
          {out.length > 0 && <span>Not signed in: {out.map((i) => i.name).join(", ")}</span>}
        </footer>
      </div>
    </>
  );
}
