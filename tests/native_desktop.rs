use serde_json::json;
use silolink::{
    desktop::{Desktop, analyze_records},
    documents, project,
};
use std::fs;
use tempfile::TempDir;

#[test]
fn connecting_is_explicit_idempotent_and_preserves_project_and_state_choices() {
    let config = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let mut app = Desktop::open(config.path()).unwrap();
    assert!(app.connect(root.path(), false).is_err());
    assert!(!root.path().join(".silolink").exists());
    let id = app.connect(root.path(), true).unwrap();
    assert_eq!(app.connect(root.path(), false).unwrap(), id);
    assert_eq!(app.data.projects.len(), 1);
    assert!(app.data.settings.state_directory.is_none());
    let reopened = Desktop::open(config.path()).unwrap();
    assert_eq!(reopened.data.projects.len(), 1);
    assert_eq!(reopened.project(&id).unwrap().id(), id);
}

#[test]
fn document_read_obeys_inventory_scope_and_detects_stale_revisions() {
    let root = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    fs::write(root.path().join("guide.md"), "# Guide\nfirst").unwrap();
    fs::write(root.path().join(".gitignore"), "private.md\n").unwrap();
    fs::write(root.path().join("private.md"), "secret").unwrap();
    let doc = documents::read(&project, "guide.md", None).unwrap();
    assert_eq!(doc["text"], "# Guide\nfirst");
    assert!(documents::read(&project, "../guide.md", None).is_err());
    assert!(documents::read(&project, "private.md", None).is_err());
    fs::write(root.path().join("guide.md"), "# Changed").unwrap();
    assert_eq!(
        documents::read(&project, "guide.md", doc["revision"].as_str())
            .unwrap_err()
            .code,
        "DOCUMENT_REVISION_CONFLICT"
    );
}

#[test]
fn usage_analysis_counts_only_real_user_records_and_preserves_evidence_scope() {
    let records = vec![
        json!({"id":"u1","projectId":"one","role":"user","text":"잘해줘","source":{"provider":"codex"},"occurredAt":null}),
        json!({"id":"a1","projectId":"one","role":"assistant","text":"잘해줘","source":{"provider":"codex"}}),
        json!({"id":"u2","projectId":"two","role":"user","text":"잘해줘","source":{"provider":"claude"},"occurredAt":"2026-11-02T01:00:00Z"}),
    ];
    let report = analyze_records(&records);
    assert_eq!(report["userRequests"], 2);
    assert_eq!(report["repeatedRequests"][0]["count"], 2);
    assert_eq!(
        report["repeatedRequests"][0]["recordIds"],
        json!(["u1", "u2"])
    );
    assert_eq!(report["missingTimestamps"], 1);
    assert_eq!(analyze_records(&[])["userRequests"], 0);
}

#[test]
fn settings_notes_and_tasks_survive_restart_without_inventing_completion() {
    let config = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let mut app = Desktop::open(config.path()).unwrap();
    let id = app.connect(root.path(), true).unwrap();
    let mut settings = app.data.settings.clone();
    settings.review_time = "25:99".into();
    assert!(app.save_settings(settings).is_err());
    assert_eq!(app.data.settings.review_time, "20:30");
    let task = app.add_task(&id, "오류 처리 요청에 적용", "학습").unwrap();
    assert!(!app.data.tasks[0].completed);
    assert!(!app.data.tasks[0].user_tested);
    app.add_note(
        &id,
        "learning",
        "부분 실패",
        "성공 결과와 실패 범위",
        vec!["u1".into()],
    )
    .unwrap();
    app.complete_task(&task, true, false).unwrap();
    let mut reopened = Desktop::open(config.path()).unwrap();
    assert!(reopened.data.tasks[0].completed);
    assert!(!reopened.data.tasks[0].user_tested);
    assert_eq!(reopened.data.notes[0].evidence_ids, vec!["u1"]);
    assert!(
        reopened
            .add_task("missing-project", "No project", "학습")
            .is_err()
    );
}

#[test]
fn task_schedule_validates_time_and_timer_preserves_user_test_boundary() {
    let config = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let mut app = Desktop::open(config.path()).unwrap();
    let id = app.connect(root.path(), true).unwrap();
    let task = app.add_task(&id, "실제 사용자 확인", "테스트").unwrap();
    assert!(app.schedule_task(&task, Some("not-a-date")).is_err());
    assert!(app.data.tasks[0].due_at.is_none());
    app.schedule_task(&task, Some("2026-11-03T03:30:00Z"))
        .unwrap();
    app.timer(&task, true).unwrap();
    app.complete_task(&task, true, false).unwrap();
    assert!(app.data.tasks[0].spans[0].ended_at.is_some());
    assert!(!app.data.tasks[0].user_tested);
    assert!(app.timer(&task, true).is_err());
    let restored = Desktop::open(config.path()).unwrap();
    assert_eq!(
        restored.data.tasks[0].due_at.as_deref(),
        Some("2026-11-03T03:30:00Z")
    );
}

#[test]
fn request_marks_persist_and_toggle() {
    let config = TempDir::new().unwrap();
    let mut app = Desktop::open(config.path()).unwrap();
    app.mark_request("record-1", true).unwrap();
    app.mark_request("record-1", true).unwrap();
    assert_eq!(app.data.request_marks.len(), 1);
    let mut reopened = Desktop::open(config.path()).unwrap();
    assert_eq!(reopened.data.request_marks[0].record_id, "record-1");
    assert_eq!(reopened.data.request_marks[0].kind, "intentional");
    assert!(reopened.detection().intentional.contains("record-1"));
    reopened.mark_request("record-1", false).unwrap();
    assert!(reopened.data.request_marks.is_empty());
    assert!(reopened.mark_request("", true).is_err());
    assert!(reopened.mark_request(&"x".repeat(201), true).is_err());
}

#[test]
fn delegation_phrases_are_validated() {
    let config = TempDir::new().unwrap();
    let mut app = Desktop::open(config.path()).unwrap();
    let mut settings = app.data.settings.clone();
    settings.delegation_phrases_added = vec!["가".repeat(41)];
    assert!(app.save_settings(settings.clone()).is_err());
    settings.delegation_phrases_added = (0..101).map(|i| format!("표현{i}")).collect();
    assert!(app.save_settings(settings.clone()).is_err());
    settings.delegation_phrases_added = vec!["  대강  ".into(), "대강".into()];
    settings.delegation_phrases_removed = vec![" 깔끔하게 ".into()];
    app.save_settings(settings).unwrap();
    assert_eq!(app.data.settings.delegation_phrases_added, ["대강"]);
    assert_eq!(app.data.settings.delegation_phrases_removed, ["깔끔하게"]);
    let detection = app.detection();
    assert!(detection.phrases.iter().any(|p| p == "대강"));
    assert!(!detection.phrases.iter().any(|p| p == "깔끔하게"));
}
