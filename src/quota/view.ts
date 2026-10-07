import { ctaCards } from "./cta";
import { PROVIDER_INFO, QUOTA_PROVIDERS, type QuotaEntry } from "./entry";
import type { QuotaState } from "./store";

/** One Quota card: a Provider (built-in calls) or a `cta` account. */
export interface QuotaItem {
  key: string;
  name: string;
  short: string;
  /** The account's number among its Provider's, when it has several. */
  account: string | null;
  /** A `cta` account's short id. */
  accountId: string | null;
  cli: string | null;
  agent: string;
  entry: QuotaEntry;
  /** Set for a `cta` account; built-in entries carry their own age. */
  polledAt: number | null;
  fromCta: boolean;
}

/** What the Quota surfaces show: cards, or the one `cta` message that replaces them (ADR 0005). */
export type QuotaView = { kind: "items"; items: QuotaItem[] } | { kind: "ctaNote"; message: string };

export function quotaView(s: Pick<QuotaState, "source" | "cta" | "slots">): QuotaView {
  if (s.source === "cta" && s.cta.result?.kind === "failed") return { kind: "ctaNote", message: s.cta.result.reason };
  if (s.source === "cta" && s.cta.result?.kind === "ok") {
    if (s.cta.result.accounts.length === 0) return { kind: "ctaNote", message: "no accounts — run cta ledger quota poll" };
    return {
      kind: "items",
      items: ctaCards(s.cta.result.accounts).map((c) => ({ ...c, fromCta: true })),
    };
  }
  return {
    kind: "items",
    items: QUOTA_PROVIDERS.map((p) => ({
      key: p,
      name: PROVIDER_INFO[p].name,
      short: PROVIDER_INFO[p].short,
      account: null,
      accountId: null,
      cli: PROVIDER_INFO[p].cli,
      agent: PROVIDER_INFO[p].agent,
      entry: s.slots[p].entry,
      polledAt: null,
      fromCta: false,
    })),
  };
}
