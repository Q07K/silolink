mod support;
use serde_json::{Value, json};
use silolink::{
    project::{self, Project},
    records,
    store::Store,
};
use std::{
    fs,
    io::{BufRead, BufReader},
    process::{Command, Stdio},
    time::Duration,
};
use tempfile::TempDir;
struct OwnedChild(std::process::Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn report(project: &Project, text: &str) -> Value {
    json!({"schemaVersion":1,"status":"success","project":project.json(),"observedAt":"2026-11-02T01:00:00.000Z","records":records::claude(project,"session",&[json!({"uuid":"one","session_id":"session","type":"user","message":{"content":text}})],"2026-11-02T01:00:00.000Z").records,"sources":[{"provider":"claude","status":"success"}]})
}
#[test]
fn revisions_reopening_and_partial_failure_preserve_previous_records() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let mut store = Store::open(state.path(), false).unwrap();
    let token = store.acquire(&project).unwrap();
    assert_eq!(
        store
            .commit(&project, &report(&project, "old"), &token)
            .unwrap()["changes"]["added"],
        1
    );
    store.release(&project, &token).unwrap();
    drop(store);
    let mut store = Store::open(state.path(), false).unwrap();
    let token = store.acquire(&project).unwrap();
    assert_eq!(
        store
            .commit(&project, &report(&project, "old"), &token)
            .unwrap()["changes"]["unchanged"],
        1
    );
    let changed = store
        .commit(&project, &report(&project, "new"), &token)
        .unwrap();
    assert_eq!(changed["changes"]["updated"], 1);
    let saved = store.read(&project, "all").unwrap();
    let id = saved["records"][0]["id"].as_str().unwrap();
    assert_eq!(store.revisions(&project, id).unwrap().len(), 2);
    for status in ["partial", "failed"] {
        let mut partial = report(&project, "none");
        partial["records"] = json!([]);
        partial["status"] = json!(status);
        store.commit(&project, &partial, &token).unwrap();
        let saved = store.read(&project, "all").unwrap();
        assert_eq!(saved["records"][0]["text"], "new");
        assert_eq!(saved["lastRun"]["status"], status);
    }
    store.release(&project, &token).unwrap();
}
#[test]
fn live_leases_exclude_competing_collectors_and_released_tokens_cannot_commit() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let mut a = Store::open(state.path(), false).unwrap();
    let mut b = Store::open(state.path(), false).unwrap();
    let token = a.acquire(&project).unwrap();
    assert_eq!(b.acquire(&project).unwrap_err().code, "PROJECT_SYNC_BUSY");
    a.release(&project, &token).unwrap();
    assert_eq!(
        a.commit(&project, &report(&project, "x"), &token)
            .unwrap_err()
            .code,
        "SYNC_LEASE_LOST"
    );
    let token = b.acquire(&project).unwrap();
    b.commit(&project, &report(&project, "x"), &token).unwrap();
    b.release(&project, &token).unwrap();
}
#[test]
fn a_mid_batch_storage_failure_rolls_back_records_revisions_and_last_run() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let mut store = Store::open(state.path(), false).unwrap();
    let token = store.acquire(&project).unwrap();
    store
        .commit(&project, &report(&project, "old"), &token)
        .unwrap();
    let db = rusqlite::Connection::open(&store.path).unwrap();
    db.execute_batch("CREATE TRIGGER reject_test_record BEFORE INSERT ON records WHEN NEW.record_id='reject' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").unwrap();
    drop(db);
    let mut changed = report(&project, "must roll back");
    let mut rejected = changed["records"][0].clone();
    rejected["id"] = json!("reject");
    changed["records"].as_array_mut().unwrap().push(rejected);
    assert_eq!(
        store.commit(&project, &changed, &token).unwrap_err().code,
        "STORE_WRITE_FAILED"
    );
    let saved = store.read(&project, "all").unwrap();
    assert_eq!(saved["records"][0]["text"], "old");
    assert_eq!(
        store
            .revisions(&project, saved["records"][0]["id"].as_str().unwrap())
            .unwrap()
            .len(),
        1
    );
    store.release(&project, &token).unwrap();
}
#[test]
fn stores_enforce_project_identity_location_and_provider_filters() {
    let root = TempDir::new().unwrap();
    let foreign = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let (other, _) = project::init(foreign.path()).unwrap();
    let mut store = Store::open(state.path(), false).unwrap();
    let token = store.acquire(&project).unwrap();
    let mut bad = report(&project, "x");
    bad["records"][0]["projectId"] = json!(other.id());
    assert_eq!(
        store.commit(&project, &bad, &token).unwrap_err().code,
        "INVALID_COLLECTION_REPORT"
    );
    store
        .commit(&project, &report(&project, "x"), &token)
        .unwrap();
    store.release(&project, &token).unwrap();
    assert!(
        store.read(&other, "all").unwrap()["records"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let moved = Project {
        metadata: project.metadata.clone(),
        root: other.root,
    };
    assert_eq!(
        store.acquire(&moved).unwrap_err().code,
        "PROJECT_LOCATION_CONFLICT"
    );
    assert_eq!(
        store.read(&project, "unknown").unwrap_err().code,
        "INVALID_ARGUMENTS"
    );
}
#[test]
fn absent_foreign_future_and_linked_stores_are_preserved() {
    let state = TempDir::new().unwrap();
    assert_eq!(
        Store::open(state.path(), true).err().unwrap().code,
        "STORE_NOT_INITIALIZED"
    );
    assert_eq!(fs::read_dir(state.path()).unwrap().count(), 0);
    let file = state.path().join("silolink.sqlite");
    let db = rusqlite::Connection::open(&file).unwrap();
    db.execute_batch(
        "CREATE TABLE foreign_data(value TEXT);INSERT INTO foreign_data VALUES ('keep')",
    )
    .unwrap();
    drop(db);
    let before = fs::read(&file).unwrap();
    assert_eq!(
        Store::open(state.path(), false).err().unwrap().code,
        "UNSUPPORTED_STORE_VERSION"
    );
    assert_eq!(fs::read(&file).unwrap(), before);
    fs::remove_file(&file).unwrap();
    drop(Store::open(state.path(), false).unwrap());
    let db = rusqlite::Connection::open(&file).unwrap();
    db.pragma_update(None, "user_version", 999).unwrap();
    drop(db);
    let before = fs::read(&file).unwrap();
    assert_eq!(
        Store::open(state.path(), false).err().unwrap().code,
        "UNSUPPORTED_STORE_VERSION"
    );
    assert_eq!(fs::read(&file).unwrap(), before);
    fs::remove_file(&file).unwrap();
    let foreign = TempDir::new().unwrap();
    support::directory_link(foreign.path(), &file);
    assert_eq!(
        Store::open(state.path(), false).err().unwrap().code,
        "INVALID_STORE_PATH"
    );
    assert_eq!(fs::read_dir(foreign.path()).unwrap().count(), 0);
}
#[test]
fn killed_collectors_roll_back_uncommitted_rows_and_stale_leases_are_reclaimed() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let mut store = Store::open(state.path(), false).unwrap();
    let token = store.acquire(&project).unwrap();
    store
        .commit(&project, &report(&project, "old"), &token)
        .unwrap();
    store.release(&project, &token).unwrap();
    drop(store);
    let mut child = OwnedChild(
        Command::new(env!("CARGO_BIN_EXE_silolink-provider-fixture"))
            .env("SILOLINK_FIXTURE_SCENARIO", "store-crash")
            .env("SILOLINK_FIXTURE_ROOT", &project.root)
            .env("SILOLINK_FIXTURE_STATE", state.path())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    let stdout = child.0.stdout.take().unwrap();
    let (send, receive) = std::sync::mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout).read_line(&mut line);
        let _ = send.send((result.is_ok(), line));
    });
    let ready = receive.recv_timeout(Duration::from_secs(10));
    child.0.kill().unwrap();
    child.0.wait().unwrap();
    reader.join().unwrap();
    assert!(ready.unwrap().0);
    let mut store = Store::open(state.path(), false).unwrap();
    assert_eq!(
        store.read(&project, "all").unwrap()["records"][0]["text"],
        "old"
    );
    let token = store.acquire(&project).unwrap();
    assert_eq!(
        store
            .commit(&project, &report(&project, "old"), &token)
            .unwrap()["changes"]["unchanged"],
        1
    );
    store.release(&project, &token).unwrap();
}
