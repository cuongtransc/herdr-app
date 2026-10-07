# Quota from cta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Quota column shows `cta ledger quota --json` (one card per account) when a `cta` executable is installed, and keeps today's built-in Provider calls unchanged on a Mac without `cta`.

**Architecture:** A new Rust module `src-tauri/src/quota/cta.rs` locates `cta`, runs it (optionally `poll` first), and parses its JSON into `CtaQuota`; a Tauri command `quota_cta(poll)` exposes it. The zustand quota store asks `cta` first on every due refresh; `missing` switches it to the existing per-Provider `quota_fetch` path. `QuotaColumn` renders `cta` cards or the existing Provider cards depending on the store's `source`. The built-in modules (`credentials`, `requests`, `parsers`, `outcome`) are not edited.

**Tech Stack:** Rust (Tauri v2, tokio process, serde_json, chrono), React 19 + TypeScript, zustand 5, Vitest + Testing Library (jsdom).

**Spec:** `docs/adr/0005-quota-from-cta-with-builtin-fallback.md` (amends `docs/adr/0002-quota-from-provider-apis-without-refresh.md`; the fallback behaviour stays as in `docs/superpowers/specs/2026-10-03-dashboard-quota-design.md`)

## Global Constraints

- Do not edit `src-tauri/src/quota/{credentials,requests,parsers,outcome}.rs` or the `Provider` enum: the fallback is frozen (ADR 0005). Calling `parsers::parse_date` from the new module is allowed.
- No Provider knowledge in the `cta` path beyond display names: the app never filters, merges, re-orders within a Provider, or corrects `cta`'s accounts and windows.
- `cta` lookup order: `$HOME/.local/bin/cta`, then each `PATH` directory, then `/opt/homebrew/bin/cta`, `/usr/local/bin/cta`; the first regular file with any execute bit wins.
- Commands run: `cta ledger quota --json` (read, timeout 20 s) and, only when the user pressed Refresh, `cta ledger quota poll` first (timeout 60 s, exit status ignored: it exits 1 whenever any Provider fails). stdin null, `kill_on_drop(true)`.
- Failure copy (all start with `cta`): `cta exited <code>: <first non-empty stderr line, max 200 chars>`, `cta exited <code>` (no stderr), `cta killed` (no exit code), `cta timed out`, `cta could not start`, `cta: unreadable output`. `cta`'s own `last_poll.detail` is shown verbatim.
- Never log `cta`'s stdout or stderr. The only log line is `tracing::info!("quota cta: {}", result.log_line())`.
- IPC JSON is camelCase; `CtaQuota` is tagged `kind` (`missing` | `ok` | `failed`) with camelCase fields. Timestamps are epoch milliseconds; `durationSecs` is whole seconds or null.
- `cta` Provider ids → display: `claude` → `Claude` / icon `claude`; `codex` → `Codex` / `codex`; `opencode-go` → `OpenCode Go` / `opencode`; `grok` → `Grok` / `grok`; any other id → the id itself as name and icon (AgentIcon draws a monogram).
- Card order: known Providers in the order above, then unknown ids alphabetically; accounts of one Provider keep `cta`'s order.
- Account label: shown only when a Provider has more than one account: the id without a leading `sha256:`, first 8 characters.
- Stale poll: a `cta` card whose `polledAt` is more than 30 minutes (`1_800_000` ms) old shows `updatedAgo(polledAt, now)` under its windows.
- Scheduling reuses `isDue` from `src/quota/schedule.ts` (5 min tick, 60 s show debounce, manual always).
- Rust tests live in `#[cfg(test)] mod tests` at the bottom of the module; run from `src-tauri/`. Frontend tests use `toBeTruthy()` / `toBeNull()` and mock IPC with `vi.mock("../lib/ipc", …)`.

## Review Focus

1. A `cta` that hangs must end as `cta timed out` and be killed, never leave the Refresh spinner running (Rust test in Task 2, store test in Task 4).
2. `cta` present but failing must show the failure and must not fall back to the built-in calls (store test in Task 4).
3. A Provider id the app has never seen (`kimi`) must render as a card, not be dropped (tests in Tasks 1, 3 and 5).
4. Pressing Refresh while a `cta` read is in flight must not start a second `cta` process (store test in Task 4).
5. On a Mac without `cta`, every existing quota test must still pass with `quotaCta` answering `missing` (Tasks 4 and 5 update their mocks only).

