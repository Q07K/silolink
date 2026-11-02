use crate::{
    project::{self, Project},
    providers, records,
};
use serde_json::{Value, json};
pub async fn collect(project: &Project, provider: &str, limit: usize) -> Value {
    let observed = project::now();
    let names = if provider == "all" {
        vec!["codex", "claude"]
    } else {
        vec![provider]
    };
    let mut records = Vec::new();
    let mut sources = Vec::new();
    for provider in names {
        let result = if provider == "codex" {
            providers::codex::read(project, limit, &observed).await
        } else {
            providers::claude::read(project, limit, &observed)
        };
        let (items, source) = result.split(provider);
        records.extend(items);
        sources.push(source);
    }
    records::deduplicate(&mut records);
    let status = if sources.iter().all(|s| s["status"] == "failed") {
        "failed"
    } else if sources.iter().any(|s| s["status"] != "success") {
        "partial"
    } else {
        "success"
    };
    json!({"schemaVersion":1,"mode":"text-history","status":status,"project":project.json(),"observedAt":observed,"limitPerProvider":limit,"scope":"exact-root","records":records,"sources":sources})
}
