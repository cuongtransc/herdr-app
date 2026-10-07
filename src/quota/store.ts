import { create } from "zustand";
import { quotaCta, quotaFetch } from "../lib/ipc";
import type { CtaQuota, QuotaOutcome, QuotaProvider } from "../lib/types";
import { applying, QUOTA_PROVIDERS, type QuotaEntry } from "./entry";
import { isDue, type QuotaTrigger } from "./schedule";

export interface QuotaSlot {
  entry: QuotaEntry;
  lastStarted: number | null;
  rateLimitedUntil: number | null;
  inFlight: boolean;
}

export type QuotaSource = "unknown" | "cta" | "builtin";

export interface CtaSlot {
  result: CtaQuota | null;
  inFlight: boolean;
  lastStarted: number | null;
}

export interface QuotaState {
  slots: Record<QuotaProvider, QuotaSlot>;
  source: QuotaSource;
  cta: CtaSlot;
  refresh: (trigger: QuotaTrigger) => Promise<void>;
}

export const initialSlots = (): Record<QuotaProvider, QuotaSlot> => {
  const slot = (): QuotaSlot => ({ entry: { kind: "loading" }, lastStarted: null, rateLimitedUntil: null, inFlight: false });
  return { claude: slot(), codex: slot(), opencodeGo: slot(), grok: slot() };
};

export const initialQuota = (): Pick<QuotaState, "slots" | "source" | "cta"> => ({
  slots: initialSlots(),
  source: "unknown",
  cta: { result: null, inFlight: false, lastStarted: null },
});

export const useQuota = create<QuotaState>((set, get) => {
  const settle = (p: QuotaProvider, outcome: QuotaOutcome) =>
    set((s) => ({
      slots: {
        ...s.slots,
        [p]: {
          ...s.slots[p],
          entry: applying(s.slots[p].entry, outcome, p),
          rateLimitedUntil: outcome.kind === "rateLimited" ? outcome.until : null,
          inFlight: false,
        },
      },
    }));

  return {
    ...initialQuota(),
    refresh: async (trigger) => {
      const now = Date.now();
      const state = get();
      if ((state.source !== "builtin" || trigger === "manual") && !state.cta.inFlight && isDue(trigger, state.cta.lastStarted, null, now)) {
        set((s) => ({ cta: { ...s.cta, inFlight: true, lastStarted: now } }));
        let result: CtaQuota;
        try {
          result = await quotaCta(trigger === "manual");
        } catch (err) {
          result = { kind: "failed", reason: err instanceof Error ? err.message : String(err) };
        }
        if (result.kind !== "missing") {
          set((s) => ({ source: "cta", cta: { ...s.cta, result, inFlight: false } }));
          return;
        }
        set((s) => ({ source: "builtin", cta: { ...s.cta, result, inFlight: false } }));
      } else if (get().source !== "builtin" || get().cta.inFlight) {
        return;
      }
      await refreshBuiltin(trigger);
    },
  };

  async function refreshBuiltin(trigger: QuotaTrigger): Promise<void> {
      const now = Date.now();
      const due = QUOTA_PROVIDERS.filter((p) => {
        const s = get().slots[p];
        return !s.inFlight && isDue(trigger, s.lastStarted, s.rateLimitedUntil, now);
      });
      if (due.length === 0) return;
      set((s) => {
        const slots = { ...s.slots };
        for (const p of due) slots[p] = { ...slots[p], inFlight: true, lastStarted: now };
        return { slots };
      });
      await Promise.all(
        due.map((p) =>
          quotaFetch(p).then(
            (outcome) => settle(p, outcome),
            (err) => settle(p, { kind: "failed", reason: err instanceof Error ? err.message : String(err) }),
          ),
        ),
      );
    }
});
