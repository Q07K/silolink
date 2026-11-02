use crate::{
    error::{Error, Result},
    project::{self, Project},
};
use ignore::{IncrementalIgnore, WalkBuilder};
use percent_encoding::percent_decode_str;
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Read,
    path::{Component, Path, PathBuf},
    sync::{Arc, Mutex},
};

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024;
const MAX_DOCUMENTS: usize = 2000;
const MAX_ENTRIES: usize = 100_000;
const MAX_DEPTH: usize = 64;
const EXCLUDED_DIRECTORIES: &[&str] = &[
    ".git",
    ".silolink",
    ".tools",
    "node_modules",
    "target",
    "vendor",
    "dist",
    "build",
    ".venv",
    "venv",
    ".next",
];

/// Read a document from the same inventory exposed by `scan`, preserving its scope.
pub fn read(project: &Project, path: &str, expected_revision: Option<&str>) -> Result<Value> {
    let relative = Path::new(path);
    if path.is_empty()
        || path.contains('\\')
        || relative
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err(Error::new(
            "DOCUMENT_OUT_OF_SCOPE",
            "Choose a document in this project.",
        ));
    }
    let inventory = scan(project)?;
    let document = inventory["documents"]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|item| item["path"].as_str() == Some(path))
        })
        .ok_or_else(|| {
            Error::new(
                "DOCUMENT_OUT_OF_SCOPE",
                "This document is excluded, missing, or outside the project.",
            )
        })?;
    let mut filename = project.root.clone();
    for part in relative.components() {
        filename.push(part);
        if project::linked(&filename)
            .map_err(|e| Error::io("DOCUMENT_READ_FAILED", "Cannot inspect the document.", &e))?
        {
            return Err(Error::new(
                "DOCUMENT_OUT_OF_SCOPE",
                "Linked document paths are not read.",
            ));
        }
    }
    let mut bytes = Vec::new();
    File::open(&filename)
        .and_then(|file| file.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|e| Error::io("DOCUMENT_READ_FAILED", "Cannot read the document.", &e))?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(Error::new(
            "DOCUMENT_TOO_LARGE",
            "The document exceeds the reading limit.",
        ));
    }
    let revision = hash(&bytes);
    if document["revision"] != revision || expected_revision.is_some_and(|r| r != revision) {
        return Err(Error::new(
            "DOCUMENT_REVISION_CONFLICT",
            "The document changed; refresh it before continuing.",
        ));
    }
    let text = String::from_utf8(bytes)
        .map_err(|_| Error::new("DOCUMENT_INVALID_UTF8", "The document is not valid UTF-8."))?;
    let mut result = document.clone();
    result["text"] = json!(text);
    result["projectId"] = json!(project.id());
    Ok(result)
}

#[derive(Serialize)]
struct Heading {
    level: u8,
    text: String,
    line: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Link {
    destination: String,
    kind: &'static str,
    line: usize,
    status: &'static str,
    target: Option<String>,
    fragment_checked: bool,
}
#[derive(Serialize)]
struct Document {
    id: String,
    path: String,
    revision: String,
    bytes: u64,
    title: Option<String>,
    headings: Vec<Heading>,
    links: Vec<Link>,
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}
fn warn(warnings: &mut Vec<Value>, code: &str, path: &str) {
    warnings.push(json!({"code":code,"path":path}));
}
fn excluded_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|s| s.to_str())
        .is_some_and(|s| EXCLUDED_DIRECTORIES.contains(&s))
}
fn markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("md") || s.eq_ignore_ascii_case("markdown"))
}