---

### Task 1: Parse `cta ledger quota --json` and locate `cta`

**Files:**
- Create: `src-tauri/src/quota/cta.rs`
- Modify: `src-tauri/src/quota/mod.rs` (add `pub mod cta;`)

**Interfaces:**
- Consumes: `crate::quota::QuotaWindow`, `crate::quota::parsers::parse_date(&Value) -> Option<i64>`.
- Produces:
  - `#[derive(Debug, Clone, PartialEq, Serialize)] #[serde(rename_all = "camelCase")] pub struct CtaAccount { pub provider: String, pub account: String, pub windows: Vec<QuotaWindow>, pub polled_at: Option<i64>, pub status: String, pub detail: String }`
  - `#[derive(Debug, Clone, PartialEq, Serialize)] #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")] pub enum CtaQuota { Missing, Ok { accounts: Vec<CtaAccount>, read_at: i64 }, Failed { reason: String } }`
  - `pub fn parse_board(stdout: &[u8]) -> Option<Vec<CtaAccount>>` — `None` unless the top level is an object whose `accounts` is an array. An entry is skipped unless `provider` and `account` are strings. A window is skipped unless `window` is a string and `used_pct` a JSON number; `label = window`, `used_percent` clamped 0…100, `resets_at = parse_date`, `duration_secs = duration_s` rounded when finite and > 0, else `None`. Missing `windows` → empty. `last_poll` missing or null → `polled_at: None`, `status: "unknown"`, `detail: ""`.
  - `pub const FALLBACK_DIRS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];`
  - `pub fn locate(home: Option<&Path>, path_env: Option<&OsStr>, fallback_dirs: &[PathBuf]) -> Option<PathBuf>`

