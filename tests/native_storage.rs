use serde_json::{Value, json};
use std::{fs, path::Path, process::Command};
use tempfile::TempDir;
use uuid::Uuid;
fn run(root: &Path, config: &Path, state: &Path, command: &str) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_silolink"))
        .args([
            command,
            "--provider",
            "claude",
            "--state-dir",
            state.to_str().unwrap(),
        ])
        .current_dir(root)
        .env("CLAUDE_CONFIG_DIR", config)
        .output()
        .unwrap()
}
#[test]
fn native_sync_persists_beyond_the_history_cap_and_reads_without_provider_access() {
    let root = TempDir::new().unwrap();
    let config = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    silolink::project::init(root.path()).unwrap();
    let canonical = dunce::canonicalize(root.path()).unwrap();
    let encoded: String = canonical
        .to_string_lossy()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let dir = config.path().join("projects").join(encoded);
    fs::create_dir_all(&dir).unwrap();
    let session = Uuid::new_v4().to_string();
    let file = dir.join(format!("{session}.jsonl"));
    let mut lines = Vec::new();
    let mut parent = Value::Null;
    for i in 0..1005 {
        let id = Uuid::new_v4().to_string();
        lines.push(json!({"cwd":canonical,"uuid":id,"parentUuid":parent,"sessionId":session,"type":"user","version":"2.1.292","message":{"content":format!("request {i}")}}).to_string());
        parent = json!(id);
    }
    fs::write(&file, format!("{}\n", lines.join("\n"))).unwrap();
    let first = run(root.path(), config.path(), state.path(), "sync");
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let first: Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(first["changes"]["added"], 1005);
    assert!(first.get("records").is_none());
    lines.push(json!({"cwd":canonical,"uuid":Uuid::new_v4().to_string(),"parentUuid":parent,"sessionId":session,"type":"user","version":"2.1.292","message":{"content":"new request"}}).to_string());
    fs::write(&file, format!("{}\n", lines.join("\n"))).unwrap();
    let second = run(root.path(), config.path(), state.path(), "sync");
    assert!(second.status.success());
    let second: Value = serde_json::from_slice(&second.stdout).unwrap();
    assert_eq!(
        second["changes"],
        json!({"added":1,"updated":0,"unchanged":1005})
    );
    fs::remove_file(&file).unwrap();
    let saved = run(root.path(), config.path(), state.path(), "records");
    assert!(saved.status.success());
    let saved: Value = serde_json::from_slice(&saved.stdout).unwrap();
    assert_eq!(saved["records"].as_array().unwrap().len(), 1006);
}
#[test]
fn native_records_reads_an_actual_javascript_v1_database_contract() {
    let root = TempDir::new().unwrap();
    let config = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let f: Value = serde_json::from_str(include_str!("fixtures/legacy-store.json")).unwrap();
    fs::create_dir(root.path().join(".silolink")).unwrap();
    fs::write(
        root.path().join(".silolink/project.json"),
        f["metadata"].to_string(),
    )
    .unwrap();
    let db = rusqlite::Connection::open(state.path().join("silolink.sqlite")).unwrap();
    for sql in f["schema"].as_array().unwrap() {
        db.execute_batch(sql.as_str().unwrap()).unwrap();
    }
    db.pragma_update(None, "application_id", f["applicationId"].as_i64().unwrap())
        .unwrap();
    db.pragma_update(None, "user_version", 1).unwrap();
    let mut last = f["lastRun"].clone();
    last["project"]["rootPath"] = json!(dunce::canonicalize(root.path()).unwrap());
    db.execute(
        "INSERT INTO projects VALUES (?1,?2,?3,?4)",
        rusqlite::params![
            f["metadata"]["id"].as_str().unwrap(),
            dunce::canonicalize(root.path()).unwrap().to_str().unwrap(),
            f["metadata"].to_string(),
            last.to_string()
        ],
    )
    .unwrap();
    for name in ["records", "revisions"] {
        for row in f[name].as_array().unwrap() {
            db.execute(
                &format!("INSERT INTO {name} VALUES (?1,?2,?3,?4)"),
                rusqlite::params![
                    row["project_id"].as_str().unwrap(),
                    row["record_id"].as_str().unwrap(),
                    row["revision"].as_str().unwrap(),
                    row["payload"].as_str().unwrap()
                ],
            )
            .unwrap();
        }
    }
    drop(db);
    let result = run(root.path(), config.path(), state.path(), "records");
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(result["records"][0]["text"], "legacy record");
    assert_eq!(result["lastRun"]["observedAt"], "2026-11-02T01:00:00.000Z");
}
