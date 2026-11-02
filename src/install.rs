use crate::{
    error::{Error, Result},
    project,
};
use serde_json::{Value, json};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

struct Skill {
    name: &'static str,
    body: &'static str,
    interface: Option<&'static str>,
}
macro_rules! operation_skill {
    ($name:literal) => {
        Skill {
            name: $name,
            body: include_str!(concat!("../integrations/skills/", $name, "/SKILL.md")),
            interface: Some(include_str!(concat!(
                "../integrations/skills/",
                $name,
                "/agents/openai.yaml"
            ))),
        }
    };
}
const SKILLS: &[Skill] = &[
    Skill {
        name: "silolink",
        body: include_str!("../integrations/skills/silolink/SKILL.md"),
        interface: None,
    },
    operation_skill!("silolink-init"),
    operation_skill!("silolink-docs"),
    operation_skill!("silolink-docs-check"),
    operation_skill!("silolink-docs-apply"),
    operation_skill!("silolink-docs-changes"),
    operation_skill!("silolink-docs-undo"),
    operation_skill!("silolink-history"),
    operation_skill!("silolink-sync"),
    operation_skill!("silolink-records"),
    operation_skill!("silolink-watch"),
];
pub const HOSTS: [&str; 3] = ["codex", "claude", "antigravity"];