// Resolve only project-relative paths. Each ancestor is checked before following it.
fn local_target(
    root: &Path,
    source: &Path,
    destination: &str,
    matcher: &mut IncrementalIgnore,
    warnings: &mut Vec<Value>,
) -> (&'static str, Option<String>) {
    if destination.starts_with("//") {
        return ("external", None);
    }
    if let Some((scheme, _)) = destination.split_once(':')
        && !scheme.is_empty()
        && scheme.as_bytes()[0].is_ascii_alphabetic()
        && scheme
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'-' | b'.'))
    {
        return ("external", None);
    }
    let encoded = destination.split(['#', '?']).next().unwrap_or("");
    if encoded.is_empty() {
        return ("fragment-unchecked", None);
    }
    let Ok(decoded) = percent_decode_str(encoded).decode_utf8() else {
        return ("invalid-path", None);
    };
    let decoded = decoded.replace('\\', "/");
    if decoded.contains('\0') || decoded.contains(':') {
        return ("invalid-path", None);
    }
    let mut path = if decoded.starts_with('/') {
        PathBuf::new()
    } else {
        source.parent().unwrap_or(Path::new("")).to_path_buf()
    };
    for component in Path::new(decoded.trim_start_matches('/')).components() {
        match component {
            Component::Normal(name) => path.push(name),
            Component::CurDir => (),
            Component::ParentDir => {
                if !path.pop() {
                    return ("outside-project", None);
                }
            }
            _ => return ("outside-project", None),
        }
    }
    let target = relative(Path::new(""), &path);
    let mut prefix = root.to_path_buf();
    for component in path.components() {
        prefix.push(component.as_os_str());
        match fs::symlink_metadata(&prefix) {
            Ok(metadata) => {
                if project::linked(&prefix).unwrap_or(true) {
                    return ("excluded", Some(target));
                }
                if metadata.is_dir()
                    && (excluded_directory(&prefix)
                        || prefix
                            .join(".silolink/project.json")
                            .symlink_metadata()
                            .is_ok())
                {
                    return ("excluded", Some(target));
                }
                let (matched, error) = matcher
                    .matched_with_errors(prefix.strip_prefix(root).unwrap(), metadata.is_dir());
                if error.is_some() {
                    warn(
                        warnings,
                        "IGNORE_RULES_INCOMPLETE",
                        &relative(root, &prefix),
                    );
                }
                if matched.is_ignore() {
                    return ("excluded", Some(target));
                }
            }
            Err(e)
                if matches!(
                    e.kind(),
                    std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
                ) =>
            {
                return ("missing", Some(target));
            }
            Err(_) => {
                warn(warnings, "LINK_TARGET_UNREADABLE", &relative(root, &prefix));
                return ("unreadable", Some(target));
            }
        }
    }
    // Windows links may spell the same path with different letter casing.
    // Use the filesystem spelling so incoming links join the inventory paths.
    match dunce::canonicalize(root.join(&path)) {
        Ok(canonical) if canonical.starts_with(root) => {
            ("exists", Some(relative(root, &canonical)))
        }
        Ok(_) => ("outside-project", None),
        Err(_) => {
            warn(warnings, "LINK_TARGET_UNREADABLE", &target);
            ("unreadable", Some(target))
        }
    }
}

fn parse(
    project: &Project,
    path: &Path,
    bytes: &[u8],
    text: &str,
    matcher: &mut IncrementalIgnore,
    warnings: &mut Vec<Value>,
) -> Document {
    let mut headings = Vec::new();
    let mut heading: Option<Heading> = None;
    let mut links = Vec::new();
    let line_starts: Vec<_> = std::iter::once(0)
        .chain(
            text.bytes()
                .enumerate()
                .filter_map(|(i, b)| (b == b'\n').then_some(i + 1)),
        )
        .collect();
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS;
    for (event, range) in Parser::new_ext(text, options).into_offset_iter() {
        let line = line_starts.partition_point(|start| *start <= range.start);
        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                heading = Some(Heading {
                    level: level as u8,
                    text: String::new(),
                    line,
                })
            }
            Event::Text(text) | Event::Code(text) if heading.is_some() => {
                heading.as_mut().unwrap().text.push_str(&text)
            }
            Event::SoftBreak | Event::HardBreak if heading.is_some() => {
                heading.as_mut().unwrap().text.push(' ')
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some(mut value) = heading.take() {
                    value.text = value.text.trim().to_owned();
                    headings.push(value);
                }
            }
            Event::Start(tag @ (Tag::Link { .. } | Tag::Image { .. })) => {
                let (destination, kind) = match tag {
                    Tag::Link { dest_url, .. } => (dest_url.into_string(), "link"),
                    Tag::Image { dest_url, .. } => (dest_url.into_string(), "image"),
                    _ => unreachable!(),
                };
                let (status, target) =
                    local_target(&project.root, path, &destination, matcher, warnings);
                links.push(Link {
                    destination,
                    kind,
                    line,
                    status,
                    target,
                    fragment_checked: false,
                });
            }
            _ => (),
        }
    }
    let title = headings
        .iter()
        .find(|h| !h.text.is_empty())
        .map(|h| h.text.clone());
    let path = relative(Path::new(""), path);
    Document {
        id: hash(
            serde_json::to_string(&[project.id(), path.as_str()])
                .expect("document identity JSON")
                .as_bytes(),
        ),
        path,
        revision: hash(bytes),
        bytes: bytes.len() as u64,
        title,
        headings,
        links,
    }
}

