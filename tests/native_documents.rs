use serde_json::Value;
use silolink::project;
use std::{
    fs,
    path::Path,
    process::{Command, Output},
};
use tempfile::TempDir;

fn run(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_silolink"))
        .arg("docs")
        .args(args)
        .current_dir(root)
        .env_remove("SILOLINK_STATE_DIR")
        .output()
        .unwrap()
}
fn report(output: &Output) -> Value {
    assert!(
        output.status.success(),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}
fn write(root: &Path, path: &str, text: &str) {
    let path = root.join(path);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
fn doc<'a>(report: &'a Value, path: &str) -> &'a Value {
    report["documents"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["path"] == path)
        .unwrap()
}

#[test]
fn inventory_connects_scattered_documents_with_evidence_and_never_changes_them() {
    let temp = TempDir::new().unwrap();
    let root = temp.path();
    project::init(root).unwrap();
    write(
        root,
        "README.md",
        "# Project\n[Guide](docs/guide.md)\n[Missing](docs/gone.md)\n",
    );
    write(
        root,
        "docs/guide.md",
        "# Guide\n\n## Setup\nKeep this text.\n",
    );
    write(
        root,
        "notes/copy.markdown",
        "# Guide\n\n## Setup\nKeep this text.\n",
    );
    write(root, "loose.md", "unstructured notes\n");
    let before = fs::read(root.join("README.md")).unwrap();
    let metadata = fs::read(root.join(".silolink/project.json")).unwrap();
    let first = report(&run(root, &[]));
    assert_eq!(first["command"], "docs");
    assert_eq!(first["mode"], "document-inventory");
    assert_eq!(first["documents"].as_array().unwrap().len(), 4);
    assert_eq!(doc(&first, "docs/guide.md")["title"], "Guide");
    assert_eq!(doc(&first, "docs/guide.md")["headings"][1]["line"], 3);
    assert_eq!(doc(&first, "README.md")["links"][0]["status"], "exists");
    assert_eq!(doc(&first, "README.md")["links"][1]["status"], "missing");
    let proposals = first["proposals"].as_array().unwrap();
    let duplicate = proposals
        .iter()
        .find(|p| p["kind"] == "review-identical-content")
        .unwrap();
    assert_eq!(duplicate["documents"].as_array().unwrap().len(), 2);
    assert_eq!(duplicate["incomingLinks"][0]["source"], "README.md");
    assert!(proposals.iter().all(|p| p["requiresReview"] == true));
    assert!(proposals.iter().any(|p| p["kind"] == "repair-local-links"));
    assert!(proposals.iter().any(|p| p["kind"] == "add-document-title"));
    let second = report(&run(root, &[]));
    assert_eq!(first["documents"], second["documents"]);
    assert_eq!(first["proposals"], second["proposals"]);
    assert_eq!(fs::read(root.join("README.md")).unwrap(), before);
    assert_eq!(
        fs::read(root.join(".silolink/project.json")).unwrap(),
        metadata
    );
    assert_eq!(fs::read_dir(root.join(".silolink")).unwrap().count(), 1);
}

#[test]
fn markdown_links_use_the_parser_and_do_not_treat_code_or_urls_as_missing_files() {
    let temp = TempDir::new().unwrap();
    project::init(temp.path()).unwrap();
    write(temp.path(), "docs/한글 guide.md", "Guide\n=====\n");
    write(
        temp.path(),
        "README.md",
        "---\ntitle: Metadata\n---\n# **Project** `CLI`\n\n[ref][guide]\n\n[guide]: docs/%ED%95%9C%EA%B8%80%20guide.md#setup\n[web](https://example.invalid/no.md)\n[anchor](#intro)\n![image](assets/missing.png)\n[escape](../outside.md)\n[root](/docs/%ED%95%9C%EA%B8%80%20guide.md)\n\n```md\n[fake](not-a-link.md)\n```\n`[also fake](no.md)`\n",
    );
    let result = report(&run(temp.path(), &[]));
    let readme = doc(&result, "README.md");
    assert_eq!(readme["title"], "Project CLI");
    let links = readme["links"].as_array().unwrap();
    assert_eq!(links.len(), 6);
    assert_eq!(links[0]["target"], "docs/한글 guide.md");
    assert_eq!(links[0]["status"], "exists");
    assert_eq!(links[0]["fragmentChecked"], false);
    assert_eq!(links[1]["status"], "external");
    assert_eq!(links[2]["status"], "fragment-unchecked");
    assert_eq!(links[3]["kind"], "image");
    assert_eq!(links[3]["status"], "missing");
    assert_eq!(links[4]["status"], "outside-project");
    assert_eq!(links[5]["status"], "exists");
    assert_eq!(doc(&result, "docs/한글 guide.md")["title"], "Guide");
}

