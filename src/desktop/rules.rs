use super::analysis::{cluster, similarity};
use crate::error::{Error, Result};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::BTreeSet;

const RULE_FILES: &[&str] = &[
    "agents.md",
    "claude.md",
    "gemini.md",
    "contributing.md",
    "conventions.md",
    "convention.md",
    "style.md",
    "styleguide.md",
];
const RULE_WORDS: &[&str] = &[
    "convention",
    "rule",
    "guideline",
    "policy",
    "style",
    "규칙",
    "컨벤션",
    "가이드",
    "정책",
];
const MAX_RULES: usize = 3000;

/// Documents that usually hold instructions for people and AI tools working in a project.
pub fn is_rule_document(path: &str) -> bool {
    let lower = path.to_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(&lower);
    RULE_FILES.contains(&name)
        || (!lower.contains("node_modules")
            && RULE_WORDS.iter().any(|w| name.contains(w)))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleLine {
    pub project_id: String,
    pub project_name: String,
    pub path: String,
    pub revision: String,
    pub section: String,
    pub text: String,
    pub line: usize,
}

/// List items under headings, outside code fences; each item is one candidate rule.
pub fn extract(text: &str) -> Vec<(String, String, usize)> {
    let mut rules = Vec::new();
    let mut section = String::new();
    let mut fenced = false;
    for (index, raw) in text.lines().enumerate() {
        let line = raw.trim();
        if line.starts_with("```") || line.starts_with("~~~") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        if let Some(heading) = line.strip_prefix('#') {
            section = heading.trim_start_matches('#').trim().to_owned();
            continue;
        }
        let item = line
            .strip_prefix("- ")
            .or_else(|| line.strip_prefix("* "))
            .or_else(|| line.strip_prefix("+ "))
            .or_else(|| {
                let digits = line.find(|c: char| !c.is_ascii_digit())?;
                (digits > 0)
                    .then(|| line[digits..].strip_prefix(". ").or_else(|| line[digits..].strip_prefix(") ")))
                    .flatten()
            });
        let Some(item) = item else {
            continue;
        };
        let item = item
            .trim_start_matches("[ ] ")
            .trim_start_matches("[x] ")
            .replace("**", "")
            .trim()
            .to_owned();
        let length = item.chars().count();
        if (4..=400).contains(&length) {
            rules.push((section.clone(), item, index + 1));
        }
    }
    rules
}

/// Groups similar rules across projects: shared (same wording), variant (similar, worded
/// differently) and local (one project). Similarity is a candidate, never an automatic merge.
pub fn compare(rules: &[RuleLine], projects: &[(String, String)]) -> Value {
    let rules = &rules[..rules.len().min(MAX_RULES)];
    let normalized: Vec<String> = rules
        .iter()
        .map(|r| {
            r.text
                .chars()
                .filter(|c| c.is_alphanumeric())
                .flat_map(char::to_lowercase)
                .collect()
        })
        .collect();
    let groups = cluster(rules.len(), |i, j| {
        normalized[i] == normalized[j] || similarity(&rules[i].text, &rules[j].text) >= 0.6
    });
    let mut output: Vec<Value> = groups
        .into_iter()
        .map(|group| {
            let in_projects: BTreeSet<&str> =
                group.iter().map(|i| rules[*i].project_id.as_str()).collect();
            let same = group.iter().all(|i| normalized[*i] == normalized[group[0]]);
            let status = if in_projects.len() < 2 {
                "local"
            } else if same {
                "shared"
            } else {
                "variant"
            };
            let missing: Vec<&str> = projects
                .iter()
                .filter(|(id, _)| !in_projects.contains(id.as_str()))
                .map(|(id, _)| id.as_str())
                .collect();
            json!({
                "status": status,
                "text": rules[group[0]].text,
                "projectIds": in_projects,
                "missingProjectIds": missing,
                "items": group.iter().map(|i| &rules[*i]).collect::<Vec<_>>(),
            })
        })
        .collect();
    let rank = |v: &Value| match v["status"].as_str() {
        Some("variant") => 0,
        Some("shared") => 1,
        _ => 2,
    };
    output.sort_by(|a, b| {
        rank(a).cmp(&rank(b)).then_with(|| {
            b["projectIds"]
                .as_array()
                .map(Vec::len)
                .cmp(&a["projectIds"].as_array().map(Vec::len))
        })
    });
    let count = |status: &str| output.iter().filter(|g| g["status"] == status).count();
    json!({
        "summary": {"shared": count("shared"), "variant": count("variant"), "local": count("local"), "rules": rules.len()},
        "groups": output,
        "method": "list-items-in-rule-documents-bigram-similarity",
    })
}

/// A reviewed-change plan that appends rules under a new section; existing text is preserved.
pub fn append_plan(
    project_id: &str,
    path: &str,
    current: Option<(&str, &str)>,
    heading: &str,
    rules: &[String],
    rationale: &str,
) -> Result<Value> {
    let heading = heading.trim();
    let rules: Vec<String> = rules
        .iter()
        .map(|r| r.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|r| !r.is_empty())
        .collect();
    if heading.is_empty()
        || heading.len() > 200
        || heading.contains(['\r', '\n'])
        || rules.is_empty()
        || rules.len() > 100
        || rules.iter().any(|r| r.len() > 1000)
        || !path.to_lowercase().ends_with(".md")
    {
        return Err(Error::new(
            "INVALID_RULE_PLAN",
            "Choose a Markdown file, a section title, and 1-100 rules.",
        ));
    }
    let section = format!(
        "## {heading}\n\n{}\n",
        rules
            .iter()
            .map(|r| format!("- {r}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let (expected, content) = match current {
        Some((revision, text)) => {
            let mut content = text.to_owned();
            if !content.is_empty() && !content.ends_with('\n') {
                content.push('\n');
            }
            if !content.is_empty() {
                content.push('\n');
            }
            content.push_str(&section);
            (Some(revision.to_owned()), content)
        }
        None => (None, format!("# 작업 규칙\n\n{section}")),
    };
    Ok(json!({
        "schemaVersion": 1,
        "id": uuid::Uuid::new_v4().to_string(),
        "projectId": project_id,
        "rationale": rationale,
        "operations": [{"path": path, "expectedRevision": expected, "content": content}],
        "guards": [],
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn line(project: &str, text: &str) -> RuleLine {
        RuleLine {
            project_id: project.into(),
            project_name: project.into(),
            path: "AGENTS.md".into(),
            revision: "r".into(),
            section: "규칙".into(),
            text: text.into(),
            line: 1,
        }
    }
    #[test]
    fn extracts_list_items_outside_code() {
        let text = "# 규칙\n- 커밋 메시지는 한국어로 쓴다\n```\n- not a rule\n```\n1. **테스트**를 먼저 작성한다\n- ab\n";
        let rules = extract(text);
        assert_eq!(rules.len(), 2);
        assert_eq!(rules[1], ("규칙".into(), "테스트를 먼저 작성한다".into(), 6));
        assert!(is_rule_document("AGENTS.md") && is_rule_document("docs/코딩-규칙.md"));
        assert!(!is_rule_document("README.md"));
    }
    #[test]
    fn separates_shared_variant_and_local_rules() {
        let projects = vec![("a".to_string(), "A".to_string()), ("b".to_string(), "B".to_string())];
        let rules = vec![
            line("a", "커밋 메시지는 한국어로 쓴다"),
            line("b", "커밋 메시지는 한국어로 쓴다."),
            line("a", "PR 설명에 테스트 결과를 적는다"),
            line("b", "PR 설명에 테스트 결과를 꼭 적는다"),
            line("a", "디자인 토큰만 사용한다"),
        ];
        let result = compare(&rules, &projects);
        assert_eq!(result["summary"], json!({"shared":1,"variant":1,"local":1,"rules":5}));
        let local = result["groups"].as_array().unwrap().iter().find(|g| g["status"] == "local").unwrap();
        assert_eq!(local["missingProjectIds"], json!(["b"]));
    }
    #[test]
    fn appends_rules_without_rewriting_existing_text() {
        let plan = append_plan("p", "AGENTS.md", Some(("rev", "# 기존\n- 유지")), "공통 규칙", &["새 규칙".into()], "why").unwrap();
        assert_eq!(plan["operations"][0]["content"], "# 기존\n- 유지\n\n## 공통 규칙\n\n- 새 규칙\n");
        assert_eq!(plan["operations"][0]["expectedRevision"], "rev");
        let created = append_plan("p", "AGENTS.md", None, "공통 규칙", &["새 규칙".into()], "why").unwrap();
        assert!(created["operations"][0]["expectedRevision"].is_null());
        assert!(append_plan("p", "notes.txt", None, "h", &["r".into()], "why").is_err());
    }
}
