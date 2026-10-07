import { useEffect, useState } from "react";
import { AgentIcon } from "../agents/AgentIcon";
import { useMinuteClock } from "../agents/paneFilter";
import { QuotaDetail, useQuotaPolling, useSecondClock } from "../dashboard/QuotaColumn";
import { PROVIDER_INFO, QUOTA_PROVIDERS } from "../quota/entry";
import { elapsedFraction, percent, untilReset } from "../quota/format";
import { headline } from "../quota/summary";
import { useQuota } from "../quota/store";

/** The full Quota, over the Sidebar's foot; Escape or a click outside closes it. */
function QuotaPopover({ onClose }: { onClose: () => void }) {
  const now = useSecondClock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="quota-scrim" onMouseDown={onClose} />
      <div className="quota-pop" role="dialog" aria-label="Quota">
        <QuotaDetail now={now} signedInOnly />
      </div>
    </>
  );
}

/** The Sidebar's foot: per signed-in Provider, its most pressing window (ui-ux-guidelines §7.3). */
export function QuotaStrip() {
  useQuotaPolling();
  const slots = useQuota((s) => s.slots);
  const now = useMinuteClock();
  const [open, setOpen] = useState(false);
  const rows = QUOTA_PROVIDERS.flatMap((p) => {
    const h = headline(slots[p].entry, now);
    return h ? [{ p, h }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <div className={"quota-strip" + (open ? " open" : "")}>
      {open && <QuotaPopover onClose={() => setOpen(false)} />}
      {rows.map(({ p, h }) => {
        const { window: w } = h;
        const reset = untilReset(w.resetsAt, now);
        const frac = elapsedFraction(w.resetsAt, w.durationSecs, now);
        const text = `${w.label} ${percent(w.usedPercent)}${reset ? ` · ${reset}` : ""}`;
        return (
          <button
            key={p}
            type="button"
            className={"quota-row tone-" + h.tone + (h.stale ? " stale" : "")}
            aria-label={`${PROVIDER_INFO[p].name}, ${text}${h.stale ? ", last known" : ""}: show quota`}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <AgentIcon agent={PROVIDER_INFO[p].agent} />
            <span className="quota-name">{PROVIDER_INFO[p].name}</span>
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
