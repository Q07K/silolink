use super::{Task, analysis::similarity};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Estimate {
    pub low_minutes: Option<u64>,
    pub median_minutes: Option<u64>,
    pub high_minutes: Option<u64>,
    pub basis_task_ids: Vec<String>,
    pub method: String,
    pub created_at: String,
}

/// Union of time spans in milliseconds; overlapping spans are not added twice.
pub fn worked_milliseconds(task: &Task, now: i64) -> i64 {
    let mut spans: Vec<(i64, i64)> = task
        .spans
        .iter()
        .filter_map(|s| {
            let start = chrono::DateTime::parse_from_rfc3339(&s.started_at)
                .ok()?
                .timestamp_millis();
            let end = match &s.ended_at {
                Some(end) => chrono::DateTime::parse_from_rfc3339(end)
                    .ok()?
                    .timestamp_millis(),
                None => now,
            };
            (end >= start).then_some((start, end))
        })
        .collect();
    spans.sort();
    let mut total = 0;
    let mut current: Option<(i64, i64)> = None;
    for (start, end) in spans {
        current = match current {
            Some((a, b)) if start <= b => Some((a, b.max(end))),
            Some((a, b)) => {
                total += b - a;
                Some((start, end))
            }
            None => Some((start, end)),
        };
    }
    total + current.map(|(a, b)| b - a).unwrap_or(0)
}

/// Completed tasks similar to `task`, with their measured time. Only timed, finished work counts.
pub fn similar(tasks: &[Task], task: &Task, now: i64) -> Vec<Value> {
    let mut found: Vec<(f64, Value)> = tasks
        .iter()
        .filter(|t| t.id != task.id && t.completed && !t.spans.is_empty())
        .filter_map(|t| {
            let score = similarity(&t.title, &task.title)
                + if t.phase == task.phase { 0.15 } else { 0.0 };
            let minutes = worked_milliseconds(t, now) / 60_000;
            (score >= 0.35 && minutes > 0).then(|| {
                (
                    score,
                    json!({"taskId":t.id,"title":t.title,"projectId":t.project_id,"phase":t.phase,
                        "minutes":minutes,"userTested":t.user_tested,"similarity":(score*100.0).round()/100.0}),
                )
            })
        })
        .collect();
    found.sort_by(|a, b| b.0.total_cmp(&a.0));
    found.into_iter().take(5).map(|(_, v)| v).collect()
}

pub fn estimate(tasks: &[Task], task: &Task, now: i64, created_at: &str) -> Estimate {
    let references = similar(tasks, task, now);
    let mut minutes: Vec<u64> = references
        .iter()
        .filter_map(|r| r["minutes"].as_u64())
        .collect();
    minutes.sort();
    let pick = |i: usize| minutes.get(i).copied();
    Estimate {
        low_minutes: pick(0),
        median_minutes: pick(minutes.len() / 2),
        high_minutes: minutes.last().copied(),
        basis_task_ids: references
            .iter()
            .filter_map(|r| r["taskId"].as_str().map(str::to_owned))
            .collect(),
        method: match minutes.len() {
            0 => "no-comparable-task",
            1 => "single-reference",
            _ => "similar-completed-tasks",
        }
        .into(),
        created_at: created_at.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::TimeSpan;
    fn task(id: &str, title: &str, done: bool, spans: &[(&str, &str)]) -> Task {
        Task {
            id: id.into(),
            project_id: "p".into(),
            title: title.into(),
            phase: "구현".into(),
            completed: done,
            user_tested: done,
            due_at: None,
            created_at: "2026-11-01T00:00:00Z".into(),
            spans: spans
                .iter()
                .map(|(a, b)| TimeSpan {
                    started_at: (*a).into(),
                    ended_at: Some((*b).into()),
                })
                .collect(),
            origin_id: None,
            estimates: vec![],
        }
    }
    #[test]
    fn overlapping_spans_are_counted_once() {
        let t = task(
            "a",
            "x",
            true,
            &[
                ("2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z"),
                ("2026-11-01T00:30:00Z", "2026-11-01T01:30:00Z"),
            ],
        );
        assert_eq!(worked_milliseconds(&t, 0), 90 * 60_000);
    }
    #[test]
    fn estimates_from_similar_finished_work_only() {
        let tasks = vec![
            task(
                "1",
                "로그인 화면 구현",
                true,
                &[("2026-11-01T00:00:00Z", "2026-11-01T01:00:00Z")],
            ),
            task(
                "2",
                "로그인 화면 구현 수정",
                true,
                &[("2026-11-01T00:00:00Z", "2026-11-01T03:00:00Z")],
            ),
            task(
                "3",
                "결제 API 연동",
                true,
                &[("2026-11-01T00:00:00Z", "2026-11-01T05:00:00Z")],
            ),
            task(
                "4",
                "로그인 화면 구현",
                false,
                &[("2026-11-01T00:00:00Z", "2026-11-01T09:00:00Z")],
            ),
        ];
        let target = task("new", "회원가입 화면 구현", false, &[]);
        let e = estimate(&tasks, &target, 0, "now");
        assert_eq!(e.method, "similar-completed-tasks");
        assert_eq!((e.low_minutes, e.high_minutes), (Some(60), Some(180)));
        assert!(
            !e.basis_task_ids.contains(&"3".to_string())
                && !e.basis_task_ids.contains(&"4".to_string())
        );
        let none = estimate(&tasks[2..3], &target, 0, "now");
        assert_eq!(
            (none.method.as_str(), none.median_minutes),
            ("no-comparable-task", None)
        );
    }
}
