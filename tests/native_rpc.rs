use serde_json::json;
use silolink::{
    project,
    providers::{codex, rpc::Rpc},
};
use std::{fs, time::Duration};
use tempfile::TempDir;
async fn rpc(scenario: &str, root: &std::path::Path) -> Rpc {
    let mut command = tokio::process::Command::new(env!("CARGO_BIN_EXE_silolink-provider-fixture"));
    command
        .env("SILOLINK_FIXTURE_SCENARIO", scenario)
        .env("SILOLINK_FIXTURE_ROOT", root);
    Rpc::connect_command(command, Duration::from_millis(100))
        .await
        .unwrap()
}
#[tokio::test]
async fn protocol_errors_process_exit_malformed_json_and_stalls_are_distinct() {
    let root = TempDir::new().unwrap();
    for (scenario, code) in [
        ("rpcerror", "PROVIDER_RPC_ERROR"),
        ("exit", "PROVIDER_EXITED"),
        ("malformed", "INVALID_PROVIDER_PROTOCOL"),
        ("stall", "PROVIDER_TIMEOUT"),
    ] {
        let mut rpc = rpc(scenario, root.path()).await;
        let error = rpc.request("thread/list", json!({})).await.unwrap_err();
        assert_eq!(error.code, code, "{scenario}");
        if scenario == "rpcerror" {
            assert_eq!(error.details["method"], "thread/list");
            assert_eq!(error.details["rpcCode"], -32601);
        }
        rpc.close().await;
    }
}
#[tokio::test]
async fn codex_pages_both_levels_and_exposes_limits_and_bad_session_entries() {
    let root = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    for (scenario, limit, records, warnings) in [
        ("normal", 1000, 2, false),
        ("normal", 1, 1, false),
        ("bad-session", 1000, 2, true),
        ("loop", 1000, 2, true),
    ] {
        let mut rpc = rpc(scenario, &project.root).await;
        let result = codex::read_with(&project, limit, "2026-11-02T00:00:00Z", &mut rpc).await;
        rpc.close().await;
        assert_eq!(result.records.len(), records, "{scenario}");
        assert_eq!(!result.warnings.is_empty(), warnings, "{scenario}");
        assert_eq!(result.limit_reached, limit == 1);
        assert!(result.error.is_none());
    }
}
#[tokio::test]
async fn codex_rejects_foreign_project_metadata_before_fetching_turns() {
    let temporary = TempDir::new().unwrap();
    let root = temporary.path().join("project");
    let foreign = temporary.path().join("project-other");
    fs::create_dir(&root).unwrap();
    fs::create_dir(&foreign).unwrap();
    let (project, _) = project::init(&root).unwrap();
    let mut rpc = rpc("foreign", &project.root).await;
    let result = codex::read_with(&project, 1000, "now", &mut rpc).await;
    rpc.close().await;
    assert_eq!(result.items_read, 0);
    assert!(result.records.is_empty());
    assert_eq!(result.warnings[0]["code"], "PROJECT_MISMATCH");
}
