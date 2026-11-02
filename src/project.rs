use crate::error::{Error, Result};
use chrono::{SecondsFormat, Utc};
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Project {
    pub root: PathBuf,
    pub metadata: Value,
}
impl Project {
    pub fn id(&self) -> &str {
        self.metadata["id"].as_str().expect("validated project id")
    }
    pub fn json(&self) -> Value {
        let mut value = self.metadata.clone();
        value["rootPath"] = json!(self.root);
        value
    }
}
pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
pub fn linked(path: &Path) -> std::io::Result<bool> {
    let metadata = fs::symlink_metadata(path)?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        Ok(metadata.file_attributes() & 0x400 != 0)
    }
    #[cfg(not(windows))]
    {
        Ok(metadata.file_type().is_symlink())
    }
}
pub fn root(directory: &Path) -> Result<PathBuf> {
    let root = dunce::canonicalize(directory).map_err(|e| {
        Error::io(
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                "PROJECT_ACCESS_DENIED"
            } else {
                "PROJECT_DIRECTORY_NOT_FOUND"
            },
            "Choose an existing readable project directory.",
            &e,
        )
    })?;
    if !root.is_dir() {
        return Err(Error::new(
            "PROJECT_DIRECTORY_NOT_FOUND",
            "Choose an existing project directory.",
        ));
    }
    Ok(root)
}
fn validate(metadata: Value) -> Result<Value> {
    if !metadata.is_object() {
        return Err(Error::new(
            "INVALID_PROJECT",
            "Project metadata must be an object.",
        ));
    }
    if metadata["schemaVersion"] != 1 {
        return Err(Error::new(
            "UNSUPPORTED_PROJECT_VERSION",
            "This project format is not supported.",
        )
        .details(json!({"schemaVersion":metadata["schemaVersion"]})));
    }
    let id = metadata["id"].as_str().unwrap_or("");
    let valid_id = Uuid::parse_str(id).is_ok() && id.len() == 36;
    if !valid_id
        || metadata["name"]
            .as_str()
            .is_none_or(|s| s.trim().is_empty())
        || metadata["createdAt"]
            .as_str()
            .is_none_or(|s| chrono::DateTime::parse_from_rfc3339(s).is_err())
    {
        return Err(Error::new(
            "INVALID_PROJECT",
            "Project metadata is incomplete; it has been preserved.",
        ));
    }
    Ok(metadata)
}
fn read_config(filename: &Path) -> Result<Value> {
    match linked(filename) {
        Ok(true) => {
            return Err(Error::new(
                "INVALID_PROJECT",
                "Project metadata must not be a link.",
            ));
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(Error::new(
                "PROJECT_NOT_INITIALIZED",
                "Run silolink init for this project first.",
            ));
        }
        Err(e) => {
            return Err(Error::io(
                "PROJECT_ACCESS_DENIED",
                "Cannot inspect project metadata.",
                &e,
            ));
        }
        _ => (),
    }
    let text = fs::read_to_string(filename)
        .map_err(|e| Error::io("PROJECT_ACCESS_DENIED", "Cannot read project metadata.", &e))?;
    validate(serde_json::from_str(&text).map_err(|_| {
        Error::new(
            "INVALID_PROJECT",
            "Project metadata is invalid JSON; it has been preserved.",
        )
    })?)
}
fn check(root: &Path) -> Result<()> {
    let directory = root.join(".silolink");
    match linked(&directory) {
        Ok(is_link) if is_link || !directory.is_dir() => {
            return Err(Error::new(
                "INVALID_PROJECT",
                ".silolink must be a local directory, not a file or link.",
            ));
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => {
            return Err(Error::io(
                "PROJECT_ACCESS_DENIED",
                "Cannot inspect .silolink.",
                &e,
            ));
        }
        _ => (),
    }
    if directory.join("init.lock").symlink_metadata().is_ok() {
        return Err(Error::new(
            "PROJECT_BUSY",
            "Project initialization is in progress; retry when it finishes.",
        ));
    }
    Ok(())
}
pub fn read(directory: &Path) -> Result<Project> {
    let root = root(directory)?;
    check(&root)?;
    Ok(Project {
        metadata: read_config(&root.join(".silolink/project.json"))?,
        root,
    })
}
pub fn init(directory: &Path) -> Result<(Project, bool)> {
    let root = root(directory)?;
    check(&root)?;
    let metadata_dir = root.join(".silolink");
    let config = metadata_dir.join("project.json");
    if config.symlink_metadata().is_ok() {
        return Ok((
            Project {
                metadata: read_config(&config)?,
                root,
            },
            false,
        ));
    }
    fs::create_dir_all(&metadata_dir).map_err(|e| {
        Error::io(
            "PROJECT_ACCESS_DENIED",
            "Cannot create project metadata directory.",
            &e,
        )
    })?;
    let lock_path = metadata_dir.join("init.lock");
    let lock = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|e| {
            Error::io(
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    "PROJECT_BUSY"
                } else {
                    "PROJECT_ACCESS_DENIED"
                },
                "Cannot acquire project initialization lock.",
                &e,
            )
        })?;
    let result = (|| {
        if config.symlink_metadata().is_ok() {
            return Ok((
                Project {
                    metadata: read_config(&config)?,
                    root: root.clone(),
                },
                false,
            ));
        }
        let metadata = json!({"schemaVersion":1,"id":Uuid::new_v4().to_string(),"name":root.file_name().map(|s|s.to_string_lossy().to_string()).unwrap_or_else(||root.display().to_string()),"createdAt":now()});
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&config)
            .map_err(|e| {
                Error::io(
                    "PROJECT_ACCESS_DENIED",
                    "Cannot create project metadata; existing content was preserved.",
                    &e,
                )
            })?;
        file.write_all(
            format!(
                "{}\n",
                serde_json::to_string_pretty(&metadata).expect("JSON value")
            )
            .as_bytes(),
        )
        .map_err(|e| {
            Error::io(
                "PROJECT_ACCESS_DENIED",
                "Cannot write project metadata.",
                &e,
            )
        })?;
        file.sync_all().map_err(|e| {
            Error::io(
                "PROJECT_ACCESS_DENIED",
                "Cannot flush project metadata.",
                &e,
            )
        })?;
        Ok((
            Project {
                metadata,
                root: root.clone(),
            },
            true,
        ))
    })();
    drop(lock);
    fs::remove_file(lock_path).map_err(|e| {
        Error::io(
            "PROJECT_ACCESS_DENIED",
            "Cannot release initialization lock.",
            &e,
        )
    })?;
    result
}
pub fn assert_scope(project: &Project, cwd: &str) -> Result<()> {
    if cwd.trim().is_empty() {
        return Err(Error::new(
            "PROJECT_UNRESOLVED",
            "The source does not identify its project directory.",
        ));
    }
    let source = dunce::canonicalize(cwd).map_err(|_| {
        Error::new(
            "PROJECT_UNRESOLVED",
            "The source directory cannot be resolved.",
        )
    })?;
    if !source.starts_with(&project.root) {
        return Err(Error::new(
            "PROJECT_MISMATCH",
            "The source belongs to a different project.",
        ));
    }
    Ok(())
}
