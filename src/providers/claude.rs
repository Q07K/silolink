use super::{Snapshot, claude_queue};
use crate::{
    error::{Error, Result},
    project::{self, Project},
    records,
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

pub fn read(project: &Project, limit: usize, observed: &str) -> Snapshot {
    let config = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".claude"));
    read_from(project, limit, observed, &config)
}
pub fn read_from(project: &Project, limit: usize, observed: &str, config: &Path) -> Snapshot {
    let mut result = Snapshot::new("local-transcripts");
    result.adapter = Some("claude-jsonl-v1".into());
    if let Err(e) = collect(project, limit, observed, config, &mut result) {
        result.error = Some(e.json());
    }
    result.finish(limit)
}
fn encoded(path: &Path) -> String {
    path.to_string_lossy()
        .encode_utf16()
        .map(|unit| {
            if unit <= 127 && (unit as u8).is_ascii_alphanumeric() {
                char::from(unit as u8)
            } else {
                '-'
            }
        })
        .collect()
}
fn collect(
    project: &Project,
    limit: usize,
    observed: &str,
    config: &Path,
    result: &mut Snapshot,
) -> Result<()> {
    if config.exists() && !config.is_dir() {
        return Err(Error::new(
            "PROVIDER_READ_FAILED",
            "The Claude configuration path is not a directory.",
        ));
    }
    let projects = config.join("projects");
    if projects.exists() && !projects.is_dir() {
        return Err(Error::new(
            "PROVIDER_READ_FAILED",
            "The Claude projects path is not a directory.",
        ));
    }
    let encoded = encoded(&project.root);
    let mut directories = Vec::new();
    let entries = match fs::read_dir(&projects) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => {
            return Err(Error::io(
                "PROVIDER_READ_FAILED",
                "Cannot list Claude project transcripts.",
                &e,
            ));
        }
    };
    for entry in entries {
        let entry = entry.map_err(|e| {
            Error::io(
                "PROVIDER_READ_FAILED",
                "Cannot inspect Claude project transcripts.",
                &e,
            )
        })?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.eq_ignore_ascii_case(&encoded)
            || (encoded.len() > 200 && name.starts_with(&format!("{}-", &encoded[..200])))
        {
            directories.push(entry.path());
        }
    }
    let mut files = Vec::new();
    for directory in directories {
        if project::linked(&directory).unwrap_or(true) {
            result
                .warnings
                .push(json!({"code":"LINKED_TRANSCRIPT_DIRECTORY"}));
            continue;
        }
        for entry in fs::read_dir(directory).map_err(|e| {
            Error::io(
                "PROVIDER_READ_FAILED",
                "Cannot read Claude project transcripts.",
                &e,
            )
        })? {
            let entry = entry.map_err(|e| {
                Error::io(
                    "PROVIDER_READ_FAILED",
                    "Cannot inspect Claude transcript.",
                    &e,
                )
            })?;
            let file = entry.path();
            let Some(id) = file.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if file.extension().is_none_or(|s| s != "jsonl")
                || uuid::Uuid::parse_str(id).is_err()
                || id.len() != 36
            {
                continue;
            }
            let modified = entry.metadata().and_then(|m| m.modified()).ok();
            files.push((file, modified));
        }
    }
    files.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
    for (file, _) in files {
        if result.items_read >= limit {
            break;
        }
        let id = file
            .file_stem()
            .and_then(|s| s.to_str())
            .expect("UUID filename");
        match read_session(project, &file, &mut result.warnings) {
            Ok(Some(messages)) => {
                let messages = messages
                    .into_iter()
                    .take(limit - result.items_read)
                    .collect::<Vec<_>>();
                result.items_read += messages.len();
                result.append(records::claude(project, id, &messages, observed));
                result.sessions_read += 1;
            }
            Ok(None) => (),
            Err(error) => {
                let mut warning = error.json();
                warning["sessionId"] = json!(id);
                result.warnings.push(warning);
            }
        }
    }
    Ok(())
}
fn open(file: &Path) -> Result<BufReader<fs::File>> {
    if project::linked(file).unwrap_or(true) || !file.is_file() {
        return Err(Error::new(
            "PROVIDER_READ_FAILED",
            "The transcript must be a regular local file.",
        ));
    }
    Ok(BufReader::new(fs::File::open(file).map_err(|e| {
        Error::io("PROVIDER_READ_FAILED", "Cannot open Claude transcript.", &e)
    })?))
}
fn read_session(
    project: &Project,
    file: &Path,
    warnings: &mut Vec<Value>,
) -> Result<Option<Vec<Value>>> {
    let mut reader = open(file)?;
    let mut line = Vec::new();
    let mut cwd = None;
    let mut scanned = 0;
    // Resolve ownership from metadata before reading the complete conversation.
    loop {
        line.clear();
        let count = read_line(&mut reader, &mut line)?;
        if count == 0 {
            break;
        }
        scanned += count;
        if let Ok(value) = serde_json::from_slice::<Value>(&line) {
            if value["isSidechain"] == true {
                return Ok(None);
            }
            if let Some(path) = value["cwd"].as_str() {
                cwd = Some(path.to_owned());
                break;
            }
        }
        if scanned > 1024 * 1024 {
            break;
        }
    }
    project::assert_scope(project, cwd.as_deref().unwrap_or(""))?;
    let mut entries = Vec::new();
    let mut queue_operations = Vec::new();
    let mut reader = open(file)?;
    let mut versions = HashSet::new();
    loop {
        line.clear();
        let count = read_line(&mut reader, &mut line)?;
        if count == 0 {
            break;
        }
        match serde_json::from_slice::<Value>(&line) {
            Ok(value) => {
                if value["type"] == "queue-operation" {
                    queue_operations.push(value);
                    continue;
                }
                if let Some(version) = value["version"].as_str() {
                    versions.insert(version.to_owned());
                }
                if value["type"] == "relocated"
                    && let Some(path) = value["relocatedCwd"].as_str()
                {
                    project::assert_scope(project, path)?;
                }
                if matches!(
                    value["type"].as_str(),
                    Some("user" | "assistant" | "system" | "progress" | "attachment")
                ) && value["uuid"].is_string()
                {
                    entries.push(value);
                }
            }
            Err(_) => {
                if !line.iter().all(|b| b.is_ascii_whitespace()) {
                    warnings.push(json!({"code":if line.last()==Some(&b'\n'){"INVALID_TRANSCRIPT_LINE"}else{"INCOMPLETE_TRANSCRIPT_LINE"},"sessionId":file.file_stem().and_then(|s|s.to_str())}));
                }
            }
        }
    }
    for version in versions {
        if !version.starts_with("2.1.") {
            warnings.push(json!({"code":"UNVERIFIED_CLAUDE_FORMAT","version":version}));
        }
    }
    Ok(Some(active_with_receipts(
        entries,
        &queue_operations,
        warnings,
    )))
}
fn read_line(reader: &mut impl BufRead, bytes: &mut Vec<u8>) -> Result<usize> {
    loop {
        let buffer = reader
            .fill_buf()
            .map_err(|e| Error::io("PROVIDER_READ_FAILED", "Cannot read Claude transcript.", &e))?;
        if buffer.is_empty() {
            return Ok(bytes.len());
        }
        let end = buffer.iter().position(|b| *b == b'\n');
        let count = end.map(|n| n + 1).unwrap_or(buffer.len());
        if bytes.len() + count > 16 * 1024 * 1024 {
            return Err(Error::new(
                "TRANSCRIPT_LINE_TOO_LARGE",
                "Claude transcript line exceeds the supported size.",
            ));
        }
        bytes.extend_from_slice(&buffer[..count]);
        reader.consume(count);
        if end.is_some() {
            return Ok(bytes.len());
        }
    }
}
pub fn active_messages(entries: Vec<Value>, warnings: &mut Vec<Value>) -> Vec<Value> {
    active_with_receipts(entries, &[], warnings)
}

