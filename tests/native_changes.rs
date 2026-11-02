use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use silolink::project;
use std::{
    fs,
    path::Path,
    process::{Command, Output},
};
use tempfile::TempDir;
use uuid::Uuid;

fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
fn run(root: &Path, command: &str, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_silolink"))
        .arg(command)
        .args(args)
        .current_dir(root)
        .env_remove("SILOLINK_STATE_DIR")
        .output()
        .unwrap()
}
fn value(output: &Output) -> Value {
    let bytes = if output.stdout.is_empty() {
        &output.stderr
    } else {
        &output.stdout
    };
    serde_json::from_slice(bytes).unwrap_or_else(|_| panic!("{}", String::from_utf8_lossy(bytes)))
}
fn success(output: Output) -> Value {
    assert!(output.status.success(), "{}", value(&output));
    value(&output)
}
fn write(root: &Path, path: &str, text: &str) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn plan(root: &Path, operations: Value) -> Value {
    json!({"schemaVersion":1,"id":Uuid::new_v4().to_string(),"projectId":project::read(root).unwrap().id(),"rationale":"Merge reviewed docs, rewrite real content, and repair references.","operations":operations,"guards":[]})
}
fn save(temp: &TempDir, plan: &Value) -> String {
    let filename = temp.path().join("reviewed-plan.json");
    fs::write(&filename, plan.to_string()).unwrap();
    filename.to_str().unwrap().to_owned()
}

#[test]
fn reviewed_merge_rewrite_delete_and_links_apply_once_and_restore_original_bytes() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    write(
        root.path(),
        "README.md",
        "# Project\r\n[Old](notes/old.md)\r\n",
    );
    write(root.path(), "notes/old.md", "# Old\nKeep this decision.\n");
    write(root.path(), "untouched.md", "# Unselected\n");
    let p = plan(
        root.path(),
        json!([
            {"path":"docs/guide.md","expectedRevision":null,"content":"# Guide\nKeep this decision, explained with the new design.\n"},
            {"path":"README.md","expectedRevision":hash("# Project\r\n[Old](notes/old.md)\r\n"),"content":"# Project\n[Guide](docs/guide.md)\n"},
            {"path":"notes/old.md","expectedRevision":hash("# Old\nKeep this decision.\n"),"content":null}
        ]),
    );
    let filename = save(&input, &p);
    let state_path = state.path().to_str().unwrap();
    let preview = success(run(root.path(), "docs-check", &["--plan", &filename]));
    assert_eq!(preview["changeState"], "ready");
    assert_eq!(preview["incomingLinks"][0]["source"], "README.md");
    assert_eq!(preview["incomingLinks"][0]["sourceCoveredByPlan"], true);
    assert_eq!(
        preview["operations"][1]["before"],
        "# Project\r\n[Old](notes/old.md)\r\n"
    );
    assert_eq!(
        fs::read_dir(root.path().join(".silolink")).unwrap().count(),
        1
    );
    assert!(!root.path().join("docs").exists());
    assert_eq!(fs::read_dir(state.path()).unwrap().count(), 0);
    let applied = success(run(
        root.path(),
        "docs-apply",
        &["--plan", &filename, "--state-dir", state_path],
    ));
    assert_eq!(applied["changeState"], "applied");
    assert!(
        applied["validation"]["newBrokenLinks"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert!(!root.path().join("notes/old.md").exists());
    assert!(
        fs::read_to_string(root.path().join("docs/guide.md"))
            .unwrap()
            .contains("new design")
    );
    assert_eq!(
        fs::read_to_string(root.path().join("untouched.md")).unwrap(),
        "# Unselected\n"
    );
    let repeated = success(run(
        root.path(),
        "docs-apply",
        &["--plan", &filename, "--state-dir", state_path],
    ));
    assert_eq!(repeated["changeState"], "applied");
    let listed = success(run(
        root.path(),
        "docs-changes",
        &["--state-dir", state_path],
    ));
    assert_eq!(listed["changes"].as_array().unwrap().len(), 1);
    let id = p["id"].as_str().unwrap();
    let undone = success(run(
        root.path(),
        "docs-undo",
        &["--change", id, "--state-dir", state_path],
    ));
    assert_eq!(undone["changeState"], "rolled-back");
    assert_eq!(
        fs::read(root.path().join("README.md")).unwrap(),
        b"# Project\r\n[Old](notes/old.md)\r\n"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("notes/old.md")).unwrap(),
        "# Old\nKeep this decision.\n"
    );
    assert!(!root.path().join("docs/guide.md").exists());
    success(run(
        root.path(),
        "docs-undo",
        &["--change", id, "--state-dir", state_path],
    ));
    assert!(!state.path().join("silolink.sqlite").exists());
}

