//! pi's model aliases, read the way pikit's footer reads them, so the Chat lens names an alias
//! Model as pi's terminal footer does: the short label from `configs/footer.json`
//! (`segmentOptions.model.aliasLabels`), and whether the served target is a fallback, that is
//! not the head of the alias's chain in `model-alias.json`.
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

/// An alias Model as the Composer shows it: `label→model`, or `label↓model` on a fallback.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct ModelAlias {
    pub name: String,
    pub label: String,
    /// The provider of the target that served the last reply, when known.
    pub provider: Option<String>,
    pub fallback: bool,
}

#[derive(Default)]
pub struct PiAliases {
    labels: HashMap<String, String>,
    /// Alias name -> its `provider/model` refs, nested `alias/<name>` refs expanded.
    chains: HashMap<String, Vec<String>>,
}

impl PiAliases {
    /// Reads the local pi config; a missing or broken file leaves full names and no marker.
    pub fn load() -> Self {
        let Some(dir) = agent_dir() else {
            return Self::default();
        };
        let map = std::env::var_os("PI_MODEL_ALIAS_MAP")
            .map(PathBuf::from)
            .unwrap_or_else(|| dir.join("model-alias.json"));
        let read = |p: PathBuf| std::fs::read_to_string(p).ok();
        Self::from_json(
            read(dir.join("configs/footer.json")).as_deref(),
            read(map).as_deref(),
        )
    }

    pub fn from_json(footer: Option<&str>, alias_map: Option<&str>) -> Self {
        let parse = |s: Option<&str>| s.and_then(|s| serde_json::from_str::<Value>(s).ok());
        let mut labels = HashMap::new();
        if let Some(Value::Object(o)) = parse(footer)
            .as_ref()
            .and_then(|v| v.pointer("/segmentOptions/model/aliasLabels"))
        {
            for (k, v) in o {
                if let Some(s) = v.as_str().filter(|s| !s.is_empty()) {
                    labels.insert(k.clone(), s.to_string());
                }
            }
        }
        let mut raw = HashMap::new();
        if let Some(Value::Object(o)) = parse(alias_map) {
            for (role, v) in o {
                if role.is_empty() || role.starts_with('$') {
                    continue;
                }
                if let Some(t) = role_targets(&v) {
                    raw.insert(role, t);
                }
            }
        }
        let chains = raw
            .keys()
            .map(|r| (r.clone(), expand(r, &raw, &mut vec![])))
            .collect();
        Self { labels, chains }
    }

    /// `provider`/`model`: the target that served the last reply, if the Transcript says.
    pub fn describe(&self, name: &str, provider: Option<&str>, model: Option<&str>) -> ModelAlias {
        let fallback = match (provider, model, self.chains.get(name)) {
            (Some(p), Some(m), Some(chain)) => {
                let r = format!("{p}/{m}");
                chain.iter().position(|c| *c == r).is_some_and(|i| i > 0)
            }
            _ => false,
        };
        ModelAlias {
            name: name.to_string(),
            label: self
                .labels
                .get(name)
                .cloned()
                .unwrap_or_else(|| name.to_string()),
            provider: provider.map(str::to_string),
            fallback,
        }
    }
}

/// pi's agent dir: `PI_CODING_AGENT_DIR`, else `~/.pi/agent`.
fn agent_dir() -> Option<PathBuf> {
    if let Some(d) = std::env::var_os("PI_CODING_AGENT_DIR").filter(|d| !d.is_empty()) {
        return Some(PathBuf::from(d));
    }
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".pi/agent"))
}

fn is_ref(s: &str) -> bool {
    s.find('/').is_some_and(|i| i > 0 && i < s.len() - 1)
}

/// A role is one ref, a non-empty array of refs, or `{ "targets": … }`.
fn role_targets(v: &Value) -> Option<Vec<String>> {
    let v = match v {
        Value::Object(o) => o.get("targets")?,
        v => v,
    };
    let refs: Vec<String> = match v {
        Value::String(s) => vec![s.clone()],
        Value::Array(a) => a
            .iter()
            .map(|x| x.as_str().map(str::to_string))
            .collect::<Option<_>>()?,
        _ => return None,
    };
    (!refs.is_empty() && refs.iter().all(|r| is_ref(r))).then_some(refs)
}

/// Expands `alias/<name>` refs in order, skipping unknown or cyclic ones, first seen wins.
fn expand(role: &str, raw: &HashMap<String, Vec<String>>, path: &mut Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    let Some(targets) = raw.get(role) else {
        return out;
    };
    path.push(role.to_string());
    for t in targets {
        let nested = t.strip_prefix("alias/");
        let refs = match nested {
            Some(n) if path.iter().any(|p| p == n) || !raw.contains_key(n) => vec![],
            Some(n) => expand(n, raw, path),
            None => vec![t.clone()],
        };
        for r in refs {
            if !out.contains(&r) {
                out.push(r);
            }
        }
    }
    path.pop();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const FOOTER: &str =
        r#"{"segmentOptions":{"model":{"aliasLabels":{"implementer-medium":"impl-m"}}}}"#;
    const MAP: &str = r#"{
        "$defaults": {"timeouts": {}},
        "implementer-medium": ["opencode-go/deepseek-v4.1-flash", "openai-codex/gpt-6-sol"],
        "planner": {"targets": ["openai-codex/gpt-6.1-sol", "alias/implementer-medium"]},
        "loop": ["alias/loop", "xai/grok-4.6"]
    }"#;

    #[test]
    fn labels_the_alias_and_marks_a_fallback_target() {
        let a = PiAliases::from_json(Some(FOOTER), Some(MAP));
        assert_eq!(
            a.describe(
                "implementer-medium",
                Some("openai-codex"),
                Some("gpt-6-sol")
            ),
            ModelAlias {
                name: "implementer-medium".into(),
                label: "impl-m".into(),
                provider: Some("openai-codex".into()),
                fallback: true,
            }
        );
        let head = a.describe(
            "implementer-medium",
            Some("opencode-go"),
            Some("deepseek-v4.1-flash"),
        );
        assert!(!head.fallback);
        // The same model id under another provider is not in the chain.
        assert!(
            !a.describe("implementer-medium", Some("xai"), Some("gpt-6-sol"))
                .fallback
        );
    }

    #[test]
    fn expands_nested_aliases_and_skips_cycles() {
        let a = PiAliases::from_json(None, Some(MAP));
        assert!(
            a.describe("planner", Some("openai-codex"), Some("gpt-6-sol"))
                .fallback
        );
        assert!(!a.describe("loop", Some("xai"), Some("grok-4.6")).fallback);
        // No label configured: the full name.
        assert_eq!(a.describe("planner", None, None).label, "planner");
    }

    #[test]
    fn missing_or_broken_config_gives_the_full_name_and_no_marker() {
        for (f, m) in [(None, None), (Some("{"), Some("[1]"))] {
            let a = PiAliases::from_json(f, m);
            let d = a.describe(
                "implementer-medium",
                Some("openai-codex"),
                Some("gpt-6-sol"),
            );
            assert_eq!(
                (d.label.as_str(), d.fallback),
                ("implementer-medium", false)
            );
        }
    }
}
