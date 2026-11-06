use crate::runtime::{Runtime, error, lock};
use serde_json::{Value, json};
use silolink::{
    desktop::{analyze_records, discovery, project_report, rules},
    error::Result,
    project,
};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

/// Stored records and display names for the selected projects.
pub fn records_for(
    runtime: &Runtime,
    project_ids: &[String],
) -> Result<(Vec<Value>, HashMap<String, String>)> {
    let repo = lock(&runtime.repository)?;
    let directory = runtime.state_directory(&repo.data.settings).to_owned();
    let mut records = vec![];
    let mut names = HashMap::new();
    for id in project_ids {
        let project = repo.project(id)?;
        names.insert(
            id.clone(),
            project.metadata["name"]
                .as_str()
                .unwrap_or("project")
                .to_owned(),
        );
        match silolink::sync::read(&project, &directory, "all") {
            Ok(report) => records.extend(report["records"].as_array().cloned().unwrap_or_default()),
            Err(e) if e.code == "STORE_NOT_INITIALIZED" => (),
            Err(e) => return Err(e),
        }
    }
    Ok((records, names))
}

/// Merges deterministic discoveries; returns (discovery id, fingerprint, title) for new ones.
pub fn refresh_local(runtime: &Runtime, records: &[Value], analysis: &Value) -> Result<Vec<(String, String, String)>> {
    let found = discovery::local_discoveries(records, analysis, &project::now());
    let mut repo = lock(&runtime.repository)?;
    let added = repo.sync_local_discoveries(found)?;
    Ok(new_items(&repo.data.discoveries, &added))
}
fn new_items(all: &[silolink::desktop::Discovery], added: &[String]) -> Vec<(String, String, String)> {
    all.iter()
        .filter(|d| added.contains(&d.id))
        .map(|d| (d.id.clone(), d.fingerprint.clone(), d.title.clone()))
        .collect()
}
/// In-app notices for new discoveries; the OS notification is optional.
pub fn announce(app: &AppHandle, runtime: &Runtime, items: &[(String, String, String)], system: bool) {
    for (_, fingerprint, title) in items {
        crate::lifecycle::notify_once(
            app,
            runtime,
            &format!("discovery:{fingerprint}"),
            "discovery",
            &format!("새 발견: {title}"),
            system,
        );
    }
}

pub fn start_analysis(
    app: AppHandle,
    runtime: Arc<Runtime>,
    provider: String,
    project_ids: Vec<String>,
) -> Result<String> {
    let (records, names) = records_for(&runtime, &project_ids)?;
    let (prompt, aliases) = {
        let repo = lock(&runtime.repository)?;
        let known: Vec<_> = repo
            .data
            .discoveries
            .iter()
            .filter(|d| d.project_ids.iter().any(|p| project_ids.contains(p)))
            .collect();
        let sample = discovery::build_prompt(&records, &names, &known)?;
        let aliases: HashMap<String, String> = sample
            .aliases
            .iter()
            .map(|(alias, r)| (alias.clone(), r.record["id"].as_str().unwrap_or("").to_owned()))
            .collect();
        (sample.prompt, aliases)
    };
    let id = lock(&runtime.repository)?.begin_analysis(&provider, &project_ids, aliases.len())?;
    let (tx, mut cancelled) = watch::channel(false);
    lock(&runtime.jobs)?.insert(id.clone(), tx);
    let root = lock(&runtime.repository)?.project(&project_ids[0])?.root;
    let job = id.clone();
    tauri::async_runtime::spawn(async move {
        let answer = tokio::select! {
            result = tokio::time::timeout(Duration::from_secs(300), crate::ai::generate(&provider, &root, &prompt)) =>
                result.unwrap_or_else(|_| Err(error("AI_TIMEOUT", "The analysis exceeded its time limit."))),
            _ = cancelled.changed() => Err(error("AI_CANCELLED", "The analysis was cancelled.")),
        };
        // Rebuild the sample from the same records so evidence maps back to stored IDs.
        let outcome = answer.and_then(|text| {
            let known = [];
            let sample = discovery::build_prompt(&records, &names, &known)?;
            let consistent = sample
                .aliases
                .iter()
                .all(|(alias, r)| aliases.get(alias).map(String::as_str) == r.record["id"].as_str());
            if !consistent {
                return Err(error("ANALYSIS_SAMPLE_CHANGED", "The analyzed records changed."));
            }
            discovery::parse_discoveries(&text, &sample, &provider, &job, &project::now())
        });
        let added = lock(&runtime.repository).and_then(|mut repo| {
            let added = repo.finish_analysis(&job, outcome)?;
            Ok(new_items(&repo.data.discoveries, &added))
        });
        if let Ok(mut jobs) = runtime.jobs.lock() {
            jobs.remove(&job);
        }
        if let Ok(items) = &added {
            let system = lock(&runtime.repository).is_ok_and(|r| r.data.settings.immediate_notifications);
            announce(&app, &runtime, items, system);
        }
        let _ = app.emit("workspace-changed", json!({"analysisId": job}));
    });
    Ok(id)
}

