use crate::runtime::{Runtime, lock};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

// Project discovery is independent of optional AI history collection.
pub async fn project_connections(app: AppHandle, runtime: Arc<Runtime>) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let rt = runtime.clone();
        if matches!(
            tauri::async_runtime::spawn_blocking(move || rt.sync_projects()).await,
            Ok(Ok(true))
        ) {
            let _ = app.emit("workspace-changed", json!({"projects":true}));
        }
    }
}

pub async fn background(app: AppHandle, runtime: Arc<Runtime>) {
    use chrono::{Datelike, Timelike};
    let mut collection_settings = runtime.collection_settings_changed.subscribe();
    let mut last_collection: Option<std::time::Instant> = None;
    loop {
        tokio::select! {
            _ = collection_settings.changed() => last_collection = None,
            _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {}
        }
        let data = match lock(&runtime.repository) {
            Ok(repo) => {
                // Consume updates that arrived between waking and reading the settings.
                if collection_settings.has_changed().unwrap_or(false) {
                    collection_settings.borrow_and_update();
                    last_collection = None;
                }
                repo.data.clone()
            }
            Err(_) => continue,
        };
        if !data.settings.background_enabled {
            continue;
        }
        if !data.projects.is_empty()
            && last_collection.is_none_or(|last| {
                last.elapsed().as_secs() >= data.settings.collection_interval_secs
            })
        {
            for project in &data.projects {
                if collection_settings.has_changed().unwrap_or(false) {
                    break;
                }
                let result = super::runtime::collect(&runtime, &project.id, true).await;
                if result
                    .as_ref()
                    .is_err_and(|e| e.code == "COLLECTION_DISABLED")
                {
                    break;
                }
                let _ = app.emit(
                    "collection-finished",
                    json!({"projectId":project.id,"error":result.err().map(|e| e.json())}),
                );
            }
            last_collection = Some(std::time::Instant::now());
            crate::insight::maybe_auto_analyze(&app, &runtime);
        }
        let offset = chrono::FixedOffset::east_opt(if data.settings.timezone == "Asia/Seoul" {
            9 * 3600
        } else {
            0
        })
        .expect("supported offset");
        let now = chrono::Utc::now().with_timezone(&offset);
        let parts: Vec<_> = data
            .settings
            .review_time
            .split(':')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect();
        if parts.len() == 2 && (now.hour(), now.minute()) >= (parts[0], parts[1]) {
            notify_once(
                &app,
                &runtime,
                &format!("daily:{}", now.date_naive()),
                "daily",
                "하루를 돌아볼 시간입니다.",
                data.settings.immediate_notifications,
            );
            if now.weekday().num_days_from_monday() == data.settings.review_weekday {
                notify_once(
                    &app,
                    &runtime,
                    &format!("weekly:{}", now.date_naive()),
                    "weekly",
                    "이번 주의 요청과 프로젝트를 함께 돌아보세요.",
                    data.settings.immediate_notifications,
                );
            }
        }
        // Repeated-request discoveries need no model; announce them as soon as they appear.
        let rt = runtime.clone();
        let ids: Vec<String> = data.projects.iter().map(|p| p.id.clone()).collect();
        if let Ok(Ok(items)) = tauri::async_runtime::spawn_blocking(move || {
            let (records, _) = crate::insight::records_for(&rt, &ids)?;
            let detection = crate::runtime::lock(&rt.repository)?.detection();
            let analysis = silolink::desktop::analyze_with(&records, &detection);
            crate::insight::refresh_local(&rt, &records, &analysis)
        })
        .await
        {
            crate::insight::announce(
                &app,
                &runtime,
                &items,
                data.settings.immediate_notifications,
            );
        }
    }
}
pub(crate) fn notify_once(
    app: &AppHandle,
    runtime: &Runtime,
    id: &str,
    kind: &str,
    title: &str,
    system: bool,
) {
    let added = lock(&runtime.repository).and_then(|mut repo| repo.record_notice(id, kind, title));
    if matches!(added, Ok(true)) {
        if system {
            let _ = app
                .notification()
                .builder()
                .title("SiloLink")
                .body(title)
                .show();
        }
        let _ = app.emit("workspace-changed", json!({"notice":id}));
    }
}
pub fn shutdown(app: AppHandle) {
    let runtime = app.state::<Arc<Runtime>>().inner().clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(jobs) = runtime.jobs.lock() {
            for sender in jobs.values() {
                let _ = sender.send(true);
            }
        }
        for _ in 0..40 {
            if runtime.jobs.lock().is_ok_and(|jobs| jobs.is_empty()) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        app.exit(0);
    });
}
pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::TrayIconBuilder,
    };
    let show = MenuItem::with_id(app, "show", "SiloLink 열기", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("SiloLink")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => shutdown(app.clone()),
            _ => (),
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
