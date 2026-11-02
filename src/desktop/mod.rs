mod analysis;
pub use analysis::analyze_records;

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
        });
        self.commit(next)?;
        Ok(id)
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
        source.id = Uuid::new_v4().to_string();
        source.recorded_at = project::now();
        let id = source.id.clone();
        let mut next = self.data.clone();
        next.sources.push(source);
        self.commit(next)?;
        Ok(id)
    }
    pub fn add_task(&mut self, project_id: &str, title: &str, phase: &str) -> Result<String> {
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
        });
        self.commit(next)?;
        Ok(id)
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
fn validate_settings(settings: &Settings) -> Result<()> {
    if settings.review_time.len() != 5
        || chrono::NaiveTime::parse_from_str(&settings.review_time, "%H:%M").is_err()
        || settings.review_weekday > 6
        || !matches!(settings.timezone.as_str(), "Asia/Seoul" | "UTC")
        || !matches!(settings.theme.as_str(), "system" | "light" | "dark")
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
