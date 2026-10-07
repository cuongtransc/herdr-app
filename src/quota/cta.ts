import type { CtaAccount } from "../lib/types";
import type { QuotaEntry } from "./entry";
import { updatedAgo } from "./format";

export interface CtaCard {
  key: string;
  name: string;
  agent: string;
  account: string | null;
  entry: QuotaEntry;
  polledAt: number | null;
}

export const STALE_POLL_MS = 1_800_000;

const CTA_PROVIDERS = [
  { id: "claude", name: "Claude", agent: "claude" },
  { id: "codex", name: "Codex", agent: "codex" },
  { id: "opencode-go", name: "OpenCode Go", agent: "opencode" },
  { id: "grok", name: "Grok", agent: "grok" },
];

export function ctaCards(accounts: CtaAccount[]): CtaCard[] {
  const counts = new Map<string, number>();
  for (const account of accounts) counts.set(account.provider, (counts.get(account.provider) ?? 0) + 1);

  return accounts
    .map((account, index) => ({ account, index }))
    .sort((a, b) => {
      const ai = CTA_PROVIDERS.findIndex((provider) => provider.id === a.account.provider);
      const bi = CTA_PROVIDERS.findIndex((provider) => provider.id === b.account.provider);
      if (ai >= 0 || bi >= 0) {
        if (ai < 0) return 1;
        if (bi < 0) return -1;
        if (ai !== bi) return ai - bi;
      } else {
        const byId = a.account.provider.localeCompare(b.account.provider);
        if (byId !== 0) return byId;
      }
      return a.index - b.index;
    })
    .map(({ account }) => {
      const provider = CTA_PROVIDERS.find((item) => item.id === account.provider);
      const fetchedAt = account.polledAt ?? 0;
      const report = { windows: account.windows, fetchedAt };
      const entry: QuotaEntry = account.status === "ok"
        ? { kind: "ok", report }
        : {
            kind: "problem",
            message: account.detail || account.status,
            last: account.windows.length > 0 ? report : null,
          };
      return {
        key: `${account.provider}/${account.account}`,
        name: provider?.name ?? account.provider,
        agent: provider?.agent ?? account.provider,
        account: counts.get(account.provider)! > 1 ? shortAccount(account.account) : null,
        entry,
        polledAt: account.polledAt,
      };
    });
}

export function shortAccount(id: string): string {
  return (id.startsWith("sha256:") ? id.slice("sha256:".length) : id).slice(0, 8);
}

export function staleNote(polledAt: number | null, now: number): string | null {
  if (polledAt === null || now - polledAt <= STALE_POLL_MS) return null;
  return updatedAgo(polledAt, now);
}