- [ ] **Step 1: Write the failing tests** at the bottom of `src-tauri/src/quota/cta.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::quota::{QuotaWindow, FIVE_HOURS, WEEK};
    use std::os::unix::fs::PermissionsExt;

    fn ms(s: &str) -> i64 {
        crate::quota::parsers::parse_date(&serde_json::json!(s)).unwrap()
    }

    const BOARD: &str = r#"{"accounts":[
      {"provider":"claude","account":"0bb1535b-bb5a","windows":[
        {"window":"5h","used_pct":44.0,"resets_at":"2026-10-07T14:10:00Z","duration_s":18000.0,"sampled_at":"2026-10-07T13:35:46Z"},
        {"window":"week · Fable","used_pct":120,"resets_at":null,"duration_s":604800.0}],
       "cycle":{"start":"2026-09-22T19:58:10Z","end":"2026-10-22T19:58:10Z","source":"profile.subscription_created_at"},
       "last_poll":{"at":"2026-10-07T13:35:46Z","status":"ok","detail":""}},
      {"provider":"opencode-go","account":"sha256:008e8aa","windows":[],"cycle":null,
       "last_poll":{"at":"2026-10-07T09:33:29Z","status":"http","detail":"HTTP 403 from opencode.ai/zen/go/v1/usage"}},
      {"provider":"kimi","account":"k1","windows":[{"window":"month","used_pct":5,"resets_at":"2026-11-01T00:00:00Z","duration_s":null}]},
      {"provider":7,"account":"bad"},
      {"provider":"codex","account":"c1","windows":[{"window":"week","used_pct":"12"},{"used_pct":3}]}
    ]}"#;

    #[test]
    fn parses_accounts_windows_and_polls() {
        let accounts = parse_board(BOARD.as_bytes()).unwrap();
        assert_eq!(accounts.len(), 4);
        assert_eq!(
            accounts[0],
            CtaAccount {
                provider: "claude".into(),
                account: "0bb1535b-bb5a".into(),
                windows: vec![
                    QuotaWindow { label: "5h".into(), used_percent: 44.0, resets_at: Some(ms("2026-10-07T14:10:00Z")), duration_secs: Some(FIVE_HOURS) },
                    QuotaWindow { label: "week · Fable".into(), used_percent: 100.0, resets_at: None, duration_secs: Some(WEEK) },
                ],
                polled_at: Some(ms("2026-10-07T13:35:46Z")),
                status: "ok".into(),
                detail: "".into(),
            }
        );
        assert_eq!(accounts[1].provider, "opencode-go");
        assert!(accounts[1].windows.is_empty());
        assert_eq!(accounts[1].status, "http");
        assert_eq!(accounts[1].detail, "HTTP 403 from opencode.ai/zen/go/v1/usage");
        assert_eq!(accounts[2].provider, "kimi");
        assert_eq!(accounts[2].windows[0].duration_secs, None);
        assert_eq!((accounts[2].polled_at, accounts[2].status.as_str()), (None, "unknown"));
        assert_eq!(accounts[3].provider, "codex");
        assert!(accounts[3].windows.is_empty());
    }

    #[test]
    fn rejects_output_without_an_accounts_array() {
        assert_eq!(parse_board(b"not json"), None);
        assert_eq!(parse_board(br#"{"accounts":{}}"#), None);
        assert_eq!(parse_board(br#"[]"#), None);
        assert_eq!(parse_board(br#"{"accounts":[]}"#), Some(vec![]));
    }

    fn exe(dir: &Path, mode: u32) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let p = dir.join("cta");
        std::fs::write(&p, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(mode)).unwrap();
        p
    }

    #[test]
    fn locates_home_first_then_path_then_fallbacks() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home");
        let on_path = exe(&tmp.path().join("bin"), 0o755);
        let path_env = std::env::join_paths([tmp.path().join("empty"), tmp.path().join("bin")]).unwrap();
        let fallback = vec![tmp.path().join("brew")];
        let in_brew = exe(&fallback[0], 0o755);

        assert_eq!(locate(Some(&home), Some(&path_env), &fallback), Some(on_path.clone()));
        let in_home = exe(&home.join(".local/bin"), 0o755);
        assert_eq!(locate(Some(&home), Some(&path_env), &fallback), Some(in_home.clone()));
        std::fs::set_permissions(&in_home, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(locate(Some(&home), Some(&path_env), &fallback), Some(on_path));
        assert_eq!(locate(Some(&home), None, &fallback), Some(in_brew));
        assert_eq!(locate(None, None, &[]), None);
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run (in `src-tauri/`): `cargo test quota::cta`
Expected: compile error, `parse_board` / `locate` / `CtaAccount` not found.

- [ ] **Step 3: Implement** `CtaAccount`, `CtaQuota`, `parse_board`, `FALLBACK_DIRS` and `locate` in `src-tauri/src/quota/cta.rs`, and `pub mod cta;` in `quota/mod.rs`. `locate` checks `home/.local/bin/cta`, then `std::env::split_paths(path_env)` each joined with `cta`, then each fallback dir joined with `cta`; a candidate counts when `metadata.is_file() && mode & 0o111 != 0`.

- [ ] **Step 4: Run to verify they pass**

Run (in `src-tauri/`): `cargo test quota::cta`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/quota/cta.rs src-tauri/src/quota/mod.rs
git commit -m "feat(quota): parse cta ledger quota JSON and locate cta"
```

---

### Task 2: Run `cta` and expose `quota_cta`

**Files:**
- Modify: `src-tauri/src/quota/cta.rs`
- Modify: `src-tauri/src/commands.rs` (next to `quota_fetch`, ~line 697)
- Modify: `src-tauri/src/lib.rs` (`invoke_handler` list, after `commands::quota_fetch`)

**Interfaces:**
- Consumes: Task 1's `CtaQuota`, `parse_board`, `locate`, `FALLBACK_DIRS`.
- Produces:
  - `#[derive(Debug, Clone, Copy)] pub struct Timeouts { pub read: Duration, pub poll: Duration }` and `pub const TIMEOUTS: Timeouts` = read 20 s, poll 60 s.
  - `pub async fn run(cta: &Path, poll: bool, timeouts: Timeouts) -> CtaQuota` — never `Missing`; `read_at` = `chrono::Utc::now().timestamp_millis()` after the read.
  - `impl CtaQuota { pub fn log_line(&self) -> String }` → `missing`, `ok <n> accounts`, `failed <reason>`.
  - `pub async fn read(poll: bool) -> CtaQuota` — `locate(HOME, PATH, FALLBACK_DIRS)`; `None` → `Missing`; else `run(.., TIMEOUTS)`; logs the one log line.
  - Tauri command `quota_cta(poll: bool) -> Result<CtaQuota, AppError>`, always `Ok(cta::read(poll).await)`.

- [ ] **Step 1: Write the failing tests** — add to `mod tests` in `cta.rs`:

