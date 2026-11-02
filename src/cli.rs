use crate::{
    error::{Error, Result},
    project,
};
use std::{collections::HashMap, path::PathBuf};

pub const MAX_ITEMS: usize = 9_007_199_254_740_991;
pub const HELP: &str = "SiloLink native CLI\n\n  silolink init [--project <directory>]\n  silolink docs [--project <directory>]\n  silolink setup [--host codex|claude|antigravity|all] [--scope user|project] [--project <directory>]\n  silolink history [--project <directory>] [--provider codex|claude|all] [--limit <items>]\n  silolink sync [--project <directory>] [--provider codex|claude|all] [--state-dir <directory>] [--limit <items>]\n  silolink records [--project <directory>] [--provider codex|claude|all] [--state-dir <directory>]\n  silolink watch [--project <directory>] [--provider codex|claude|all] [--state-dir <directory>] [--interval <seconds>]\n\ninit preserves existing documents. setup installs the shared skill.\ndocs reads Markdown and proposes evidence-based reviews without changing files.\nhistory defaults to 1000 source items per provider; sync/watch read all supported history.\nChoose --state-dir or SILOLINK_STATE_DIR to store conversations locally.\nwatch runs in the foreground (30 seconds by default).\nExit codes: 0 success, 1 failure, 2 partial result, 130 interrupted watch.\n";
#[derive(Debug)]
pub struct Options {
    pub command: String,
    pub directory: PathBuf,
    pub provider: String,
    pub limit: usize,
    pub state_dir: Option<PathBuf>,
    pub interval_seconds: u64,
    pub host: String,
    pub scope: String,
}
fn invalid() -> Error {
    Error::new(
        "INVALID_ARGUMENTS",
        "Invalid command options; run silolink --help.",
    )
}
pub fn parse(args: &[String]) -> Result<Options> {
    let mut values = HashMap::new();
    let mut positional = Vec::new();
    let mut help = false;
    let mut i = 0;
    while i < args.len() {
        let argument = &args[i];
        i += 1;
        if matches!(argument.as_str(), "--help" | "-h") {
            help = true;
            continue;
        }
        if argument == "--" {
            positional.extend(args[i..].iter().cloned());
            break;
        }
        if argument.starts_with('-') {
            let (name, inline) = argument
                .split_once('=')
                .map(|(n, v)| (n, Some(v)))
                .unwrap_or((argument.as_str(), None));
            let key = match name {
                "-C" | "--project" => "project",
                "--provider" => "provider",
                "--limit" => "limit",
                "--host" => "host",
                "--scope" => "scope",
                "--state-dir" => "state-dir",
                "--interval" => "interval",
                _ => return Err(invalid()),
            };
            let value = if let Some(value) = inline {
                value.to_owned()
            } else {
                let value = args
                    .get(i)
                    .filter(|s| !s.starts_with('-'))
                    .ok_or_else(invalid)?
                    .clone();
                i += 1;
                value
            };
            values.insert(key, value);
        } else {
            positional.push(argument.clone());
        }
    }
    let command = if help {
        "help".to_owned()
    } else {
        if positional.len() != 1 {
            return Err(invalid());
        }
        positional.remove(0)
    };
    let allowed: &[&str] = match command.as_str() {
        "help" => &[
            "project",
            "provider",
            "limit",
            "host",
            "scope",
            "state-dir",
            "interval",
        ],
        "init" | "docs" => &["project"],
        "setup" => &["project", "host", "scope"],
        "history" => &["project", "provider", "limit"],
        "sync" => &["project", "provider", "limit", "state-dir"],
        "records" => &["project", "provider", "state-dir"],
        "watch" => &["project", "provider", "state-dir", "interval"],
        _ => return Err(invalid()),
    };
    if values.keys().any(|key| !allowed.contains(key)) {
        return Err(invalid());
    }
    let provider = values
        .get("provider")
        .map(String::as_str)
        .unwrap_or("all")
        .to_owned();
    let host = values
        .get("host")
        .map(String::as_str)
        .unwrap_or("all")
        .to_owned();
    let scope = values
        .get("scope")
        .map(String::as_str)
        .unwrap_or("user")
        .to_owned();
    if command != "help"
        && (!matches!(provider.as_str(), "all" | "codex" | "claude")
            || !matches!(host.as_str(), "all" | "codex" | "claude" | "antigravity")
            || !matches!(scope.as_str(), "user" | "project"))
    {
        return Err(invalid());
    }
    if command == "setup" && scope == "user" && values.contains_key("project") {
        return Err(invalid());
    }
    let limit = if let Some(value) = values.get("limit") {
        if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
            return Err(invalid());
        }
        value.parse::<usize>().map_err(|_| invalid())?
    } else if command == "history" {
        1000
    } else {
        MAX_ITEMS
    };
    if command != "help" && (limit == 0 || limit > MAX_ITEMS) {
        return Err(invalid());
    }
    let interval_seconds = if let Some(value) = values.get("interval") {
        if !value.bytes().all(|b| b.is_ascii_digit()) {
            return Err(invalid());
        }
        value.parse::<u64>().map_err(|_| invalid())?
    } else {
        30
    };
    if command != "help" && !(1..=86400).contains(&interval_seconds) {
        return Err(invalid());
    }
    let state_dir = values
        .get("state-dir")
        .cloned()
        .or_else(|| std::env::var("SILOLINK_STATE_DIR").ok());
    if matches!(command.as_str(), "sync" | "records" | "watch")
        && state_dir.as_ref().is_none_or(|s| s.trim().is_empty())
    {
        return Err(Error::new(
            "STATE_DIRECTORY_REQUIRED",
            "Choose --state-dir or set SILOLINK_STATE_DIR before saving or reading records.",
        ));
    }
    let directory =
        values
            .get("project")
            .map(PathBuf::from)
            .unwrap_or(std::env::current_dir().map_err(|e| {
                Error::io(
                    "PROJECT_DIRECTORY_NOT_FOUND",
                    "Cannot locate the working directory.",
                    &e,
                )
            })?);
    Ok(Options {
        command,
        directory,
        provider,
        limit,
        state_dir: state_dir.map(PathBuf::from),
        interval_seconds,
        host,
        scope,
    })
}
pub fn init(options: &Options) -> Result<serde_json::Value> {
    let (project, created) = project::init(&options.directory)?;
    Ok(
        serde_json::json!({"schemaVersion":1,"command":"init","status":"success","created":created,"project":project.json()}),
    )
}
