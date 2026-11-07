use serde::Deserialize;
use serde_json::{Value, json};
use silolink::{
    desktop::{Desktop, Settings, Source, analyze_records},
    error::{Error, Result},
    project,
};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

pub struct Runtime {
    pub repository: Mutex<Desktop>,
    pub directory: PathBuf,
    default_state_directory: PathBuf,
    pub collection_settings_changed: watch::Sender<()>,
    pub jobs: Mutex<HashMap<String, watch::Sender<bool>>>,
    reviewed: Mutex<HashMap<String, (String, PathBuf)>>,
    registry: PathBuf,
    connection_errors: Mutex<Vec<Value>>,
    pub search: Mutex<silolink::documents::SearchIndex>,
}
pub fn error(code: &'static str, message: &str) -> Error {
    Error::new(code, message)
}
pub fn lock<T>(value: &Mutex<T>) -> Result<MutexGuard<'_, T>> {
    value.lock().map_err(|_| {
        error(
            "DESKTOP_STATE_FAILED",
            "Desktop state is unavailable; restart the application.",
        )
    })
}
impl Runtime {
    pub fn open(directory: &Path, default_state_directory: PathBuf) -> Result<Self> {
        let mut repository = Desktop::open(directory)?;
        // An interrupted provider process must not stay 'running' after a restart.
        let mut next = repository.data.clone();
        let mut changed = false;
        for chat in &mut next.chats {
            if chat.status == "running" {
                chat.status = "interrupted".into();
                chat.ended_at = Some(project::now());
                changed = true;
            }
        }
        for run in &mut next.analysis_runs {
            if run.status == "running" {
                run.status = "interrupted".into();
                run.ended_at = Some(project::now());
                changed = true;
            }
        }
        if changed {
            repository.commit(next)?;
        }
        Ok(Self {
            repository: Mutex::new(repository),
            directory: directory.into(),
            default_state_directory,
            collection_settings_changed: watch::channel(()).0,
            jobs: Mutex::new(HashMap::new()),
            reviewed: Mutex::new(HashMap::new()),
            registry: silolink::registry::directory()?,
            connection_errors: Mutex::new(Vec::new()),
            search: Mutex::new(silolink::documents::SearchIndex::default()),
        })
    }
    pub fn state_directory<'a>(&'a self, settings: &'a Settings) -> &'a Path {
        settings
            .state_directory
            .as_deref()
            .map(Path::new)
            .unwrap_or(&self.default_state_directory)
    }
    pub fn snapshot(&self) -> Result<Value> {
        self.sync_projects()?;
        let data = lock(&self.repository)?.data.clone();
        let connection_errors = lock(&self.connection_errors)?.clone();
        let mut inventories = vec![];
        let mut collections = vec![];
        let mut records = vec![];
        let directory = self.state_directory(&data.settings);
        for linked in &data.projects {
            let project = match project::read(&linked.root) {
                Ok(p) if p.id() == linked.id => p,
                Ok(_) => {
                    inventories.push(json!({"projectId":linked.id,"error":{"code":"PROJECT_LOCATION_CONFLICT","message":"The project identity changed."}}));
                    continue;
                }
                Err(e) => {
                    inventories.push(json!({"projectId":linked.id,"error":e.json()}));
                    continue;
                }
            };
            match silolink::documents::scan(&project) {
                Ok(report) => inventories.push(json!({"projectId":linked.id,"report":report})),
                Err(e) => inventories.push(json!({"projectId":linked.id,"error":e.json()})),
            };
            match silolink::sync::read(&project, directory, "all") {
                Ok(report) => {
                    if let Some(items) = report["records"].as_array() {
                        records.extend(items.clone());
                    }
                    collections.push(json!({"projectId":linked.id,"lastRun":report["lastRun"]}));
                }
                Err(e) if e.code == "STORE_NOT_INITIALIZED" => (),
                Err(e) => collections.push(json!({"projectId":linked.id,"error":e.json()})),
            }
        }
        let analysis = analyze_records(&records);
        // Deterministic discoveries are refreshed with every read; reviews are preserved.
        let added = crate::insight::refresh_local(self, &records, &analysis)?;
        if !added.is_empty() {
            let mut repo = lock(&self.repository)?;
            for (_, fingerprint, title) in &added {
                repo.record_notice(
                    &format!("discovery:{fingerprint}"),
                    "discovery",
                    &format!("새 발견: {title}"),
                )?;
            }
        }
        let data = lock(&self.repository)?.data.clone();
        Ok(
            json!({"workspace":data,"defaultStateDirectory":self.default_state_directory,"inventories":inventories,"collections":collections,"records":records,"analysis":analysis,"projectConnectionErrors":connection_errors,"loadedAt":project::now()}),
        )
    }
    pub fn sync_projects(&self) -> Result<bool> {
        let mut repository = lock(&self.repository)?;
        let report = silolink::registry::import(&self.registry, &mut repository);
        let (added, errors) = match report {
            Ok(report) => (report.added, report.errors),
            Err(error) => (
                0,
                vec![json!({"registration":self.registry,"error":error.json()})],
            ),
        };
        let mut previous = lock(&self.connection_errors)?;
        let changed = added > 0 || *previous != errors;
        *previous = errors;
        Ok(changed)
    }
    pub fn checked_plan(&self, project_id: &str, plan: Value) -> Result<Value> {
        let project = lock(&self.repository)?.project(project_id)?;
        let id = plan["id"]
            .as_str()
            .filter(|id| uuid::Uuid::parse_str(id).is_ok() && id.len() == 36)
            .ok_or_else(|| error("INVALID_CHANGE_PLAN", "A valid plan ID is required."))?
            .to_owned();
        if plan["projectId"] != project_id {
            return Err(error(
                "PROJECT_MISMATCH",
                "The change plan belongs to another project.",
            ));
        }
        let bytes = serde_json::to_vec(&plan)
            .map_err(|_| error("INVALID_CHANGE_PLAN", "Invalid plan JSON."))?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err(error(
                "INVALID_CHANGE_PLAN",
                "The plan exceeds the size limit.",
            ));
        }
        let directory = self.directory.join("reviewed-plans");
        fs::create_dir_all(&directory).map_err(storage_error)?;
        let path = directory.join(format!("{id}.json"));
        match OpenOptions::new().create_new(true).write(true).open(&path) {
            Ok(mut file) => {
                file.write_all(&bytes).map_err(storage_error)?;
                file.sync_all().map_err(storage_error)?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if project::linked(&path).map_err(storage_error)?
                    || fs::read(&path).map_err(storage_error)? != bytes
                {
                    return Err(error(
                        "DOCUMENT_PLAN_ID_CONFLICT",
                        "This plan ID already identifies other content.",
                    ));
                }
            }
            Err(e) => return Err(storage_error(e)),
        }
        let result = silolink::changes::check(&project, &path)?;
        if result["changeState"] == "ready" {
            lock(&self.reviewed)?.insert(id, (project_id.into(), path));
        }
        Ok(result)
    }
    pub fn apply(&self, app: &AppHandle, project_id: &str, plan_id: &str) -> Result<Value> {
        let (project, state) = {
            let repo = lock(&self.repository)?;
            (
                repo.project(project_id)?,
                self.state_directory(&repo.data.settings).to_owned(),
            )
        };
        let (scope, path) = lock(&self.reviewed)?.get(plan_id).cloned().ok_or_else(|| {
            error(
                "PLAN_REVIEW_REQUIRED",
                "Review this change in the desktop before applying it.",
            )
        })?;
        if scope != project_id {
            return Err(error(
                "PROJECT_MISMATCH",
                "The reviewed plan belongs to another project.",
            ));
        }
        silolink::changes::apply_with_progress(&project, &path, &state, |stage, path| {
            let _ = app.emit(
                "document-progress",
                json!({"stage":stage,"path":path,"projectId":project_id}),
            );
        })
    }
}
fn storage_error(e: std::io::Error) -> Error {
    Error::io(
        "DESKTOP_STORAGE_FAILED",
        "Cannot access the desktop change plan.",
        &e,
    )
}

