# Task 5 report

Updated the dashboard quota column to display one card per cta account, including account labels, stale timestamps, unknown providers, empty and failed cta results, and manual polling. Updated dashboard tests and account-label styling.

## Verification

- `pnpm test` — 95 test files passed, 793 tests passed.
- `pnpm typecheck` — `tsc --noEmit` exited 0.
- `git diff --check` — exited 0.

Implementation commit: `b5300be3bb8885af4ba32227d787aec805beda04 feat(dashboard): quota column shows cta accounts`.

Final result: Task 5 implementation committed and verification passed.

## Review fixes

- Failed cta accounts with retained windows now render their problem detail without `Body`'s age suffix; `staleNote` alone renders age for a real stale `polledAt`. A null `polledAt` renders no age, rather than an epoch-derived age. Built-in cards retain `Body`'s existing problem-age behavior.
- Added regressions for duplicate age, null poll timestamp, and the spinner during a pending manual cta refresh.
- Red: targeted Vitest run failed on both age regressions (2 failed, 7 passed). Green: `pnpm vitest run src/dashboard/QuotaColumn.test.tsx` passed (9/9).
- `mise run ci` passed: 95 frontend files / 796 tests and 311 backend unit tests; log `/tmp/herdr-quota-cta-review-ci.log` ended in `ci passed`. Nonfatal jsdom canvas warnings remain. `git diff --check` passed.
- Review fix commit: `51b1c51 fix(dashboard): show cta poll age only when known`. A concurrent commit recorded the same staged changes before this agent's commit command finished; its hook passed the full gate and then reported a clean tree / nothing to commit.

## Final review fixes

- Read the complete accepted ADR 0005, amended ADR 0002, fallback design spec, and CTA implementation plan. ADR 0005's no-correction rule takes precedence over the plan's clamping instruction. The installed CTA points to `ct-agent`: `src/ctc/ledger/quota/providers.py::_pct` explicitly preserves raw percentages; `tests/ledger/quota/test_providers.py::test_percent_is_kept_raw_and_booleans_are_not_numbers` expects `130` and `-4`. `history.py::to_json` and text presentation also retain the raw values. Values above 100 are therefore valid contract data, not an app-side error to correct.
- Removed clamping only from the CTA parser. Added parser coverage for `120`, `130`, and `-4`; the frozen built-in quota modules are unchanged. Added a dashboard regression displaying `130%` and `-4%` while independently bounding bar widths to `100%` and `0%`. No production UI change was needed.
- Added a gated real-process test: the fake CTA cannot finish its read until released, and `read_at` must fall between the pre-release checkpoint and the returned result. Added a timeout test that atomically records the child PID, confirms it is alive, uses `exec sleep` to avoid an orphan shell child, and retries until `kill(pid, 0)` reports `ESRCH`. The test cleans up a surviving child on regression. The older timeout fixture now also uses `exec sleep`.
- Added `quotaCta` to the AgentDashboard IPC mock, returning the supported `missing` outcome. Each test resets quota state; the search integration test awaits four built-in cards and verifies the `builtin` source rather than passing through a caught missing-export rejection.

### Final review verification

- Baseline: 19 targeted frontend tests and 9 CTA backend tests passed.
- Red: the raw-percentage parser regressions failed as expected (2 failures, 10 passes). Green: 20 targeted frontend tests and all 12 CTA backend tests passed.
- Mutation checks: capturing `read_at` before the read failed the timing test; disabling `kill_on_drop` failed the PID disappearance test; clamping displayed text failed the `130%` rendering test. All temporary mutations were removed and the final diff checked.
- `mise run ci` passed (exit 0, `ci passed`): formatting, type-checking, clippy, 95 frontend files / 797 tests, and 314 backend unit tests. The three opt-in backend integration tests remain ignored by the standard gate. Nonfatal jsdom canvas warnings remain. CI output: `.pi/tasks/01a116f9-499e-7102-a820-46bdc37753d7-74561/bb0a05a0c.output`.
- `git diff --check` and `git diff --cached --check` passed. No subagents were used.
- A concurrent commit recorded the verified source/test changes as `6dc113e9f22ee8b884beda1cb217951060e04898` (`fix(quota): retain cta percentages and strengthen integration tests`). Inspected the actual commit: it contains exactly the three intended source/test files, with raw percentages and the original correct timestamp/cleanup behavior. This appended report is committed separately.