#[test]
fn scan_respects_gitignore_generated_paths_nested_projects_and_link_boundaries() {
    let temp = TempDir::new().unwrap();
    let foreign = TempDir::new().unwrap();
    project::init(temp.path()).unwrap();
    write(temp.path(), ".gitignore", "private/\n*.secret.md\n");
    for path in [
        "private/personal.md",
        "a.secret.md",
        "node_modules/package/README.md",
        "target/generated.md",
        ".tools/vendor.md",
        ".silolink/internal.md",
    ] {
        write(temp.path(), path, "# Excluded\n");
    }
    write(temp.path(), "nested/README.md", "# Another project\n");
    project::init(&temp.path().join("nested")).unwrap();
    write(foreign.path(), "secret.md", "# Foreign\n");
    support::directory_link(foreign.path(), &temp.path().join("linked"));
    write(
        temp.path(),
        "README.md",
        "# Local\n[external](linked/secret.md)\n[ignored](private/personal.md)\n[child](nested/README.md)\n",
    );
    let result = report(&run(temp.path(), &[]));
    assert_eq!(result["documents"].as_array().unwrap().len(), 1);
    assert!(
        result["excluded"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["path"] == "linked" && e["reason"] == "linked-path")
    );
    assert!(
        result["excluded"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["path"] == "nested" && e["reason"] == "nested-project")
    );
    let links = doc(&result, "README.md")["links"].as_array().unwrap();
    assert_eq!(links[0]["status"], "excluded");
    assert_eq!(links[1]["status"], "excluded");
    assert_eq!(links[2]["status"], "excluded");
    assert_eq!(
        fs::read_to_string(foreign.path().join("secret.md")).unwrap(),
        "# Foreign\n"
    );
}

#[test]
fn document_identity_survives_edits_and_same_titles_are_only_comparison_candidates() {
    let temp = TempDir::new().unwrap();
    project::init(temp.path()).unwrap();
    write(temp.path(), "a.md", "# Policy\nLocal rule A\n");
    write(temp.path(), "b.md", "# Policy\nDifferent rule B\n");
    let first = report(&run(temp.path(), &[]));
    assert!(
        !first["proposals"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["kind"] == "review-identical-content")
    );
    assert!(
        first["proposals"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["kind"] == "compare-same-title" && p["basis"] == "same-title-only")
    );
    write(temp.path(), "a.md", "# Policy\nEdited rule A\n");
    let second = report(&run(temp.path(), &[]));
    assert_eq!(doc(&first, "a.md")["id"], doc(&second, "a.md")["id"]);
    assert_ne!(
        doc(&first, "a.md")["revision"],
        doc(&second, "a.md")["revision"]
    );
}

#[test]
fn invalid_or_large_documents_are_reported_as_partial_without_losing_readable_documents() {
    let temp = TempDir::new().unwrap();
    project::init(temp.path()).unwrap();
    write(temp.path(), "valid.md", "# Valid\n");
    fs::write(temp.path().join("binary.md"), [0xff, 0xfe, 0x00]).unwrap();
    fs::write(
        temp.path().join("large.md"),
        vec![b'x'; 2 * 1024 * 1024 + 1],
    )
    .unwrap();
    let output = run(temp.path(), &[]);
    assert_eq!(output.status.code(), Some(2));
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["status"], "partial");
    assert_eq!(result["documents"].as_array().unwrap().len(), 1);
    let warnings = result["warnings"].as_array().unwrap();
    assert!(
        warnings
            .iter()
            .any(|w| w["code"] == "DOCUMENT_INVALID_UTF8" && w["path"] == "binary.md")
    );
    assert!(
        warnings
            .iter()
            .any(|w| w["code"] == "DOCUMENT_TOO_LARGE" && w["path"] == "large.md")
    );
}