#[test]
fn stale_source_destination_and_read_dependencies_are_rejected_before_document_writes() {
    for conflict in ["source", "destination", "guard"] {
        let root = TempDir::new().unwrap();
        let state = TempDir::new().unwrap();
        let input = TempDir::new().unwrap();
        project::init(root.path()).unwrap();
        write(root.path(), "a.md", "# Before\n");
        write(root.path(), "guard.md", "# Reference\n");
        let mut p = plan(
            root.path(),
            json!([
                {"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"},
                {"path":"new.md","expectedRevision":null,"content":"# New\n"}
            ]),
        );
        p["guards"] = json!([{"path":"guard.md","expectedRevision":hash("# Reference\n")}]);
        match conflict {
            "source" => write(root.path(), "a.md", "# External edit\n"),
            "destination" => write(root.path(), "new.md", "# Occupied\n"),
            _ => write(root.path(), "guard.md", "# Reference edited\n"),
        }
        let before = fs::read(root.path().join("a.md")).unwrap();
        let filename = save(&input, &p);
        let output = run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                state.path().to_str().unwrap(),
            ],
        );
        assert_eq!(output.status.code(), Some(1));
        assert_eq!(value(&output)["changeState"], "conflict");
        assert_eq!(fs::read(root.path().join("a.md")).unwrap(), before);
        if conflict != "destination" {
            assert!(!root.path().join("new.md").exists());
        }
        assert_eq!(fs::read_dir(state.path()).unwrap().count(), 0);
    }
}

#[test]
fn undo_preserves_external_edits_and_can_retry_after_conflict_is_resolved() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# Applied\n"}]),
    );
    let filename = save(&input, &p);
    let args = [
        "--plan",
        filename.as_str(),
        "--state-dir",
        state.path().to_str().unwrap(),
    ];
    success(run(root.path(), "docs-apply", &args));
    write(root.path(), "a.md", "# My later edit\n");
    let undo = [
        "--change",
        p["id"].as_str().unwrap(),
        "--state-dir",
        state.path().to_str().unwrap(),
    ];
    let failed = run(root.path(), "docs-undo", &undo);
    assert_eq!(failed.status.code(), Some(1));
    assert_eq!(value(&failed)["changeState"], "conflict");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# My later edit\n"
    );
    write(root.path(), "a.md", "# Applied\n");
    success(run(root.path(), "docs-undo", &undo));
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# Before\n"
    );
}

#[test]
fn plans_cannot_escape_projects_overwrite_management_files_or_enter_other_projects() {
    for path in [
        "../outside.md",
        "C:/outside.md",
        ".silolink/project.md",
        "node_modules/pkg/README.md",
        "nested/README.md",
        "a/../b.md",
        "README.md ",
        "CON.md",
        "README.md/child.md",
    ] {
        let root = TempDir::new().unwrap();
        let state = TempDir::new().unwrap();
        let input = TempDir::new().unwrap();
        project::init(root.path()).unwrap();
        write(root.path(), "README.md", "# Keep\n");
        write(root.path(), "nested/README.md", "# Other\n");
        project::init(&root.path().join("nested")).unwrap();
        let p = plan(
            root.path(),
            json!([{"path":path,"expectedRevision":null,"content":"# Overwrite\n"}]),
        );
        let filename = save(&input, &p);
        let output = run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                state.path().to_str().unwrap(),
            ],
        );
        assert_eq!(output.status.code(), Some(1), "{path}: {}", value(&output));
        assert_eq!(
            fs::read_to_string(root.path().join("README.md")).unwrap(),
            "# Keep\n"
        );
        assert_eq!(fs::read_dir(state.path()).unwrap().count(), 0);
    }
}

