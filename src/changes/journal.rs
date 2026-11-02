use super::plan::{self, Plan, Snapshot};
use crate::{
    error::{Error, Result},
    project::{self, Project},
};
use rusqlite::{Connection, OpenFlags, OptionalExtension, TransactionBehavior, params};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

const APPLICATION_ID: i64 = 0x534c4443;
pub(super) struct Entry {
    pub path: String,
    pub before: Option<String>,
    pub after: Option<String>,
    pub mode: Option<u32>,
    pub phase: String,
}
pub(super) struct Change {
    pub plan: Plan,
    pub entries: Vec<Entry>,
    pub state: String,
    pub direction: String,
    pub baseline: Value,
    pub validation: Value,
    pub created_at: String,
    pub updated_at: String,
}
pub(super) struct Journal {
    db: Connection,
    pub path: PathBuf,
}
fn db_error(error: rusqlite::Error) -> Error {
    Error::new(
        "DOCUMENT_JOURNAL_FAILED",
        "Cannot read or commit the document change journal.",
    )
    .details(serde_json::json!({"sqliteCode":error.sqlite_error().map(|e|e.extended_code)}))
}
fn corrupt() -> Error {
    Error::new(
        "INVALID_DOCUMENT_JOURNAL",
        "The journal is foreign, unsupported, or inconsistent; it was preserved.",
    )
}
fn safe_root(directory: &Path, create: bool) -> Result<PathBuf> {
    let root = if directory.is_absolute() {
        directory.to_path_buf()
    } else {
        std::env::current_dir().map_err(plan::io)?.join(directory)
    };
    for ancestor in root.ancestors().collect::<Vec<_>>().into_iter().rev() {
        if ancestor.as_os_str().is_empty() {
            continue;
        }
        match fs::symlink_metadata(ancestor) {
            Ok(metadata) => {
                if project::linked(ancestor).map_err(plan::io)? || !metadata.is_dir() {
                    return Err(corrupt());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && create => {
                fs::create_dir(ancestor).map_err(plan::io)?
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(Error::new(
                    "DOCUMENT_JOURNAL_NOT_INITIALIZED",
                    "No document change journal exists at this location.",
                ));
            }
            Err(e) => return Err(plan::io(e)),
        }
    }
    dunce::canonicalize(root).map_err(plan::io)
}
impl Journal {
    pub fn open(directory: &Path, read_only: bool) -> Result<Self> {
        let root = safe_root(directory, !read_only)?;
        let path = root.join("document-changes.sqlite");
        for suffix in ["", "-journal", "-wal", "-shm"] {
            let candidate = root.join(format!("document-changes.sqlite{suffix}"));
            match fs::symlink_metadata(&candidate) {
                Ok(metadata) => {
                    if project::linked(&candidate).map_err(plan::io)? || !metadata.is_file() {
                        return Err(corrupt());
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(plan::io(e)),
            }
        }
        if read_only && !path.exists() {
            return Err(Error::new(
                "DOCUMENT_JOURNAL_NOT_INITIALIZED",
                "No document change journal exists at this location.",
            ));
        }
        let flags = if read_only {
            OpenFlags::SQLITE_OPEN_READ_ONLY
        } else {
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE
        };
        let mut db = Connection::open_with_flags(&path, flags).map_err(db_error)?;
        db.busy_timeout(Duration::from_secs(1)).map_err(db_error)?;
        let id: i64 = db
            .query_row("PRAGMA application_id", [], |r| r.get(0))
            .map_err(db_error)?;
        let version: i64 = db
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(db_error)?;
        if id != APPLICATION_ID || version != 1 {
            let count: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
                    [],
                    |r| r.get(0),
                )
                .map_err(db_error)?;
            if read_only || id != 0 || version != 0 || count != 0 {
                return Err(corrupt());
            }
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(db_error)?;
            tx.execute_batch("CREATE TABLE changes(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, root_path TEXT NOT NULL, plan_hash TEXT NOT NULL, plan TEXT NOT NULL, state TEXT NOT NULL, direction TEXT NOT NULL, baseline TEXT NOT NULL, validation TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE files(change_id TEXT NOT NULL REFERENCES changes(id), ordinal INTEGER NOT NULL, path TEXT NOT NULL, before_text TEXT, after_text TEXT, mode INTEGER, phase TEXT NOT NULL, PRIMARY KEY(change_id,ordinal));").map_err(db_error)?;
            tx.pragma_update(None, "application_id", APPLICATION_ID)
                .map_err(db_error)?;
            tx.pragma_update(None, "user_version", 1)
                .map_err(db_error)?;
            tx.commit().map_err(db_error)?;
        }
        db.pragma_update(None, "foreign_keys", true)
            .map_err(db_error)?;
        if !read_only {
            db.pragma_update(None, "synchronous", "FULL")
                .map_err(db_error)?;
        }
        Ok(Self { db, path })
    }
    pub fn load(&self, project: &Project, id: &str) -> Result<Option<Change>> {
        let raw=self.db.query_row("SELECT project_id,root_path,plan_hash,plan,state,direction,baseline,validation,created_at,updated_at FROM changes WHERE id=?1",[id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?,r.get::<_,String>(8)?,r.get::<_,String>(9)?))).optional().map_err(db_error)?;
        let Some((
            project_id,
            root,
            plan_hash,
            text,
            state,
            direction,
            baseline,
            validation,
            created_at,
            updated_at,
        )) = raw
        else {
            return Ok(None);
        };
        if project_id != project.id() || Path::new(&root) != project.root {
            return Err(Error::new(
                "DOCUMENT_CHANGE_PROJECT_CONFLICT",
                "The change belongs to a different project or location.",
            ));
        }
        let plan: Plan = serde_json::from_str(&text).map_err(|_| corrupt())?;
        plan.validate(project)?;
        if plan.id != id
            || plan::hash(&plan.canonical()) != plan_hash
            || !matches!(
                state.as_str(),
                "applying" | "applied" | "partial" | "conflict" | "rolling-back" | "rolled-back"
            )
            || !matches!(direction.as_str(), "apply" | "undo")
        {
            return Err(corrupt());
        }
        let mut statement=self.db.prepare("SELECT path,before_text,after_text,mode,phase,ordinal FROM files WHERE change_id=?1 ORDER BY ordinal").map_err(db_error)?;
        let numbered = statement
            .query_map([id], |r| {
                Ok((
                    r.get::<_, i64>(5)?,
                    Entry {
                        path: r.get(0)?,
                        before: r.get(1)?,
                        after: r.get(2)?,
                        mode: r.get(3)?,
                        phase: r.get(4)?,
                    },
                ))
            })
            .map_err(db_error)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)?;
        let mut entries = Vec::new();
        for (index, (ordinal, entry)) in numbered.into_iter().enumerate() {
            if ordinal != index as i64 {
                return Err(corrupt());
            }
            entries.push(entry);
        }
        if entries.len() != plan.operations.len()
            || entries.iter().zip(&plan.operations).any(|(e, op)| {
                e.path != op.path
                    || e.after != op.content
                    || e.before.as_deref().map(plan::hash) != op.expected_revision
                    || e.before.as_ref().is_some_and(|s| s.len() > plan::MAX_FILE)
                    || !matches!(
                        e.phase.as_str(),
                        "pending" | "writing" | "applied" | "reverting" | "reverted"
                    )
            })
        {
            return Err(corrupt());
        }
        let baseline: Value = serde_json::from_str(&baseline).map_err(|_| corrupt())?;
        let validation: Value = serde_json::from_str(&validation).map_err(|_| corrupt())?;
        if !baseline["brokenLinks"].is_array()
            || !baseline["warnings"].is_array()
            || (!validation.is_null()
                && (!validation["newBrokenLinks"].is_array() || !validation["warnings"].is_array()))
            || (matches!(state.as_str(), "applied" | "rolled-back") && validation.is_null())
            || (state == "applied" && entries.iter().any(|e| e.phase != "applied"))
            || (state == "rolled-back" && entries.iter().any(|e| e.phase != "reverted"))
        {
            return Err(corrupt());
        }
        Ok(Some(Change {
            plan,
            entries,
            state,
            direction,
            baseline,
            validation,
            created_at,
            updated_at,
        }))
    }
    pub fn create(
        &mut self,
        project: &Project,
        plan: Plan,
        snapshots: Vec<Snapshot>,
        baseline: Value,
    ) -> Result<Change> {
        let now = project::now();
        let text = plan.canonical();
        let entries: Vec<_> = plan
            .operations
            .iter()
            .zip(snapshots)
            .map(|(op, before)| Entry {
                path: op.path.clone(),
                before: before.text,
                after: op.content.clone(),
                mode: before.mode,
                phase: "pending".into(),
            })
            .collect();
        let tx = self
            .db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(db_error)?;
        tx.execute(
            "INSERT INTO changes VALUES (?1,?2,?3,?4,?5,'applying','apply',?6,'null',?7,?7)",
            params![
                plan.id,
                project.id(),
                project.root.to_string_lossy(),
                plan::hash(&text),
                text,
                baseline.to_string(),
                now
            ],
        )
        .map_err(db_error)?;
        for (index, entry) in entries.iter().enumerate() {
            tx.execute(
                "INSERT INTO files VALUES (?1,?2,?3,?4,?5,?6,'pending')",
                params![
                    plan.id,
                    index as i64,
                    entry.path,
                    entry.before,
                    entry.after,
                    entry.mode
                ],
            )
            .map_err(db_error)?;
        }
        tx.commit().map_err(db_error)?;
        Ok(Change {
            plan,
            entries,
            state: "applying".into(),
            direction: "apply".into(),
            baseline,
            validation: Value::Null,
            created_at: now.clone(),
            updated_at: now,
        })
    }
    pub fn checkpoint(&mut self, change: &mut Change) -> Result<()> {
        change.updated_at = project::now();
        let tx = self
            .db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(db_error)?;
        tx.execute(
            "UPDATE changes SET state=?1,direction=?2,validation=?3,updated_at=?4 WHERE id=?5",
            params![
                change.state,
                change.direction,
                change.validation.to_string(),
                change.updated_at,
                change.plan.id
            ],
        )
        .map_err(db_error)?;
        for (index, entry) in change.entries.iter().enumerate() {
            tx.execute(
                "UPDATE files SET phase=?1 WHERE change_id=?2 AND ordinal=?3",
                params![entry.phase, change.plan.id, index as i64],
            )
            .map_err(db_error)?;
        }
        tx.commit().map_err(db_error)
    }
    pub fn ids(&self, project: &Project) -> Result<Vec<String>> {
        let mut query = self
            .db
            .prepare(
                "SELECT id FROM changes WHERE project_id=?1 ORDER BY created_at DESC,id LIMIT 100",
            )
            .map_err(db_error)?;
        query
            .query_map([project.id()], |r| r.get(0))
            .map_err(db_error)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(db_error)
    }
}
