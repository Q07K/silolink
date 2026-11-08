mod analysis;
pub mod detection;
pub mod discovery;
mod export;
pub mod planning;
pub mod rules;
pub use analysis::{analyze_records, human_requests, request_view, similarity};
pub use discovery::{AnalysisRun, Discovery};
pub use export::{project_report, write_report};
pub use planning::Estimate;

use crate::{
    error::{Error, Result},
    project::{self, Project},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;

const MAX_CONFIG: u64 = 16 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub state_directory: Option<String>,
    pub review_time: String,
    pub review_weekday: u32,
    pub timezone: String,
    pub immediate_notifications: bool,
    pub background_enabled: bool,
    pub collection_interval_secs: u64,
    pub theme: String,
    /// Runs model analysis after background collection; it uses the user's CLI quota.
    pub auto_analysis: bool,
    pub analysis_provider: String,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            state_directory: None,
            review_time: "20:30".into(),
            review_weekday: 6,
            timezone: "Asia/Seoul".into(),
            immediate_notifications: false,
            background_enabled: false,
            collection_interval_secs: 300,
            theme: "system".into(),
            auto_analysis: false,
            analysis_provider: "codex".into(),
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedProject {
    pub id: String,
    pub name: String,
    pub root: PathBuf,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub evidence_ids: Vec<String>,
    pub created_at: String,
    /// Learning progress the user sets: open, applying, done, or held.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// The discovery or chat this note came from.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin_id: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub url: String,
    pub kind: String,
    pub claim: String,
    pub conditions: String,
    pub version: String,
    pub verified: bool,
    pub recorded_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fetched: Option<FetchedReference>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedReference {
    pub url: String,
    pub title: String,
    pub text: String,
    pub fetched_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSpan {
    pub started_at: String,
    pub ended_at: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub phase: String,
    pub completed: bool,
    pub user_tested: bool,
    pub due_at: Option<String>,
    pub created_at: String,
    pub spans: Vec<TimeSpan>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin_id: Option<String>,
    #[serde(default)]
    pub estimates: Vec<Estimate>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub text: String,
    pub created_at: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub project_id: String,
    pub provider: String,
    pub context: String,
    #[serde(default)]
    pub evidence_ids: Vec<String>,
    pub messages: Vec<ChatMessage>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub status: String,
    pub error: Option<Value>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub created_at: String,
    pub read: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopData {
    pub schema_version: u32,
    pub settings: Settings,
    pub projects: Vec<LinkedProject>,
    pub notes: Vec<Note>,
    pub sources: Vec<Source>,
    pub tasks: Vec<Task>,
    pub chats: Vec<Chat>,
    pub notices: Vec<Notice>,
    pub seen_discoveries: Vec<String>,
    pub discoveries: Vec<Discovery>,
    pub analysis_runs: Vec<AnalysisRun>,
}
impl Default for DesktopData {
    fn default() -> Self {
        Self {
            schema_version: 1,
            settings: Settings::default(),
            projects: vec![],
            notes: vec![],
            sources: vec![],
            tasks: vec![],
            chats: vec![],
            notices: vec![],
            seen_discoveries: vec![],
            discoveries: vec![],
            analysis_runs: vec![],
        }
    }
}
pub struct Desktop {
    pub data: DesktopData,
    directory: PathBuf,
}
fn io(error: std::io::Error) -> Error {
    Error::io(
        "DESKTOP_STORAGE_FAILED",
        "Cannot read or save desktop settings; existing data was preserved.",
        &error,
    )
}
fn invalid(message: &str) -> Error {
    Error::new("INVALID_DESKTOP_INPUT", message)
}
fn text(value: &str, limit: usize) -> Result<()> {
    if value.trim().is_empty() || value.len() > limit {
        return Err(invalid("Text is missing or exceeds the allowed length."));
    }
    Ok(())
}
impl Desktop {
    pub fn open(directory: &Path) -> Result<Self> {
        if directory.exists() && project::linked(directory).map_err(io)? {
            return Err(invalid("Desktop storage must not be a link."));
        }
        let path = directory.join("workspace.json");
        let data = if path.symlink_metadata().is_ok() {
            if project::linked(&path).map_err(io)? {
                return Err(invalid("Desktop settings must not be a link."));
            }
            let mut bytes = Vec::new();
            File::open(&path)
                .map_err(io)?
                .take(MAX_CONFIG + 1)
                .read_to_end(&mut bytes)
                .map_err(io)?;
            if bytes.len() as u64 > MAX_CONFIG {
                return Err(invalid("Desktop settings exceed the size limit."));
            }
            let data: DesktopData = serde_json::from_slice(&bytes)
                .map_err(|_| invalid("Desktop settings are invalid; the file was preserved."))?;
            if data.schema_version != 1 {
                return Err(invalid("This desktop data version is not supported."));
            }
            validate_settings(&data.settings)?;
            data
        } else {
            DesktopData::default()
        };
        Ok(Self {
            data,
            directory: directory.to_owned(),
        })
    }
    pub fn commit(&mut self, next: DesktopData) -> Result<()> {
        validate_settings(&next.settings)?;
        let bytes = serde_json::to_vec_pretty(&next)
            .map_err(|_| invalid("Cannot encode desktop settings."))?;
        if bytes.len() as u64 > MAX_CONFIG {
            return Err(invalid("Desktop data exceeds the local storage limit."));
        }
        fs::create_dir_all(&self.directory).map_err(io)?;
        let filename = self.directory.join("workspace.json");
        if filename.exists() && project::linked(&filename).map_err(io)? {
            return Err(invalid("Desktop settings must not be a link."));
        }
        let staging = self
            .directory
            .join(format!("workspace-{}.tmp", Uuid::new_v4()));
        let result: Result<()> = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&staging)
                .map_err(io)?;
            file.write_all(&bytes).map_err(io)?;
            file.sync_all().map_err(io)?;
            drop(file);
            fs::rename(&staging, &filename).map_err(io)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&staging);
        }
        result?;
        self.data = next;
        Ok(())
    }
    pub fn save_settings(&mut self, settings: Settings) -> Result<()> {
        validate_settings(&settings)?;
        let mut next = self.data.clone();
        next.settings = settings;
        self.commit(next)
    }
    pub fn connect(&mut self, root: &Path, initialize: bool) -> Result<String> {
        let project = if initialize {
            project::init(root)?.0
        } else {
            project::read(root)?
        };
        if let Some(previous) = self.data.projects.iter().find(|p| p.id == project.id()) {
            if previous.root != project.root {
                return Err(Error::new(
                    "PROJECT_LOCATION_CONFLICT",
                    "This project is linked at a different location.",
                ));
            }
            return Ok(previous.id.clone());
        }
        let mut next = self.data.clone();
        next.projects.push(LinkedProject {
            id: project.id().into(),
            root: project.root.clone(),
            name: project.metadata["name"]
                .as_str()
                .unwrap_or("Project")
                .into(),
        });
        self.commit(next)?;
        Ok(project.id().into())
    }
    pub fn project(&self, id: &str) -> Result<Project> {
        let linked = self
            .data
            .projects
            .iter()
            .find(|p| p.id == id)
            .ok_or_else(|| invalid("Choose a linked project."))?;
        let project = project::read(&linked.root)?;
        if project.id() != id {
            return Err(Error::new(
                "PROJECT_LOCATION_CONFLICT",
                "The linked project identity changed.",
            ));
        }
        Ok(project)
    }
    pub fn state_directory(&self) -> Result<PathBuf> {
        self.data
            .settings
            .state_directory
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| {
                Error::new(
                    "STATE_DIRECTORY_REQUIRED",
                    "Choose where to store records and document backups first.",
                )
            })
    }
    pub fn add_note(
        &mut self,
        project_id: &str,
        kind: &str,
        title: &str,
        body: &str,
        evidence_ids: Vec<String>,
    ) -> Result<String> {
        self.add_note_from(project_id, kind, title, body, evidence_ids, None)
    }
    pub fn add_note_from(
        &mut self,
        project_id: &str,
        kind: &str,
        title: &str,
        body: &str,
        evidence_ids: Vec<String>,
        origin_id: Option<String>,
    ) -> Result<String> {
        self.project(project_id)?;
        text(title, 240)?;
        text(body, 200_000)?;
        if !matches!(
            kind,
            "learning" | "decision" | "rule" | "analysis" | "research"
        ) || evidence_ids.len() > 200
        {
            return Err(invalid("Invalid note kind or evidence scope."));
        }
        let id = Uuid::new_v4().to_string();
        let mut next = self.data.clone();
        next.notes.push(Note {
            id: id.clone(),
            project_id: project_id.into(),
            kind: kind.into(),
            title: title.trim().into(),
            body: body.into(),
            evidence_ids,
            created_at: project::now(),
            status: (kind == "learning").then(|| "open".into()),
            origin_id: origin_id.clone(),
        });
        if let Some(origin) = &origin_id {
            link(&mut next, origin, &id);
        }
        self.commit(next)?;
        Ok(id)
    }
    pub fn set_note_status(&mut self, id: &str, status: &str) -> Result<()> {
        if !matches!(status, "open" | "applying" | "done" | "held") {
            return Err(invalid("Choose a valid note status."));
        }
        let mut next = self.data.clone();
        let note = next
            .notes
            .iter_mut()
            .find(|n| n.id == id)
            .ok_or_else(|| invalid("Note not found."))?;
        note.status = Some(status.into());
        self.commit(next)
    }
    pub fn add_source(&mut self, mut source: Source) -> Result<String> {
        self.project(&source.project_id)?;
        text(&source.title, 240)?;
        text(&source.claim, 20_000)?;
        if !matches!(
            source.kind.as_str(),
            "official" | "paper" | "community" | "interpretation"
        ) || !source.url.starts_with("https://")
            || source.url.len() > 4096
            || source.conditions.len() > 20_000
            || source.version.len() > 200
        {
            return Err(invalid("Choose a source kind and an HTTPS reference."));
        }
        if let Some(fetched) = &source.fetched {
            text(&fetched.text, 100_000)?;
            if fetched.url != source.url
                || fetched.title.len() > 1000
                || chrono::DateTime::parse_from_rfc3339(&fetched.fetched_at).is_err()
            {
                return Err(invalid("The fetched reference does not match this source."));
            }
        }
        source.id = Uuid::new_v4().to_string();
        source.recorded_at = project::now();
        let id = source.id.clone();
        let mut next = self.data.clone();
        next.sources.push(source);
        self.commit(next)?;
        Ok(id)
    }
    pub fn export_notes(&self, project_id: &str, note_ids: &[String]) -> Result<String> {
        let project = self.project(project_id)?;
        if note_ids.is_empty() || note_ids.len() > 100 {
            return Err(invalid("Choose between 1 and 100 notes to export."));
        }
        let mut output = format!(
            "# SiloLink · {}\n\n",
            project.metadata["name"].as_str().unwrap_or("프로젝트")
        );
        let mut seen = std::collections::BTreeSet::new();
        for id in note_ids {
            if !seen.insert(id) {
                continue;
            }
            let note = self
                .data
                .notes
                .iter()
                .find(|note| &note.id == id && note.project_id == project_id)
                .ok_or_else(|| {
                    invalid("A selected note is missing or belongs to another project.")
                })?;
            output.push_str(&format!(
                "## {}\n\n{} · {}\n\n{}\n\n",
                note.title.replace(['\r', '\n'], " "),
                note.kind,
                note.created_at,
                note.body
            ));
            if !note.evidence_ids.is_empty() {
                output.push_str("### 연결된 원문 기록\n\n");
                for evidence in &note.evidence_ids {
                    output.push_str(&format!("- 원문 ID `{evidence}`\n"));
                }
                output.push('\n');
            }
        }
        Ok(output)
    }
    pub fn add_task(&mut self, project_id: &str, title: &str, phase: &str) -> Result<String> {
        self.add_task_from(project_id, title, phase, None)
    }
    pub fn add_task_from(
        &mut self,
        project_id: &str,
        title: &str,
        phase: &str,
        origin_id: Option<String>,
    ) -> Result<String> {
        self.project(project_id)?;
        text(title, 240)?;
        text(phase, 80)?;
        let id = Uuid::new_v4().to_string();
        let mut next = self.data.clone();
        next.tasks.push(Task {
            id: id.clone(),
            project_id: project_id.into(),
            title: title.trim().into(),
            phase: phase.into(),
            completed: false,
            user_tested: false,
            due_at: None,
            created_at: project::now(),
            spans: vec![],
            origin_id: origin_id.clone(),
            estimates: vec![],
        });
        if let Some(origin) = &origin_id {
            link(&mut next, origin, &id);
        }
        self.commit(next)?;
        Ok(id)
    }
    /// Records a new estimate only when it differs, so the history shows why it changed.
    pub fn estimate_task(&mut self, id: &str) -> Result<Value> {
        let task = self
            .data
            .tasks
            .iter()
            .find(|t| t.id == id)
            .ok_or_else(|| invalid("Task not found."))?
            .clone();
        let now = chrono::Utc::now().timestamp_millis();
        let references = planning::similar(&self.data.tasks, &task, now);
        let estimate = planning::estimate(&self.data.tasks, &task, now, &project::now());
        let changed = task.estimates.last().is_none_or(|last| {
            (
                last.low_minutes,
                last.median_minutes,
                last.high_minutes,
                &last.basis_task_ids,
            ) != (
                estimate.low_minutes,
                estimate.median_minutes,
                estimate.high_minutes,
                &estimate.basis_task_ids,
            )
        });
        if changed {
            let mut next = self.data.clone();
            let stored = next
                .tasks
                .iter_mut()
                .find(|t| t.id == id)
                .expect("task exists");
            stored.estimates.push(estimate.clone());
            if stored.estimates.len() > 20 {
                stored.estimates.remove(0);
            }
            self.commit(next)?;
        }
        Ok(serde_json::json!({"estimate":estimate,"references":references,"changed":changed}))
    }
    /// Merges discoveries by fingerprint, keeping the user's review; returns newly added IDs.
    pub fn merge_discoveries(&mut self, incoming: Vec<Discovery>) -> Result<Vec<String>> {
        let mut next = self.data.clone();
        let mut added = vec![];
        let mut changed = false;
        for discovery in incoming {
            match next
                .discoveries
                .iter_mut()
                .find(|d| d.fingerprint == discovery.fingerprint)
            {
                Some(existing) => {
                    let known: std::collections::BTreeSet<_> = existing
                        .evidence
                        .iter()
                        .map(|e| e.record_id.clone())
                        .collect();
                    let grew = discovery
                        .evidence
                        .iter()
                        .any(|e| !known.contains(&e.record_id));
                    if grew || existing.summary != discovery.summary {
                        existing.evidence = discovery.evidence;
                        existing.project_ids = discovery.project_ids;
                        existing.title = discovery.title;
                        existing.summary = discovery.summary;
                        existing.updated_at = discovery.updated_at;
                        changed = true;
                    }
                }
                None => {
                    added.push(discovery.id.clone());
                    next.discoveries.push(discovery);
                    changed = true;
                }
            }
        }
        // Bound storage: drop the oldest dismissed items first.
        while next.discoveries.len() > 500 {
            let index = next
                .discoveries
                .iter()
                .position(|d| d.status == "dismissed")
                .unwrap_or(0);
            next.discoveries.remove(index);
        }
        if changed {
            self.commit(next)?;
        }
        Ok(added)
    }
    /// Replaces app-computed discoveries: unreviewed ones whose basis disappeared are retired.
    pub fn sync_local_discoveries(&mut self, found: Vec<Discovery>) -> Result<Vec<String>> {
        let current: std::collections::BTreeSet<String> =
            found.iter().map(|d| d.fingerprint.clone()).collect();
        let stale =
            self.data.discoveries.iter().any(|d| {
                d.source == "local" && d.status == "new" && !current.contains(&d.fingerprint)
            });
        if stale {
            let mut next = self.data.clone();
            next.discoveries.retain(|d| {
                !(d.source == "local" && d.status == "new" && !current.contains(&d.fingerprint))
            });
            self.commit(next)?;
        }
        self.merge_discoveries(found)
    }
    pub fn review_discovery(
        &mut self,
        id: &str,
        status: &str,
        correction: Option<&str>,
    ) -> Result<()> {
        if !discovery::STATUSES.contains(&status)
            || correction.is_some_and(|c| c.len() > 4000)
            || (status == "corrected" && correction.is_none_or(|c| c.trim().is_empty()))
        {
            return Err(invalid("Choose a review status; a correction needs text."));
        }
        let mut next = self.data.clone();
        let item = next
            .discoveries
            .iter_mut()
            .find(|d| d.id == id)
            .ok_or_else(|| invalid("Discovery not found."))?;
        item.status = status.into();
        item.correction = correction
            .map(|c| c.trim().to_owned())
            .filter(|c| !c.is_empty());
        item.updated_at = project::now();
        self.commit(next)
    }
    pub fn begin_analysis(
        &mut self,
        provider: &str,
        project_ids: &[String],
        request_count: usize,
    ) -> Result<String> {
        if !matches!(provider, "codex" | "claude")
            || project_ids.is_empty()
            || project_ids.len() > 10
        {
            return Err(invalid("Choose a supported provider and 1-10 projects."));
        }
        if self
            .data
            .analysis_runs
            .iter()
            .any(|r| r.status == "running")
        {
            return Err(Error::new(
                "ANALYSIS_RUNNING",
                "An analysis is already running.",
            ));
        }
        let id = Uuid::new_v4().to_string();
        let mut next = self.data.clone();
        next.analysis_runs.push(AnalysisRun {
            id: id.clone(),
            provider: provider.into(),
            project_ids: project_ids.to_vec(),
            status: "running".into(),
            started_at: project::now(),
            ended_at: None,
            request_count,
            discovery_count: 0,
            rejected_count: 0,
            error: None,
        });
        if next.analysis_runs.len() > 50 {
            next.analysis_runs.remove(0);
        }
        self.commit(next)?;
        Ok(id)
    }
    pub fn finish_analysis(
        &mut self,
        id: &str,
        outcome: std::result::Result<(Vec<Discovery>, usize), Error>,
    ) -> Result<Vec<String>> {
        let (status, error, found, rejected) = match outcome {
            Ok((found, rejected)) => ("completed", None, found, rejected),
            Err(e) => (
                if e.code == "AI_CANCELLED" {
                    "cancelled"
                } else {
                    "failed"
                },
                Some(e.json()),
                vec![],
                0,
            ),
        };
        let count = found.len();
        let added = self.merge_discoveries(found)?;
        let mut next = self.data.clone();
        let run = next
            .analysis_runs
            .iter_mut()
            .find(|r| r.id == id)
            .ok_or_else(|| invalid("Analysis run not found."))?;
        run.status = status.into();
        run.ended_at = Some(project::now());
        run.discovery_count = count;
        run.rejected_count = rejected;
        run.error = error;
        self.commit(next)?;
        Ok(added)
    }
    pub fn complete_task(&mut self, id: &str, completed: bool, user_tested: bool) -> Result<()> {
        let mut next = self.data.clone();
        let task = next
            .tasks
            .iter_mut()
            .find(|t| t.id == id)
            .ok_or_else(|| invalid("Task not found."))?;
        task.completed = completed;
        task.user_tested = user_tested;
        if completed {
            for span in &mut task.spans {
                if span.ended_at.is_none() {
                    span.ended_at = Some(project::now());
                }
            }
        }
        self.commit(next)
    }
    pub fn schedule_task(&mut self, id: &str, due_at: Option<&str>) -> Result<()> {
        if due_at.is_some_and(|time| chrono::DateTime::parse_from_rfc3339(time).is_err()) {
            return Err(invalid("Choose a valid date and time."));
        }
        let mut next = self.data.clone();
        let task = next
            .tasks
            .iter_mut()
            .find(|t| t.id == id)
            .ok_or_else(|| invalid("Task not found."))?;
        task.due_at = due_at.map(str::to_owned);
        self.commit(next)
    }
    pub fn timer(&mut self, id: &str, running: bool) -> Result<()> {
        if !self.data.tasks.iter().any(|t| t.id == id) {
            return Err(invalid("Task not found."));
        }
        let mut next = self.data.clone();
        let now = project::now();
        for task in &mut next.tasks {
            for span in &mut task.spans {
                if span.ended_at.is_none() {
                    span.ended_at = Some(now.clone());
                }
            }
        }
        if running {
            let task = next
                .tasks
                .iter_mut()
                .find(|t| t.id == id)
                .expect("task exists");
            if task.completed {
                return Err(invalid("Reopen the task before starting its timer."));
            }
            task.spans.push(TimeSpan {
                started_at: now,
                ended_at: None,
            });
        }
        self.commit(next)
    }
    pub fn mark_notices_read(&mut self) -> Result<()> {
        let mut next = self.data.clone();
        for n in &mut next.notices {
            n.read = true;
        }
        self.commit(next)
    }
    pub fn record_notice(&mut self, id: &str, kind: &str, title: &str) -> Result<bool> {
        if self.data.seen_discoveries.iter().any(|seen| seen == id) {
            return Ok(false);
        }
        let mut next = self.data.clone();
        next.seen_discoveries.push(id.into());
        next.notices.push(Notice {
            id: id.into(),
            kind: kind.into(),
            title: title.into(),
            created_at: project::now(),
            read: false,
        });
        self.commit(next)?;
        Ok(true)
    }
    pub fn begin_chat(
        &mut self,
        project_id: &str,
        provider: &str,
        context: &str,
        question: &str,
        evidence_ids: Vec<String>,
    ) -> Result<String> {
        self.project(project_id)?;
        text(question, 16_000)?;
        if !matches!(provider, "codex" | "claude") || context.len() > 64_000 {
            return Err(invalid("Invalid provider or context size."));
        }
        let now = project::now();
        let id = Uuid::new_v4().to_string();
        let mut next = self.data.clone();
        next.chats.push(Chat {
            id: id.clone(),
            project_id: project_id.into(),
            provider: provider.into(),
            context: context.into(),
            evidence_ids,
            messages: vec![ChatMessage {
                role: "user".into(),
                text: question.into(),
                created_at: now.clone(),
            }],
            started_at: now,
            ended_at: None,
            status: "running".into(),
            error: None,
        });
        self.commit(next)?;
        Ok(id)
    }
    pub fn finish_chat(
        &mut self,
        id: &str,
        outcome: std::result::Result<String, Error>,
    ) -> Result<()> {
        let mut next = self.data.clone();
        let chat = next
            .chats
            .iter_mut()
            .find(|c| c.id == id)
            .ok_or_else(|| invalid("Chat not found."))?;
        chat.ended_at = Some(project::now());
        match outcome {
            Ok(answer) => {
                chat.status = "completed".into();
                chat.messages.push(ChatMessage {
                    role: "assistant".into(),
                    text: answer,
                    created_at: project::now(),
                });
            }
            Err(error) => {
                chat.status = if error.code == "AI_CANCELLED" {
                    "cancelled"
                } else {
                    "failed"
                }
                .into();
                chat.error = Some(error.json());
            }
        }
        self.commit(next)
    }
    pub fn json(&self) -> Value {
        serde_json::to_value(&self.data).expect("desktop JSON")
    }
}
fn link(data: &mut DesktopData, origin: &str, item: &str) {
    if let Some(discovery) = data.discoveries.iter_mut().find(|d| d.id == origin)
        && !discovery.follow_ups.iter().any(|f| f == item)
    {
        discovery.follow_ups.push(item.into());
        if discovery.status == "new" {
            discovery.status = "accepted".into();
        }
    }
}
fn validate_settings(settings: &Settings) -> Result<()> {
    if settings.review_time.len() != 5
        || chrono::NaiveTime::parse_from_str(&settings.review_time, "%H:%M").is_err()
        || settings.review_weekday > 6
        || !matches!(settings.timezone.as_str(), "Asia/Seoul" | "UTC")
        || !matches!(settings.theme.as_str(), "system" | "light" | "dark")
        || !matches!(settings.analysis_provider.as_str(), "codex" | "claude")
        || !(30..=86400).contains(&settings.collection_interval_secs)
        || settings
            .state_directory
            .as_ref()
            .is_some_and(|p| !Path::new(p).is_absolute())
    {
        return Err(invalid(
            "Invalid review time, timezone, theme, interval, or storage location.",
        ));
    }
    Ok(())
}