#[test]
fn invalid_incomplete_duplicate_and_wrong_project_plans_have_no_side_effects() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    let base = plan(
        root.path(),
        json!([{"path":"new.md","expectedRevision":null,"content":"# New\n"}]),
    );
    for kind in [
        "missing-content",
        "missing-revision",
        "duplicate",
        "wrong-project",
        "version",
        "empty",
        "unknown-field",
    ] {
        let mut p = base.clone();
        match kind {
            "missing-content" => {
                p["operations"][0]
                    .as_object_mut()
                    .unwrap()
                    .remove("content");
            }
            "missing-revision" => {
                p["operations"][0]
                    .as_object_mut()
                    .unwrap()
                    .remove("expectedRevision");
            }
            "duplicate" => {
                let duplicate = p["operations"][0].clone();
                p["operations"].as_array_mut().unwrap().push(duplicate);
            }
            "wrong-project" => p["projectId"] = json!(Uuid::new_v4().to_string()),
            "version" => p["schemaVersion"] = json!(2),
            "empty" => p["operations"] = json!([]),
            _ => p["oops"] = json!(true),
        }
        let filename = save(&input, &p);
        let output = run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                state.path().to_str().unwrap(),
            ],
        );
        assert_eq!(output.status.code(), Some(1), "{kind}");
        assert_eq!(
            value(&output)["error"]["code"],
            "INVALID_CHANGE_PLAN",
            "{kind}"
        );
        assert!(!root.path().join("new.md").exists());
        assert_eq!(fs::read_dir(state.path()).unwrap().count(), 0);
    }
    let filename = save(&input, &base);
    let no_state = run(root.path(), "docs-apply", &["--plan", &filename]);
    assert_eq!(
        value(&no_state)["error"]["code"],
        "STATE_DIRECTORY_REQUIRED"
    );
}

#[test]
fn missing_or_foreign_journals_and_cross_project_change_ids_are_preserved() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    let missing = run(
        root.path(),
        "docs-changes",
        &["--state-dir", state.path().to_str().unwrap()],
    );
    assert_eq!(missing.status.code(), Some(1));
    assert_eq!(fs::read_dir(state.path()).unwrap().count(), 0);
    let foreign = state.path().join("document-changes.sqlite");
    fs::write(&foreign, b"unrelated data").unwrap();
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":null,"content":"# New\n"}]),
    );
    let filename = save(&input, &p);
    assert_eq!(
        run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                state.path().to_str().unwrap()
            ]
        )
        .status
        .code(),
        Some(1)
    );
    assert_eq!(fs::read(&foreign).unwrap(), b"unrelated data");
    assert!(!root.path().join("a.md").exists());
}

#[test]
fn a_read_dependency_edited_while_staging_prevents_the_document_replacement() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    write(root.path(), "guard.md", "# Reference\n");
    let mut p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"}]),
    );
    p["guards"] = json!([{"path":"guard.md","expectedRevision":hash("# Reference\n")}]);
    let filename = save(&input, &p);
    let result = silolink::changes::apply_with_progress(
        &project,
        Path::new(&filename),
        state.path(),
        |stage, _| {
            if stage == "staged" {
                write(root.path(), "guard.md", "# Edited while staging\n");
            }
        },
    )
    .unwrap();
    assert_eq!(result["status"], "failed");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# Before\n"
    );
}

#[test]
fn missing_undo_does_not_initialize_an_unrelated_state_directory() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    let output = run(
        root.path(),
        "docs-undo",
        &[
            "--change",
            &Uuid::new_v4().to_string(),
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    );
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(fs::read_dir(state.path()).unwrap().count(), 0);
}

#[test]
fn change_history_distinguishes_historical_application_from_current_file_state() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"}]),
    );
    let filename = save(&input, &p);
    success(run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    write(root.path(), "a.md", "# Before\n");
    let status = success(run(
        root.path(),
        "docs-changes",
        &["--state-dir", state.path().to_str().unwrap()],
    ));
    assert_eq!(status["changes"][0]["changeState"], "applied");
    assert_eq!(status["changes"][0]["status"], "partial");
}

