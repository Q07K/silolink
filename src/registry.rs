//! Shared project discovery. CLI processes never edit the desktop workspace.
use crate::{
    desktop::Desktop,
    error::{Error, Result},
    project::{self, Project},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_ENTRY: u64 = 64 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    schema_version: u32,
    id: String,
    root: PathBuf,
}
pub fn directory() -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("SILOLINK_PROJECT_REGISTRY_DIR") {
        return Ok(PathBuf::from(path));
    }
    std::env::var_os("SILOLINK_USER_HOME")
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .map(|home| home.join(".silolink/projects"))
        .ok_or_else(|| invalid("Cannot locate your project registry directory."))
}
fn invalid(message: &str) -> Error {
    Error::new("PROJECT_REGISTRY_FAILED", message)
}
fn io(error: std::io::Error) -> Error {
    Error::io(
        "PROJECT_REGISTRY_FAILED",
        "Cannot register the project with the desktop app; project documents were preserved. Retry init after checking the registry directory.",
        &error,
    )
}
fn check_directory(directory: &Path) -> Result<()> {
    // Check every existing ancestor, including reparse points on Windows.
    for path in directory.ancestors() {
        match project::linked(path) {
            Ok(true) => {
                return Err(invalid(
                    "The project registry must not use linked directories.",
                ));
            }
            Ok(false) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(io(e)),
        }
    }
    Ok(())
}
fn read(path: &Path) -> Result<Entry> {
    if project::linked(path).map_err(io)? {
        return Err(invalid("Project registration must not be a link."));
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(io)?
        .take(MAX_ENTRY + 1)
        .read_to_end(&mut bytes)
        .map_err(io)?;
    if bytes.len() as u64 > MAX_ENTRY {
        return Err(invalid("Project registration exceeds the size limit."));
    }
    let entry: Entry = serde_json::from_slice(&bytes)
        .map_err(|_| invalid("Invalid project registration; the file was preserved."))?;
    if entry.schema_version != 1
        || entry.id.len() != 36
        || uuid::Uuid::parse_str(&entry.id).is_err()
        || !entry.root.is_absolute()
    {
        return Err(invalid(
            "Invalid project registration identity or location.",
        ));
    }
    Ok(entry)
}
fn same(entry: &Entry, project: &Project) -> Result<()> {
    if entry.id != project.id() || entry.root != project.root {
        return Err(Error::new(
            "PROJECT_LOCATION_CONFLICT",
            "This project identity is registered at another location; the existing registration was preserved.",
        ));
    }
    Ok(())
}
pub fn register(directory: &Path, project: &Project) -> Result<()> {
    check_directory(directory)?;
    fs::create_dir_all(directory).map_err(io)?;
    let filename = directory.join(format!("{}.json", project.id()));
    if filename.symlink_metadata().is_ok() {
        return same(&read(&filename)?, project);
    }
    let entry = Entry {
        schema_version: 1,
        id: project.id().into(),
        root: project.root.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&entry)
        .map_err(|_| invalid("Cannot encode project registration."))?;
    if bytes.len() as u64 > MAX_ENTRY {
        return Err(invalid("Project registration exceeds the size limit."));
    }
    let staging = directory.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)
            .map_err(io)?;
        file.write_all(&bytes).map_err(io)?;
        file.sync_all().map_err(io)?;
        drop(file);
        // Publish complete bytes atomically, without replacing another process's entry.
        match fs::hard_link(&staging, &filename) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                same(&read(&filename)?, project)
            }
            Err(e) => Err(io(e)),
        }
    })();
    let _ = fs::remove_file(staging);
    result
}
#[derive(Default)]
pub struct ImportReport {
    pub added: usize,
    pub errors: Vec<Value>,
}
pub fn import(directory: &Path, desktop: &mut Desktop) -> Result<ImportReport> {
    check_directory(directory)?;
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(ImportReport::default()),
        Err(e) => return Err(io(e)),
    };
    let mut paths = Vec::new();
    for (count, entry) in entries.enumerate() {
        if count >= 10_000 {
            return Err(invalid("Too many project registrations."));
        }
        let path = entry.map_err(io)?.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            paths.push(path);
        }
    }
    paths.sort();
    let mut report = ImportReport::default();
    for path in paths {
        let result = (|| {
            let entry = read(&path)?;
            let project = project::read(&entry.root)?;
            same(&entry, &project)?;
            let before = desktop.data.projects.len();
            desktop.connect(&project.root, false)?;
            report.added += desktop.data.projects.len() - before;
            Ok::<_, Error>(())
        })();
        if let Err(e) = result {
            report
                .errors
                .push(json!({"registration":path,"error":e.json()}));
        }
    }
    Ok(report)
}
