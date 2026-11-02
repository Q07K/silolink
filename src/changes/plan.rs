use crate::{
    error::{Error, Result},
    project::{self, Project},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub(super) const MAX_FILE: usize = 2 * 1024 * 1024;
const MAX_PLAN: usize = 16 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Plan {
    pub schema_version: u32,
    pub id: String,
    pub project_id: String,
    pub rationale: String,
    pub operations: Vec<Operation>,
    #[serde(default)]
    pub guards: Vec<Guard>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Operation {
    pub path: String,
    pub expected_revision: Option<String>,
    pub content: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Guard {
    pub path: String,
    pub expected_revision: String,
}
#[derive(Clone)]
pub(super) struct Snapshot {
    pub text: Option<String>,
    pub mode: Option<u32>,
}
impl Snapshot {
    pub fn revision(&self) -> Option<String> {
        self.text.as_deref().map(hash)
    }
}
pub(super) fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
pub(super) fn invalid(message: &str) -> Error {
    Error::new("INVALID_CHANGE_PLAN", message)
}
pub(super) fn io(error: std::io::Error) -> Error {
    Error::io(
        "DOCUMENT_IO_FAILED",
        "Cannot inspect or change the selected document.",
        &error,
    )
}
pub(super) fn uuid(value: &str) -> bool {
    Uuid::parse_str(value).is_ok() && value.len() == 36 && value.to_ascii_lowercase() == value
}
pub(super) fn digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub(super) fn validate_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.len() > 1024
        || path.contains('\\')
        || path.contains(':')
        || path.chars().any(char::is_control)
    {
        return Err(invalid("Use a portable project-relative Markdown path."));
    }
    for part in path.split('/') {
        let lower = part.to_ascii_lowercase();
        let stem = lower.split('.').next().unwrap_or("");
        let reserved = matches!(stem, "con" | "prn" | "aux" | "nul")
            || (stem.len() == 4
                && (stem.starts_with("com") || stem.starts_with("lpt"))
                && matches!(stem.as_bytes()[3], b'1'..=b'9'));
        if part.is_empty()
            || matches!(part, "." | "..")
            || part.ends_with(['.', ' '])
            || part.contains(['<', '>', '"', '|', '?', '*'])
            || reserved
            || matches!(
                lower.as_str(),
                ".git"
                    | ".silolink"
                    | ".tools"
                    | "node_modules"
                    | "target"
                    | "vendor"
                    | "dist"
                    | "build"
                    | ".venv"
                    | "venv"
                    | ".next"
            )
        {
            return Err(invalid(
                "The change path is ambiguous, reserved, or protected.",
            ));
        }
    }
    if !Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
    {
        return Err(invalid("Document changes are limited to Markdown files."));
    }
    Ok(())
}
impl Plan {
    pub fn read(project: &Project, filename: &Path) -> Result<Self> {
        if project::linked(filename).map_err(io)? || !fs::metadata(filename).map_err(io)?.is_file()
        {
            return Err(invalid("The plan must be a regular file, not a link."));
        }
        let mut bytes = Vec::new();
        File::open(filename)
            .map_err(io)?
            .take((MAX_PLAN + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(io)?;
        if bytes.len() > MAX_PLAN {
            return Err(invalid("The plan exceeds 16 MiB."));
        }
        let value: Value = serde_json::from_slice(&bytes)
            .map_err(|_| invalid("The plan must be valid UTF-8 JSON."))?;
        if value["operations"].as_array().is_none_or(|ops| {
            ops.iter().any(|op| {
                !op.as_object().is_some_and(|o| {
                    o.contains_key("content") && o.contains_key("expectedRevision")
                })
            })
        }) {
            return Err(invalid(
                "Each operation requires explicit content and expectedRevision; null means deletion or expected absence.",
            ));
        }
        let plan: Self = serde_json::from_value(value)
            .map_err(|_| invalid("The plan fields are incomplete or unsupported."))?;
        plan.validate(project)?;
        Ok(plan)
    }
    pub fn validate(&self, project: &Project) -> Result<()> {
        if self.schema_version != 1
            || !uuid(&self.id)
            || self.project_id != project.id()
            || self.rationale.trim().is_empty()
            || self.rationale.len() > 8192
            || self.operations.is_empty()
            || self.operations.len() > 128
            || self.guards.len() > 256
        {
            return Err(invalid(
                "Check the plan version, IDs, rationale, and operation limits.",
            ));
        }
        let mut paths = BTreeSet::new();
        let mut bytes = 0;
        for op in &self.operations {
            validate_path(&op.path)?;
            if !paths.insert(op.path.to_lowercase())
                || op.expected_revision.as_deref().is_some_and(|s| !digest(s))
                || (op.expected_revision.is_none() && op.content.is_none())
                || op.content.as_ref().is_some_and(|s| {
                    s.len() > MAX_FILE || op.expected_revision.as_deref() == Some(hash(s).as_str())
                })
            {
                return Err(invalid(
                    "The plan contains duplicate paths, invalid hashes, oversized content, or an operation without a change.",
                ));
            }
            bytes += op.content.as_ref().map_or(0, String::len);
        }
        for guard in &self.guards {
            validate_path(&guard.path)?;
            if !digest(&guard.expected_revision) || !paths.insert(guard.path.to_lowercase()) {
                return Err(invalid(
                    "Read dependencies require unique paths and SHA-256 revisions.",
                ));
            }
        }
        if bytes > 8 * 1024 * 1024 {
            return Err(invalid("The plan exceeds 8 MiB of new document text."));
        }
        // File-vs-directory overlaps are never valid document operations.
        for a in &paths {
            if paths
                .iter()
                .any(|b| b != a && b.starts_with(&format!("{a}/")))
            {
                return Err(invalid("Change paths overlap as a file and directory."));
            }
        }
        Ok(())
    }
    pub fn canonical(&self) -> String {
        serde_json::to_string(self).expect("change plan JSON")
    }
}
pub(super) fn target(project: &Project, path: &str) -> Result<PathBuf> {
    validate_path(path)?;
    let mut current = project.root.clone();
    let parts: Vec<_> = path.split('/').collect();
    for (i, part) in parts.iter().enumerate() {
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(metadata) => {
                if project::linked(&current).map_err(io)? {
                    return Err(Error::new(
                        "DOCUMENT_PATH_CONFLICT",
                        "Linked document paths are preserved.",
                    ));
                }
                if i + 1 < parts.len() {
                    if !metadata.is_dir()
                        || current
                            .join(".silolink/project.json")
                            .symlink_metadata()
                            .is_ok()
                    {
                        return Err(Error::new(
                            "DOCUMENT_PATH_CONFLICT",
                            "A parent is not a directory or belongs to another project.",
                        ));
                    }
                } else if !metadata.is_file() {
                    return Err(Error::new(
                        "DOCUMENT_PATH_CONFLICT",
                        "A document target is not a regular file.",
                    ));
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(io(e)),
        }
    }
    Ok(current)
}
pub(super) fn snapshot(project: &Project, path: &str) -> Result<Snapshot> {
    let target = target(project, path)?;
    let metadata = match fs::metadata(&target) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Snapshot {
                text: None,
                mode: None,
            });
        }
        Err(e) => return Err(io(e)),
    };
    let mut bytes = Vec::new();
    File::open(&target)
        .map_err(io)?
        .take((MAX_FILE + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(io)?;
    if bytes.len() > MAX_FILE {
        return Err(invalid("An existing document exceeds 2 MiB."));
    }
    let text = String::from_utf8(bytes)
        .map_err(|_| invalid("Only UTF-8 documents can be changed; the source was preserved."))?;
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode()
    };
    #[cfg(not(unix))]
    let mode = u32::from(metadata.permissions().readonly());
    Ok(Snapshot {
        text: Some(text),
        mode: Some(mode),
    })
}
pub(super) fn guards(project: &Project, plan: &Plan) -> Vec<Value> {
    plan.guards.iter().filter_map(|guard| match snapshot(project,&guard.path) {
        Ok(current) if current.revision().as_deref()==Some(&guard.expected_revision)=>None,
        Ok(current)=>Some(json!({"path":guard.path,"code":"DOCUMENT_REVISION_CONFLICT","expectedRevision":guard.expected_revision,"currentRevision":current.revision()})),
        Err(error)=>Some(json!({"path":guard.path,"error":error.json()}))
    }).collect()
}
pub(super) fn preflight(project: &Project, plan: &Plan) -> (Vec<Snapshot>, Vec<Value>) {
    let mut snapshots = Vec::new();
    let mut conflicts = guards(project, plan);
    let mut total = 0;
    for op in &plan.operations {
        match snapshot(project, &op.path) {
            Ok(current) => {
                total += current.text.as_ref().map_or(0, String::len);
                if current.revision() != op.expected_revision {
                    conflicts.push(json!({"path":op.path,"code":"DOCUMENT_REVISION_CONFLICT","expectedRevision":op.expected_revision,"currentRevision":current.revision()}));
                }
                snapshots.push(current);
            }
            Err(error) => {
                conflicts.push(json!({"path":op.path,"error":error.json()}));
                snapshots.push(Snapshot {
                    text: None,
                    mode: None,
                });
            }
        }
    }
    if total > 8 * 1024 * 1024 {
        conflicts.push(json!({"code":"DOCUMENT_BACKUP_LIMIT"}));
    }
    (snapshots, conflicts)
}
