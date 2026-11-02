use crate::{
    ai, integrations,
    runtime::{self, Runtime, error, lock},
};
use serde_json::{Value, json};
use silolink::error::Result;
use std::{io::Read, sync::Arc};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
type Reply = std::result::Result<Value, Value>;

#[tauri::command]
pub fn quit_application(app: AppHandle) {
    crate::lifecycle::shutdown(app);
}
fn public(result: Result<Value>) -> Reply {
    result.map_err(|e| e.json())
}
async fn worker(task: impl FnOnce() -> Result<Value> + Send + 'static) -> Reply {
    tauri::async_runtime::spawn_blocking(task).await.map_err(|_|json!({"code":"DESKTOP_WORKER_FAILED","message":"The desktop operation stopped unexpectedly."}))?.map_err(|e|e.json())
}
#[tauri::command]
pub async fn workspace(state: State<'_, Arc<Runtime>>) -> Reply {
    let runtime = state.inner().clone();
    worker(move || runtime.snapshot()).await
}

#[tauri::command]
pub async fn tool_connections(app: AppHandle) -> Reply {
    worker(move || integrations::status(&app)).await
}

#[tauri::command]
pub async fn connect_tool(app: AppHandle, host: String) -> Reply {
    worker(move || integrations::connect(&app, &host)).await
}
#[tauri::command]
pub async fn mutate(state: State<'_, Arc<Runtime>>, request: runtime::Mutation) -> Reply {
    let runtime = state.inner().clone();
    worker(move || runtime::mutate(&runtime, request)).await
}
#[tauri::command]
pub async fn choose_directory(app: AppHandle) -> Reply {
    worker(move || {
        let selected = app.dialog().file().blocking_pick_folder();
        let path = selected
            .map(|p| {
                p.into_path()
                    .map_err(|_| error("INVALID_DIRECTORY", "Choose a local folder."))
            })
            .transpose()?;
        Ok(json!(path))
    })
    .await
}
#[tauri::command]
pub async fn collect_records(state: State<'_, Arc<Runtime>>, project_id: String) -> Reply {
    public(runtime::collect(state.inner().clone(), project_id).await)
}
#[tauri::command]
pub async fn read_document(
    state: State<'_, Arc<Runtime>>,
    project_id: String,
    path: String,
    revision: Option<String>,
) -> Reply {
    let runtime = state.inner().clone();
    worker(move || {
        let project = lock(&runtime.repository)?.project(&project_id)?;
        silolink::documents::read(&project, &path, revision.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn import_plan(app: AppHandle) -> Reply {
    worker(move || {
        let Some(path) = app
            .dialog()
            .file()
            .add_filter("SiloLink change plan", &["json"])
            .blocking_pick_file()
        else {
            return Ok(Value::Null);
        };
        let path = path
            .into_path()
            .map_err(|_| error("INVALID_CHANGE_PLAN", "Choose a local plan file."))?;
        let mut bytes = vec![];
        std::fs::File::open(path)
            .and_then(|f| f.take(16 * 1024 * 1024 + 1).read_to_end(&mut bytes))
            .map_err(|e| {
                silolink::error::Error::io(
                    "PLAN_READ_FAILED",
                    "Cannot read the selected change plan.",
                    &e,
                )
            })?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err(error("INVALID_CHANGE_PLAN", "The plan is too large."));
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| error("INVALID_CHANGE_PLAN", "The file is not valid JSON."))
    })
    .await
}
#[tauri::command]
pub async fn check_plan(state: State<'_, Arc<Runtime>>, project_id: String, plan: Value) -> Reply {
    let runtime = state.inner().clone();
    worker(move || runtime.checked_plan(&project_id, plan)).await
}
#[tauri::command]
pub async fn apply_plan(
    app: AppHandle,
    state: State<'_, Arc<Runtime>>,
    project_id: String,
    plan_id: String,
) -> Reply {
    let runtime = state.inner().clone();
    worker(move || runtime.apply(&app, &project_id, &plan_id)).await
}
#[tauri::command]
pub async fn change_history(state: State<'_, Arc<Runtime>>, project_id: String) -> Reply {
    let runtime = state.inner().clone();
    worker(move || {
        let repo = lock(&runtime.repository)?;
        silolink::changes::list(&repo.project(&project_id)?, &repo.state_directory()?, None)
    })
    .await
}
#[tauri::command]
pub async fn undo_change(
    app: AppHandle,
    state: State<'_, Arc<Runtime>>,
    project_id: String,
    change_id: String,
) -> Reply {
    let runtime = state.inner().clone();
    worker(move || {
        let (p, dir) = {
            let repo = lock(&runtime.repository)?;
            (repo.project(&project_id)?, repo.state_directory()?)
        };
        silolink::changes::undo_with_progress(&p, &dir, &change_id, |stage, path| {
            let _ = app.emit("document-progress", json!({"stage":stage,"path":path}));
        })
    })
    .await
}
#[tauri::command]
pub async fn start_chat(
    app: AppHandle,
    state: State<'_, Arc<Runtime>>,
    request: ai::Request,
) -> Reply {
    let runtime = state.inner().clone();
    worker(move || ai::start(app, runtime, request).map(|id| json!({"id":id}))).await
}
#[tauri::command]
pub fn cancel_chat(state: State<'_, Arc<Runtime>>, id: String) -> Reply {
    public((|| {
        let jobs = lock(&state.jobs)?;
        let sender = jobs
            .get(&id)
            .ok_or_else(|| error("CHAT_NOT_RUNNING", "This request is no longer running."))?;
        sender
            .send(true)
            .map_err(|_| error("CHAT_NOT_RUNNING", "The request already ended."))?;
        Ok(json!({"cancelled":true}))
    })())
}
#[tauri::command]
pub fn open_reference(app: AppHandle, url: String) -> Reply {
    public((|| {
        let parsed = url::Url::parse(&url)
            .map_err(|_| error("INVALID_REFERENCE", "Choose an HTTP or HTTPS reference."))?;
        if !matches!(parsed.scheme(), "https" | "http")
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err(error(
                "INVALID_REFERENCE",
                "Only HTTP/HTTPS links without embedded credentials can be opened.",
            ));
        }
        app.opener()
            .open_url(parsed.as_str(), None::<&str>)
            .map_err(|_| {
                error(
                    "REFERENCE_OPEN_FAILED",
                    "Cannot open the reference in your browser.",
                )
            })?;
        Ok(Value::Null)
    })())
}
