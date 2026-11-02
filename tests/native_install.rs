use serde_json::Value;
use std::{fs, path::Path, process::Command};
use tempfile::TempDir;
#[test]
fn setup_rejects_linked_destinations_without_writing_to_the_target() {
    let home = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let foreign = TempDir::new().unwrap();
    support::directory_link(foreign.path(), &home.path().join(".agents"));
    let result = run(root.path(), home.path(), &["setup", "--host", "codex"]);
    assert_eq!(result.status.code(), Some(1));
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(
        result["installations"][0]["error"]["code"],
        "SKILL_INSTALL_CONFLICT"
    );
    assert_eq!(fs::read_dir(foreign.path()).unwrap().count(), 0);
}
fn run(root: &Path, home: &Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_silolink"))
        .args(args)
        .current_dir(root)
        .env("SILOLINK_USER_HOME", home)
        .output()
        .unwrap()
}
#[test]
fn native_setup_installs_user_skills_and_runs_init_without_node_or_a_repository_checkout() {
    let home = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let result = run(root.path(), home.path(), &["setup", "--host", "all"]);
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(result["installations"].as_array().unwrap().len(), 3);
    for relative in [
        ".agents/skills/silolink",
        ".claude/skills/silolink",
        ".gemini/config/skills/silolink",
    ] {
        let skill = home.path().join(relative);
        let metadata: Value =
            serde_json::from_slice(&fs::read(skill.join("installation.json")).unwrap()).unwrap();
        assert_eq!(metadata["schemaVersion"], 2);
        let project = TempDir::new().unwrap();
        fs::write(project.path().join("notes.md"), "# Existing notes\n").unwrap();
        let output = Command::new(metadata["cliPath"].as_str().unwrap())
            .arg("init")
            .current_dir(project.path())
            .env("PATH", "")
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(project.path().join(".silolink/project.json").is_file());
        let inventory = Command::new(metadata["cliPath"].as_str().unwrap())
            .arg("docs")
            .current_dir(project.path())
            .env("PATH", "")
            .output()
            .unwrap();
        assert!(
            inventory.status.success(),
            "{}",
            String::from_utf8_lossy(&inventory.stderr)
        );
        let inventory: Value = serde_json::from_slice(&inventory.stdout).unwrap();
        assert_eq!(inventory["documents"][0]["path"], "notes.md");
        assert_eq!(
            fs::read_to_string(project.path().join("notes.md")).unwrap(),
            "# Existing notes\n"
        );
        assert!(!skill.join("scripts/run.mjs").exists());
    }
    let result = run(root.path(), home.path(), &["setup", "--host", "all"]);
    assert!(result.status.success());
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert!(
        result["installations"]
            .as_array()
            .unwrap()
            .iter()
            .all(|i| i["status"] == "unchanged")
    );
    assert!(!root.path().join(".silolink").exists());
}
#[test]
fn project_setup_deduplicates_shared_hosts_and_preserves_foreign_or_edited_skills() {
    let home = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let result = run(
        root.path(),
        home.path(),
        &["setup", "--host", "all", "--scope", "project"],
    );
    assert!(result.status.success());
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(result["installations"].as_array().unwrap().len(), 2);
    fs::write(
        root.path().join(".agents/skills/silolink/SKILL.md"),
        "local edit",
    )
    .unwrap();
    let result = run(
        root.path(),
        home.path(),
        &["setup", "--host", "all", "--scope", "project"],
    );
    assert_eq!(result.status.code(), Some(2));
    assert_eq!(
        fs::read_to_string(root.path().join(".agents/skills/silolink/SKILL.md")).unwrap(),
        "local edit"
    );
    let foreign = home.path().join(".claude/skills/silolink");
    fs::create_dir_all(&foreign).unwrap();
    fs::write(foreign.join("SKILL.md"), "foreign").unwrap();
    let result = run(root.path(), home.path(), &["setup", "--host", "claude"]);
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        fs::read_to_string(foreign.join("SKILL.md")).unwrap(),
        "foreign"
    );
}
mod support;
