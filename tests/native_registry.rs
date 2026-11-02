mod support;
use serde_json::{Value, json};
use silolink::{desktop::Desktop, project, registry};
use std::{fs, process::Command};
use tempfile::TempDir;

#[test]
fn cli_init_joins_an_existing_desktop_without_collecting_history_or_losing_notes() {
    let temp = TempDir::new().unwrap();
    let folder = temp.path().join("스킬 프로젝트");
    let previous = temp.path().join("existing");
    let registry_dir = temp.path().join("registry");
    fs::create_dir(&folder).unwrap();
    fs::create_dir(&previous).unwrap();
    fs::write(folder.join("notes.md"), "# Keep\r\n").unwrap();
    let profile = temp.path().join("desktop");
    let mut desktop = Desktop::open(&profile).unwrap();
    let existing = desktop.connect(&previous, true).unwrap();
    desktop
        .add_note(&existing, "learning", "Saved", "Keep my note", vec![])
        .unwrap();
    let before = serde_json::to_value(&desktop.data).unwrap();
    for _ in 0..2 {
        let result = Command::new(env!("CARGO_BIN_EXE_silolink"))
            .args(["init", "--project"])
            .arg(&folder)
            .env("SILOLINK_PROJECT_REGISTRY_DIR", &registry_dir)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let result: Value = serde_json::from_slice(&result.stdout).unwrap();
        assert_eq!(result["desktopRegistration"]["status"], "registered");
    }
    assert_eq!(
        registry::import(&registry_dir, &mut desktop).unwrap().added,
        1
    );
    assert_eq!(
        registry::import(&registry_dir, &mut desktop).unwrap().added,
        0
    );
    let reloaded = Desktop::open(&profile).unwrap();
    assert_eq!(reloaded.data.projects.len(), 2);
    let after = serde_json::to_value(&reloaded.data).unwrap();
    for key in ["notes", "settings", "chats", "tasks"] {
        assert_eq!(before[key], after[key]);
    }
    assert!(!reloaded.data.settings.background_enabled);
    assert_eq!(fs::read(folder.join("notes.md")).unwrap(), b"# Keep\r\n");
    assert_eq!(fs::read_dir(folder.join(".silolink")).unwrap().count(), 1);
}

#[test]
fn invalid_stale_and_conflicting_registrations_do_not_hide_valid_projects() {
    let temp = TempDir::new().unwrap();
    let registry_dir = temp.path().join("registry");
    let mut desktop = Desktop::open(&temp.path().join("desktop")).unwrap();
    assert_eq!(
        registry::import(&registry_dir, &mut desktop).unwrap().added,
        0
    );
    assert!(!registry_dir.exists());
    let a = temp.path().join("a");
    let b = temp.path().join("b");
    fs::create_dir(&a).unwrap();
    fs::create_dir(&b).unwrap();
    let original = project::init(&a).unwrap().0;
    registry::register(&registry_dir, &original).unwrap();
    desktop.connect(&a, false).unwrap();
    fs::create_dir(b.join(".silolink")).unwrap();
    fs::copy(
        a.join(".silolink/project.json"),
        b.join(".silolink/project.json"),
    )
    .unwrap();
    let copy = project::read(&b).unwrap();
    assert_eq!(
        registry::register(&registry_dir, &copy).unwrap_err().code,
        "PROJECT_LOCATION_CONFLICT"
    );
    let filename = registry_dir.join(format!("{}.json", original.id()));
    fs::write(
        &filename,
        serde_json::to_vec(&json!({"schemaVersion":1,"id":original.id(),"root":copy.root}))
            .unwrap(),
    )
    .unwrap();
    fs::write(registry_dir.join("invalid.json"), "{").unwrap();
    let good = temp.path().join("good");
    fs::create_dir(&good).unwrap();
    registry::register(&registry_dir, &project::init(&good).unwrap().0).unwrap();
    let report = registry::import(&registry_dir, &mut desktop).unwrap();
    assert_eq!(report.added, 1);
    assert_eq!(report.errors.len(), 2);
    assert_eq!(desktop.data.projects[0].root, original.root);
    fs::remove_dir_all(&good).unwrap();
    assert_eq!(
        registry::import(&registry_dir, &mut desktop)
            .unwrap()
            .errors
            .len(),
        3
    );
}

#[test]
fn registration_failure_is_reported_and_a_retry_preserves_project_identity() {
    let temp = TempDir::new().unwrap();
    let registry_dir = temp.path().join("registry");
    fs::write(&registry_dir, "occupied").unwrap();
    let run = || {
        Command::new(env!("CARGO_BIN_EXE_silolink"))
            .arg("init")
            .arg("--project")
            .arg(temp.path())
            .env("SILOLINK_PROJECT_REGISTRY_DIR", &registry_dir)
            .output()
            .unwrap()
    };
    let failed = run();
    assert!(!failed.status.success());
    let error: Value = serde_json::from_slice(&failed.stderr).unwrap();
    assert_eq!(error["error"]["code"], "PROJECT_REGISTRY_FAILED");
    let id = project::read(temp.path()).unwrap().id().to_owned();
    fs::remove_file(&registry_dir).unwrap();
    assert!(run().status.success());
    assert_eq!(project::read(temp.path()).unwrap().id(), id);
}

#[test]
fn linked_registry_and_entries_never_modify_their_targets() {
    let temp = TempDir::new().unwrap();
    let foreign = temp.path().join("foreign");
    fs::create_dir(&foreign).unwrap();
    let link = temp.path().join("registry");
    support::directory_link(&foreign, &link);
    let project = project::init(temp.path()).unwrap().0;
    assert!(registry::register(&link, &project).is_err());
    assert_eq!(fs::read_dir(&foreign).unwrap().count(), 0);
    let direct = temp.path().join("direct-registry");
    fs::create_dir(&direct).unwrap();
    support::directory_link(&foreign, &direct.join(format!("{}.json", project.id())));
    assert!(registry::register(&direct, &project).is_err());
    let mut desktop = Desktop::open(&temp.path().join("desktop")).unwrap();
    assert_eq!(
        registry::import(&direct, &mut desktop)
            .unwrap()
            .errors
            .len(),
        1
    );
    assert_eq!(fs::read_dir(foreign).unwrap().count(), 0);
}
