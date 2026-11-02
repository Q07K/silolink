use serde_json::{Value, json};
use silolink::{
    project::{self, Project},
    records,
};
use tempfile::TempDir;

fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/record-contracts.json")).unwrap()
}
#[test]
fn sha256_identity_and_revisions_match_javascript_v1_for_both_providers() {
    let root = TempDir::new().unwrap();
    let f = fixture();
    let project = Project {
        root: dunce::canonicalize(root.path()).unwrap(),
        metadata: json!({"id":f["projectId"]}),
    };
    let observed = f["observedAt"].as_str().unwrap();
    let claude = records::claude(
        &project,
        "container",
        f["claude"]["messages"].as_array().unwrap(),
        observed,
    );
    let codex = records::codex(
        &project,
        &json!({"id":"thread","source":"exec"}),
        f["codex"]["turns"].as_array().unwrap(),
        observed,
    );
    assert_eq!(
        serde_json::to_value(claude).unwrap(),
        f["claude"]["expected"]
    );
    assert_eq!(serde_json::to_value(codex).unwrap(), f["codex"]["expected"]);
}
#[test]
fn identities_distinguish_repeated_text_and_updates_but_ignore_collection_time() {
    let root = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let entry =
        json!({"uuid":"one","session_id":"origin","type":"user","message":{"content":"same"}});
    let a = records::claude(
        &project,
        "first",
        std::slice::from_ref(&entry),
        "2026-11-01T00:00:00Z",
    )
    .records
    .remove(0);
    let b = records::claude(
        &project,
        "second",
        std::slice::from_ref(&entry),
        "2026-11-02T00:00:00Z",
    )
    .records
    .remove(0);
    assert_eq!(a["id"], b["id"]);
    assert_eq!(a["revision"], b["revision"]);
    let mut edited = entry.clone();
    edited["message"]["content"] = json!("edited");
    let c = records::claude(&project, "first", &[edited], "now")
        .records
        .remove(0);
    assert_eq!(a["id"], c["id"]);
    assert_ne!(a["revision"], c["revision"]);
    let mut new = entry;
    new["uuid"] = json!("two");
    let d = records::claude(&project, "first", &[new], "now")
        .records
        .remove(0);
    assert_ne!(a["id"], d["id"]);
    let mut both = vec![a, b, c, d];
    records::deduplicate(&mut both);
    assert_eq!(both.len(), 2);
}
#[test]
fn missing_ids_unknown_content_and_tool_only_messages_remain_visible_in_diagnostics() {
    let root = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let result = records::claude(
        &project,
        "s",
        &[
            json!({"type":"user"}),
            json!({"uuid":"one","type":"user"}),
            json!({"uuid":"two","session_id":"s","type":"user","message":{"content":[{"type":"__proto__"}]}}),
            json!({"uuid":"three","session_id":"s","type":"constructor"}),
        ],
        "now",
    );
    assert!(result.records.is_empty());
    assert_eq!(result.warnings.len(), 2);
    assert_eq!(result.omitted["__proto__"], 1);
    assert_eq!(result.omitted["noText"], 1);
    assert_eq!(result.omitted["constructor"], 1);
}
#[test]
fn scope_allows_subdirectories_and_rejects_siblings_missing_or_linked_foreign_directories() {
    let temp = TempDir::new().unwrap();
    let (project, _) = project::init(temp.path()).unwrap();
    let child = temp.path().join("child");
    std::fs::create_dir(&child).unwrap();
    assert!(project::assert_scope(&project, child.to_str().unwrap()).is_ok());
    let foreign = TempDir::new().unwrap();
    assert_eq!(
        project::assert_scope(&project, foreign.path().to_str().unwrap())
            .unwrap_err()
            .code,
        "PROJECT_MISMATCH"
    );
    assert_eq!(
        project::assert_scope(&project, "").unwrap_err().code,
        "PROJECT_UNRESOLVED"
    );
}
