mod journal;
mod plan;

use crate::{
    documents,
    error::{Error, Result},
    project::{self, Project},
};
use journal::{Change, Entry, Journal};
use plan::{Plan, Snapshot};
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions, TryLockError},
    io::{Read, Write},
    path::{Path, PathBuf},
};

fn lock(project: &Project, create: bool) -> Result<Option<File>> {
    let filename = project.root.join(".silolink/document-changes.lock");
    match project::linked(&filename) {
        Ok(true) => {
            return Err(Error::new(
                "DOCUMENT_LOCK_CONFLICT",
                "The document lock is a linked path.",
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound && !create => return Ok(None),
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(plan::io(e)),
        _ => (),
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(create)
        .truncate(false)
        .open(filename)
        .map_err(plan::io)?;
    match file.try_lock() {
        Ok(()) => Ok(Some(file)),
        Err(TryLockError::WouldBlock) => Err(Error::new(
            "DOCUMENT_CHANGE_BUSY",
            "Another document change is running for this project.",
        )),
        Err(TryLockError::Error(error)) => Err(plan::io(error)),
    }
}
fn active(project: &Project) -> Result<bool> {
    match lock(project, false) {
        Ok(_) => Ok(false),
        Err(e) if e.code == "DOCUMENT_CHANGE_BUSY" => Ok(true),
        Err(e) => Err(e),
    }
}
fn conflict_report(id: &str, conflicts: Vec<Value>) -> Value {
    json!({"schemaVersion":1,"status":"failed","changeId":id,"changeState":"conflict","conflicts":conflicts})
}
fn stage(project: &Project, change: &Change, index: usize, undo: bool) -> Result<PathBuf> {
    let filename = plan::target(project, &change.entries[index].path)?;
    Ok(filename.parent().expect("document parent").join(format!(
        ".silolink-{}-{index}-{}.tmp",
        change.plan.id,
        if undo { "undo" } else { "apply" }
    )))
}
fn cleanup_stage(
    project: &Project,
    change: &Change,
    index: usize,
    undo: bool,
    owned: bool,
) -> Result<()> {
    let filename = stage(project, change, index, undo)?;
    let metadata = match fs::symlink_metadata(&filename) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(plan::io(e)),
    };
    if !owned || project::linked(&filename).map_err(plan::io)? || !metadata.is_file() {
        return Err(Error::new(
            "DOCUMENT_STAGING_CONFLICT",
            "An unrecognized staging file was preserved.",
        ));
    }
    let expected = if undo {
        &change.entries[index].before
    } else {
        &change.entries[index].after
    };
    let Some(expected) = expected else {
        return Err(Error::new(
            "DOCUMENT_STAGING_CONFLICT",
            "An unexpected staging file was preserved.",
        ));
    };
    let mut bytes = Vec::new();
    File::open(&filename)
        .map_err(plan::io)?
        .take((plan::MAX_FILE + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(plan::io)?;
    if !expected.as_bytes().starts_with(&bytes) {
        return Err(Error::new(
            "DOCUMENT_STAGING_CONFLICT",
            "The staging file was edited outside this change.",
        ));
    }
    #[cfg(windows)]
    if metadata.permissions().readonly() {
        let mut permissions = metadata.permissions();
        // Windows-only: clear the DOS readonly bit on our own staging file.
        // This code is never compiled on Unix, where the lint's mode warning applies.
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        fs::set_permissions(&filename, permissions).map_err(plan::io)?;
    }
    fs::remove_file(filename).map_err(plan::io)
}
fn same(current: &Snapshot, text: &Option<String>) -> bool {
    current.text == *text
}
fn entry_state(project: &Project, entry: &Entry) -> Result<&'static str> {
    let current = plan::snapshot(project, &entry.path)?;
    Ok(if same(&current, &entry.before) {
        "before"
    } else if same(&current, &entry.after) {
        "after"
    } else {
        "external-change"
    })
}
fn allowed(entry: &Entry, current: &str, undo: bool) -> bool {
    if undo {
        match entry.phase.as_str() {
            "pending" | "reverted" => current == "before",
            "writing" | "reverting" => matches!(current, "before" | "after"),
            "applied" => current == "after",
            _ => false,
        }
    } else {
        match entry.phase.as_str() {
            "pending" => current == "before",
            "writing" => matches!(current, "before" | "after"),
            "applied" => current == "after",
            _ => false,
        }
    }
}
fn conflicts(project: &Project, change: &Change, undo: bool) -> Vec<Value> {
    let mut result = if undo || change.state == "applied" {
        Vec::new()
    } else {
        plan::guards(project, &change.plan)
    };
    for entry in &change.entries {
        match entry_state(project,entry){
            Ok(current)if allowed(entry,current,undo)=>(),
            Ok(current)=>result.push(json!({"path":entry.path,"code":"DOCUMENT_REVISION_CONFLICT","currentState":current})),
            Err(error)=>result.push(json!({"path":entry.path,"error":error.json()}))
        }
    }
    result
}
fn summarize_links(report: &Value) -> Value {
    let missing:Vec<_>=report["documents"].as_array().expect("document report").iter().flat_map(|doc|doc["links"].as_array().expect("document links").iter().filter(|link|link["status"]=="missing").map(|link|json!({"source":doc["path"],"line":link["line"],"destination":link["destination"]}))).collect();
    json!({"brokenLinks":missing,"coverage":report["coverage"],"warnings":report["warnings"],"scanStatus":report["status"]})
}
fn link_snapshot(project: &Project) -> Result<Value> {
    Ok(summarize_links(&documents::scan(project)?))
}
fn validate_links(project: &Project, baseline: &Value) -> Result<Value> {
    let current = link_snapshot(project)?;
    let old = baseline["brokenLinks"].as_array().ok_or_else(|| {
        Error::new(
            "INVALID_DOCUMENT_JOURNAL",
            "The baseline link report is invalid.",
        )
    })?;
    let new: Vec<_> = current["brokenLinks"]
        .as_array()
        .expect("link report")
        .iter()
        .filter(|link| {
            !old.iter().any(|before| {
                before["source"] == link["source"] && before["destination"] == link["destination"]
            })
        })
        .collect();
    Ok(
        json!({"newBrokenLinks":new,"brokenLinks":current["brokenLinks"],"coverage":current["coverage"],"warnings":current["warnings"],"scanStatus":current["scanStatus"]}),
    )
}
fn summary(project: &Project, change: &Change, journal: &Path, is_active: bool) -> Value {
    let files:Vec<_>=change.entries.iter().map(|entry| match entry_state(project,entry){
        Ok(current)=>json!({"path":entry.path,"phase":entry.phase,"currentState":current,"beforeRevision":entry.before.as_deref().map(plan::hash),"afterRevision":entry.after.as_deref().map(plan::hash)}),
        Err(error)=>json!({"path":entry.path,"phase":entry.phase,"currentState":"unreadable","error":error.json()})
    }).collect();
    let state = if matches!(change.state.as_str(), "applying" | "rolling-back") && !is_active {
        "interrupted"
    } else {
        change.state.as_str()
    };
    let broken = change.validation["newBrokenLinks"]
        .as_array()
        .is_some_and(|v| !v.is_empty())
        || change.validation["scanStatus"] == "partial";
    let changed = files.iter().zip(&change.entries).any(|(file, entry)| {
        let current = file["currentState"].as_str().unwrap_or("unreadable");
        !allowed(entry, current, change.direction == "undo")
    });
    json!({"schemaVersion":1,"status":if matches!(state,"applied"|"rolled-back")&&!broken&&!changed{"success"}else{"partial"},"changeId":change.plan.id,"projectId":project.id(),"changeState":state,"direction":change.direction,"active":is_active,"rationale":change.plan.rationale,"createdAt":change.created_at,"updatedAt":change.updated_at,"journalPath":journal,"files":files,"validation":change.validation})
}

pub fn check(project: &Project, filename: &Path) -> Result<Value> {
    let plan = Plan::read(project, filename)?;
    let (snapshots, conflicts) = plan::preflight(project, &plan);
    let operations:Vec<_>=plan.operations.iter().zip(snapshots).map(|(op,current)|json!({"path":op.path,"expectedRevision":op.expected_revision,"currentRevision":current.revision(),"afterRevision":op.content.as_deref().map(plan::hash),"before":current.text,"after":op.content})).collect();
    let inventory = documents::scan(project)?;
    let mut incoming = Vec::new();
    for document in inventory["documents"]
        .as_array()
        .expect("document inventory")
    {
        for link in document["links"].as_array().expect("document links") {
            if link["target"].as_str().is_some_and(|target| {
                plan.operations
                    .iter()
                    .any(|op| op.path.to_lowercase() == target.to_lowercase())
            }) {
                let source = document["path"].as_str().expect("document path");
                let covered = plan
                    .operations
                    .iter()
                    .any(|op| op.path.to_lowercase() == source.to_lowercase())
                    || plan
                        .guards
                        .iter()
                        .any(|guard| guard.path.to_lowercase() == source.to_lowercase());
                incoming.push(json!({"source":source,"sourceRevision":document["revision"],"line":link["line"],"destination":link["destination"],"target":link["target"],"sourceCoveredByPlan":covered}));
            }
        }
    }
    Ok(json!({
        "schemaVersion":1,"command":"docs-check",
        "status":if conflicts.is_empty(){"success"}else{"failed"},
        "changeId":plan.id,"projectId":project.id(),
        "changeState":if conflicts.is_empty(){"ready"}else{"conflict"},
        "rationale":plan.rationale,"operations":operations,"guards":plan.guards,
        "conflicts":conflicts,"links":summarize_links(&inventory),"incomingLinks":incoming
    }))
}

/// Progress notifications carry no document text. The callback must not reenter
/// document mutation; the project lock remains held for the complete operation.
pub fn apply_with_progress(
    project: &Project,
    filename: &Path,
    state: &Path,
    mut progress: impl FnMut(&str, &str),
) -> Result<Value> {
    let plan = Plan::read(project, filename)?;
    let _lock = lock(project, true)?;
    // Look up an existing immutable plan before checking its original preimages.
    let existing = if state
        .join("document-changes.sqlite")
        .symlink_metadata()
        .is_ok()
    {
        Some(Journal::open(state, true)?)
    } else {
        None
    };
    let previous = existing
        .as_ref()
        .map(|journal| journal.load(project, &plan.id))
        .transpose()?
        .flatten();
    let mut journal;
    let mut change = if let Some(previous) = previous {
        if previous.plan.canonical() != plan.canonical() {
            return Err(Error::new(
                "DOCUMENT_PLAN_ID_CONFLICT",
                "This plan ID already identifies different content.",
            ));
        }
        if previous.direction == "undo" {
            return Err(Error::new(
                "DOCUMENT_CHANGE_REVERTED",
                "This plan has entered recovery; use a new plan ID to apply it again.",
            ));
        }
        drop(existing);
        journal = Journal::open(state, false)?;
        previous
    } else {
        drop(existing);
        let (snapshots, conflicts) = plan::preflight(project, &plan);
        if !conflicts.is_empty() {
            return Ok(conflict_report(&plan.id, conflicts));
        }
        let baseline = link_snapshot(project)?;
        journal = Journal::open(state, false)?;
        journal.create(project, plan, snapshots, baseline)?
    };
    drive(project, &mut journal, &mut change, false, &mut progress)
}
pub fn apply(project: &Project, filename: &Path, state: &Path) -> Result<Value> {
    apply_with_progress(project, filename, state, |_, _| {})
}

pub fn undo_with_progress(
    project: &Project,
    state: &Path,
    id: &str,
    mut progress: impl FnMut(&str, &str),
) -> Result<Value> {
    if !plan::uuid(id) {
        return Err(plan::invalid("A canonical change UUID is required."));
    }
    let _lock = lock(project, true)?;
    let reader = Journal::open(state, true)?;
    let mut change = reader.load(project, id)?.ok_or_else(|| {
        Error::new(
            "DOCUMENT_CHANGE_NOT_FOUND",
            "No change with this ID exists for this project.",
        )
    })?;
    drop(reader);
    let mut journal = Journal::open(state, false)?;
    drive(project, &mut journal, &mut change, true, &mut progress)
}
pub fn undo(project: &Project, state: &Path, id: &str) -> Result<Value> {
    undo_with_progress(project, state, id, |_, _| {})
}

pub fn list(project: &Project, state: &Path, id: Option<&str>) -> Result<Value> {
    if id.is_some_and(|id| !plan::uuid(id)) {
        return Err(plan::invalid("A canonical change UUID is required."));
    }
    let journal = Journal::open(state, true)?;
    let is_active = active(project)?;
    let ids = if let Some(id) = id {
        vec![id.to_owned()]
    } else {
        journal.ids(project)?
    };
    let mut changes = Vec::new();
    for id in ids {
        let change = journal.load(project, &id)?.ok_or_else(|| {
            Error::new(
                "DOCUMENT_CHANGE_NOT_FOUND",
                "No change with this ID exists for this project.",
            )
        })?;
        changes.push(summary(project, &change, &journal.path, is_active));
    }
    Ok(
        json!({"schemaVersion":1,"command":"docs-changes","status":"success","changes":changes,"limit":100}),
    )
}

fn write_document(
    project: &Project,
    change: &Change,
    index: usize,
    undo: bool,
    progress: &mut impl FnMut(&str, &str),
) -> Result<()> {
    let entry = &change.entries[index];
    let expected = if undo { &entry.after } else { &entry.before };
    let desired = if undo { &entry.before } else { &entry.after };
    let filename = plan::target(project, &entry.path)?;
    if !same(&plan::snapshot(project, &entry.path)?, expected) {
        return Err(Error::new(
            "DOCUMENT_REVISION_CONFLICT",
            "The document changed immediately before its write.",
        ));
    }
    if !undo && !plan::guards(project, &change.plan).is_empty() {
        return Err(Error::new(
            "DOCUMENT_REVISION_CONFLICT",
            "A read dependency changed before the document write.",
        ));
    }
    if let Some(text) = desired {
        let parent = filename.parent().expect("document parent");
        // Validate and create each missing parent without following a linked ancestor.
        let mut path = project.root.clone();
        for component in parent
            .strip_prefix(&project.root)
            .expect("project parent")
            .components()
        {
            path.push(component);
            match fs::create_dir(&path) {
                Ok(()) => (),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
                Err(e) => return Err(plan::io(e)),
            };
            plan::target(project, &entry.path)?;
        }
        let staging = stage(project, change, index, undo)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)
            .map_err(plan::io)?;
        file.write_all(text.as_bytes()).map_err(plan::io)?;
        file.sync_all().map_err(plan::io)?;
        if let Some(mode) = entry.mode {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                file.set_permissions(fs::Permissions::from_mode(mode))
                    .map_err(plan::io)?;
            }
            #[cfg(not(unix))]
            {
                let mut permissions = file.metadata().map_err(plan::io)?.permissions();
                permissions.set_readonly(mode != 0);
                file.set_permissions(permissions).map_err(plan::io)?;
            }
        }
        drop(file);
        progress("staged", &entry.path);
        if !undo && !plan::guards(project, &change.plan).is_empty() {
            return Err(Error::new(
                "DOCUMENT_REVISION_CONFLICT",
                "A read dependency changed while staging the document.",
            ));
        }
        if !same(&plan::snapshot(project, &entry.path)?, expected) {
            return Err(Error::new(
                "DOCUMENT_REVISION_CONFLICT",
                "The document changed while its replacement was staged.",
            ));
        }
        plan::target(project, &entry.path)?;
        fs::rename(&staging, &filename).map_err(plan::io)?;
    } else {
        fs::remove_file(&filename).map_err(plan::io)?;
    }
    #[cfg(unix)]
    File::open(filename.parent().expect("document parent"))
        .and_then(|dir| dir.sync_all())
        .map_err(plan::io)?;
    progress("after-write", &entry.path);
    if !same(&plan::snapshot(project, &entry.path)?, desired) {
        return Err(Error::new(
            "DOCUMENT_REVISION_CONFLICT",
            "The document changed immediately after its write.",
        ));
    }
    Ok(())
}

fn drive(
    project: &Project,
    journal: &mut Journal,
    change: &mut Change,
    undo: bool,
    progress: &mut impl FnMut(&str, &str),
) -> Result<Value> {
    let conflicts = conflicts(project, change, undo);
    if !conflicts.is_empty() {
        change.state = "conflict".into();
        if undo {
            change.direction = "undo".into();
        }
        journal.checkpoint(change)?;
        let mut result = summary(project, change, &journal.path, false);
        result["status"] = json!("failed");
        result["conflicts"] = json!(conflicts);
        return Ok(result);
    }
    if (undo && change.state == "rolled-back") || (!undo && change.state == "applied") {
        return Ok(summary(project, change, &journal.path, false));
    }
    change.direction = if undo { "undo" } else { "apply" }.into();
    change.state = if undo { "rolling-back" } else { "applying" }.into();
    journal.checkpoint(change)?;
    progress("prepared", "");
    let indices: Vec<_> = if undo {
        (0..change.entries.len()).rev().collect()
    } else {
        (0..change.entries.len()).collect()
    };
    for (completed, index) in indices.into_iter().enumerate() {
        let attempt = (|| {
            if !undo {
                let guard_conflicts = plan::guards(project, &change.plan);
                if !guard_conflicts.is_empty() {
                    return Err(Error::new(
                        "DOCUMENT_REVISION_CONFLICT",
                        "A read dependency changed during application.",
                    )
                    .details(json!({"conflicts":guard_conflicts})));
                }
            }
            let current = entry_state(project, &change.entries[index])?;
            if !allowed(&change.entries[index], current, undo) {
                return Err(Error::new(
                    "DOCUMENT_REVISION_CONFLICT",
                    "The document was edited outside this change.",
                ));
            }
            let phase = change.entries[index].phase.clone();
            cleanup_stage(project, change, index, false, phase == "writing")?;
            cleanup_stage(project, change, index, true, phase == "reverting")?;
            let desired = if undo { "before" } else { "after" };
            if current != desired {
                change.entries[index].phase = if undo { "reverting" } else { "writing" }.into();
                journal.checkpoint(change)?;
                progress("before-write", &change.entries[index].path);
                write_document(project, change, index, undo, progress)?;
            }
            change.entries[index].phase = if undo { "reverted" } else { "applied" }.into();
            journal.checkpoint(change)?;
            progress("recorded", &change.entries[index].path);
            Ok(())
        })();
        if let Err(error) = attempt {
            change.state = "partial".into();
            journal.checkpoint(change)?;
            let mut result = summary(project, change, &journal.path, false);
            result["status"] = json!(if completed > 0
                || change
                    .entries
                    .iter()
                    .any(|e| e.phase == "applied" || e.phase == "reverted")
            {
                "partial"
            } else {
                "failed"
            });
            result["error"] = error.json();
            return Ok(result);
        }
    }
    change.validation = validate_links(project, &change.baseline)?;
    change.state = if undo { "rolled-back" } else { "applied" }.into();
    journal.checkpoint(change)?;
    Ok(summary(project, change, &journal.path, false))
}