```rust
    const FAST: Timeouts = Timeouts { read: Duration::from_secs(5), poll: Duration::from_secs(5) };

    /// A fake cta that records its arguments next to itself, then runs `body`.
    fn fake(dir: &Path, body: &str) -> PathBuf {
        let p = dir.join("cta");
        std::fs::write(&p, format!("#!/bin/sh\necho \"$*\" >> \"$(dirname \"$0\")/calls\"\n{body}\n")).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    }
    fn calls(dir: &Path) -> String {
        std::fs::read_to_string(dir.join("calls")).unwrap_or_default()
    }
    const ONE: &str = r#"{"accounts":[{"provider":"grok","account":"g1","windows":[],"last_poll":{"at":"2026-10-07T13:51:05Z","status":"ok","detail":""}}]}"#;

    #[tokio::test]
    async fn reads_without_polling() {
        let tmp = tempfile::tempdir().unwrap();
        let cta = fake(tmp.path(), &format!("echo '{ONE}'"));
        let CtaQuota::Ok { accounts, read_at } = run(&cta, false, FAST).await else { panic!("not ok") };
        assert_eq!(accounts.len(), 1);
        assert!(read_at > 0);
        assert_eq!(calls(tmp.path()), "ledger quota --json\n");
    }

    #[tokio::test]
    async fn polls_first_and_ignores_the_poll_exit_status() {
        let tmp = tempfile::tempdir().unwrap();
        let cta = fake(tmp.path(), &format!("[ \"$3\" = poll ] && exit 1\necho '{ONE}'"));
        assert!(matches!(run(&cta, true, FAST).await, CtaQuota::Ok { .. }));
        assert_eq!(calls(tmp.path()), "ledger quota poll\nledger quota --json\n");
    }

    #[tokio::test]
    async fn reports_failures_in_fixed_copy() {
        let tmp = tempfile::tempdir().unwrap();
        let failed = |reason: &str| CtaQuota::Failed { reason: reason.into() };
        let long_body = format!("echo {} >&2; exit 4", "x".repeat(300));
        let cases = [
            ("printf '\\nboom\\nmore\\n' >&2; exit 2", failed("cta exited 2: boom")),
            ("exit 3", failed("cta exited 3")),
            (long_body.as_str(), failed(&format!("cta exited 4: {}", "x".repeat(200)))),
            ("echo garbage", failed("cta: unreadable output")),
            ("kill -9 $$", failed("cta killed")),
        ];
        for (body, want) in cases {
            let cta = fake(tmp.path(), body);
            assert_eq!(run(&cta, false, FAST).await, want, "body: {body}");
        }
        let slow = fake(tmp.path(), "sleep 5");
        let short = Timeouts { read: Duration::from_millis(200), poll: Duration::from_millis(200) };
        assert_eq!(run(&slow, false, short).await, failed("cta timed out"));
        assert_eq!(run(&tmp.path().join("absent"), false, FAST).await, failed("cta could not start"));
    }

    #[test]
    fn log_line_never_carries_account_ids() {
        let ok = CtaQuota::Ok { accounts: parse_board(BOARD.as_bytes()).unwrap(), read_at: 1 };
        assert_eq!(ok.log_line(), "ok 4 accounts");
        assert_eq!(CtaQuota::Missing.log_line(), "missing");
        assert_eq!(CtaQuota::Failed { reason: "cta timed out".into() }.log_line(), "failed cta timed out");
    }
```

- [ ] **Step 2: Run to verify they fail**

Run (in `src-tauri/`): `cargo test quota::cta`
Expected: compile error, `run` / `Timeouts` / `log_line` not found.

- [ ] **Step 3: Implement** `Timeouts`, `TIMEOUTS`, `run`, `log_line`, `read` in `cta.rs`, then the `quota_cta` command in `commands.rs` and its entry in `lib.rs`. `run` uses `tokio::process::Command::new(cta)` with `.stdin(Stdio::null()).kill_on_drop(true).output()` inside `tokio::time::timeout`; the poll step's result is dropped except on spawn error, which returns `cta could not start`. A poll that times out does not stop the read.

- [ ] **Step 4: Run to verify they pass, then lint**

