use silolink::{project, store::Store, sync};
use std::time::Duration;
use tempfile::TempDir;
#[tokio::test]
async fn invalid_watch_intervals_fail_without_creating_a_store() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    for interval in [Duration::ZERO, Duration::from_secs(86401)] {
        let (_send, receive) = tokio::sync::watch::channel(true);
        let result = sync::watch(&project, state.path(), "claude", interval, receive, |_| {
            panic!("must not collect")
        })
        .await;
        assert_eq!(result.unwrap_err().code, "INVALID_ARGUMENTS");
    }
    assert_eq!(std::fs::read_dir(state.path()).unwrap().count(), 0);
}
#[tokio::test]
async fn watch_saves_its_first_cycle_and_stop_during_wait_does_not_collect_again() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let (send, receive) = tokio::sync::watch::channel(false);
    let stop = send.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(25)).await;
        stop.send(true).unwrap();
    });
    let mut reports = Vec::new();
    let code = sync::watch(
        &project,
        state.path(),
        "claude",
        Duration::from_secs(10),
        receive,
        |report| {
            reports.push(report.clone());
            Ok(())
        },
    )
    .await
    .unwrap();
    assert_eq!(code, 130);
    assert_eq!(reports.len(), 1);
    assert_eq!(reports[0]["command"], "watch");
    let store = Store::open(state.path(), true).unwrap();
    assert_eq!(
        store.read(&project, "all").unwrap()["lastRun"]["status"],
        "success"
    );
}
#[tokio::test]
async fn watch_retries_busy_collectors_and_stops_after_the_successful_retry() {
    let root = TempDir::new().unwrap();
    let state = TempDir::new().unwrap();
    let (project, _) = project::init(root.path()).unwrap();
    let mut owner = Store::open(state.path(), false).unwrap();
    let token = owner.acquire(&project).unwrap();
    let (send, receive) = tokio::sync::watch::channel(false);
    let mut reports = Vec::new();
    sync::watch(
        &project,
        state.path(),
        "claude",
        Duration::from_millis(1),
        receive,
        |report| {
            reports.push(report.clone());
            if reports.len() == 1 {
                owner.release(&project, &token).unwrap();
            } else {
                send.send(true).unwrap();
            }
            Ok(())
        },
    )
    .await
    .unwrap();
    assert_eq!(reports.len(), 2);
    assert_eq!(reports[0]["error"]["code"], "PROJECT_SYNC_BUSY");
    assert_eq!(reports[1]["status"], "success");
}
