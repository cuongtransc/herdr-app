//! The prompts Claude Code keeps for a folder (`~/.claude/history.jsonl`), read on the Pane's
//! Machine, so Up in the Chat lens recalls what Up recalls in Claude's own terminal.
use super::commands::sh;
use crate::error::AppResult;
use crate::transport::{exec, Transport};
use serde_json::Value;
use std::collections::HashMap;

/// How many prompts a folder's history offers; the oldest go first.
pub const HISTORY_MAX: usize = 100;

/// A folder's Claude prompts, oldest first, with pasted text put back in place of its
/// `[Pasted text #N …]` placeholder. Empty when Claude has none or keeps no history file.
pub async fn claude_history(t: &dyn Transport, home: &str, cwd: &str) -> AppResult<Vec<String>> {
    let project = match cwd.trim_end_matches('/') {
        "" => "/",
        p => p,
    };
    // Claude writes compact JSON, so the project's exact key and value (closing quote included,
    // so a sibling folder sharing the prefix does not match) narrow the file on the Machine:
    // a remote one sends only the folder's lines.
    let needle = format!("\"project\":{}", Value::from(project));
    let o = exec(t, &sh(LINES, [home.to_string(), needle])).await?;
    let mut entries: Vec<(String, Vec<Paste>)> = o
        .stdout
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter(|v| v.get("project").and_then(Value::as_str) == Some(project))
        .filter_map(|v| {
            let display = v.get("display")?.as_str()?.to_string();
            Some((display, pastes(v.get("pastedContents"))))
        })
        .collect();
    // Long pastes live in the paste cache, by hash: one more read for those still referenced.
    let hashes: Vec<String> = entries
        .iter()
        .flat_map(|(_, p)| p.iter())
        .filter_map(|p| match p {
            Paste::Hash(_, h) => Some(h.clone()),
            _ => None,
        })
        .collect();
    let cached = if hashes.is_empty() {
        HashMap::new()
    } else {
        let mut args = vec![home.to_string()];
        args.extend(hashes);
        let o = exec(t, &sh(PASTES, args)).await?;
        o.stdout
            .split('\x1e')
            .skip(1)
            .filter_map(|c| c.split_once('\x1f'))
            .filter(|(_, text)| !text.is_empty())
            .map(|(h, text)| (h.to_string(), text.to_string()))
            .collect()
    };
    let mut out: Vec<String> = Vec::new();
    for (display, pastes) in entries.drain(..) {
        let prompt = pastes.iter().fold(display, |text, p| match p {
            Paste::Text(id, content) => put_back(&text, *id, content),
            Paste::Hash(id, h) => cached
                .get(h)
                .map_or(text.clone(), |c| put_back(&text, *id, c)),
        });
        if prompt.trim().is_empty() || out.last() == Some(&prompt) {
            continue;
        }
        out.push(prompt);
    }
    let skip = out.len().saturating_sub(HISTORY_MAX);
    Ok(out.split_off(skip))
}

/// The folder's lines from the end of Claude's history file (`$1` home, `$2` the project's JSON).
const LINES: &str = r#"f="$1/.claude/history.jsonl"; [ -r "$f" ] || exit 0; tail -n 20000 "$f" | grep -F -- "$2" | tail -n 400"#;

/// Cached pastes by hash (`$1` home, then hashes), each as RS hash US text.
const PASTES: &str = r#"d="$1/.claude/paste-cache"; shift; for h; do printf '\036%s\037' "$h"; cat "$d/$h.txt" 2>/dev/null; done"#;

enum Paste {
    Text(u64, String),
    Hash(u64, String),
}