Run (in `src-tauri/`): `cargo test quota::cta && cargo clippy -- -D warnings`
Expected: 7 passed; clippy clean.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/quota/cta.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(quota): run cta and expose the quota_cta command"
```

---

### Task 3: Frontend `cta` types and cards

**Files:**
- Modify: `src/lib/types.ts` (after `QuotaOutcome`, ~line 163)
- Modify: `src/lib/ipc.ts` (next to `quotaFetch`, line 119)
- Create: `src/quota/cta.ts`
- Test: `src/quota/cta.test.ts`

**Interfaces:**
- Consumes: Task 2's IPC shape; `QuotaEntry` from `src/quota/entry.ts`; `updatedAgo` from `src/quota/format.ts`.
- Produces:
  - `types.ts`: `export interface CtaAccount { provider: string; account: string; windows: QuotaWindow[]; polledAt: number | null; status: string; detail: string }` and `export type CtaQuota = { kind: "missing" } | { kind: "ok"; accounts: CtaAccount[]; readAt: number } | { kind: "failed"; reason: string };`
  - `ipc.ts`: `export const quotaCta = (poll: boolean) => invoke<CtaQuota>("quota_cta", { poll });`
  - `cta.ts`: `export interface CtaCard { key: string; name: string; agent: string; account: string | null; entry: QuotaEntry; polledAt: number | null }`, `export const STALE_POLL_MS = 1_800_000;`, `export function ctaCards(accounts: CtaAccount[]): CtaCard[]`, `export function shortAccount(id: string): string`, `export function staleNote(polledAt: number | null, now: number): string | null`.
  - Entry rule: `status === "ok"` → `{ kind: "ok", report: { windows, fetchedAt: polledAt ?? 0 } }`; otherwise `{ kind: "problem", message: detail || status, last: windows.length > 0 ? { windows, fetchedAt: polledAt ?? 0 } : null }`. `key` = `` `${provider}/${account}` ``.

- [ ] **Step 1: Write the failing tests** — `src/quota/cta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CtaAccount } from "../lib/types";
import { ctaCards, shortAccount, staleNote, STALE_POLL_MS } from "./cta";

const w = { label: "week", usedPercent: 12, resetsAt: null, durationSecs: 604_800 };
const acct = (provider: string, account: string, more: Partial<CtaAccount> = {}): CtaAccount => ({
  provider, account, windows: [w], polledAt: 1_000, status: "ok", detail: "", ...more,
});

describe("ctaCards", () => {
  it("orders known Providers first, unknown ids alphabetically, accounts in cta order", () => {
    const cards = ctaCards([
      acct("zeta", "z1"), acct("grok", "g1"), acct("kimi", "k1"),
      acct("claude", "c-second"), acct("opencode-go", "sha256:abcdef0123456"), acct("claude", "c-first"),
    ]);
    expect(cards.map((c) => c.key)).toEqual([
      "claude/c-second", "claude/c-first", "opencode-go/sha256:abcdef0123456", "grok/g1", "kimi/k1", "zeta/z1",
    ]);
    expect(cards.map((c) => c.name)).toEqual(["Claude", "Claude", "OpenCode Go", "Grok", "kimi", "zeta"]);
    expect(cards.map((c) => c.agent)).toEqual(["claude", "claude", "opencode", "grok", "kimi", "zeta"]);
  });

  it("labels accounts only when a Provider has several", () => {
    const cards = ctaCards([acct("claude", "0bb1535b-bb5a"), acct("claude", "955f5fbe-a050"), acct("codex", "edbec1d9")]);
    expect(cards.map((c) => c.account)).toEqual(["0bb1535b", "955f5fbe", null]);
  });

  it("maps poll status to entries, keeping windows of a failed poll as the last report", () => {
    const [ok, failedWithNumbers, failedEmpty, noDetail] = ctaCards([
      acct("claude", "a"),
      acct("claude", "b", { status: "http", detail: "HTTP 401 from x" }),
      acct("claude", "c", { status: "http", detail: "HTTP 403 from y", windows: [], polledAt: null }),
      acct("claude", "d", { status: "auth", detail: "" }),
    ]);
    expect(ok.entry).toEqual({ kind: "ok", report: { windows: [w], fetchedAt: 1_000 } });
    expect(failedWithNumbers.entry).toEqual({ kind: "problem", message: "HTTP 401 from x", last: { windows: [w], fetchedAt: 1_000 } });
    expect(failedEmpty.entry).toEqual({ kind: "problem", message: "HTTP 403 from y", last: null });
    expect(noDetail.entry).toEqual({ kind: "problem", message: "auth", last: { windows: [w], fetchedAt: 1_000 } });
  });
});