#[test]
fn partial_application_preserves_external_edits_and_resumes_without_duplicate_work() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# A before\n");
    write(root.path(), "b.md", "# B before\n");
    let p = plan(
        root.path(),
        json!([
            {"path":"a.md","expectedRevision":hash("# A before\n"),"content":"# A after\n"},
            {"path":"b.md","expectedRevision":hash("# B before\n"),"content":"# B after\n"}
        ]),
    );
    let filename = save(&input, &p);
    let partial = silolink::changes::apply_with_progress(
        &project,
        Path::new(&filename),
        state.path(),
        |stage, path| {
            if stage == "recorded" && path == "a.md" {
                write(root.path(), "b.md", "# User edit\n");
            }
        },
    )
    .unwrap();
    assert_eq!(partial["status"], "partial");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# A after\n"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("b.md")).unwrap(),
        "# User edit\n"
    );
    let args = [
        "--plan",
        filename.as_str(),
        "--state-dir",
        state.path().to_str().unwrap(),
    ];
    assert_eq!(run(root.path(), "docs-apply", &args).status.code(), Some(1));
    write(root.path(), "b.md", "# B before\n");
    success(run(root.path(), "docs-apply", &args));
    success(run(
        root.path(),
        "docs-undo",
        &[
            "--change",
            p["id"].as_str().unwrap(),
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# A before\n"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("b.md")).unwrap(),
        "# B before\n"
    );
}

struct OwnChild(std::process::Child);
impl Drop for OwnChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn paused_child(
    root: &Path,
    state: &Path,
    filename: &str,
    stage: &str,
    undo: Option<&str>,
) -> OwnChild {
    use std::{
        io::{BufRead, BufReader},
        process::Stdio,
        sync::mpsc,
        time::Duration,
    };
    let mut command = Command::new(env!("CARGO_BIN_EXE_silolink-provider-fixture"));
    command
        .env("SILOLINK_FIXTURE_SCENARIO", "change-crash")
        .env("SILOLINK_FIXTURE_ROOT", root)
        .env("SILOLINK_FIXTURE_STATE", state)
        .env("SILOLINK_CHANGE_PLAN", filename)
        .env("SILOLINK_CHANGE_STAGE", stage)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());
    if let Some(id) = undo {
        command.env("SILOLINK_CHANGE_UNDO", id);
    } else {
        command.env_remove("SILOLINK_CHANGE_UNDO");
    }
    let mut child = OwnChild(command.spawn().unwrap());
    let stdout = child.0.stdout.take().unwrap();
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout).read_line(&mut line);
        let _ = send.send((result, line));
    });
    let (result, line) = receive
        .recv_timeout(Duration::from_secs(10))
        .expect("child did not reach the journal checkpoint");
    result.unwrap();
    assert_eq!(line.trim(), "ready");
    child
}

#[test]
fn killed_processes_release_project_locks_and_reconcile_staging_and_file_write_gaps() {
    for stage in ["before-write", "staged", "after-write", "recorded"] {
        let root = TempDir::new().unwrap();
        let state = TempDir::new().unwrap();
        let other_state = TempDir::new().unwrap();
        let input = TempDir::new().unwrap();
        project::init(root.path()).unwrap();
        write(root.path(), "a.md", "# Before\n");
        let p = plan(
            root.path(),
            json!([{ "path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"},{"path":"b.md","expectedRevision":null,"content":"# New\n"}]),
        );
        let filename = save(&input, &p);
        let mut child = paused_child(root.path(), state.path(), &filename, stage, None);
        let status = success(run(
            root.path(),
            "docs-changes",
            &["--state-dir", state.path().to_str().unwrap()],
        ));
        assert_eq!(status["changes"][0]["active"], true);
        let busy = run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                other_state.path().to_str().unwrap(),
            ],
        );
        assert_eq!(value(&busy)["error"]["code"], "DOCUMENT_CHANGE_BUSY");
        assert_eq!(fs::read_dir(other_state.path()).unwrap().count(), 0);
        child.0.kill().unwrap();
        child.0.wait().unwrap();
        let status = success(run(
            root.path(),
            "docs-changes",
            &["--state-dir", state.path().to_str().unwrap()],
        ));
        assert_eq!(status["changes"][0]["changeState"], "interrupted");
        success(run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                state.path().to_str().unwrap(),
            ],
        ));
        assert_eq!(
            fs::read_to_string(root.path().join("a.md")).unwrap(),
            "# After\n"
        );
        success(run(
            root.path(),
            "docs-undo",
            &[
                "--change",
                p["id"].as_str().unwrap(),
                "--state-dir",
                state.path().to_str().unwrap(),
            ],
        ));
        assert_eq!(
            fs::read_to_string(root.path().join("a.md")).unwrap(),
            "# Before\n"
        );
        assert!(!root.path().join("b.md").exists());
        assert!(
            !fs::read_dir(root.path()).unwrap().any(|e| e
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp"))
        );
    }
}

