mod support;
use serde_json::json;
use silolink::project;
use std::{fs, process::Command};
use tempfile::TempDir;
#[test]
fn absent_uninitialized_and_invalid_project_paths_never_create_or_replace_documents() {
    let root = TempDir::new().unwrap();
    assert_eq!(
        project::read(root.path()).unwrap_err().code,
        "PROJECT_NOT_INITIALIZED"
    );
    assert_eq!(
        project::init(&root.path().join("missing"))
            .unwrap_err()
            .code,
        "PROJECT_DIRECTORY_NOT_FOUND"
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    fs::write(root.path().join(".silolink"), "keep").unwrap();
    assert_eq!(
        project::init(root.path()).unwrap_err().code,
        "INVALID_PROJECT"
    );
    assert_eq!(
        fs::read_to_string(root.path().join(".silolink")).unwrap(),
        "keep"
    );
}
#[test]
fn future_corrupt_and_incomplete_metadata_are_preserved() {
    for (text, code) in [
        (
            json!({"schemaVersion":999}).to_string(),
            "UNSUPPORTED_PROJECT_VERSION",
        ),
        ("{broken".into(), "INVALID_PROJECT"),
        (
            json!({"schemaVersion":1,"id":"bad"}).to_string(),
            "INVALID_PROJECT",
        ),
    ] {
        let root = TempDir::new().unwrap();
        fs::create_dir(root.path().join(".silolink")).unwrap();
        let file = root.path().join(".silolink/project.json");
        fs::write(&file, &text).unwrap();
        assert_eq!(project::init(root.path()).unwrap_err().code, code);
        assert_eq!(fs::read_to_string(file).unwrap(), text);
    }
}
#[test]
fn in_progress_initialization_does_not_read_partial_metadata() {
    let root = TempDir::new().unwrap();
    fs::create_dir(root.path().join(".silolink")).unwrap();
    fs::write(root.path().join(".silolink/project.json"), "partial").unwrap();
    fs::write(root.path().join(".silolink/init.lock"), "").unwrap();
    assert_eq!(project::read(root.path()).unwrap_err().code, "PROJECT_BUSY");
    assert_eq!(project::init(root.path()).unwrap_err().code, "PROJECT_BUSY");
}
#[test]
fn metadata_links_cannot_redirect_initialization_into_another_directory() {
    let root = TempDir::new().unwrap();
    let foreign = TempDir::new().unwrap();
    support::directory_link(foreign.path(), &root.path().join(".silolink"));
    assert_eq!(
        project::init(root.path()).unwrap_err().code,
        "INVALID_PROJECT"
    );
    assert_eq!(fs::read_dir(foreign.path()).unwrap().count(), 0);
}
#[test]
fn scope_rejects_same_prefix_siblings_and_links_that_escape_the_project() {
    let root = TempDir::new().unwrap();
    let main = root.path().join("project");
    let sibling = root.path().join("project-other");
    fs::create_dir(&main).unwrap();
    fs::create_dir(&sibling).unwrap();
    let (project, _) = project::init(&main).unwrap();
    assert_eq!(
        project::assert_scope(&project, sibling.to_str().unwrap())
            .unwrap_err()
            .code,
        "PROJECT_MISMATCH"
    );
    let link = main.join("outside");
    support::directory_link(&sibling, &link);
    assert_eq!(
        project::assert_scope(&project, link.to_str().unwrap())
            .unwrap_err()
            .code,
        "PROJECT_MISMATCH"
    );
}
#[test]
fn concurrent_native_initializers_keep_one_identity_and_busy_callers_can_retry() {
    let root = TempDir::new().unwrap();
    let spawn = || {
        Command::new(env!("CARGO_BIN_EXE_silolink"))
            .arg("init")
            .current_dir(root.path())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .unwrap()
    };
    let a = spawn();
    let b = spawn();
    let a = a.wait_with_output().unwrap();
    let b = b.wait_with_output().unwrap();
    let project = project::read(root.path()).unwrap();
    assert!(a.status.success() || b.status.success());
    for result in [a, b] {
        if result.status.success() {
            let value: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
            assert_eq!(value["project"]["id"], project.id());
        } else {
            let value: serde_json::Value = serde_json::from_slice(&result.stderr).unwrap();
            assert_eq!(value["error"]["code"], "PROJECT_BUSY");
        }
    }
    let (_, created) = project::init(root.path()).unwrap();
    assert!(!created);
    assert_eq!(
        fs::read_dir(root.path().join(".silolink")).unwrap().count(),
        1
    );
}
