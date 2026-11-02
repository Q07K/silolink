pub mod claude;
mod claude_queue;
pub mod codex;
pub mod rpc;
use crate::{
    error::{Error, Result},
    records::{self, Normalized},
};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub records: Vec<Value>,
    pub warnings: Vec<Value>,
    pub omitted: HashMap<String, u64>,
    pub sessions_read: usize,
    pub items_read: usize,
    pub limit_reached: bool,
    pub error: Option<Value>,
    pub metadata_scope: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adapter: Option<String>,
}
impl Snapshot {
    pub fn new(scope: &str) -> Self {
        Self {
            metadata_scope: scope.into(),
            ..Self::default()
        }
    }
    pub fn append(&mut self, normalized: Normalized) {
        self.records.extend(normalized.records);
        self.warnings.extend(normalized.warnings);
        for (kind, count) in normalized.omitted {
            *self.omitted.entry(kind).or_default() += count;
        }
    }
    pub fn finish(mut self, limit: usize) -> Self {
        self.limit_reached = self.items_read >= limit;
        records::deduplicate(&mut self.records);
        self
    }
    pub fn split(mut self, provider: &str) -> (Vec<Value>, Value) {
        let records = std::mem::take(&mut self.records);
        let status = if self.error.is_some() && records.is_empty() {
            "failed"
        } else if self.error.is_some() || !self.warnings.is_empty() || self.limit_reached {
            "partial"
        } else {
            "success"
        };
        let mut value = serde_json::to_value(self).expect("snapshot JSON");
        value.as_object_mut().expect("object").remove("records");
        value["provider"] = json!(provider);
        value["status"] = json!(status);
        (records, value)
    }
}
pub fn next_cursor(page: &Value, seen: &mut HashSet<String>) -> Result<Option<String>> {
    if !page["data"].is_array()
        || !page
            .get("nextCursor")
            .is_some_and(|v| v.is_null() || v.is_string())
    {
        return Err(Error::new(
            "INVALID_PROVIDER_RESPONSE",
            "The provider returned an invalid history page.",
        ));
    }
    let cursor = page["nextCursor"].as_str().map(str::to_owned);
    if let Some(cursor) = &cursor
        && !seen.insert(cursor.clone())
    {
        return Err(Error::new(
            "INVALID_PAGINATION",
            "The provider repeated a history cursor.",
        ));
    }
    Ok(cursor)
}
