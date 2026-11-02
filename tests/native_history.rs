use serde_json::{Value, json};
use silolink::{project, providers::rpc::Rpc};
use std::{fs, path::Path, process::Command, time::Duration};
use tempfile::TempDir;
use uuid::Uuid;
#[test]
fn unicode_project_paths_read_existing_utf16_encoded_transcript_buckets() {
    let temporary = TempDir::new().unwrap();
    let config = TempDir::new().unwrap();
    let root = temporary.path().join("프로젝트-😀");
    fs::create_dir(&root).unwrap();
    project::init(&root).unwrap();
    let root = dunce::canonicalize(root).unwrap();
    let encoded: String = root
        .to_string_lossy()
        .encode_utf16()
        .map(|unit| {
            if unit <= 127 && (unit as u8).is_ascii_alphanumeric() {
                char::from(unit as u8)
            } else {
                '-'
            }
        })
        .collect();
    let directory = config.path().join("projects").join(encoded);
    fs::create_dir_all(&directory).unwrap();
    let session = Uuid::new_v4().to_string();
    let message = entry(&root, "one", Value::Null, "unicode path", &session);
    fs::write(
        directory.join(format!("{session}.jsonl")),
        format!("{message}\n"),
    )
    .unwrap();
    let output = run(&root, config.path(), &["history", "--provider", "claude"]);
    assert!(output.status.success());
    let report: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["records"].as_array().unwrap().len(), 1);
}
#[test]
fn empty_history_is_success_but_all_provider_failure_is_not() {
    let root = TempDir::new().unwrap();
    let config = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    let empty = run(
        root.path(),
        config.path(),
        &["history", "--provider", "claude"],
    );
    assert!(empty.status.success());
    let empty: Value = serde_json::from_slice(&empty.stdout).unwrap();
    assert_eq!(empty["records"], json!([]));
    let broken = config.path().join("not-a-directory");
    fs::write(&broken, "synthetic").unwrap();
    let failed = run(root.path(), &broken, &["history", "--provider", "all"]);
    assert_eq!(failed.status.code(), Some(1));
    let failed: Value = serde_json::from_slice(&failed.stdout).unwrap();
    assert_eq!(failed["status"], "failed");
    assert!(
        failed["sources"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s["status"] == "failed")
    );
}
fn run(root: &Path, config: &Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_silolink"))
        .args(args)
        .current_dir(root)
        .env("CLAUDE_CONFIG_DIR", config)
        .env("SILOLINK_CODEX_EXECUTABLE", "silolink-missing-codex.exe")
        .output()
        .unwrap()
}
fn transcript(root: &Path, config: &Path) -> std::path::PathBuf {
    let root = dunce::canonicalize(root).unwrap();
    let encoded: String = root
        .to_string_lossy()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let dir = config.join("projects").join(encoded);
    fs::create_dir_all(&dir).unwrap();
    dir.join(format!("{}.jsonl", Uuid::new_v4()))
}
fn entry(root: &Path, id: &str, parent: Value, text: &str, origin: &str) -> Value {
    json!({"cwd":dunce::canonicalize(root).unwrap(),"uuid":id,"parentUuid":parent,"sessionId":origin,"type":"user","timestamp":"2026-11-02T00:00:00Z","version":"2.1.292","message":{"role":"user","content":text}})
}
#[test]
fn native_claude_reads_appended_copied_history_and_surfaces_partial_provider_failure() {
    let root = TempDir::new().unwrap();
    let config = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    let file = transcript(root.path(), config.path());
    let session = file.file_stem().unwrap().to_str().unwrap();
    let a = entry(root.path(), "one", Value::Null, "same", session);
    let b = entry(root.path(), "two", json!("one"), "same", session);
    fs::write(&file, format!("{a}\n{b}\n")).unwrap();
    let first = run(
        root.path(),
        config.path(),
        &["history", "--provider", "claude"],
    );
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let first: Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(first["records"].as_array().unwrap().len(), 2);
    assert_ne!(first["records"][0]["id"], first["records"][1]["id"]);
    let other = transcript(root.path(), config.path());
    let c = entry(
        root.path(),
        "three",
        json!("two"),
        "new",
        other.file_stem().unwrap().to_str().unwrap(),
    );
    fs::write(&other, format!("{a}\n{b}\n{c}\n")).unwrap();
    let second = run(
        root.path(),
        config.path(),
        &["history", "--provider", "all"],
    );
    assert_eq!(second.status.code(), Some(2));
    let second: Value = serde_json::from_slice(&second.stdout).unwrap();
    assert_eq!(second["records"].as_array().unwrap().len(), 3);
    assert_eq!(second["sources"][0]["status"], "failed");
}
#[test]
fn transcript_corruption_limits_and_foreign_ownership_are_not_reported_as_complete() {
    let root = TempDir::new().unwrap();
    let config = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    let file = transcript(root.path(), config.path());
    let a = entry(root.path(), "one", Value::Null, "question", "s");
    fs::write(&file, format!("{a}\ninvalid\n")).unwrap();
    let result = run(
        root.path(),
        config.path(),
        &["history", "--provider", "claude", "--limit", "1"],
    );
    assert_eq!(result.status.code(), Some(2));
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(result["records"].as_array().unwrap().len(), 1);
    assert_eq!(result["sources"][0]["limitReached"], true);
    assert!(
        !result["sources"][0]["warnings"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let foreign = TempDir::new().unwrap();
    let a = entry(foreign.path(), "one", Value::Null, "foreign", "s");
    fs::write(&file, format!("{a}\n")).unwrap();
    let result = run(
        root.path(),
        config.path(),
        &["history", "--provider", "claude"],
    );
    assert_eq!(result.status.code(), Some(2));
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert!(result["records"].as_array().unwrap().is_empty());
    assert_eq!(
        result["sources"][0]["warnings"][0]["code"],
        "PROJECT_MISMATCH"
    );
}
#[tokio::test]
async fn native_rpc_initializes_and_preserves_protocol_failures_and_timeouts() {
    let program = std::ffi::OsStr::new(env!("CARGO_BIN_EXE_silolink-provider-fixture"));
    let mut rpc = Rpc::connect_with(program, &[], Duration::from_secs(2))
        .await
        .unwrap();
    let page = rpc.request("thread/list", json!({})).await.unwrap();
    assert_eq!(page["data"][0]["id"], "thread");
    rpc.close().await;
    assert_eq!(
        rpc.request("x", json!({})).await.unwrap_err().code,
        "PROVIDER_CLOSED"
    );
    assert_eq!(
        Rpc::connect_with(
            std::ffi::OsStr::new("silolink-does-not-exist"),
            &[],
            Duration::from_millis(20)
        )
        .await
        .err()
        .unwrap()
        .code,
        "PROVIDER_UNAVAILABLE"
    );
}