fn proposal(
    kind: &str,
    basis: &str,
    documents: &[&Document],
    incoming: &BTreeMap<&str, Vec<Value>>,
) -> Value {
    let references: Vec<_> = documents
        .iter()
        .flat_map(|doc| incoming.get(doc.path.as_str()).into_iter().flatten())
        .collect();
    json!({"kind":kind,"basis":basis,"requiresReview":true,"documents":documents.iter().map(|d| json!({"path":d.path,"revision":d.revision})).collect::<Vec<_>>(),"incomingLinks":references})
}
fn proposals(documents: &[Document]) -> Vec<Value> {
    let mut result = Vec::new();
    if documents.is_empty() {
        result.push(json!({"kind":"review-documentation-gap","basis":"no-readable-markdown-in-scope","requiresReview":true,"documents":[],"incomingLinks":[]}));
    }
    let mut identical: BTreeMap<&str, Vec<&Document>> = BTreeMap::new();
    let mut titles: BTreeMap<&str, Vec<&Document>> = BTreeMap::new();
    let mut incoming: BTreeMap<&str, Vec<Value>> = BTreeMap::new();
    for doc in documents {
        for link in &doc.links {
            if let Some(target) = link.target.as_deref() {
                incoming.entry(target).or_default().push(json!({"source":doc.path,"sourceRevision":doc.revision,"line":link.line,"destination":link.destination,"target":target}));
            }
        }
    }
    for doc in documents {
        if doc.bytes > 0 {
            identical.entry(&doc.revision).or_default().push(doc);
        }
        if let Some(title) = doc.title.as_deref() {
            titles.entry(title).or_default().push(doc);
        } else {
            result.push(proposal(
                "add-document-title",
                "no-markdown-heading",
                &[doc],
                &incoming,
            ));
        }
        let missing: Vec<_> = doc.links.iter().filter(|l| l.status == "missing").collect();
        if !missing.is_empty() {
            let mut value = proposal(
                "repair-local-links",
                "missing-local-target",
                &[doc],
                &incoming,
            );
            value["links"] = json!(missing);
            result.push(value);
        }
    }
    for group in identical.values().filter(|g| g.len() > 1) {
        result.push(proposal(
            "review-identical-content",
            "byte-identical",
            group,
            &incoming,
        ));
    }
    for group in titles
        .values()
        .filter(|g| g.len() > 1 && g.iter().any(|d| d.revision != g[0].revision))
    {
        result.push(proposal(
            "compare-same-title",
            "same-title-only",
            group,
            &incoming,
        ));
    }
    result
}

