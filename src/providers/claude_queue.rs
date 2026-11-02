use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

#[derive(Default)]
pub struct Receipts {
    delivery_counts: HashMap<String, usize>,
    source_counts: HashMap<String, usize>,
    delivery_copies: HashMap<String, Vec<String>>,
    ambiguous_sources: HashSet<String>,
}
impl Receipts {
    pub fn read(entries: &[Value], operations: &[Value], warnings: &mut Vec<Value>) -> Self {
        let mut state = Self::default();
        for event in operations {
            if event["operation"] != "remove" || event["reason"] != "absorbed_mid_turn" {
                continue;
            }
            if let Some(id) = event["deliveryId"].as_str().filter(|s| !s.is_empty()) {
                *state.delivery_counts.entry(id.to_owned()).or_default() += 1;
            } else if let Some(id) = event["commandUuid"].as_str() {
                *state.source_counts.entry(id.to_owned()).or_default() += 1;
            } else {
                warnings.push(json!({"code":"UNSUPPORTED_QUEUE_RECEIPT"}));
            }
        }
        let mut seen = HashSet::new();
        let mut source_payloads = HashMap::new();
        for entry in entries {
            let attachment = &entry["attachment"];
            if entry["type"] != "attachment" || attachment["type"] != "queued_command" {
                continue;
            }
            let Some(uuid) = entry["uuid"].as_str() else {
                continue;
            };
            if let Some(delivery) = attachment["delivery_id"].as_str().filter(|s| !s.is_empty()) {
                if seen.insert(uuid.to_owned()) {
                    state
                        .delivery_copies
                        .entry(delivery.to_owned())
                        .or_default()
                        .push(uuid.to_owned());
                }
            } else if let Some(source) =
                attachment["source_uuid"].as_str().filter(|s| !s.is_empty())
            {
                if source_payloads
                    .get(source)
                    .is_some_and(|previous| previous != attachment)
                {
                    state.ambiguous_sources.insert(source.to_owned());
                }
                source_payloads.insert(source.to_owned(), attachment.clone());
            }
        }
        state
    }
    fn overrides(&self, entries: &[Value]) -> HashMap<String, bool> {
        let mut states = HashMap::new();
        for (delivery, copies) in &self.delivery_copies {
            if let Some(count) = self.delivery_counts.get(delivery) {
                for (index, uuid) in copies.iter().enumerate() {
                    states.insert(uuid.clone(), index >= copies.len().saturating_sub(*count));
                }
            }
        }
        let mut source_copies: HashMap<&str, Vec<&str>> = HashMap::new();
        for entry in entries {
            let attachment = &entry["attachment"];
            if entry["type"] == "attachment"
                && attachment["type"] == "queued_command"
                && attachment["delivery_id"].as_str().is_none_or(str::is_empty)
                && let (Some(source), Some(uuid)) =
                    (attachment["source_uuid"].as_str(), entry["uuid"].as_str())
            {
                source_copies.entry(source).or_default().push(uuid);
            }
        }
        for (source, copies) in source_copies {
            if self.ambiguous_sources.contains(source) {
                continue;
            }
            if let Some(count) = self.source_counts.get(source) {
                for (index, uuid) in copies.iter().enumerate() {
                    states.insert(
                        (*uuid).to_owned(),
                        index >= copies.len().saturating_sub(*count),
                    );
                }
            }
        }
        states
    }
}

fn visible_origin(value: &Value) -> bool {
    matches!(
        value["kind"].as_str(),
        Some("channel" | "observer" | "observer-activity" | "slack-ping" | "peer")
    )
}

pub fn visible_messages(
    entries: Vec<Value>,
    receipts: &Receipts,
    warnings: &mut Vec<Value>,
) -> Vec<Value> {
    let delivery = receipts.overrides(&entries);
    let mut reply_after = vec![false; entries.len()];
    let mut next_is_reply = false;
    let last_message = entries
        .iter()
        .rposition(|entry| matches!(entry["type"].as_str(), Some("user" | "assistant")));
    for (index, entry) in entries.iter().enumerate().rev() {
        reply_after[index] = next_is_reply;
        let tool_result = entry["message"]["content"]
            .as_array()
            .is_some_and(|blocks| blocks.iter().any(|block| block["type"] == "tool_result"));
        if entry["type"] == "assistant" || tool_result {
            next_is_reply = true;
        } else if entry["type"] == "user"
            && entry["isMeta"] != true
            && entry["isCompactSummary"] != true
        {
            next_is_reply = false;
        }
    }
    let mut ids = entries
        .iter()
        .filter_map(|entry| entry["uuid"].as_str().map(str::to_owned))
        .collect::<HashSet<_>>();
    let mut messages = Vec::new();
    for (index, mut entry) in entries.into_iter().enumerate() {
        if entry["isSidechain"] == true || entry["teamName"].as_str().is_some_and(|s| !s.is_empty())
        {
            continue;
        }
        if entry["type"] == "attachment" && entry["attachment"]["type"] == "queued_command" {
            let attachment = entry["attachment"].clone();
            let eligible = delivery
                .get(entry["uuid"].as_str().expect("entry UUID"))
                .copied()
                .unwrap_or(reply_after[index] || last_message.is_none_or(|last| index > last));
            if !eligible {
                continue;
            }
            if attachment["isMeta"] == true && !visible_origin(&attachment["origin"]) {
                continue;
            }
            if !attachment["prompt"].is_string() && !attachment["prompt"].is_array() {
                warnings.push(json!({"code":"UNSUPPORTED_QUEUED_PROMPT","itemId":entry["uuid"]}));
                continue;
            }
            if !attachment["forwardedIntent"].is_null() {
                warnings.push(json!({"code":"UNVERIFIED_QUEUED_DELIVERY","itemId":entry["uuid"]}));
            }
            let original = entry["uuid"].as_str().expect("entry UUID");
            let id = attachment["source_uuid"]
                .as_str()
                .filter(|s| !s.is_empty())
                .unwrap_or(original)
                .to_owned();
            if id != original && !ids.insert(id.clone()) {
                continue;
            }
            entry["uuid"] = json!(id);
            entry["type"] = json!("user");
            entry["message"] = json!({"role":"user","content":attachment["prompt"]});
            entry["isMeta"] = attachment["isMeta"].clone();
            entry["origin"] = attachment["origin"].clone();
        }
        if matches!(entry["type"].as_str(), Some("user" | "assistant"))
            && (entry["isMeta"] != true || visible_origin(&entry["origin"]))
        {
            messages.push(entry);
        }
    }
    messages
}