/// Starts model analysis after collection when enabled and enough new requests arrived.
pub fn maybe_auto_analyze(app: &AppHandle, runtime: &Arc<Runtime>) {
    let (provider, project_ids, since) = match lock(&runtime.repository) {
        Ok(repo) if repo.data.settings.auto_analysis && !repo.data.projects.is_empty() => {
            if repo.data.analysis_runs.iter().any(|r| r.status == "running") {
                return;
            }
            let last = repo
                .data
                .analysis_runs
                .iter()
                .rev()
                .find(|r| r.status == "completed")
                .map(|r| r.started_at.clone());
            if let Some(last) = &last
                && chrono::DateTime::parse_from_rfc3339(last)
                    .is_ok_and(|t| chrono::Utc::now().signed_duration_since(t).num_hours() < 6)
            {
                return;
            }
            (
                repo.data.settings.analysis_provider.clone(),
                repo.data.projects.iter().take(10).map(|p| p.id.clone()).collect::<Vec<_>>(),
                last,
            )
        }
        _ => return,
    };
    let Ok((records, _)) = records_for(runtime, &project_ids) else {
        return;
    };
    let (requests, _) = silolink::desktop::human_requests(&records);
    let fresh = requests
        .iter()
        .filter(|r| {
            since.as_deref().is_none_or(|since| {
                r.record["occurredAt"].as_str().is_some_and(|at| at > since)
            })
        })
        .count();
    if fresh >= 5 {
        let _ = start_analysis(app.clone(), runtime.clone(), provider, project_ids);
    }
}

pub fn compare_rules(runtime: &Runtime, project_ids: &[String]) -> Result<Value> {
    if project_ids.is_empty() || project_ids.len() > 10 {
        return Err(error("INVALID_RULE_SCOPE", "Choose 1-10 projects to compare."));
    }
    let repo = lock(&runtime.repository)?;
    let mut lines = vec![];
    let mut projects = vec![];
    let mut documents = vec![];
    for id in project_ids {
        let project = repo.project(id)?;
        let name = project.metadata["name"].as_str().unwrap_or("project").to_owned();
        let inventory = silolink::documents::scan(&project)?;
        let paths: Vec<String> = inventory["documents"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|d| d["path"].as_str())
            .filter(|p| rules::is_rule_document(p))
            .map(str::to_owned)
            .collect();
        let read = silolink::documents::read_many(&project, &paths)?;
        for (path, document) in paths.iter().zip(read) {
            match document {
                Ok(document) => {
                    let text = document["text"].as_str().unwrap_or("");
                    let extracted = rules::extract(text);
                    documents.push(json!({"projectId":id,"path":path,"revision":document["revision"],"rules":extracted.len()}));
                    for (section, rule, line) in extracted {
                        lines.push(rules::RuleLine {
                            project_id: id.clone(),
                            project_name: name.clone(),
                            path: path.clone(),
                            revision: document["revision"].as_str().unwrap_or("").into(),
                            section,
                            text: rule,
                            line,
                        });
                    }
                }
                Err(e) => documents.push(json!({"projectId":id,"path":path,"error":e.json()})),
            }
        }
        projects.push((id.clone(), name));
    }
    let mut result = rules::compare(&lines, &projects);
    result["documents"] = json!(documents);
    result["projects"] = json!(projects.iter().map(|(id, name)| json!({"id":id,"name":name})).collect::<Vec<_>>());
    Ok(result)
}

pub fn rule_plan(
    runtime: &Runtime,
    project_id: &str,
    path: &str,
    heading: &str,
    selected: &[String],
) -> Result<Value> {
    let project = lock(&runtime.repository)?.project(project_id)?;
    let exists = project
        .root
        .join(path.replace('/', std::path::MAIN_SEPARATOR_STR))
        .symlink_metadata()
        .is_ok();
    let current = if exists {
        Some(silolink::documents::read(&project, path, None)?)
    } else {
        None
    };
    rules::append_plan(
        project_id,
        path,
        current
            .as_ref()
            .map(|d| (d["revision"].as_str().unwrap_or(""), d["text"].as_str().unwrap_or(""))),
        heading,
        selected,
        "다른 프로젝트와 비교해 선택한 규칙을 이 프로젝트에 추가합니다.",
    )
}

