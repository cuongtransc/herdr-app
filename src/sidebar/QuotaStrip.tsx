import { useRef, useState } from "react";
import { AgentIcon } from "../agents/AgentIcon";
import { useMinuteClock } from "../agents/paneFilter";
import { useQuotaPolling } from "../dashboard/QuotaColumn";
import { agoShort, elapsedFraction, shortReset } from "../quota/format";
import { HIDE_AFTER_MS, headline, trouble } from "../quota/summary";
import { useQuota } from "../quota/store";
import { useApp } from "../store/app";
import { ChevronIcon } from "../ui/icons";
import { quotaView, type QuotaItem } from "../quota/view";
import { itemLabel, QuotaPanel } from "./QuotaPanel";

type Row =
  | { item: QuotaItem; label: string; kind: "numbers"; h: NonNullable<ReturnType<typeof headline>> }
  | { item: QuotaItem; label: string; kind: "trouble"; reason: string; ago: string | null; message: string };

/** One row per card worth a line: its most pressing window, or why its numbers cannot be trusted. */
function stripRows(items: QuotaItem[], now: number): Row[] {
  return items.flatMap((item): Row[] => {
    const label = itemLabel(item);
    const t = trouble(item, now);
    // A built-in Provider with no numbers yet ("no Go subscription") stays out, as before.
    if (t && (item.fromCta || t.at !== null)) {
      if (t.at !== null && now - t.at > HIDE_AFTER_MS) return [];
      return [{ item, label, kind: "trouble", reason: t.reason, ago: t.at !== null ? agoShort(t.at, now) : null, message: t.message }];
    }
    if (t) return [];
    const h = headline(item.entry, now);
    return h ? [{ item, label, kind: "numbers", h }] : [];
  });
}

/** What the folded strip's header says, or null when no row has numbers to trust. */
type Fold = { text: string; warn: boolean; full: string | null };

/**
 * The folded strip's one line. A full account says nothing new for the days until it resets, so
 * it only counts beside the line; the line goes to the account that warns (the fullest of them),
 * else the fullest with room. Only when every account is full does fullness warn, with the
 * soonest reset. Rows whose numbers cannot be trusted stay out, as in the strip.
 */
function foldLine(rows: Row[], now: number): Fold | null {
  const numbers = rows.flatMap((r) => (r.kind === "numbers" ? [r] : []));
  if (numbers.length === 0) return null;
  const isFull = (r: (typeof numbers)[number]) => r.h.window.usedPercent >= 100;
  const full = numbers.filter(isFull);
  const room = numbers.filter((r) => !isFull(r)).sort((a, b) => b.h.window.usedPercent - a.h.window.usedPercent);
  if (room.length === 0) {
    const soonest = Math.min(...full.map((r) => r.h.window.resetsAt ?? Infinity));
    const reset = shortReset(Number.isFinite(soonest) ? soonest : null, now);
    return { text: `${full.length} full` + (reset ? ` · ${reset}` : ""), warn: true, full: null };
  }
  const pick = room.find((r) => r.h.tone === "warn") ?? room[0];
  const warn = pick.h.tone === "warn";
  const reset = warn ? shortReset(pick.h.window.resetsAt, now) : null;
  const text = `${pick.label} · ${Math.round(pick.h.window.usedPercent)}%` + (reset ? ` · ${reset}` : "");
  return { text, warn, full: full.length > 0 ? `· ${full.length} full` : null };
}

/** The Sidebar's foot: per signed-in Provider or `cta` account, its most pressing window (ui-ux-guidelines §7.3). */
export function QuotaStrip() {
  useQuotaPolling();
  const slots = useQuota((s) => s.slots);
  const source = useQuota((s) => s.source);
  const cta = useQuota((s) => s.cta);
  const now = useMinuteClock();
  const [open, setOpen] = useState(false);
  // Folds like the Sidebar's sections, remembered with them.
  const unfolded = useApp((s) => s.expanded["quota"] ?? true);
  const toggle = useApp((s) => s.toggle);
  const strip = useRef<HTMLDivElement>(null);
  const view = quotaView({ source, cta, slots });
  const rows = stripRows(view.kind === "items" ? view.items : [], now);
  if (rows.length === 0) return null;
  const fold = unfolded ? null : foldLine(rows, now);
  return (
    <div ref={strip} className={"quota-strip" + (open ? " open" : "")}>
      {open && <QuotaPanel anchor={strip} onClose={() => setOpen(false)} />}
      <button type="button" className="section-toggle quota-toggle" aria-expanded={unfolded} onClick={() => toggle("quota", unfolded)}>
        Quota
        <ChevronIcon className={"icon chev" + (unfolded ? " open" : "")} />
        {fold && (
          <span className="quota-fold-line">
            <span className={"quota-fold" + (fold.warn ? " tone-warn" : "")}>{fold.text}</span>
            {fold.full && <span className="quota-fold-full">{fold.full}</span>}
          </span>
        )}
      </button>
      {unfolded && rows.map((row) => {
        const { item, label } = row;
        const id = item.accountId !== null ? ` · ${item.accountId}` : "";
        if (row.kind === "trouble") {
          const text = row.reason + (row.ago ? ` · ${row.ago}` : "");
          return (
            <button
              key={item.key}
              type="button"
              className="quota-row tone-muted problem"
              title={`${label}${id} · ${row.message}`}
              aria-label={`${label}, ${text}: show quota`}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <AgentIcon agent={item.agent} />
              <span className="quota-name">{label}</span>
              {/* A long reason clips; its age stays. */}
              <span className="quota-val">
                <span className="quota-reason">{row.reason}</span>
                {row.ago && <span>{` · ${row.ago}`}</span>}
              </span>
            </button>
          );
        }
        const { window: w, tone } = row.h;
        const reset = shortReset(w.resetsAt, now);
        const frac = elapsedFraction(w.resetsAt, w.durationSecs, now);
        const used = w.usedPercent >= 100 ? "full" : `${Math.round(w.usedPercent)}%`;
        const text = used + (reset ? ` · ${reset}` : "");
        return (
          <button
            key={item.key}
            type="button"
            className={"quota-row tone-" + tone}
            title={`${label}${id} · ${w.label} window`}
            aria-label={`${label}, ${w.label} ${used}${reset ? ` · resets in ${reset}` : ""}: show quota`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <AgentIcon agent={item.agent} />
            <span className="quota-name">{label}</span>
            <span className="dash-quota-bar" aria-hidden="true">
              <span className="fill" style={{ width: Math.min(100, Math.max(0, w.usedPercent)) + "%" }} />
              {frac !== null && <span className="tick" style={{ left: frac * 100 + "%" }} />}
            </span>
            <span className="quota-val">{text}</span>
          </button>
        );
      })}
    </div>
  );
}
