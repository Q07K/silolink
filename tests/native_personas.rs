use silolink::{desktop::Desktop, documents::SearchIndex, project};
use std::fs;
use tempfile::TempDir;

#[test]
fn body_search_preserves_scope_revisions_and_updates_cached_text() {
    let root = TempDir::new().unwrap();
    fs::write(
        root.path().join("README.md"),
        "# 인증 결정\n\nrefresh-token-rotation\n",
    )
    .unwrap();
    fs::write(root.path().join(".gitignore"), "private.md\n").unwrap();
    fs::write(
        root.path().join("private.md"),
        "refresh-token-rotation secret",
    )
    .unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let mut index = SearchIndex::default();
    let found = index.search(&project, "REFRESH-token").unwrap();
    assert_eq!(found["matches"].as_array().unwrap().len(), 1);
    assert_eq!(found["matches"][0]["path"], "README.md");
    assert_eq!(found["matches"][0]["line"], 3);
    let revision = found["matches"][0]["revision"].clone();
    fs::write(root.path().join("README.md"), "# 인증 결정\n새 결정\n").unwrap();
    assert!(
        index.search(&project, "refresh-token").unwrap()["matches"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_ne!(
        index.search(&project, "새 결정").unwrap()["matches"][0]["revision"],
        revision
    );
    assert!(index.search(&project, "").is_err());
}

#[test]
fn note_export_contains_selected_notes_and_rejects_foreign_ids() {
    let profile = TempDir::new().unwrap();
    let first = TempDir::new().unwrap();
    let second = TempDir::new().unwrap();
    let mut app = Desktop::open(profile.path()).unwrap();
    let a = app.connect(first.path(), true).unwrap();
    let b = app.connect(second.path(), true).unwrap();
    let selected = app
        .add_note(
            &a,
            "rule",
            "검토 기준",
            "변경 이유를 남긴다.",
            vec!["evidence-1".into()],
        )
        .unwrap();
    let foreign = app
        .add_note(&b, "decision", "다른 고객", "PRIVATE_CLIENT_B", vec![])
        .unwrap();
    let report = app
        .export_notes(&a, std::slice::from_ref(&selected))
        .unwrap();
    assert!(report.contains("검토 기준") && report.contains("evidence-1"));
    assert!(!report.contains("PRIVATE_CLIENT_B"));
    assert!(app.export_notes(&a, &[foreign]).is_err());
    assert!(app.export_notes(&a, &[]).is_err());
    assert_eq!(Desktop::open(profile.path()).unwrap().data.notes.len(), 2);
}

#[test]
fn fetched_sources_preserve_original_text_and_load_legacy_records() {
    use silolink::desktop::Source;
    let mut legacy: Source = serde_json::from_value(serde_json::json!({
        "id":"", "projectId":"", "title":"자료", "url":"https://example.org/doc", "kind":"official", "claim":"주장", "conditions":"", "version":"", "verified":false, "recordedAt":""
    })).unwrap();
    assert!(legacy.fetched.is_none());
    let profile = TempDir::new().unwrap();
    let root = TempDir::new().unwrap();
    let mut app = Desktop::open(profile.path()).unwrap();
    legacy.project_id = app.connect(root.path(), true).unwrap();
    legacy.fetched = Some(silolink::desktop::FetchedReference {
        url: legacy.url.clone(),
        title: "원문 제목".into(),
        text: "수집한 원문".into(),
        fetched_at: project::now(),
    });
    app.add_source(legacy.clone()).unwrap();
    let reopened = Desktop::open(profile.path()).unwrap();
    assert_eq!(
        reopened.data.sources[0].fetched.as_ref().unwrap().text,
        "수집한 원문"
    );
    assert!(!reopened.data.sources[0].verified);
    legacy.fetched.as_mut().unwrap().url = "https://other.example.org".into();
    assert!(app.add_source(legacy).is_err());
    assert_eq!(app.data.sources.len(), 1);
}

#[test]
fn report_file_write_preserves_unicode_and_existing_files_on_failure() {
    let directory = TempDir::new().unwrap();
    let path = directory.path().join("공유 보고서.md");
    let body = "# 검토 기준\n\n한글 원문과 결정 🙂\n";
    silolink::desktop::write_report(&path, body).unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), body);
    silolink::desktop::write_report(&path, "# 새 결정\n").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "# 새 결정\n");
    let protected = directory.path().join("settings.json");
    fs::write(&protected, "preserved").unwrap();
    assert!(silolink::desktop::write_report(&protected, body).is_err());
    assert_eq!(fs::read_to_string(&protected).unwrap(), "preserved");
    assert!(
        silolink::desktop::write_report(&directory.path().join("missing/report.md"), body).is_err()
    );
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
}