fn user_skill_path(host: &str) -> &'static str {
    match host {
        "claude" => ".claude/skills/silolink",
        "antigravity" => ".gemini/config/skills/silolink",
        _ => ".agents/skills/silolink",
    }
}
fn invocation(host: &str) -> &'static str {
    if host == "codex" {
        "$silolink-init"
    } else {
        "/silolink-init"
    }
}
fn installation_metadata(executable: &Path) -> String {
    format!(
        "{}\n",
        serde_json::to_string_pretty(
            &json!({"schemaVersion":2,"product":"silolink","cliPath":executable})
        )
        .expect("installation JSON")
    )
}
fn canonical_executable(executable: &Path) -> Result<PathBuf> {
    let path = dunce::canonicalize(executable).map_err(|e| {
        Error::io(
            "CLI_UNAVAILABLE",
            "Cannot locate the native SiloLink executable.",
            &e,
        )
    })?;
    if !path.is_file() {
        return Err(Error::new(
            "CLI_UNAVAILABLE",
            "The native SiloLink executable is missing.",
        ));
    }
    Ok(path)
}
fn base_directory(directory: &Path) -> Result<PathBuf> {
    let base = dunce::canonicalize(directory).map_err(|e| {
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
    Ok(base)
}
fn matches_file(path: &Path, expected: &str) -> bool {
    if project::linked(path).unwrap_or(true) {
        return false;
    }
    let mut bytes = Vec::new();
    File::open(path)
        .and_then(|file| file.take(expected.len() as u64 + 1).read_to_end(&mut bytes))
        .is_ok()
        && bytes == expected.as_bytes()
}
fn skill_files<'a>(skill: &'a Skill, metadata: &'a str) -> Vec<(&'static str, &'a str)> {
    let mut files = vec![("SKILL.md", skill.body), ("installation.json", metadata)];
    if let Some(interface) = skill.interface {
        files.push(("agents/openai.yaml", interface));
    }
    files
}
fn relative_skill_path(base_skill: &str, skill: &Skill) -> String {
    format!(
        "{}/{}",
        base_skill.rsplit_once('/').expect("known skill path").0,
        skill.name
    )
}

#[derive(Clone, Copy, PartialEq)]
enum SkillState {
    Installed,
    Missing,
    Conflict,
}

fn skill_state(base: &Path, relative: &str, skill: &Skill, metadata: &str) -> SkillState {
    let mut path = base.to_owned();
    for component in relative.split('/') {
        path.push(component);
        match path.symlink_metadata() {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return SkillState::Missing,
            Err(_) => return SkillState::Conflict,
            Ok(_) if project::linked(&path).unwrap_or(true) || !path.is_dir() => {
                return SkillState::Conflict;
            }
            Ok(_) => (),
        }
    }
    for (name, expected) in skill_files(skill, metadata) {
        if name.contains('/') {
            let parent = path.join("agents");
            if project::linked(&parent).unwrap_or(true) || !parent.is_dir() {
                return SkillState::Conflict;
            }
        }
        if !matches_file(&path.join(name), expected) {
            return SkillState::Conflict;
        }
    }
    SkillState::Installed
}

/// Read the whole bundle without adding missing skills or changing old files.
pub fn inspect_user(home: &Path, executable: &Path) -> Result<Value> {
    let base = base_directory(home)?;
    let executable = canonical_executable(executable)?;
    let metadata = installation_metadata(&executable);
    let names: Vec<_> = SKILLS.iter().map(|s| s.name).collect();
    let tools: Vec<_> = HOSTS.iter().map(|host| {
        let relative = user_skill_path(host);
        let states: Vec<_> = SKILLS.iter()
            .map(|skill| skill_state(&base, &relative_skill_path(relative, skill), skill, &metadata))
            .collect();
        let status = if states.contains(&SkillState::Conflict) { "conflict" }
            else if states.iter().all(|s| *s == SkillState::Installed) { "installed" }
            else if states.contains(&SkillState::Installed) { "update_available" }
            else { "not_installed" };
        json!({"host":host,"path":base.join(relative),"status":status,"invocation":invocation(host),"skills":names})
    }).collect();
    Ok(json!({"schemaVersion":1,"tools":tools}))
}
fn conflict() -> Error {
    Error::new(
        "SKILL_INSTALL_CONFLICT",
        "Existing, changed, legacy, or linked skill files were preserved. Inspect and back up the installation before replacing it.",
    )
}
fn install_one(base: &Path, relative: &str, skill: &Skill, metadata: &str) -> Result<&'static str> {
    match skill_state(base, relative, skill, metadata) {
        SkillState::Installed => return Ok("unchanged"),
        SkillState::Conflict => return Err(conflict()),
        SkillState::Missing => (),
    }
    let mut parent = base.to_path_buf();
    let components: Vec<_> = relative.split('/').collect();
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
        }
        if project::linked(&parent).unwrap_or(true) || !parent.is_dir() {
            return Err(conflict());
        }
    }
    let target = parent.join(skill.name);
    match fs::create_dir(&target) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            return if skill_state(base, relative, skill, metadata) == SkillState::Installed {
                Ok("unchanged")
            } else {
                Err(conflict())
            };
        }
        Err(e) => {
            return Err(Error::io(
                "SKILL_INSTALL_FAILED",
                "Cannot create the skill installation.",
                &e,
            ));
        }
    }
    let mut created_files = Vec::new();
    let mut created_directories = Vec::new();
    let result = (|| -> std::io::Result<()> {
        if skill.interface.is_some() {
            let agents = target.join("agents");
            fs::create_dir(&agents)?;
            created_directories.push(agents);
        }
        for (name, content) in skill_files(skill, metadata) {
            let path = target.join(name);
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)?;
            created_files.push(path);
            file.write_all(content.as_bytes())?;
            file.sync_all()?;
        }
        Ok(())
    })();
    if let Err(error) = result {
        for path in created_files.iter().rev() {
            let _ = fs::remove_file(path);
        }
        for path in created_directories.iter().rev() {
            let _ = fs::remove_dir(path);
        }
        let _ = fs::remove_dir(&target);
        return Err(Error::io(
            "SKILL_INSTALL_FAILED",
            "Cannot write the skill installation.",
            &error,
        ));
    }
    Ok("installed")
}
fn install_bundle(base: &Path, relative: &str, metadata: &str) -> Value {
    // Check all names before creating any: a foreign named entry must stay intact.
    for skill in SKILLS {
        if skill_state(base, &relative_skill_path(relative, skill), skill, metadata)
            == SkillState::Conflict
        {
            return json!({"status":"failed","error":conflict().json(),"conflictingSkill":skill.name,"skills":[]});
        }
    }
    let mut rows = Vec::new();
    let mut changed = false;
    for skill in SKILLS {
        match install_one(base, &relative_skill_path(relative, skill), skill, metadata) {
            Ok(status) => {
                changed |= status == "installed";
                rows.push(json!({"name":skill.name,"status":status}));
            }
            Err(error) => {
                rows.push(json!({"name":skill.name,"status":"failed","error":error.json()}));
                return json!({"status":if changed {"partial"} else {"failed"},"error":error.json(),"skills":rows});
            }
        }
    }
    json!({"status":if changed {"installed"} else {"unchanged"},"skills":rows})
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
    let base = base_directory(if scope == "user" { home } else { directory })?;
    let executable = canonical_executable(executable)?;
    let metadata = installation_metadata(&executable);
    let mut targets = Vec::<(&str, Vec<&str>)>::new();
    for name in HOSTS {
        if host != "all" && host != name {
            continue;
        }
        let path = match (name, scope) {
            (_, "user") => user_skill_path(name),
            ("claude", _) => ".claude/skills/silolink",
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
    let mut partial = false;
    for (relative, hosts) in targets {
        let mut result = install_bundle(&base, relative, &metadata);
        if result["status"] == "failed" || result["status"] == "partial" {
            failures += 1;
        }
        partial |= result["status"] == "partial";
        result["hosts"] = json!(hosts);
        result["path"] = json!(base.join(relative));
        result["invocations"] = json!(
            hosts
                .iter()
                .map(|name| ((*name).to_owned(), json!(invocation(name))))
                .collect::<serde_json::Map<_, _>>()
        );
        installations.push(result);
    }
    Ok(json!({"schemaVersion":1,"command":"setup","scope":scope,
        "status":if failures == 0 {"success"} else if partial || failures < installations.len() {"partial"} else {"failed"},
        "installations":installations}))
}
