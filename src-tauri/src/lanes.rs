//! The lane store's view of who owns each lane: `ctc lane list --json`, run on the Machine
//! whose sessions hold the lanes (ct-agent docs/10-lane.md).
use crate::{
    error::{AppError, AppResult},
    transport::{exec, Transport},
};
use serde::{Deserialize, Serialize};

/// One lane: its pane, and `owner`, `<herdr session>/<pane id>` of the orchestrator that owns it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaneRecord {
    pub lane_id: String,
    pub herdr_session: Option<String>,
    pub pane_id: Option<String>,
    pub owner: Option<String>,
}

/// `ctc` from `~/.local/bin`, else from the login shell's PATH; exit 127 when there is none.
const LANES_SCRIPT: &str = r#"C="$HOME/.local/bin/ctc"
[ -x "$C" ] || C=$("${SHELL:-sh}" -lc 'command -v ctc' 2>/dev/null </dev/null | tail -n 1)
case "$C" in /*) ;; *) exit 127 ;; esac
exec "$C" lane list --json
"#;

/// The lanes, or `None` when this ctc predates `owner` (its rows lack the key): the caller then
/// folds lanes as before.
pub fn parse_lanes(stdout: &str) -> AppResult<Option<Vec<LaneRecord>>> {
    let bad = |e: String| AppError::new("ctc_output", format!("ctc lane list: {e}"));
    let v: serde_json::Value = serde_json::from_str(stdout).map_err(|e| bad(e.to_string()))?;
    let rows = v
        .get("lanes")
        .and_then(|l| l.as_array())
        .ok_or_else(|| bad("no lanes array".into()))?;
    if rows.iter().any(|r| r.get("owner").is_none()) {
        return Ok(None);
    }
    rows.iter()
        .map(|r| serde_json::from_value(r.clone()).map_err(|e| bad(e.to_string())))
        .collect::<AppResult<Vec<_>>>()
        .map(Some)
}

pub async fn list(t: &dyn Transport) -> AppResult<Option<Vec<LaneRecord>>> {
    let argv: Vec<String> = ["sh", "-c", LANES_SCRIPT, "lanes"]
        .map(String::from)
        .to_vec();
    let o = exec(t, &argv).await?;
    match o.status {
        0 => parse_lanes(&o.stdout),
        127 => Err(AppError::new(
            "ctc_not_found",
            "ctc was not found on this machine",
        )),
        s => Err(AppError::new(
            "io",
            format!("ctc lane list exited {s}: {}", o.stderr.trim()),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_each_lanes_pane_and_owner() {
        let out = r#"{"lanes": [{"lane_id": "lane-a", "state": "running", "repo": "/r", "worktree": null, "herdr_session": "s", "pane_id": "w1:pA", "owner": "s/w1:p8"},
            {"lane_id": "lane-b", "state": "running", "repo": null, "worktree": null, "herdr_session": null, "pane_id": null, "owner": null}]}"#;
        assert_eq!(
            parse_lanes(out).unwrap(),
            Some(vec![
                LaneRecord {
                    lane_id: "lane-a".into(),
                    herdr_session: Some("s".into()),
                    pane_id: Some("w1:pA".into()),
                    owner: Some("s/w1:p8".into())
                },
                LaneRecord {
                    lane_id: "lane-b".into(),
                    herdr_session: None,
                    pane_id: None,
                    owner: None
                },
            ])
        );
    }

    #[test]
    fn a_ctc_without_owner_gives_none() {
        let out = r#"{"lanes": [{"lane_id": "lane-a", "state": "running", "repo": "/r", "worktree": null, "herdr_session": "s", "pane_id": "w1:pA"}]}"#;
        assert_eq!(parse_lanes(out).unwrap(), None);
    }

    #[test]
    fn an_empty_store_is_no_lanes() {
        assert_eq!(parse_lanes(r#"{"lanes": []}"#).unwrap(), Some(vec![]));
    }

    #[test]
    fn unreadable_output_is_an_error() {
        assert_eq!(parse_lanes("nope").unwrap_err().code, "ctc_output");
        assert_eq!(
            parse_lanes(r#"{"rows": []}"#).unwrap_err().code,
            "ctc_output"
        );
    }
}
