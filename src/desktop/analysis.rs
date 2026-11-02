use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

/// Observable local counts; these candidates do not diagnose understanding.
pub fn analyze_records(records: &[Value]) -> Value {
    let requests: Vec<_> = records
        .iter()
        .filter(|r| r["role"] == "user" && r["text"].as_str().is_some_and(|s| !s.trim().is_empty()))
        .collect();
    let mut groups: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
    let mut providers: BTreeMap<String, usize> = BTreeMap::new();
    let mut projects: BTreeSet<String> = BTreeSet::new();
    let mut vague = Vec::new();
    let mut missing = 0;
    for r in &requests {
        let text = r["text"].as_str().unwrap_or("");
        let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
        groups.entry(normalized).or_default().push(r);
        *providers
            .entry(r["source"]["provider"].as_str().unwrap_or("unknown").into())
            .or_default() += 1;
        if let Some(p) = r["projectId"].as_str() {
            projects.insert(p.into());
        }
        if r["occurredAt"]
            .as_str()
            .is_none_or(|s| chrono::DateTime::parse_from_rfc3339(s).is_err())
        {
            missing += 1;
        }
        let phrases: Vec<_> = [
            "잘해줘",
            "잘 해줘",
            "그거 말고",
            "최적화",
            "잘 처리",
            "best practice",
        ]
        .into_iter()
        .filter(|p| text.to_lowercase().contains(p))
        .collect();
        if !phrases.is_empty() {
            vague.push(json!({"recordId":r["id"],"projectId":r["projectId"],"text":text,"phrases":phrases,"status":"candidate"}));
        }
    }
    let mut repeated:Vec<_>=groups.into_iter().filter(|(_,rows)|rows.len()>1).map(|(text,rows)|json!({"text":text,"count":rows.len(),"recordIds":rows.iter().map(|r|r["id"].clone()).collect::<Vec<_>>(),"projectIds":rows.iter().filter_map(|r|r["projectId"].as_str()).collect::<BTreeSet<_>>()})).collect();
    repeated.sort_by(|a, b| b["count"].as_u64().cmp(&a["count"].as_u64()));
    json!({"userRequests":requests.len(),"projectCount":projects.len(),"providers":providers,"repeatedRequests":repeated,"ambiguousExpressions":vague,"missingTimestamps":missing,"method":"exact-text-and-expression-candidates","recordCount":records.len()})
}
