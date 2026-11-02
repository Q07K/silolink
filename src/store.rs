use crate::{
    error::{Error, Result},
    project::{self, Project},
};
use rusqlite::{Connection, OpenFlags, OptionalExtension, TransactionBehavior, params};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use uuid::Uuid;
const APPLICATION_ID: i64 = 0x534c4e4b;
fn database_error(error: rusqlite::Error) -> Error {
    Error::new(
        "STORE_WRITE_FAILED",
        "Cannot access the local SiloLink store.",
    )
    .details(json!({"sqliteCode":error.sqlite_error().map(|e|e.extended_code)}))
}
fn parse_payload(text: String) -> Result<Value> {
    serde_json::from_str(&text)
        .map_err(|_| Error::new("STORE_READ_FAILED", "The stored record is not valid JSON."))
}
pub struct Store {
    connection: Connection,
    pub path: PathBuf,
}
impl Store {
    pub fn open(directory: &Path, read_only: bool) -> Result<Self> {
        let root = if directory.is_absolute() {
            directory.to_owned()
        } else {
            std::env::current_dir()
                .map_err(|e| {
                    Error::io(
                        "STORE_OPEN_FAILED",
                        "Cannot resolve the store directory.",
                        &e,
                    )
                })?
                .join(directory)
        };
        let filename = root.join("silolink.sqlite");
        if read_only && !filename.exists() {
            return Err(Error::new(
                "STORE_NOT_INITIALIZED",
                "No saved SiloLink records exist in this state directory.",
            ));
        }
        if !read_only {
            fs::create_dir_all(&root).map_err(|e| {
                Error::io(
                    "STORE_OPEN_FAILED",
                    "Cannot create the local store directory.",
                    &e,
                )
            })?;
        }
        match project::linked(&filename) {
            Ok(link) if link || !filename.is_file() => {
                return Err(Error::new(
                    "INVALID_STORE_PATH",
                    "The store must be a regular local file, not a link.",
                ));
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
                return Err(Error::io(
                    "STORE_OPEN_FAILED",
                    "Cannot inspect the store file.",
                    &e,
                ));
            }
            _ => (),
        }
        let flags = if read_only {
            OpenFlags::SQLITE_OPEN_READ_ONLY
        } else {
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE
        };
        let mut connection = Connection::open_with_flags(&filename, flags).map_err(|_| {
            Error::new("STORE_OPEN_FAILED", "Cannot open the local SiloLink store.")
        })?;
        connection
            .busy_timeout(Duration::from_secs(1))
            .map_err(database_error)?;
        connection
            .pragma_update(None, "foreign_keys", true)
            .map_err(database_error)?;
        if read_only {
            check_version(&connection, false)?;
        } else {
            let tx = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database_error)?;
            check_version(&tx, true)?;
            tx.commit().map_err(database_error)?;
        }
        Ok(Self {
            connection,
            path: filename,
        })
    }
    pub fn acquire(&mut self, project: &Project) -> Result<String> {
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        check_location(&tx, project)?;
        let pid: Option<u32> = tx
            .query_row(
                "SELECT pid FROM leases WHERE project_id=?1",
                [project.id()],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;
        if pid.is_some_and(process_exists) {
            return Err(Error::new(
                "PROJECT_SYNC_BUSY",
                "Another collector is already reading this project.",
            ));
        }
        let token = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT OR REPLACE INTO leases(project_id,pid,token) VALUES (?1,?2,?3)",
            params![project.id(), std::process::id(), token],
        )
        .map_err(database_error)?;
        tx.commit().map_err(database_error)?;
        Ok(token)
    }
    pub fn release(&self, project: &Project, token: &str) -> Result<()> {
        self.connection
            .execute(
                "DELETE FROM leases WHERE project_id=?1 AND token=?2",
                params![project.id(), token],
            )
            .map_err(database_error)?;
        Ok(())
    }
    pub fn commit(&mut self, project: &Project, report: &Value, token: &str) -> Result<Value> {
        validate_report(project, report)?;
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_error)?;
        let lease: Option<String> = tx
            .query_row(
                "SELECT token FROM leases WHERE project_id=?1",
                [project.id()],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;
        if lease.as_deref() != Some(token) {
            return Err(Error::new(
                "SYNC_LEASE_LOST",
                "This collection no longer owns its project lease.",
            ));
        }
        check_location(&tx, project)?;
        tx.execute("INSERT INTO projects(project_id,root_path,metadata) VALUES (?1,?2,?3) ON CONFLICT(project_id) DO UPDATE SET metadata=excluded.metadata",params![project.id(),project.root.to_string_lossy(),project.metadata.to_string()]).map_err(database_error)?;
        let mut added = 0;
        let mut updated = 0;
        let mut unchanged = 0;
        let records = report["records"].as_array().expect("validated records");
        {
            let mut previous = tx
                .prepare("SELECT revision FROM records WHERE project_id=?1 AND record_id=?2")
                .map_err(database_error)?;
            let mut save=tx.prepare("INSERT INTO records(project_id,record_id,revision,payload) VALUES (?1,?2,?3,?4) ON CONFLICT(project_id,record_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload").map_err(database_error)?;
            let mut revision=tx.prepare("INSERT OR IGNORE INTO revisions(project_id,record_id,revision,payload) VALUES (?1,?2,?3,?4)").map_err(database_error)?;
            for record in records {
                let id = record["id"].as_str().expect("record id");
                let hash = record["revision"].as_str().expect("revision");
                let saved: Option<String> = previous
                    .query_row(params![project.id(), id], |row| row.get(0))
                    .optional()
                    .map_err(database_error)?;
                match saved {
                    None => added += 1,
                    Some(saved) if saved == hash => unchanged += 1,
                    _ => updated += 1,
                };
                let payload = record.to_string();
                revision
                    .execute(params![project.id(), id, hash, payload])
                    .map_err(database_error)?;
                save.execute(params![project.id(), id, hash, payload])
                    .map_err(database_error)?;
            }
        }
        let mut last_run = report.clone();
        last_run
            .as_object_mut()
            .expect("report object")
            .remove("records");
        last_run["recordCount"] = json!(records.len());
        last_run["changes"] = json!({"added":added,"updated":updated,"unchanged":unchanged});
        tx.execute(
            "UPDATE projects SET last_run=?1 WHERE project_id=?2",
            params![last_run.to_string(), project.id()],
        )
        .map_err(database_error)?;
        tx.commit().map_err(database_error)?;
        Ok(last_run)
    }
    pub fn read(&self, project: &Project, provider: &str) -> Result<Value> {
        if !matches!(provider, "all" | "codex" | "claude") {
            return Err(Error::new("INVALID_ARGUMENTS", "Invalid provider filter."));
        }
        check_location(&self.connection, project)?;
        let mut statement = self
            .connection
            .prepare("SELECT payload FROM records WHERE project_id=?1 ORDER BY record_id")
            .map_err(database_error)?;
        let rows = statement
            .query_map([project.id()], |row| row.get::<_, String>(0))
            .map_err(database_error)?;
        let mut records = Vec::new();
        for row in rows {
            let record = parse_payload(row.map_err(database_error)?)?;
            if provider == "all" || record["source"]["provider"] == provider {
                records.push(record);
            }
        }
        let last: Option<Option<String>> = self
            .connection
            .query_row(
                "SELECT last_run FROM projects WHERE project_id=?1",
                [project.id()],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;
        Ok(json!({"records":records,"lastRun":last.flatten().map(parse_payload).transpose()?}))
    }
    pub fn revisions(&self, project: &Project, id: &str) -> Result<Vec<Value>> {
        check_location(&self.connection, project)?;
        let mut statement = self
            .connection
            .prepare(
                "SELECT payload FROM revisions WHERE project_id=?1 AND record_id=?2 ORDER BY rowid",
            )
            .map_err(database_error)?;
        statement
            .query_map(params![project.id(), id], |row| row.get::<_, String>(0))
            .map_err(database_error)?
            .map(|row| parse_payload(row.map_err(database_error)?))
            .collect()
    }
}
fn check_version(connection: &Connection, initialize: bool) -> Result<()> {
    let id: i64 = connection
        .query_row("PRAGMA application_id", [], |row| row.get(0))
        .map_err(database_error)?;
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(database_error)?;
    if id == APPLICATION_ID && version == 1 {
        return Ok(());
    }
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get(0),
        )
        .map_err(database_error)?;
    if !initialize || id != 0 || version != 0 || count != 0 {
        return Err(Error::new(
            "UNSUPPORTED_STORE_VERSION",
            "This store is foreign or uses an unsupported format; it has been preserved.",
        ));
    }
    connection.execute_batch("CREATE TABLE projects(project_id TEXT PRIMARY KEY,root_path TEXT NOT NULL UNIQUE,metadata TEXT NOT NULL,last_run TEXT) STRICT;
CREATE TABLE records(project_id TEXT NOT NULL REFERENCES projects(project_id),record_id TEXT NOT NULL,revision TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(project_id,record_id)) STRICT;
CREATE TABLE revisions(project_id TEXT NOT NULL REFERENCES projects(project_id),record_id TEXT NOT NULL,revision TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(project_id,record_id,revision)) STRICT;
CREATE TABLE leases(project_id TEXT PRIMARY KEY,pid INTEGER NOT NULL,token TEXT NOT NULL) STRICT;").map_err(database_error)?;
    connection
        .pragma_update(None, "application_id", APPLICATION_ID)
        .map_err(database_error)?;
    connection
        .pragma_update(None, "user_version", 1)
        .map_err(database_error)?;
    Ok(())
}
fn check_location(connection: &Connection, project: &Project) -> Result<()> {
    let saved: Option<String> = connection
        .query_row(
            "SELECT root_path FROM projects WHERE project_id=?1",
            [project.id()],
            |row| row.get(0),
        )
        .optional()
        .map_err(database_error)?;
    if saved.is_some_and(|path| Path::new(&path) != project.root) {
        return Err(Error::new(
            "PROJECT_LOCATION_CONFLICT",
            "This project ID is registered at a different location; no records were merged.",
        ));
    }
    Ok(())
}
fn validate_report(project: &Project, report: &Value) -> Result<()> {
    let invalid = || {
        Error::new(
            "INVALID_COLLECTION_REPORT",
            "The collection report does not match this project or record format.",
        )
    };
    let records = report["records"].as_array().ok_or_else(invalid)?;
    if report["schemaVersion"] != 1
        || report["project"]["id"] != project.id()
        || report["project"]["rootPath"] != json!(project.root)
        || !report["sources"].is_array()
        || !matches!(
            report["status"].as_str(),
            Some("success" | "partial" | "failed")
        )
        || report["observedAt"]
            .as_str()
            .is_none_or(|s| chrono::DateTime::parse_from_rfc3339(s).is_err())
        || records.iter().any(|r| {
            r["schemaVersion"] != 1
                || r["projectId"] != project.id()
                || r["id"].as_str().is_none_or(str::is_empty)
                || r["revision"].as_str().is_none_or(str::is_empty)
                || !r["text"].is_string()
                || !matches!(r["role"].as_str(), Some("user" | "assistant"))
                || !matches!(r["source"]["provider"].as_str(), Some("codex" | "claude"))
        })
    {
        return Err(invalid());
    }
    Ok(())
}
#[cfg(windows)]
fn process_exists(pid: u32) -> bool {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, ERROR_INVALID_PARAMETER, GetLastError, WAIT_OBJECT_0},
        System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, WaitForSingleObject},
    };
    // A failed access check is not evidence that a process has exited.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | 0x00100000, 0, pid);
        if handle.is_null() {
            return GetLastError() != ERROR_INVALID_PARAMETER;
        }
        let running = WaitForSingleObject(handle, 0) != WAIT_OBJECT_0;
        CloseHandle(handle);
        running
    }
}
#[cfg(unix)]
fn process_exists(pid: u32) -> bool {
    unsafe {
        libc::kill(pid as libc::pid_t, 0) == 0
            || std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
    }
}