#[test]
fn empty_and_uninitialized_projects_have_truthful_read_only_results() {
    let temp = TempDir::new().unwrap();
    let missing = run(temp.path(), &[]);
    assert_eq!(missing.status.code(), Some(1));
    let failure: Value = serde_json::from_slice(&missing.stderr).unwrap();
    assert_eq!(failure["error"]["code"], "PROJECT_NOT_INITIALIZED");
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
    project::init(temp.path()).unwrap();
    let empty = report(&run(temp.path(), &[]));
    assert!(empty["documents"].as_array().unwrap().is_empty());
    assert_eq!(empty["proposals"][0]["kind"], "review-documentation-gap");
    let invalid = run(temp.path(), &["--provider", "all"]);
    assert_eq!(invalid.status.code(), Some(1));
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}

#[test]
fn nested_ignore_rules_and_asset_links_keep_their_distinct_scope() {
    let temp = TempDir::new().unwrap();
    project::init(temp.path()).unwrap();
    write(temp.path(), ".gitignore", "notes/*\n!notes/keep.md\n");
    write(temp.path(), "notes/keep.md", "# Keep\n");
    write(temp.path(), "notes/drop.md", "# Drop\n");
    write(temp.path(), "docs/.gitignore", "scratch.md\n");
    write(temp.path(), "docs/scratch.md", "# Scratch\n");
    write(temp.path(), "docs/guide.md", "# Guide\n");
    write(temp.path(), "assets/example.txt", "Asset, not a document\n");
    write(
        temp.path(),
        "README.md",
        "# Project\n[asset](assets/example.txt)\n[private](docs/scratch.md)\n[kept](notes/keep.md)\n[not a directory](assets/example.txt/missing.md)\n",
    );
    let result = report(&run(temp.path(), &[]));
    assert_eq!(result["documents"].as_array().unwrap().len(), 3);
    let links = doc(&result, "README.md")["links"].as_array().unwrap();
    assert_eq!(links[0]["status"], "exists");
    assert_eq!(links[1]["status"], "excluded");
    assert_eq!(links[2]["status"], "exists");
    assert_eq!(links[3]["status"], "missing");
}

#[test]
fn scan_limits_mark_incomplete_coverage_instead_of_reporting_empty_success() {
    let temp = TempDir::new().unwrap();
    project::init(temp.path()).unwrap();
    write(temp.path(), "README.md", "# Project\n");
    let deep = std::iter::repeat_n("d", 64).collect::<Vec<_>>().join("/");
    write(temp.path(), &format!("{deep}/deep.md"), "# Too deep\n");
    let output = run(temp.path(), &[]);
    assert_eq!(output.status.code(), Some(2));
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(result["documents"].as_array().unwrap().len(), 1);
    assert!(
        result["warnings"]
            .as_array()
            .unwrap()
            .iter()
            .any(|w| w["code"] == "DOCUMENT_DEPTH_LIMIT")
    );
}

#[cfg(windows)]
#[test]
fn windows_case_insensitive_links_are_included_in_document_change_impact() {
    let temp = TempDir::new().unwrap();
    project::init(temp.path()).unwrap();
    write(
        temp.path(),
        "README.md",
        "# Project\n[Guide](DOCS/GUIDE.md)\n",
    );
    write(temp.path(), "docs/guide.md", "# Guide\nSame content\n");
    write(temp.path(), "copy.md", "# Guide\nSame content\n");
    let result = report(&run(temp.path(), &[]));
    let duplicate = result["proposals"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["kind"] == "review-identical-content")
        .unwrap();
    assert_eq!(duplicate["incomingLinks"].as_array().unwrap().len(), 1);
    assert_eq!(duplicate["incomingLinks"][0]["target"], "docs/guide.md");
}
mod support;