pub fn report(runtime: &Runtime, project_id: &str) -> Result<String> {
    let (records, names) = records_for(runtime, &[project_id.to_owned()])?;
    let repo = lock(&runtime.repository)?;
    let project = repo.project(project_id)?;
    let inventory = silolink::documents::scan(&project).ok();
    let analysis = analyze_records(&records);
    Ok(project_report(
        &repo.data,
        project_id,
        names.get(project_id).map(String::as_str).unwrap_or("project"),
        inventory.as_ref(),
        &analysis,
        &project::now(),
        chrono::Utc::now().timestamp_millis(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compares_rules_across_projects_and_plans_an_append() {
        let profile = tempfile::TempDir::new().unwrap();
        let first = tempfile::TempDir::new().unwrap();
        let second = tempfile::TempDir::new().unwrap();
        std::fs::write(first.path().join("AGENTS.md"), "# 규칙\n- 커밋 메시지는 한국어로 쓴다\n- 디자인 토큰만 사용한다\n").unwrap();
        std::fs::write(second.path().join("AGENTS.md"), "# Rules\n- 커밋 메시지는 한국어로 쓴다.\n").unwrap();
        let runtime = Runtime::open(profile.path(), profile.path().join("Data")).unwrap();
        let (a, b) = {
            let mut repo = lock(&runtime.repository).unwrap();
            (repo.connect(first.path(), true).unwrap(), repo.connect(second.path(), true).unwrap())
        };
        let result = compare_rules(&runtime, &[a.clone(), b.clone()]).unwrap();
        assert_eq!(result["summary"], json!({"shared":1,"variant":0,"local":1,"rules":3}));
        let local = result["groups"].as_array().unwrap().iter().find(|g| g["status"] == "local").unwrap();
        assert_eq!(local["missingProjectIds"], json!([b]));
        let plan = rule_plan(&runtime, &b, "AGENTS.md", "공통 규칙", &["디자인 토큰만 사용한다".into()]).unwrap();
        assert_eq!(plan["operations"][0]["content"], "# Rules\n- 커밋 메시지는 한국어로 쓴다.\n\n## 공통 규칙\n\n- 디자인 토큰만 사용한다\n");
        // The generated plan passes the same review used for hand-written plans.
        let checked = runtime.checked_plan(&b, plan).unwrap();
        assert_eq!(checked["changeState"], "ready");
        let created = rule_plan(&runtime, &a, "docs/RULES.md", "새 규칙", &["새 규칙 문장".into()]).unwrap();
        assert!(created["operations"][0]["expectedRevision"].is_null());
    }
    #[test]
    fn local_discoveries_keep_reviews_and_are_announced_once() {
        let profile = tempfile::TempDir::new().unwrap();
        let folder = tempfile::TempDir::new().unwrap();
        let runtime = Runtime::open(profile.path(), profile.path().join("Data")).unwrap();
        let id = lock(&runtime.repository).unwrap().connect(folder.path(), true).unwrap();
        let records: Vec<Value> = (0..3)
            .map(|i| json!({"id":format!("r{i}"),"role":"user","projectId":id,"text":format!("배포 스크립트 점검해줘 {i}"),
                "occurredAt":format!("2026-11-0{}T00:00:00Z",i+1),"source":{"provider":"claude","sessionId":"s","itemId":i,"sourceKind":null}}))
            .collect();
        let analysis = analyze_records(&records);
        let added = refresh_local(&runtime, &records, &analysis).unwrap();
        assert_eq!(added.len(), 1);
        let discovery = added[0].0.clone();
        lock(&runtime.repository).unwrap().review_discovery(&discovery, "dismissed", None).unwrap();
        assert!(refresh_local(&runtime, &records, &analysis).unwrap().is_empty());
        {
            let repo = lock(&runtime.repository).unwrap();
            assert_eq!(repo.data.discoveries.len(), 1);
            assert_eq!(repo.data.discoveries[0].status, "dismissed");
        }
        // An unreviewed discovery whose records no longer repeat is retired; reviewed ones stay.
        lock(&runtime.repository).unwrap().review_discovery(&discovery, "new", None).unwrap();
        let fewer = &records[..2];
        refresh_local(&runtime, fewer, &analyze_records(fewer)).unwrap();
        assert!(lock(&runtime.repository).unwrap().data.discoveries.is_empty());
    }
}
