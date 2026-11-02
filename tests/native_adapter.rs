use serde_json::{Value, json};
use silolink::{project::Project, providers::claude};
use std::fs;
use tempfile::TempDir;
#[test]
fn claude_native_matches_independent_sdk_fixtures_for_branches_streaming_meta_and_compaction() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/claude-adapter-contracts.json")).unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let root = TempDir::new().unwrap();
        let config = TempDir::new().unwrap();
        let root = dunce::canonicalize(root.path()).unwrap();
        let project = Project {
            root: root.clone(),
            metadata: json!({"id":fixture["projectId"]}),
        };
        let encoded: String = root
            .to_string_lossy()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
            .collect();
        let directory = config.path().join("projects").join(encoded);
        fs::create_dir_all(&directory).unwrap();
        let lines = case["raw"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| {
                let mut v = v.clone();
                v["cwd"] = json!(root);
                v.to_string()
            })
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(
            directory.join(format!("{}.jsonl", case["sessionId"].as_str().unwrap())),
            format!("{lines}\n"),
        )
        .unwrap();
        let result = claude::read_from(
            &project,
            1000,
            fixture["observedAt"].as_str().unwrap(),
            config.path(),
        );
        assert_eq!(
            json!(result.records),
            case["expected"]["records"],
            "{}",
            case["name"]
        );
        assert_eq!(
            json!(result.omitted),
            case["expected"]["omitted"],
            "{}",
            case["name"]
        );
        assert!(result.error.is_none());
        assert!(result.warnings.is_empty(), "{}", case["name"]);
    }
}
