use serde_json::Value;
use std::{
    fs,
    path::Path,
    process::{Command, Output},
};
use tempfile::TempDir;

fn run(args: &[&str], cwd: &Path) -> Output {
    Command::new(env!("CARGO_BIN_EXE_silolink"))
        .args(args)
        .current_dir(cwd)
        .env_remove("SILOLINK_STATE_DIR")
        .output()
        .unwrap()
}

#[test]
fn help_and_uninitialized_history_never_create_project_state() {
    let root = TempDir::new().unwrap();
    let help = run(&["--help"], root.path());
    assert!(help.status.success());
    let help = String::from_utf8(help.stdout).unwrap();
    assert!(help.contains("silolink setup"));
    assert!(help.contains("silolink watch"));
    let output = run(&["history", "--provider", "claude"], root.path());
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(
        value(&output.stderr)["error"]["code"],
        "PROJECT_NOT_INITIALIZED"
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
}

#[test]
fn command_options_and_numeric_boundaries_are_checked_before_provider_access() {
    let root = TempDir::new().unwrap();
    for args in [
        &["setup", "--host", "unknown"][..],
        &["setup", "--scope", "unknown"],
        &["setup", "--provider", "claude"],
        &["init", "--state-dir", "state"],
        &["history", "--limit", "9007199254740992"],
        &["history", "--limit", "1.5"],
        &["history", "--provider", "other"],
        &["records", "--interval", "1"],
        &["watch", "--limit", "1"],
        &["watch", "--interval", "0", "--state-dir", "state"],
        &["watch", "--interval", "86401", "--state-dir", "state"],
    ] {
        let output = run(args, root.path());
        assert_eq!(output.status.code(), Some(1), "{args:?}");
        assert_eq!(
            value(&output.stderr)["error"]["code"],
            "INVALID_ARGUMENTS",
            "{args:?}"
        );
    }
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
}
fn value(bytes: &[u8]) -> Value {
    serde_json::from_slice(bytes).unwrap()
}

#[test]
fn native_init_is_repeatable_and_preserves_existing_documents() {
    let temp = TempDir::new().unwrap();
    fs::write(temp.path().join("notes.md"), "# Keep\n").unwrap();
    let a = run(&["init"], temp.path());
    let b = run(&["init"], temp.path());
    assert!(a.status.success(), "{}", String::from_utf8_lossy(&a.stderr));
    assert!(b.status.success());
    let a = value(&a.stdout);
    let b = value(&b.stdout);
    assert_eq!(a["created"], true);
    assert_eq!(b["created"], false);
    assert_eq!(a["project"]["id"], b["project"]["id"]);
    assert_eq!(
        fs::read_to_string(temp.path().join("notes.md")).unwrap(),
        "# Keep\n"
    );
}

#[test]
fn native_cli_reports_invalid_options_before_creating_files() {
    let temp = TempDir::new().unwrap();
    for args in [
        &["unknown"][..],
        &["init", "--provider", "claude"],
        &["history", "--limit", "0"],
        &["watch"],
    ] {
        let result = run(args, temp.path());
        assert_eq!(result.status.code(), Some(1));
        let error = value(&result.stderr);
        assert!(matches!(
            error["error"]["code"].as_str(),
            Some("INVALID_ARGUMENTS" | "STATE_DIRECTORY_REQUIRED")
        ));
    }
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
}
