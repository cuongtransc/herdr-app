# 0005: Read Quota from `cta` when it is installed; the built-in Provider calls stay as a frozen fallback

> Status: Accepted · Date: 2026-10-07 · Amends [0002](0002-quota-from-provider-apis-without-refresh.md)

## Context

ADR 0002 has the Rust core call each Provider's undocumented usage endpoint itself. On this
user's Macs the same endpoints are already polled by `cta ledger quota poll` (ct-workstation ADR
0009: `cta` is the one caller of the quota APIs; display apps read `cta ledger quota --json`). A
launchd job runs that poll every 15 minutes and keeps every sample in `cta.db`.

Two callers of the same undocumented endpoints mean two parsers to fix when a Provider changes its
response, and two numbers on screen when one of them drifts. `cta` also sees what the app cannot:
every signed-in account of a Provider (two Claude accounts, several OpenCode Go accounts), the
billing cycle, and the history behind a burn rate.

Some Macs that run herdr-app do not have `cta`.

## Decision

- When a `cta` executable is found (`~/.local/bin/cta`, then `PATH`, then `/opt/homebrew/bin`,
  `/usr/local/bin`), the Quota column shows only what `cta ledger quota --json` returns: one card
  per account, Providers named by `cta`'s ids, including ids the app does not know.
- The app never filters, merges or corrects `cta`'s data. When `cta` exits non-zero or prints
  unreadable output, the column shows that error; it does not fall back to its own calls, so one
  number is never replaced by another source's.
- Refresh pressed by the user runs `cta ledger quota poll` before the read. Scheduled refreshes
  only read; the launchd job owns polling.
- When no `cta` executable is found, the ADR 0002 code (credentials, requests, parsers, outcome)
  runs unchanged. It is frozen: no new Provider, endpoint or field is added there. Supporting a
  Provider, or a change to a Provider's response, is done in `cta` only. The fallback is fixed
  only when a Provider change breaks one of its four existing parsers.

## Consequences

With `cta`, numbers can be up to 15 minutes old (the launchd interval); each card says when it was
last polled once that is more than 30 minutes ago. Provider-specific copy such as
`sign-in expired — run claude` is replaced by `cta`'s poll detail (`HTTP 403 from …`). The app
depends on the shape of `cta ledger quota --json`, which carries no version: the parser skips
entries it cannot read and shows `cta: unreadable output` when nothing is readable. The app now
launches one CLI (`cta`), never a Provider CLI; ADR 0002's rule against touching Provider
credentials still holds on both paths. A Mac without `cta` keeps today's four Providers and gets
no new ones.

## Alternatives considered

| Alternative | Why not chosen |
|-------------|----------------|
| Keep ADR 0002 only | Two callers and two parsers of the same undocumented endpoints; the app shows one account per Provider and no new Provider without app work. |
| `cta` only, drop the built-in code | Macs without `cta` would lose the Quota column. |
| Fall back to the built-in calls when `cta` fails | Two sources alternating on one card; a `cta` failure would be hidden instead of fixed. |
| Read `cta.db` with SQLite directly | Couples the app to `cta`'s schema and its stale-account rules; the JSON command is the contract `cta` publishes. |
| Run `cta ledger quota poll` on every scheduled refresh | Duplicates the launchd job and multiplies Provider calls by the number of open apps. |
