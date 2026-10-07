//! Read the account quota board produced by `cta ledger quota --json`.

use std::ffi::OsStr;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use serde::Serialize;
use serde_json::Value;

use super::{parsers::parse_date, QuotaWindow};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CtaAccount {
    pub provider: String,
    pub account: String,
    pub windows: Vec<QuotaWindow>,
    pub polled_at: Option<i64>,
    pub status: String,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CtaQuota {
    Missing,
    Ok {
        accounts: Vec<CtaAccount>,
        read_at: i64,
    },
    Failed {
        reason: String,
    },
}

#[derive(Debug, Clone, Copy)]
pub struct Timeouts {
    pub read: Duration,
    pub poll: Duration,
}

pub const TIMEOUTS: Timeouts = Timeouts {
    read: Duration::from_secs(20),
    poll: Duration::from_secs(60),
};

impl CtaQuota {
    pub fn log_line(&self) -> String {
        match self {
            Self::Missing => "missing".into(),
            Self::Ok { accounts, .. } => format!("ok {} accounts", accounts.len()),
            // Failure reasons may contain raw cta stderr; keep them in UI/IPC, not logs.
            Self::Failed { .. } => "failed".into(),
        }
    }
}

async fn execute(
    cta: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let mut command = Command::new(cta);
    command.args(args).stdin(Stdio::null()).kill_on_drop(true);
    let child = command.output();
    match tokio::time::timeout(timeout, child).await {
        Err(_) => Err("timeout".into()),
        Ok(Err(_)) => Err("start".into()),
        Ok(Ok(output)) => Ok(output),
    }
}

pub async fn run(cta: &Path, poll: bool, timeouts: Timeouts) -> CtaQuota {
    if poll
        && execute(cta, &["ledger", "quota", "poll"], timeouts.poll).await == Err("start".into())
    {
        return CtaQuota::Failed {
            reason: "cta could not start".into(),
        };
    }
    let output = match execute(cta, &["ledger", "quota", "--json"], timeouts.read).await {
        Ok(output) => output,
        Err(error) if error == "timeout" => {
            return CtaQuota::Failed {
                reason: "cta timed out".into(),
            }
        }
        Err(_) => {
            return CtaQuota::Failed {
                reason: "cta could not start".into(),
            }
        }
    };
    if !output.status.success() {
        let code = output
            .status
            .code()
            .map(|code| format!("cta exited {code}"));
        let Some(mut reason) = code else {
            return CtaQuota::Failed {
                reason: "cta killed".into(),
            };
        };
        let stderr = String::from_utf8_lossy(&output.stderr);
        if let Some(line) = stderr.lines().map(str::trim).find(|line| !line.is_empty()) {
            reason.push_str(": ");
            reason.extend(line.chars().take(200));
        }
        return CtaQuota::Failed { reason };
    }
    match parse_board(&output.stdout) {
        Some(accounts) => CtaQuota::Ok {
            accounts,
            read_at: chrono::Utc::now().timestamp_millis(),
        },
        None => CtaQuota::Failed {
            reason: "cta: unreadable output".into(),
        },
    }
}

pub async fn read(poll: bool) -> CtaQuota {
    let fallback_dirs = FALLBACK_DIRS.map(PathBuf::from);
    let found = locate(
        std::env::var_os("HOME").as_deref().map(Path::new),
        std::env::var_os("PATH").as_deref(),
        &fallback_dirs,
    );
    let result = match found {
        Some(path) => run(&path, poll, TIMEOUTS).await,
        None => CtaQuota::Missing,
    };
    tracing::info!("quota cta: {}", result.log_line());
    result
}

/// Preserve the account and window order reported by `cta`.
pub fn parse_board(stdout: &[u8]) -> Option<Vec<CtaAccount>> {
    let root: Value = serde_json::from_slice(stdout).ok()?;
    let entries = root.as_object()?.get("accounts")?.as_array()?;
    let accounts: Vec<_> = entries
        .iter()
        .filter_map(|entry| {
            let provider = entry.get("provider")?.as_str()?.to_owned();
            let account = entry.get("account")?.as_str()?.to_owned();
            let windows = entry
                .get("windows")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|window| {
                    let label = window.get("window")?.as_str()?.to_owned();
                    let used_percent = window.get("used_pct")?.as_f64()?.clamp(0.0, 100.0);
                    let resets_at = window.get("resets_at").and_then(parse_date);
                    let duration_secs = window
                        .get("duration_s")
                        .and_then(Value::as_f64)
                        .filter(|secs| secs.is_finite() && *secs > 0.0)
                        .map(|secs| secs.round() as u64);
                    Some(QuotaWindow {
                        label,
                        used_percent,
                        resets_at,
                        duration_secs,
                    })
                })
                .collect();
            let poll = entry.get("last_poll");
            let polled_at = poll.and_then(|p| p.get("at")).and_then(parse_date);
            let status = poll
                .and_then(|p| p.get("status"))
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_owned();
            let detail = poll
                .and_then(|p| p.get("detail"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            Some(CtaAccount {
                provider,
                account,
                windows,
                polled_at,
                status,
                detail,
            })
        })
        .collect();
    if !entries.is_empty() && accounts.is_empty() {
        None
    } else {
        Some(accounts)
    }
}

pub const FALLBACK_DIRS: [&str; 2] = ["/opt/homebrew/bin", "/usr/local/bin"];

/// Find the first executable regular `cta` file in lookup order.
pub fn locate(
    home: Option<&Path>,
    path_env: Option<&OsStr>,
    fallback_dirs: &[PathBuf],
) -> Option<PathBuf> {
    let home_candidates = home.into_iter().map(|h| h.join(".local/bin/cta"));
    let path_candidates = path_env
        .into_iter()
        .flat_map(std::env::split_paths)
        .map(|dir| dir.join("cta"));
    let fallback_candidates = fallback_dirs.iter().map(|dir| dir.join("cta"));
    home_candidates
        .chain(path_candidates)
        .chain(fallback_candidates)
        .find(|candidate| {
            candidate.metadata().is_ok_and(|metadata| {
                metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quota::{QuotaWindow, FIVE_HOURS, WEEK};
    use std::os::unix::fs::PermissionsExt;
    use std::time::Duration;

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
                    QuotaWindow {
                        label: "5h".into(),
                        used_percent: 44.0,
                        resets_at: Some(ms("2026-10-07T14:10:00Z")),
                        duration_secs: Some(FIVE_HOURS)
                    },
                    QuotaWindow {
                        label: "week · Fable".into(),
                        used_percent: 100.0,
                        resets_at: None,
                        duration_secs: Some(WEEK)
                    },
                ],
                polled_at: Some(ms("2026-10-07T13:35:46Z")),
                status: "ok".into(),
                detail: "".into(),
            }
        );
        assert_eq!(accounts[1].provider, "opencode-go");
        assert!(accounts[1].windows.is_empty());
        assert_eq!(accounts[1].status, "http");
        assert_eq!(
            accounts[1].detail,
            "HTTP 403 from opencode.ai/zen/go/v1/usage"
        );
        assert_eq!(accounts[2].provider, "kimi");
        assert_eq!(accounts[2].windows[0].duration_secs, None);
        assert_eq!(
            (accounts[2].polled_at, accounts[2].status.as_str()),
            (None, "unknown")
        );
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

    #[test]
    fn rejects_nonempty_accounts_array_when_every_entry_is_invalid() {
        assert_eq!(
            parse_board(br#"{"accounts":[{"provider":7,"account":"bad"},{"provider":"claude"}]}"#),
            None
        );
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
        let path_env =
            std::env::join_paths([tmp.path().join("empty"), tmp.path().join("bin")]).unwrap();
        let fallback = vec![tmp.path().join("brew")];
        let in_brew = exe(&fallback[0], 0o755);

        assert_eq!(
            locate(Some(&home), Some(&path_env), &fallback),
            Some(on_path.clone())
        );
        let in_home = exe(&home.join(".local/bin"), 0o755);
        assert_eq!(
            locate(Some(&home), Some(&path_env), &fallback),
            Some(in_home.clone())
        );
        std::fs::set_permissions(&in_home, std::fs::Permissions::from_mode(0o644)).unwrap();
        assert_eq!(
            locate(Some(&home), Some(&path_env), &fallback),
            Some(on_path)
        );
        assert_eq!(locate(Some(&home), None, &fallback), Some(in_brew));
        assert_eq!(locate(None, None, &[]), None);
    }

    const FAST: Timeouts = Timeouts {
        read: Duration::from_secs(5),
        poll: Duration::from_secs(5),
    };

    /// A fake cta that records its arguments next to itself, then runs `body`.
    fn fake(dir: &Path, body: &str) -> PathBuf {
        let p = dir.join("cta");
        std::fs::write(
            &p,
            format!("#!/bin/sh\necho \"$*\" >> \"$(dirname \"$0\")/calls\"\n{body}\n"),
        )
        .unwrap();
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
        let CtaQuota::Ok { accounts, read_at } = run(&cta, false, FAST).await else {
            panic!("not ok")
        };
        assert_eq!(accounts.len(), 1);
        assert!(read_at > 0);
        assert_eq!(calls(tmp.path()), "ledger quota --json\n");
    }

    #[tokio::test]
    async fn polls_first_and_ignores_the_poll_exit_status() {
        let tmp = tempfile::tempdir().unwrap();
        let cta = fake(
            tmp.path(),
            &format!("[ \"$3\" = poll ] && exit 1\necho '{ONE}'"),
        );
        assert!(matches!(run(&cta, true, FAST).await, CtaQuota::Ok { .. }));
        assert_eq!(
            calls(tmp.path()),
            "ledger quota poll\nledger quota --json\n"
        );
    }

    #[tokio::test]
    async fn reports_failures_in_fixed_copy() {
        let tmp = tempfile::tempdir().unwrap();
        let failed = |reason: &str| CtaQuota::Failed {
            reason: reason.into(),
        };
        let long_body = format!("echo {} >&2; exit 4", "x".repeat(300));
        let cases = [
            (
                "printf '\\nboom\\nmore\\n' >&2; exit 2",
                failed("cta exited 2: boom"),
            ),
            ("exit 3", failed("cta exited 3")),
            (
                long_body.as_str(),
                failed(&format!("cta exited 4: {}", "x".repeat(200))),
            ),
            ("echo garbage", failed("cta: unreadable output")),
            ("kill -9 $$", failed("cta killed")),
        ];
        for (body, want) in cases {
            let cta = fake(tmp.path(), body);
            assert_eq!(run(&cta, false, FAST).await, want, "body: {body}");
        }
        let slow = fake(tmp.path(), "sleep 5");
        let short = Timeouts {
            read: Duration::from_millis(200),
            poll: Duration::from_millis(200),
        };
        assert_eq!(run(&slow, false, short).await, failed("cta timed out"));
        assert_eq!(
            run(&tmp.path().join("absent"), false, FAST).await,
            failed("cta could not start")
        );
    }

    #[tokio::test]
    async fn failure_log_does_not_expose_stderr_or_account_ids() {
        let tmp = tempfile::tempdir().unwrap();
        let cta = fake(
            tmp.path(),
            "printf 'token=secret account=sha256:private\\n' >&2; exit 2",
        );
        let result = run(&cta, false, FAST).await;
        assert_eq!(
            result,
            CtaQuota::Failed {
                reason: "cta exited 2: token=secret account=sha256:private".into(),
            }
        );
        assert_eq!(result.log_line(), "failed");
    }

    #[test]
    fn log_line_never_carries_account_ids() {
        let ok = CtaQuota::Ok {
            accounts: parse_board(BOARD.as_bytes()).unwrap(),
            read_at: 1,
        };
        assert_eq!(ok.log_line(), "ok 4 accounts");
        assert_eq!(CtaQuota::Missing.log_line(), "missing");
        assert_eq!(
            CtaQuota::Failed {
                reason: "cta timed out".into()
            }
            .log_line(),
            "failed"
        );
    }
}