/// A prompt's pasted texts: inline, or by a hash into the paste cache (hex only, as it names a file).
fn pastes(v: Option<&Value>) -> Vec<Paste> {
    let Some(map) = v.and_then(Value::as_object) else {
        return Vec::new();
    };
    map.values()
        .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|p| {
            let id = p.get("id")?.as_u64()?;
            if let Some(c) = p.get("content").and_then(Value::as_str) {
                return Some(Paste::Text(id, c.to_string()));
            }
            let h = p.get("contentHash")?.as_str()?;
            (!h.is_empty() && h.chars().all(|c| c.is_ascii_hexdigit()))
                .then(|| Paste::Hash(id, h.to_string()))
        })
        .collect()
}

/// `text` with its `[Pasted text #id …]` placeholder replaced by `content`.
fn put_back(text: &str, id: u64, content: &str) -> String {
    let open = format!("[Pasted text #{id} ");
    let Some(start) = text.find(&open) else {
        return text.to_string();
    };
    let Some(len) = text[start..].find(']') else {
        return text.to_string();
    };
    format!("{}{}{}", &text[..start], content, &text[start + len + 1..])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transport::local::LocalTransport;
    use serde_json::json;
    use std::fs;

    fn line(project: &str, display: &str, pasted: serde_json::Value) -> String {
        json!({"display": display, "pastedContents": pasted, "timestamp": 1, "project": project, "sessionId": "s"}).to_string()
    }

    #[tokio::test]
    async fn reads_the_folders_prompts_oldest_first_with_pasted_text_back() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("home dir");
        let claude = home.join(".claude");
        fs::create_dir_all(claude.join("paste-cache")).unwrap();
        fs::write(claude.join("paste-cache/0123abcd.txt"), "cached\nlines").unwrap();
        let p = "/w/it's here";
        let lines = [
            line(p, "first", json!({})),
            line("/w/it's here-too", "other folder", json!({})),
            line("/w", "parent folder", json!({})),
            line(
                p,
                "fix\n\n[Pasted text #1 +1 lines]",
                json!({"1": {"id": 1, "type": "text", "content": "a\nb"}}),
            ),
            line(
                p,
                "see [Pasted text #2 +1 lines]",
                json!({"2": {"id": 2, "type": "text", "contentHash": "0123abcd"}}),
            ),
            line(
                p,
                "gone [Pasted text #1 +1 lines]",
                json!({"1": {"id": 1, "type": "text", "contentHash": "ffffeeee"}}),
            ),
            line(p, "again", json!({})),
            line(p, "again", json!({})),
            line(p, "   ", json!({})),
            "not json".to_string(),
        ];
        fs::write(claude.join("history.jsonl"), lines.join("\n") + "\n").unwrap();
        let got = claude_history(&LocalTransport, &home.to_string_lossy(), p)
            .await
            .unwrap();
        assert_eq!(
            got,
            [
                "first",
                "fix\n\na\nb",
                "see cached\nlines",
                // A paste whose cached text is gone keeps its placeholder.
                "gone [Pasted text #1 +1 lines]",
                "again",
            ]
        );
        // A trailing slash on the pane's folder names the same project.
        let slash = claude_history(&LocalTransport, &home.to_string_lossy(), "/w/it's here/")
            .await
            .unwrap();
        assert_eq!(slash.len(), 5);
    }

    #[tokio::test]
    async fn keeps_the_newest_prompts_and_is_empty_without_a_history_file() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().to_string_lossy().to_string();
        assert!(claude_history(&LocalTransport, &home, "/p")
            .await
            .unwrap()
            .is_empty());
        let claude = tmp.path().join(".claude");
        fs::create_dir_all(&claude).unwrap();
        let lines: Vec<String> = (0..250)
            .map(|i| line("/p", &format!("p{i}"), json!({})))
            .collect();
        fs::write(claude.join("history.jsonl"), lines.join("\n")).unwrap();
        let got = claude_history(&LocalTransport, &home, "/p").await.unwrap();
        assert_eq!(got.len(), HISTORY_MAX);
        assert_eq!(got.first().map(String::as_str), Some("p150"));
        assert_eq!(got.last().map(String::as_str), Some("p249"));
    }
}