describe("shortAccount", () => {
  it("drops a sha256 prefix and keeps 8 characters", () => {
    expect(shortAccount("sha256:008e8aa1234")).toBe("008e8aa1");
    expect(shortAccount("g1")).toBe("g1");
  });
});

describe("staleNote", () => {
  it("speaks only after 30 minutes", () => {
    const now = 10 * STALE_POLL_MS;
    expect(staleNote(now - STALE_POLL_MS, now)).toBeNull();
    expect(staleNote(now - 2 * 3_600_000, now)).toBe("updated 2h ago");
    expect(staleNote(null, now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/quota/cta.test.ts`
Expected: FAIL, cannot resolve `./cta`.

- [ ] **Step 3: Implement** the types, `quotaCta`, and `src/quota/cta.ts` (a module-level `CTA_PROVIDERS` table holding the four known ids in display order with name and agent).

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/quota/cta.test.ts && pnpm tsc --noEmit`
Expected: 5 passed; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/ipc.ts src/quota/cta.ts src/quota/cta.test.ts
git commit -m "feat(quota): cards from cta accounts"
```

---

### Task 4: Store asks `cta` first, falls back only when it is missing

**Files:**
- Modify: `src/quota/store.ts`
- Test: `src/quota/store.test.ts`

**Interfaces:**
- Consumes: `quotaCta`, `quotaFetch` from `src/lib/ipc.ts`; `CtaQuota`; `isDue`.
- Produces (in `store.ts`):
  - `export type QuotaSource = "unknown" | "cta" | "builtin";`
  - `export interface CtaSlot { result: CtaQuota | null; inFlight: boolean; lastStarted: number | null }`
  - `QuotaState` gains `source: QuotaSource` and `cta: CtaSlot`; `refresh(trigger)` keeps its signature.
  - `export const initialQuota = (): Pick<QuotaState, "slots" | "source" | "cta">` → `{ slots: initialSlots(), source: "unknown", cta: { result: null, inFlight: false, lastStarted: null } }`. `initialSlots` stays exported.
- Refresh rule: when `source !== "builtin"` or `trigger === "manual"`, and `!cta.inFlight && isDue(trigger, cta.lastStarted, null, now)`: call `quotaCta(trigger === "manual")`. `missing` → `source = "builtin"`, then run the existing per-Provider refresh with the same trigger. `ok` / `failed` → `source = "cta"`, `cta.result` = it. A rejected invoke → `source = "cta"`, `result = { kind: "failed", reason: <message> }`. When the `cta` step does not run (in flight or not due), the existing per-Provider refresh runs only if `source === "builtin"`; with `unknown` or `cta` nothing else happens.

- [ ] **Step 1: Update the existing tests' setup and add the failing tests** — in `src/quota/store.test.ts` replace the mock, imports and `beforeEach` with:

```ts
vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn(), quotaCta: vi.fn() }));
import { quotaCta, quotaFetch } from "../lib/ipc";
import type { CtaQuota, QuotaOutcome } from "../lib/types";
import { initialQuota, useQuota } from "./store";

const fetchMock = vi.mocked(quotaFetch);
const ctaMock = vi.mocked(quotaCta);
```

```ts
  beforeEach(() => {
    fetchMock.mockReset();
    ctaMock.mockReset();
    ctaMock.mockResolvedValue({ kind: "missing" });
    useQuota.setState(initialQuota());
  });
```

and append:

```ts
describe("useQuota with cta", () => {
  const board: CtaQuota = { kind: "ok", readAt: 5, accounts: [
    { provider: "claude", account: "a", windows: okWindows, polledAt: 4, status: "ok", detail: "" } ] };

  beforeEach(() => {
    fetchMock.mockReset();
    ctaMock.mockReset();
    useQuota.setState(initialQuota());
  });

  it("uses cta when installed and never calls the Providers", async () => {
    ctaMock.mockResolvedValue(board);
    await useQuota.getState().refresh("shown");
    expect(ctaMock).toHaveBeenCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useQuota.getState().source).toBe("cta");
    expect(useQuota.getState().cta).toEqual({ result: board, inFlight: false, lastStarted: expect.any(Number) });
  });

  it("shows a cta failure instead of falling back", async () => {
    ctaMock.mockResolvedValue({ kind: "failed", reason: "cta exited 2: boom" });
    await useQuota.getState().refresh("shown");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useQuota.getState().source).toBe("cta");
    expect(useQuota.getState().cta.result).toEqual({ kind: "failed", reason: "cta exited 2: boom" });
  });

  it("turns a rejected invoke into a cta failure and clears the spinner", async () => {
    ctaMock.mockRejectedValue(new Error("command quota_cta not found"));
    await useQuota.getState().refresh("shown");
    expect(useQuota.getState().cta.result).toEqual({ kind: "failed", reason: "command quota_cta not found" });
    expect(useQuota.getState().cta.inFlight).toBe(false);
  });

  it("falls back to the Providers when cta is missing and asks cta again only on manual refresh", async () => {
    ctaMock.mockResolvedValue({ kind: "missing" });
    fetchMock.mockResolvedValue({ kind: "notSignedIn" });
    await useQuota.getState().refresh("shown");
    expect(useQuota.getState().source).toBe("builtin");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await useQuota.getState().refresh("tick");
    expect(ctaMock).toHaveBeenCalledTimes(1);
    ctaMock.mockResolvedValue(board);
    await useQuota.getState().refresh("manual");
    expect(ctaMock).toHaveBeenLastCalledWith(true);
    expect(useQuota.getState().source).toBe("cta");
  });

  it("polls through cta on manual refresh without starting a second cta while one runs", async () => {
    let release!: () => void;
    ctaMock.mockImplementation(() => new Promise<CtaQuota>((r) => (release = () => r(board))));
    const first = useQuota.getState().refresh("manual");
    await useQuota.getState().refresh("manual");
    expect(ctaMock).toHaveBeenCalledTimes(1);
    expect(ctaMock).toHaveBeenCalledWith(true);
    expect(useQuota.getState().cta.inFlight).toBe(true);
    release();
    await first;
    expect(useQuota.getState().cta.inFlight).toBe(false);
  });
});
```

In every existing test of this file that resets state, replace `useQuota.setState({ slots: initialSlots() })` with `useQuota.setState(initialQuota())`. In the existing test "does not start a second fetch while one is in flight", the Provider fetches now start after the `cta` answer, so replace its synchronous `expect(fetchMock).toHaveBeenCalledTimes(4);` with `await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));`.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm vitest run src/quota/store.test.ts`
Expected: FAIL, `initialQuota` is not exported.