#[test]
fn recovery_can_resume_after_being_killed_between_restore_and_journal_commit() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"}]),
    );
    let filename = save(&input, &p);
    let id = p["id"].as_str().unwrap();
    success(run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    let mut child = paused_child(
        root.path(),
        state.path(),
        &filename,
        "after-write",
        Some(id),
    );
    child.0.kill().unwrap();
    child.0.wait().unwrap();
    let status = success(run(
        root.path(),
        "docs-changes",
        &["--state-dir", state.path().to_str().unwrap()],
    ));
    assert_eq!(status["changes"][0]["changeState"], "interrupted");
    assert_eq!(status["changes"][0]["direction"], "undo");
    let output = success(run(
        root.path(),
        "docs-undo",
        &[
            "--change",
            id,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    assert_eq!(output["changeState"], "rolled-back");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# Before\n"
    );
}

#[test]
fn journal_checkpoint_failure_keeps_preimages_and_can_resume_after_storage_repair() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"}]),
    );
    let filename = save(&input, &p);
    let result = silolink::changes::apply_with_progress(
        &project,
        Path::new(&filename),
        state.path(),
        |stage, _| {
            if stage == "prepared" {
                let db = rusqlite::Connection::open(state.path().join("document-changes.sqlite"))
                    .unwrap();
                db.execute_batch("CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON files WHEN NEW.phase='applied' BEGIN SELECT RAISE(ABORT,'simulated storage failure'); END;").unwrap();
            }
        },
    );
    assert!(result.is_err());
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# After\n"
    );
    let status = success(run(
        root.path(),
        "docs-changes",
        &["--state-dir", state.path().to_str().unwrap()],
    ));
    assert_eq!(status["changes"][0]["changeState"], "interrupted");
    let db = rusqlite::Connection::open(state.path().join("document-changes.sqlite")).unwrap();
    db.execute_batch("DROP TRIGGER fail_checkpoint").unwrap();
    drop(db);
    success(run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    success(run(
        root.path(),
        "docs-undo",
        &[
            "--change",
            p["id"].as_str().unwrap(),
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# Before\n"
    );
}

#[test]
fn change_ids_are_immutable_and_other_projects_cannot_recover_their_files() {
    let root = TempDir::new().unwrap();
    let other = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    project::init(other.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    write(other.path(), "a.md", "# Other project\n");
    let mut p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"}]),
    );
    let filename = save(&input, &p);
    success(run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    p["operations"][0]["content"] = json!("# Different immutable plan\n");
    let filename = save(&input, &p);
    let reused = run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    );
    assert_eq!(value(&reused)["error"]["code"], "DOCUMENT_PLAN_ID_CONFLICT");
    let denied = run(
        other.path(),
        "docs-undo",
        &[
            "--change",
            p["id"].as_str().unwrap(),
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    );
    assert_eq!(
        value(&denied)["error"]["code"],
        "DOCUMENT_CHANGE_PROJECT_CONFLICT"
    );
    assert_eq!(
        fs::read_to_string(other.path().join("a.md")).unwrap(),
        "# Other project\n"
    );
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# After\n"
    );
}

#[test]
fn link_validation_reports_new_breakage_and_preserves_existing_link_diagnostics() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    write(
        root.path(),
        "README.md",
        "# Project\n[preexisting](missing.md)\n[old](old.md)\n",
    );
    write(root.path(), "old.md", "# Old\n");
    let p = plan(
        root.path(),
        json!([{"path":"old.md","expectedRevision":hash("# Old\n"),"content":null}]),
    );
    let filename = save(&input, &p);
    let preview = success(run(root.path(), "docs-check", &["--plan", &filename]));
    assert_eq!(preview["incomingLinks"][0]["sourceCoveredByPlan"], false);
    let output = run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    );
    assert_eq!(output.status.code(), Some(2));
    let output = value(&output);
    assert_eq!(output["changeState"], "applied");
    assert_eq!(
        output["validation"]["brokenLinks"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        output["validation"]["newBrokenLinks"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let restored = success(run(
        root.path(),
        "docs-undo",
        &[
            "--change",
            p["id"].as_str().unwrap(),
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    assert_eq!(
        restored["validation"]["brokenLinks"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(
        restored["validation"]["newBrokenLinks"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[test]
fn linked_document_and_journal_directories_are_not_followed_and_future_schemas_are_preserved() {
    let root = TempDir::new().unwrap();
    let foreign = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    write(foreign.path(), "secret.md", "# Foreign\n");
    support::directory_link(foreign.path(), &root.path().join("linked"));
    let p = plan(
        root.path(),
        json!([{"path":"linked/secret.md","expectedRevision":hash("# Foreign\n"),"content":"# Overwrite\n"}]),
    );
    let filename = save(&input, &p);
    assert_eq!(
        run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                state.path().to_str().unwrap()
            ]
        )
        .status
        .code(),
        Some(1)
    );
    assert_eq!(
        fs::read_to_string(foreign.path().join("secret.md")).unwrap(),
        "# Foreign\n"
    );
    support::directory_link(foreign.path(), &input.path().join("linked-state"));
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":null,"content":"# New\n"}]),
    );
    let filename = save(&input, &p);
    assert_eq!(
        run(
            root.path(),
            "docs-apply",
            &[
                "--plan",
                &filename,
                "--state-dir",
                input.path().join("linked-state").to_str().unwrap()
            ]
        )
        .status
        .code(),
        Some(1)
    );
    assert!(!foreign.path().join("document-changes.sqlite").exists());
    success(run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    let database = state.path().join("document-changes.sqlite");
    let db = rusqlite::Connection::open(&database).unwrap();
    db.pragma_update(None, "user_version", 999).unwrap();
    drop(db);
    let bytes = fs::read(&database).unwrap();
    assert_eq!(
        run(
            root.path(),
            "docs-undo",
            &[
                "--change",
                p["id"].as_str().unwrap(),
                "--state-dir",
                state.path().to_str().unwrap()
            ]
        )
        .status
        .code(),
        Some(1)
    );
    assert_eq!(fs::read(&database).unwrap(), bytes);
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# New\n"
    );
}

#[test]
fn inconsistent_journal_ordinals_are_rejected_before_restoring_documents() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"}]),
    );
    let filename = save(&input, &p);
    success(run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    ));
    let db = rusqlite::Connection::open(state.path().join("document-changes.sqlite")).unwrap();
    db.execute_batch("UPDATE files SET ordinal=10").unwrap();
    drop(db);
    let output = run(
        root.path(),
        "docs-undo",
        &[
            "--change",
            p["id"].as_str().unwrap(),
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    );
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(value(&output)["error"]["code"], "INVALID_DOCUMENT_JOURNAL");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# After\n"
    );
}

#[test]
fn unrecognized_staging_edits_are_preserved_instead_of_being_deleted_on_retry() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let input = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    write(root.path(), "a.md", "# Before\n");
    let p = plan(
        root.path(),
        json!([{"path":"a.md","expectedRevision":hash("# Before\n"),"content":"# After\n"}]),
    );
    let filename = save(&input, &p);
    let partial = silolink::changes::apply_with_progress(
        &project,
        Path::new(&filename),
        state.path(),
        |stage, _| {
            if stage == "staged" {
                write(root.path(), "a.md", "# User edit\n");
            }
        },
    )
    .unwrap();
    assert_eq!(partial["status"], "failed");
    let staging = fs::read_dir(root.path())
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| p.extension().is_some_and(|s| s == "tmp"))
        .unwrap();
    fs::write(&staging, b"external staging edit").unwrap();
    write(root.path(), "a.md", "# Before\n");
    let output = run(
        root.path(),
        "docs-apply",
        &[
            "--plan",
            &filename,
            "--state-dir",
            state.path().to_str().unwrap(),
        ],
    );
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(value(&output)["error"]["code"], "DOCUMENT_STAGING_CONFLICT");
    assert_eq!(fs::read(&staging).unwrap(), b"external staging edit");
    assert_eq!(
        fs::read_to_string(root.path().join("a.md")).unwrap(),
        "# Before\n"
    );
}
mod support;
