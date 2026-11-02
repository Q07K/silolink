use crate::{
    error::{Error, Result},
    project,
};
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};

const SKILL: &str = include_str!("../integrations/skills/silolink/SKILL.md");
fn conflict() -> Error {
    Error::new(
        "SKILL_INSTALL_CONFLICT",
        "Existing, changed, legacy, or linked skill files were preserved. Inspect and back up the installation before replacing it.",
    )
}
fn install_one(base: &Path, relative: &str, executable: &Path) -> Result<&'static str> {
    let mut parent = base.to_path_buf();
    let components = relative.split('/').collect::<Vec<_>>();
    for name in &components[..components.len() - 1] {
        parent.push(name);
        match fs::create_dir(&parent) {
            Ok(()) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(e) => {
                return Err(Error::io(
                    "SKILL_INSTALL_FAILED",
                    "Cannot create the skill directory.",
                    &e,
                ));
            }
        };
        if project::linked(&parent).unwrap_or(true) || !parent.is_dir() {
            return Err(conflict());
        }
    }
    let target = parent.join("silolink");
    let metadata = format!(
        "{}\n",
        serde_json::to_string_pretty(
            &json!({"schemaVersion":2,"product":"silolink","cliPath":executable})
        )
        .expect("installation JSON")
    );
    let files = [
        ("SKILL.md", SKILL),
        ("installation.json", metadata.as_str()),
    ];
    match fs::create_dir(&target) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            if project::linked(&target).unwrap_or(true) || !target.is_dir() {
                return Err(conflict());
            }
            for (name, expected) in files {
                let path = target.join(name);
                if project::linked(&path).unwrap_or(true)
                    || fs::read_to_string(path).ok().as_deref() != Some(expected)
                {
                    return Err(conflict());
                }
            }
            return Ok("unchanged");
        }
        Err(e) => {
            return Err(Error::io(
                "SKILL_INSTALL_FAILED",
                "Cannot create the skill installation.",
                &e,
            ));
        }
    }
    let mut created = Vec::new();
    for (name, content) in files {
        let path = target.join(name);
        let result = (|| {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)?;
            created.push(path.clone());
            file.write_all(content.as_bytes())?;
            file.sync_all()
        })();
        if let Err(e) = result {
            for path in created.iter().rev() {
                let _ = fs::remove_file(path);
            }
            let _ = fs::remove_dir(&target);
            return Err(Error::io(
                "SKILL_INSTALL_FAILED",
                "Cannot write the skill installation.",
                &e,
            ));
        }
    }
    Ok("installed")
}
pub fn setup(
    host: &str,
    scope: &str,
    directory: &Path,
    home: &Path,
    executable: &Path,
) -> Result<Value> {
    if !matches!(host, "all" | "codex" | "claude" | "antigravity")
        || !matches!(scope, "user" | "project")
    {
        return Err(Error::new(
            "INVALID_ARGUMENTS",
            "Choose a supported host and installation scope.",
        ));
    }
    let base =
        dunce::canonicalize(if scope == "user" { home } else { directory }).map_err(|e| {
            Error::io(
                "INSTALL_DIRECTORY_NOT_FOUND",
                "Choose an existing installation directory.",
                &e,
            )
        })?;
    if !base.is_dir() {
        return Err(Error::new(
            "INSTALL_DIRECTORY_NOT_FOUND",
            "Choose an existing installation directory.",
        ));
    }
    let executable = dunce::canonicalize(executable).map_err(|e| {
        Error::io(
            "CLI_UNAVAILABLE",
            "Cannot locate the native SiloLink executable.",
            &e,
        )
    })?;
    let mut targets = Vec::<(&str, Vec<&str>)>::new();
    for name in ["codex", "claude", "antigravity"] {
        if host != "all" && host != name {
            continue;
        }
        let path = match (name, scope) {
            ("claude", _) => ".claude/skills/silolink",
            ("antigravity", "user") => ".gemini/config/skills/silolink",
            _ => ".agents/skills/silolink",
        };
        if let Some((_, hosts)) = targets.iter_mut().find(|(p, _)| *p == path) {
            hosts.push(name);
        } else {
            targets.push((path, vec![name]));
        }
    }
    let mut installations = Vec::new();
    let mut failures = 0;
    for (relative, hosts) in targets {
        let invocations = hosts
            .iter()
            .map(|name| {
                (
                    (*name).to_owned(),
                    json!(if *name == "codex" {
                        "$silolink init"
                    } else {
                        "/silolink init"
                    }),
                )
            })
            .collect::<serde_json::Map<_, _>>();
        let mut result =
            json!({"hosts":hosts,"path":base.join(relative),"invocations":invocations});
        match install_one(&base, relative, &executable) {
            Ok(status) => result["status"] = json!(status),
            Err(error) => {
                failures += 1;
                result["status"] = json!("failed");
                result["error"] = error.json();
            }
        }
        installations.push(result);
    }
    Ok(
        json!({"schemaVersion":1,"command":"setup","scope":scope,"status":if failures==0{"success"}else if failures==installations.len(){"failed"}else{"partial"},"installations":installations}),
    )
}
