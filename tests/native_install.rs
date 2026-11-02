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
            .env("SILOLINK_USER_HOME", home.path())
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

const ENTRY_SKILLS: [&str; 10] = [
    "silolink-init",
    "silolink-docs",
    "silolink-docs-check",
    "silolink-docs-apply",
    "silolink-docs-changes",
    "silolink-docs-undo",
    "silolink-history",
    "silolink-sync",
    "silolink-records",
    "silolink-watch",
];

#[test]
fn setup_installs_separate_discoverable_entries_for_each_project_operation() {
    let home = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    assert!(
        run(root.path(), home.path(), &["setup", "--host", "all"])
            .status
            .success()
    );
    for parent in [".agents/skills", ".claude/skills", ".gemini/config/skills"] {
        for name in ENTRY_SKILLS {
            let directory = home.path().join(parent).join(name);
            let text = fs::read_to_string(directory.join("SKILL.md")).unwrap();
            assert!(text.contains(&format!("name: {name}\n")));
            assert!(text.contains("../silolink/SKILL.md"));
            let interface = fs::read_to_string(directory.join("agents/openai.yaml")).unwrap();
            assert!(interface.contains(&format!("${name}")));
            let metadata: Value =
                serde_json::from_slice(&fs::read(directory.join("installation.json")).unwrap())
                    .unwrap();
            assert_eq!(
                metadata["cliPath"],
                dunce::canonicalize(env!("CARGO_BIN_EXE_silolink"))
                    .unwrap()
                    .to_str()
                    .unwrap()
            );
        }
    }
    let status =
        silolink::install::inspect_user(home.path(), Path::new(env!("CARGO_BIN_EXE_silolink")))
            .unwrap();
    assert_eq!(status["tools"][0]["skills"].as_array().unwrap().len(), 11);
    assert_eq!(status["tools"][0]["status"], "installed");
}

#[test]
fn existing_single_skill_gets_new_entries_without_rewriting_the_legacy_files() {
    let home = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let directory = home.path().join(".agents/skills/silolink");
    fs::create_dir_all(&directory).unwrap();
    let metadata = format!("{}\n", serde_json::to_string_pretty(&serde_json::json!({
        "schemaVersion":2,"product":"silolink","cliPath":dunce::canonicalize(env!("CARGO_BIN_EXE_silolink")).unwrap()
    })).unwrap());
    let skill = include_str!("../integrations/skills/silolink/SKILL.md");
    fs::write(directory.join("SKILL.md"), skill).unwrap();
    fs::write(directory.join("installation.json"), &metadata).unwrap();
    assert_eq!(
        silolink::install::inspect_user(home.path(), Path::new(env!("CARGO_BIN_EXE_silolink")))
            .unwrap()["tools"][0]["status"],
        "update_available"
    );
    assert!(
        run(root.path(), home.path(), &["setup", "--host", "codex"])
            .status
            .success()
    );
    assert_eq!(
        fs::read_to_string(directory.join("SKILL.md")).unwrap(),
        skill
    );
    assert_eq!(
        fs::read_to_string(directory.join("installation.json")).unwrap(),
        metadata
    );
    assert!(
        home.path()
            .join(".agents/skills/silolink-init/agents/openai.yaml")
            .is_file()
    );
}

#[test]
fn a_foreign_named_entry_prevents_bundle_changes_and_is_preserved() {
    let home = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let foreign = home.path().join(".agents/skills/silolink-sync");
    fs::create_dir_all(&foreign).unwrap();
    fs::write(foreign.join("SKILL.md"), "foreign skill").unwrap();
    let result = run(root.path(), home.path(), &["setup", "--host", "codex"]);
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        fs::read_to_string(foreign.join("SKILL.md")).unwrap(),
        "foreign skill"
    );
    assert!(!home.path().join(".agents/skills/silolink").exists());
    assert!(!home.path().join(".agents/skills/silolink-init").exists());
}

#[test]
fn user_connection_status_is_read_only_and_matches_setup_and_user_edits() {
    let home = TempDir::new().unwrap();
    let cli = Path::new(env!("CARGO_BIN_EXE_silolink"));
    let status = silolink::install::inspect_user(home.path(), cli).unwrap();
    assert_eq!(status["tools"].as_array().unwrap().len(), 3);
    assert!(
        status["tools"]
            .as_array()
            .unwrap()
            .iter()
            .all(|t| t["status"] == "not_installed")
    );
    assert_eq!(fs::read_dir(home.path()).unwrap().count(), 0);
    for host in ["codex", "claude", "antigravity"] {
        let report = silolink::install::setup(host, "user", home.path(), home.path(), cli).unwrap();
        assert_eq!(report["status"], "success");
    }
    let status = silolink::install::inspect_user(home.path(), cli).unwrap();
    assert!(
        status["tools"]
            .as_array()
            .unwrap()
            .iter()
            .all(|t| t["status"] == "installed")
    );
    let changed = home.path().join(".claude/skills/silolink/SKILL.md");
    fs::write(&changed, "my custom skill").unwrap();
    let status = silolink::install::inspect_user(home.path(), cli).unwrap();
    assert_eq!(status["tools"][1]["status"], "conflict");
    assert_eq!(status["tools"][0]["status"], "installed");
    assert_eq!(fs::read_to_string(changed).unwrap(), "my custom skill");
    assert!(!home.path().join(".silolink").exists());
    assert!(
        silolink::install::inspect_user(home.path(), &home.path().join("missing.exe")).is_err()
    );
}

#[test]
fn connection_status_does_not_follow_linked_skill_parents() {
    let home = TempDir::new().unwrap();
    let external = TempDir::new().unwrap();
    support::directory_link(external.path(), &home.path().join(".agents"));
    let status =
        silolink::install::inspect_user(home.path(), Path::new(env!("CARGO_BIN_EXE_silolink")))
            .unwrap();
    assert_eq!(status["tools"][0]["status"], "conflict");
    assert_eq!(fs::read_dir(external.path()).unwrap().count(), 0);
}
