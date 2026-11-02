mod ai;
mod commands;
mod integrations;
mod lifecycle;
mod runtime;

use runtime::Runtime;
use std::{path::PathBuf, sync::Arc};
use tauri::Manager;

pub fn run() {
    let mut context = tauri::generate_context!();
    context.set_default_window_icon(Some(tauri::include_image!("icons/128x128.png")));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::workspace,
            commands::mutate,
            commands::choose_directory,
            commands::tool_connections,
            commands::connect_tool,
            commands::collect_records,
            commands::read_document,
            commands::import_plan,
            commands::check_plan,
            commands::apply_plan,
            commands::change_history,
            commands::undo_change,
            commands::start_chat,
            commands::cancel_chat,
            commands::open_reference,
            commands::quit_application
        ])
        .setup(|app| {
            let directory = std::env::var_os("SILOLINK_DESKTOP_CONFIG_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_config_dir()?);
            let runtime = Arc::new(
                Runtime::open(&directory).map_err(|e| std::io::Error::other(e.to_string()))?,
            );
            app.manage(runtime.clone());
            lifecycle::setup_tray(app.handle())?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(lifecycle::project_connections(
                handle.clone(),
                runtime.clone(),
            ));
            tauri::async_runtime::spawn(lifecycle::background(handle, runtime));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<Arc<Runtime>>();
                let background = state
                    .repository
                    .lock()
                    .is_ok_and(|r| r.data.settings.background_enabled);
                if background {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    api.prevent_close();
                    lifecycle::shutdown(window.app_handle().clone());
                }
            }
        })
        .run(context)
        .expect("SiloLink desktop could not start");
}
