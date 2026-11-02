use crate::project::Project;
use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

#[derive(Default, Debug, Serialize)]
pub struct Normalized {
    pub records: Vec<Value>,
    pub warnings: Vec<Value>,
    pub omitted: HashMap<String, u64>,
}
pub fn source_id(value: &Value) -> Option<&str> {
    value.as_str().filter(|s| !s.trim().is_empty())
}
fn hash(value: &impl Serialize) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("serializable record"))
    )
}
pub fn timestamp(value: &Value) -> Option<String> {
    let text = value.as_str()?;
    if text.as_bytes().get(10) != Some(&b'T') {
        return None;
    }
    DateTime::parse_from_rfc3339(text).ok().map(|d| {
        d.with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true)
    })
}
fn text_parts(content: &Value, omitted: &mut HashMap<String, u64>) -> Vec<String> {
    if let Some(text) = content.as_str() {
        return if text.is_empty() {
            vec![]
        } else {
            vec![text.to_owned()]
        };
    }
    let mut parts = Vec::new();
    if let Some(blocks) = content.as_array() {
        for block in blocks {
            if block["type"] == "text" && block["text"].is_string() {
                if let Some(text) = block["text"].as_str().filter(|s| !s.is_empty()) {
                    parts.push(text.to_owned());
                }
            } else {
                *omitted
                    .entry(
                        block["type"]
                            .as_str()
                            .unwrap_or("unknownContent")
                            .to_owned(),
                    )
                    .or_default() += 1;
            }
        }
    }
    parts
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Revision<'a> {
    role: &'a str,
    parts: &'a [String],
    occurred_at: &'a Option<String>,
    time_basis: &'a str,
    phase: &'a Value,
}
fn record(project: &Project, source: Value, observed: &str, value: Revision<'_>) -> Value {
    let id = hash(&json!([
        source["provider"],
        source["sessionId"],
        source["itemId"]
    ]));
    // Field order intentionally matches the v1 JavaScript hash contract.
    let revision = hash(&value);
    let Revision {
        role,
        parts,
        occurred_at,
        time_basis: basis,
        phase,
    } = value;
    json!({"schemaVersion":1,"id":id,"revision":revision,"projectId":project.id(),"source":source,"role":role,
        "text":parts.join("\n"),"textParts":parts,"timeBasis":if occurred_at.is_some(){basis}else{"unknown"},"occurredAt":occurred_at,"observedAt":observed,"phase":phase})
}
pub fn claude(
    project: &Project,
    container: &str,
    messages: &[Value],
    observed: &str,
) -> Normalized {
    let mut result = Normalized::default();
    for message in messages {
        let Some(id) = source_id(&message["uuid"]) else {
            result.warnings.push(json!({"code":"MISSING_SOURCE_ID"}));
            continue;
        };
        let Some(origin) =
            source_id(&message["session_id"]).or_else(|| source_id(&message["sessionId"]))
        else {
            result
                .warnings
                .push(json!({"code":"MISSING_SOURCE_SESSION","itemId":id}));
            continue;
        };
        let role = message["type"].as_str().unwrap_or("unknownItem");
        if !matches!(role, "user" | "assistant") {
            *result.omitted.entry(role.to_owned()).or_default() += 1;
            continue;
        }
        let parts = text_parts(&message["message"]["content"], &mut result.omitted);
        if parts.is_empty() {
            *result.omitted.entry("noText".into()).or_default() += 1;
            continue;
        }
        let mut source = json!({"provider":"claude","sessionId":origin,"itemId":id,"turnId":null,"sourceKind":null});
        if origin != container {
            source["containerSessionId"] = json!(container);
        }
        result.records.push(record(
            project,
            source,
            observed,
            Revision {
                role,
                parts: &parts,
                occurred_at: &timestamp(&message["timestamp"]),
                time_basis: "message",
                phase: &Value::Null,
            },
        ));
    }
    result
}
pub fn codex(project: &Project, thread: &Value, turns: &[Value], observed: &str) -> Normalized {
    let mut result = Normalized::default();
    for turn in turns {
        let Some(items) = turn["items"].as_array() else {
            result.warnings.push(json!({"code":"INVALID_TURN_ITEMS"}));
            continue;
        };
        for item in items {
            let Some(id) = source_id(&item["id"]) else {
                result.warnings.push(json!({"code":"MISSING_SOURCE_ID"}));
                continue;
            };
            let (role, content) = match item["type"].as_str().unwrap_or("unknownItem") {
                "userMessage" => ("user", &item["content"]),
                "agentMessage" => ("assistant", &item["text"]),
                kind => {
                    *result.omitted.entry(kind.into()).or_default() += 1;
                    continue;
                }
            };
            let parts = text_parts(content, &mut result.omitted);
            if parts.is_empty() {
                *result.omitted.entry("noText".into()).or_default() += 1;
                continue;
            }
            let occurred = turn["startedAt"]
                .as_f64()
                .filter(|s| s.is_finite())
                .and_then(|s| DateTime::from_timestamp_millis((s * 1000.0).trunc() as i64))
                .map(|d| d.to_rfc3339_opts(SecondsFormat::Millis, true));
            let source = json!({"provider":"codex","sessionId":thread["id"],"itemId":id,"turnId":source_id(&turn["id"]),"sourceKind":thread["source"].as_str()});
            let phase = item["phase"]
                .as_str()
                .map(|s| json!(s))
                .unwrap_or(Value::Null);
            result.records.push(record(
                project,
                source,
                observed,
                Revision {
                    role,
                    parts: &parts,
                    occurred_at: &occurred,
                    time_basis: "turn-start",
                    phase: &phase,
                },
            ));
        }
    }
    result
}
pub fn deduplicate(records: &mut Vec<Value>) {
    let mut positions = HashMap::new();
    let mut unique: Vec<Value> = Vec::new();
    for record in records.drain(..) {
        let id = record["id"]
            .as_str()
            .expect("normalized record id")
            .to_owned();
        if let Some(index) = positions.get(&id) {
            unique[*index] = record;
        } else {
            positions.insert(id, unique.len());
            unique.push(record);
        }
    }
    *records = unique;
}