/// Read-only inventory: no model, persistent index, document rewrite, or implicit init.
pub fn scan(project: &Project) -> Result<Value> {
    let excluded = Arc::new(Mutex::new(Vec::new()));
    let filtered = Arc::clone(&excluded);
    let root = project.root.clone();
    let mut builder = WalkBuilder::new(&root);
    builder
        .standard_filters(false)
        .git_ignore(true)
        .require_git(false)
        .parents(false)
        .follow_links(false)
        .sort_by_file_path(|a, b| a.cmp(b));
    let mut matcher = builder.build_matchers().remove(0);
    builder.filter_entry(move |entry| {
        if entry.depth() == 0 {
            return true;
        }
        let path = entry.path();
        let reason = if project::linked(path).unwrap_or(false) {
            Some("linked-path")
        } else if entry.file_type().is_some_and(|t| t.is_dir()) {
            if excluded_directory(path) {
                Some("excluded-directory")
            } else if path
                .join(".silolink/project.json")
                .symlink_metadata()
                .is_ok()
            {
                Some("nested-project")
            } else if entry.depth() >= MAX_DEPTH {
                Some("depth-limit")
            } else {
                None
            }
        } else {
            None
        };
        if let Some(reason) = reason {
            filtered
                .lock()
                .expect("scan exclusions")
                .push(json!({"path":relative(&root,path),"reason":reason}));
            false
        } else {
            true
        }
    });
    let mut documents = Vec::new();
    let mut warnings = Vec::new();
    let mut total_bytes = 0;
    for (visited, entry) in builder.build().enumerate() {
        if visited >= MAX_ENTRIES {
            warn(&mut warnings, "DOCUMENT_ENTRY_LIMIT", "");
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                warn(&mut warnings, "DOCUMENT_TRAVERSAL_INCOMPLETE", "");
                continue;
            }
        };
        if entry.error().is_some() {
            warn(
                &mut warnings,
                "IGNORE_RULES_INCOMPLETE",
                &relative(&project.root, entry.path()),
            );
        }
        if !entry.file_type().is_some_and(|t| t.is_file()) || !markdown(entry.path()) {
            continue;
        }
        let path = relative(&project.root, entry.path());
        if entry.path().to_str().is_none() {
            warn(&mut warnings, "DOCUMENT_INVALID_PATH", &path);
            continue;
        }
        if documents.len() >= MAX_DOCUMENTS {
            warn(&mut warnings, "DOCUMENT_COUNT_LIMIT", &path);
            break;
        }
        if project::linked(entry.path()).unwrap_or(true) {
            warn(&mut warnings, "DOCUMENT_PATH_CHANGED", &path);
            continue;
        }
        let bytes = match File::open(entry.path()).and_then(|file| {
            let mut bytes = Vec::new();
            file.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes)?;
            Ok(bytes)
        }) {
            Ok(bytes) => bytes,
            Err(_) => {
                warn(&mut warnings, "DOCUMENT_UNREADABLE", &path);
                continue;
            }
        };
        if bytes.len() as u64 > MAX_FILE_BYTES {
            warn(&mut warnings, "DOCUMENT_TOO_LARGE", &path);
            continue;
        }
        total_bytes += bytes.len() as u64;
        if total_bytes > MAX_TOTAL_BYTES {
            warn(&mut warnings, "DOCUMENT_BYTE_LIMIT", &path);
            break;
        }
        let text = match std::str::from_utf8(&bytes) {
            Ok(text) => text,
            Err(_) => {
                warn(&mut warnings, "DOCUMENT_INVALID_UTF8", &path);
                continue;
            }
        };
        documents.push(parse(
            project,
            Path::new(&path),
            &bytes,
            text,
            &mut matcher,
            &mut warnings,
        ));
    }
    documents.sort_by(|a, b| a.path.cmp(&b.path));
    let mut excluded = excluded.lock().expect("scan exclusions").clone();
    excluded.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    for entry in &excluded {
        if entry["reason"] == "depth-limit" {
            warn(
                &mut warnings,
                "DOCUMENT_DEPTH_LIMIT",
                entry["path"].as_str().unwrap(),
            );
        }
    }
    warnings.sort_by_key(Value::to_string);
    warnings.dedup();
    let proposals = proposals(&documents);
    Ok(json!({
        "schemaVersion": 1,
        "command": "docs",
        "mode": "document-inventory",
        "status": if warnings.is_empty() { "success" } else { "partial" },
        "project": project.json(),
        "observedAt": project::now(),
        "coverage": {
            "extensions": ["md", "markdown"],
            "gitignore": "project-and-descendants",
            "hiddenFiles": true,
            "excludedDirectoryNames": EXCLUDED_DIRECTORIES,
            "maxFileBytes": MAX_FILE_BYTES,
            "maxTotalBytes": MAX_TOTAL_BYTES,
            "maxDocuments": MAX_DOCUMENTS,
            "maxEntries": MAX_ENTRIES,
            "maxDepth": MAX_DEPTH,
            "fragmentValidation": false,
            "htmlAndWikiLinks": false,
            "semanticAnalysis": false
        },
        "documents": documents,
        "proposals": proposals,
        "excluded": excluded,
        "warnings": warnings
    }))
}