- [ ] **Step 3: Implement** the refresh rule in `store.ts`; move the current body of `refresh` into a local `refreshBuiltin(trigger)` without changing it.

- [ ] **Step 4: Run to verify all store tests pass**

Run: `pnpm vitest run src/quota/`
Expected: all pass, including the pre-existing store tests.

- [ ] **Step 5: Commit**

```bash
git add src/quota/store.ts src/quota/store.test.ts
git commit -m "feat(quota): read cta first, fall back to Provider calls only without cta"
```

---

### Task 5: Quota column renders `cta` cards; full gate and a real run

**Files:**
- Modify: `src/dashboard/QuotaColumn.tsx`
- Modify: `src/styles.css` (after `.dash-quota-note`, line 1396)
- Test: `src/dashboard/QuotaColumn.test.tsx`

**Interfaces:**
- Consumes: `useQuota` (`source`, `cta`, `slots`, `refresh`), `initialQuota`; `ctaCards`, `staleNote` from `src/quota/cta.ts`; the existing `Body` and `AgentIcon`.
- Produces: rendering only.
- Render rule: `source === "cta"` and `cta.result.kind === "ok"` → one `li.dash-quota-card` per `ctaCards(accounts)`: head = `AgentIcon agent={card.agent}`, title `card.name`, then `<span className="dash-quota-account">{card.account}</span>` when not null; body = `<Body entry={card.entry} now={now} />` then `<p className="dash-quota-note">{note}</p>` when `staleNote(card.polledAt, now)` is not null. Zero accounts → one card titled `cta` with note `no accounts — run cta ledger quota poll`. `cta.result.kind === "failed"` → one card titled `cta` with the reason as a `dash-quota-note`. Any other state (`unknown`, `builtin`) → the existing Provider cards. Refresh spinner: `cta.inFlight` or any Provider slot in flight.
- CSS: `.dash-quota-account { color: var(--fg-3); font-size: 11px; font-family: var(--font-mono, monospace); }`

- [ ] **Step 1: Update the existing tests' setup and add the failing tests** — in `src/dashboard/QuotaColumn.test.tsx` replace the mock and `beforeEach` with:

