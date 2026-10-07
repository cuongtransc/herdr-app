import { useRef, useState } from "react";
import { AgentIcon } from "../agents/AgentIcon";
import { useMinuteClock } from "../agents/paneFilter";
import { useQuotaPolling } from "../dashboard/QuotaColumn";
import { agoShort, elapsedFraction, shortReset } from "../quota/format";
import { HIDE_AFTER_MS, headline, trouble } from "../quota/summary";
import { useQuota } from "../quota/store";
import { quotaView, type QuotaItem } from "../quota/view";
import { itemLabel, QuotaPanel } from "./QuotaPanel";

type Row =
  | { item: QuotaItem; label: string; kind: "numbers"; h: NonNullable<ReturnType<typeof headline>> }
  | { item: QuotaItem; label: string; kind: "trouble"; text: string; message: string };

/** One row per card worth a line: its most pressing window, or why its numbers cannot be trusted. */
function stripRows(items: QuotaItem[], now: number): Row[] {
  return items.flatMap((item): Row[] => {
    const label = itemLabel(item);
    const t = trouble(item, now);
    // A built-in Provider with no numbers yet ("no Go subscription") stays out, as before.
    if (t && (item.fromCta || t.at !== null)) {
      if (t.at !== null && now - t.at > HIDE_AFTER_MS) return [];
      return [{ item, label, kind: "trouble", text: t.at !== null ? `${t.reason} · ${agoShort(t.at, now)}` : t.reason, message: t.message }];
    }
    if (t) return [];
    const h = headline(item.entry, now);
    return h ? [{ item, label, kind: "numbers", h }] : [];
  });
}

/** The Sidebar's foot: per signed-in Provider or `cta` account, its most pressing window (ui-ux-guidelines §7.3). */
export function QuotaStrip() {
  useQuotaPolling();
  const slots = useQuota((s) => s.slots);
  const source = useQuota((s) => s.source);
  const cta = useQuota((s) => s.cta);
  const now = useMinuteClock();
  const [open, setOpen] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const view = quotaView({ source, cta, slots });
  const rows = stripRows(view.kind === "items" ? view.items : [], now);
  if (rows.length === 0) return null;
  return (
    <div ref={strip} className={"quota-strip" + (open ? " open" : "")}>
      {open && <QuotaPanel anchor={strip} onClose={() => setOpen(false)} />}
      {rows.map((row) => {
        const { item, label } = row;
        const id = item.accountId !== null ? ` · ${item.accountId}` : "";
        if (row.kind === "trouble") {
          return (
            <button
              key={item.key}
              type="button"
              className="quota-row tone-muted problem"
              title={`${label}${id} · ${row.message}`}
              aria-label={`${label}, ${row.text}: show quota`}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <AgentIcon agent={item.agent} />
              <span className="quota-name">{label}</span>
              <span className="quota-val">{row.text}</span>
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