#[derive(Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Mutation {
    Connect {
        path: String,
        initialize: bool,
    },
    Settings {
        settings: Settings,
    },
    Note {
        project_id: String,
        kind: String,
        title: String,
        body: String,
        evidence_ids: Vec<String>,
        #[serde(default)]
        origin_id: Option<String>,
    },
    NoteStatus {
        id: String,
        status: String,
    },
    ReviewDiscovery {
        id: String,
        status: String,
        #[serde(default)]
        correction: Option<String>,
    },
    Source {
        source: Source,
    },
    AddTask {
        project_id: String,
        title: String,
        phase: String,
        #[serde(default)]
        origin_id: Option<String>,
    },
    UpdateTask {
        id: String,
        completed: bool,
        user_tested: bool,
    },
    Timer {
        id: String,
        running: bool,
    },
    ScheduleTask {
        id: String,
        due_at: Option<String>,
    },
    ReadNotices,
}
pub fn mutate(runtime: &Runtime, request: Mutation) -> Result<Value> {
    let mut repo = lock(&runtime.repository)?;
    let id = match request {
        Mutation::Connect { path, initialize } => Some(repo.connect(Path::new(&path), initialize)?),
        Mutation::Settings { settings } => {
            let previous = &repo.data.settings;
            let collection_changed = settings.background_enabled != previous.background_enabled
                || runtime.state_directory(&settings) != runtime.state_directory(previous);
            repo.save_settings(settings)?;
            if collection_changed {
                runtime.collection_settings_changed.send_replace(());
            }
            None
        }
        Mutation::Note {
            project_id,
            kind,
            title,
            body,
            evidence_ids,
            origin_id,
        } => {
            Some(repo.add_note_from(&project_id, &kind, &title, &body, evidence_ids, origin_id)?)
        }
        Mutation::NoteStatus { id, status } => {
            repo.set_note_status(&id, &status)?;
            None
        }
        Mutation::ReviewDiscovery {
            id,
            status,
            correction,
        } => {
            repo.review_discovery(&id, &status, correction.as_deref())?;
            None
        }
        Mutation::Source { source } => Some(repo.add_source(source)?),
        Mutation::AddTask {
            project_id,
            title,
            phase,
            origin_id,
        } => Some(repo.add_task_from(&project_id, &title, &phase, origin_id)?),
        Mutation::UpdateTask {
            id,
            completed,
            user_tested,
        } => {
            repo.complete_task(&id, completed, user_tested)?;
            None
        }
        Mutation::Timer { id, running } => {
            repo.timer(&id, running)?;
            None
        }
        Mutation::ScheduleTask { id, due_at } => {
            repo.schedule_task(&id, due_at.as_deref())?;
            None
        }
        Mutation::ReadNotices => {
            repo.mark_notices_read()?;
            None
        }
    };
    Ok(json!({"id":id}))
}
pub async fn collect(runtime: &Runtime, project_id: &str, background: bool) -> Result<Value> {
    let (project, state) = {
        let repo = lock(&runtime.repository)?;
        if background && !repo.data.settings.background_enabled {
            return Err(error(
                "COLLECTION_DISABLED",
                "Background collection is off.",
            ));
        }
        (
            repo.project(project_id)?,
            runtime.state_directory(&repo.data.settings).to_owned(),
        )
    };
    silolink::sync::collect(&project, &state, "all", 1000).await
}