```tsx
vi.mock("../lib/ipc", () => ({ quotaFetch: vi.fn(), quotaCta: vi.fn() }));
import { quotaCta, quotaFetch } from "../lib/ipc";
import type { CtaQuota, QuotaOutcome, QuotaProvider } from "../lib/types";
import { initialQuota, useQuota } from "../quota/store";
```

```tsx
const ctaMock = vi.mocked(quotaCta);
```

```tsx
  beforeEach(() => {
    fetchMock.mockReset();
    ctaMock.mockReset();
    ctaMock.mockResolvedValue({ kind: "missing" });
    useQuota.setState(initialQuota());
  });
```

and append inside the `describe`:

```tsx
  it("shows one card per cta account, labels multiple accounts and unknown Providers", async () => {
    const now = Date.now();
    const board: CtaQuota = { kind: "ok", readAt: now, accounts: [
      { provider: "claude", account: "0bb1535b-bb5a", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "5h", usedPercent: 44, resetsAt: null, durationSecs: 18_000 }] },
      { provider: "claude", account: "955f5fbe-a050", polledAt: now - 3 * 3_600_000, status: "ok", detail: "",
        windows: [{ label: "week", usedPercent: 93, resetsAt: null, durationSecs: 604_800 }] },
      { provider: "opencode-go", account: "sha256:008e8aa1", polledAt: now, status: "http",
        detail: "HTTP 403 from opencode.ai/zen/go/v1/usage", windows: [] },
      { provider: "kimi", account: "k1", polledAt: now, status: "ok", detail: "",
        windows: [{ label: "month", usedPercent: 5, resetsAt: null, durationSecs: null }] },
    ] };
    ctaMock.mockResolvedValue(board);
    render(<QuotaColumn />);
    const col = screen.getByRole("region", { name: "Quota" });
    await waitFor(() => expect(within(col).getByText("44%")).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
    const items = within(col).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0].textContent).toContain("0bb1535b");
    expect(items[1].textContent).toContain("955f5fbe");
    expect(within(items[1]).getByText("updated 3h ago")).toBeTruthy();
    expect(within(items[0]).queryByText(/updated/)).toBeNull();
    expect(within(items[2]).getByText("HTTP 403 from opencode.ai/zen/go/v1/usage")).toBeTruthy();
    expect(items[2].textContent).not.toContain("008e8aa1");
    expect(within(items[3]).getByText("kimi")).toBeTruthy();
    expect(within(items[3]).getByText("5%")).toBeTruthy();
  });

  it("shows a cta failure as one card", async () => {
    ctaMock.mockResolvedValue({ kind: "failed", reason: "cta timed out" });
    render(<QuotaColumn />);
    await waitFor(() => expect(screen.getByText("cta timed out")).toBeTruthy());
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks cta to poll when refreshed by hand", async () => {
    ctaMock.mockResolvedValue({ kind: "ok", readAt: 1, accounts: [] });
    render(<QuotaColumn />);
    await waitFor(() => expect(screen.getByText("no accounts — run cta ledger quota poll")).toBeTruthy());
    await waitFor(() => expect(useQuota.getState().cta.inFlight).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Refresh quota" }));
    await waitFor(() => expect(ctaMock).toHaveBeenLastCalledWith(true));
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm vitest run src/dashboard/QuotaColumn.test.tsx`
Expected: the 3 new tests FAIL (Provider cards rendered instead of `cta` cards); the existing tests pass.

- [ ] **Step 3: Implement** the render rule in `QuotaColumn.tsx` and the CSS rule.

- [ ] **Step 4: Run the whole gate**

Run: `mise run ci > /tmp/herdr-quota-cta-ci-$(date +%s).log 2>&1; echo exit $?`
Expected: `exit 0` and the log ends with `ci passed`.

- [ ] **Step 5: Real run against the installed `cta`**

Run `cta ledger quota --json` and `mise run dev`; open the Agent Dashboard. Expected: one Quota card per account in that JSON, in the order from Global Constraints, with the same percentages; the account polled more than 30 minutes ago shows `updated …`; the OpenCode Go account with a 403 shows that detail; pressing Refresh spins until `cta ledger quota poll` finishes, and the `last_poll.at` values in `cta ledger quota --json` move forward. Then quit the dev app.

- [ ] **Step 6: Commit**

```bash
git add src/dashboard/QuotaColumn.tsx src/dashboard/QuotaColumn.test.tsx src/styles.css
git commit -m "feat(dashboard): quota column shows cta accounts"
```
