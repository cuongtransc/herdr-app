//! pi's model aliases, named as pikit's footer names them: the short label from
//! `configs/footer.json` (`segmentOptions.model.aliasLabels`). Whether a fallback served is
//! not worked out here: pi records it on each reply (`aliasTarget.chainIndex`).
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
}

impl PiAliases {
    /// Reads the local pi footer config; a missing or broken file leaves full names.
    pub fn load() -> Self {
        let footer =
            agent_dir().and_then(|d| std::fs::read_to_string(d.join("configs/footer.json")).ok());
        Self::from_json(footer.as_deref())
    }

    pub fn from_json(footer: Option<&str>) -> Self {
        let mut labels = HashMap::new();
        if let Some(Value::Object(o)) = footer
            .and_then(|s| serde_json::from_str::<Value>(s).ok())
            .as_ref()
            .and_then(|v| v.pointer("/segmentOptions/model/aliasLabels"))
        {
            for (k, v) in o {
                if let Some(s) = v.as_str().filter(|s| !s.is_empty()) {
                    labels.insert(k.clone(), s.to_string());
                }
            }
        }
        Self { labels }
    }

    /// `provider`: of the target that served the last reply; `chain_index`: its place in the
    /// alias's chain as pi recorded it, past 0 a fallback. Unrecorded means no marker.
    pub fn describe(
        &self,
        name: &str,
        provider: Option<&str>,
        chain_index: Option<u64>,
    ) -> ModelAlias {
        ModelAlias {
            name: name.to_string(),
            label: self
                .labels
                .get(name)
                .cloned()
                .unwrap_or_else(|| name.to_string()),
            provider: provider.map(str::to_string),
            fallback: chain_index.is_some_and(|i| i > 0),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_the_alias_and_marks_a_fallback_from_the_recorded_position() {
        let a = PiAliases::from_json(Some(
            r#"{"segmentOptions":{"model":{"aliasLabels":{"implementer-medium":"impl-m"}}}}"#,
        ));
        assert_eq!(
            a.describe("implementer-medium", Some("openai-codex"), Some(1)),
            ModelAlias {
                name: "implementer-medium".into(),
                label: "impl-m".into(),
                provider: Some("openai-codex".into()),
                fallback: true,
            }
        );
        assert!(!a.describe("implementer-medium", None, Some(0)).fallback);
        assert!(!a.describe("implementer-medium", None, None).fallback);
        // No label configured: the full name.
        assert_eq!(a.describe("planner", None, None).label, "planner");
    }

    #[test]
    fn missing_or_broken_config_gives_the_full_name() {
        for f in [None, Some("{"), Some("[1]")] {
            let d = PiAliases::from_json(f).describe("implementer-medium", None, Some(1));
            assert_eq!(d.label, "implementer-medium");
        }
    }
}