fn active_with_receipts(
    entries: Vec<Value>,
    operations: &[Value],
    warnings: &mut Vec<Value>,
) -> Vec<Value> {
    let receipts = claude_queue::Receipts::read(&entries, operations, warnings);
    let mut ordered = Vec::<String>::new();
    let mut by_id = HashMap::new();
    for entry in entries {
        let id = entry["uuid"].as_str().expect("entry id").to_owned();
        if !by_id.contains_key(&id) {
            ordered.push(id.clone());
        }
        by_id.insert(id, entry);
    }
    for id in ordered.clone() {
        let entry = &by_id[&id];
        if entry["type"] != "system" || entry["subtype"] != "compact_boundary" {
            continue;
        }
        let metadata = entry["compactMetadata"].clone();
        let (anchor, head, tail, chain) =
            if let Some(ids) = metadata["preservedMessages"]["uuids"].as_array() {
                let ids = ids
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect::<Vec<_>>();
                if ids.is_empty() || ids.iter().any(|id| !by_id.contains_key(id)) {
                    warnings.push(json!({"code":"UNRESOLVED_COMPACTION","itemId":id}));
                    continue;
                }
                (
                    metadata["preservedMessages"]["anchorUuid"].clone(),
                    ids[0].clone(),
                    ids.last().unwrap().clone(),
                    Some(ids),
                )
            } else if let Some(head) = metadata["preservedSegment"]["headUuid"].as_str() {
                (
                    metadata["preservedSegment"]["anchorUuid"].clone(),
                    head.to_owned(),
                    metadata["preservedSegment"]["tailUuid"]
                        .as_str()
                        .unwrap_or(head)
                        .to_owned(),
                    None,
                )
            } else {
                continue;
            };
        if let Some(chain) = chain {
            let mut parent = anchor.clone();
            for id in chain {
                by_id.get_mut(&id).expect("known id")["parentUuid"] = parent;
                parent = json!(id);
            }
        } else if let Some(entry) = by_id.get_mut(&head) {
            entry["parentUuid"] = anchor.clone();
        }
        for (id, entry) in &mut by_id {
            if *id != head && entry["parentUuid"] == anchor {
                entry["parentUuid"] = json!(tail);
            }
        }
    }
    let main = |entry: &Value| {
        entry["isSidechain"] != true
            && entry["teamName"].as_str().is_none_or(str::is_empty)
            && entry["type"] != "progress"
    };
    let parents = by_id
        .values()
        .filter(|entry| main(entry))
        .filter_map(|entry| entry["parentUuid"].as_str())
        .collect::<HashSet<_>>();
    let leaf = ordered
        .iter()
        .rev()
        .find(|id| main(&by_id[*id]) && !parents.contains(id.as_str()))
        .cloned();
    let Some(mut id) = leaf else {
        return Vec::new();
    };
    let mut chain = Vec::new();
    let mut seen = HashSet::new();
    while let Some(entry) = by_id.get(&id) {
        if !seen.insert(id.clone()) {
            warnings.push(json!({"code":"CYCLIC_TRANSCRIPT","itemId":id}));
            break;
        }
        chain.push(id.clone());
        let Some(parent) = entry["parentUuid"].as_str() else {
            break;
        };
        id = parent.to_owned();
    }
    chain.reverse();
    let model_ids = chain
        .iter()
        .filter_map(|id| by_id[id]["message"]["id"].as_str())
        .collect::<HashSet<_>>();
    let included = ordered
        .iter()
        .filter(|id| {
            seen.contains(*id)
                || by_id[*id]["type"] == "assistant"
                    && by_id[*id]["isSidechain"] != true
                    && by_id[*id]["message"]["id"]
                        .as_str()
                        .is_some_and(|id| model_ids.contains(id))
        })
        .cloned()
        .collect::<HashSet<_>>();
    // Preserve chain order; streamed siblings share a model message ID.
    let mut output = Vec::new();
    let mut emitted = HashSet::new();
    for id in chain {
        let model = by_id[&id]["message"]["id"].as_str();
        let group = if by_id[&id]["type"] == "assistant" && model.is_some() {
            let mut group = vec![id.clone()];
            group.extend(
                ordered
                    .iter()
                    .filter(|other| {
                        included.contains(*other)
                            && !seen.contains(*other)
                            && by_id[*other]["message"]["id"].as_str() == model
                    })
                    .cloned(),
            );
            group
        } else {
            vec![id]
        };
        for id in group {
            let entry = &by_id[&id];
            if emitted.insert(id) {
                output.push(entry.clone());
            }
        }
    }
    claude_queue::visible_messages(output, &receipts, warnings)
}
