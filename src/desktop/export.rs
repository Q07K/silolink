use crate::error::{Error, Result};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};
use uuid::Uuid;

pub fn write_report(path: &Path, markdown: &str) -> Result<()> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_none_or(|extension| !extension.eq_ignore_ascii_case("md"))
    {
        return Err(Error::new("EXPORT_FAILED", "Choose a Markdown (.md) file."));
    }
    let staging = path.with_file_name(format!(".silolink-export-{}.tmp", Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)?;
        file.write_all(markdown.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&staging, path)
    })();
    if let Err(cause) = result {
        let _ = fs::remove_file(&staging);
        return Err(Error::io(
            "EXPORT_FAILED",
            "Cannot save the report.",
            &cause,
        ));
    }
    Ok(())
}

fn line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn minutes(value: i64) -> String {
    let minutes = value / 60_000;
    if minutes >= 60 {
        format!("{}시간 {}분", minutes / 60, minutes % 60)
    } else {
        format!("{minutes}분")
    }
}

/// A shareable Markdown summary of one project; it states what it does not cover.
pub fn project_report(
    data: &super::DesktopData,
    project_id: &str,
    project_name: &str,
    inventory: Option<&serde_json::Value>,
    analysis: &serde_json::Value,
    generated_at: &str,
    now: i64,
) -> String {
    let mut out = format!("# {} 정리서\n\n생성 {generated_at} · SiloLink\n\n", line(project_name));
    out.push_str("## 문서 현황\n\n");
    match inventory {
        Some(report) => {
            let documents = report["documents"].as_array().cloned().unwrap_or_default();
            let proposals = report["proposals"].as_array().map(Vec::len).unwrap_or(0);
            out.push_str(&format!(
                "Markdown 문서 {}개 · 정리 후보 {proposals}개\n\n",
                documents.len()
            ));
            for doc in documents.iter().take(40) {
                out.push_str(&format!(
                    "- `{}` {}\n",
                    doc["path"].as_str().unwrap_or(""),
                    doc["title"].as_str().map(line).unwrap_or_default()
                ));
            }
            if documents.len() > 40 {
                out.push_str(&format!("- 외 {}개\n", documents.len() - 40));
            }
        }
        None => out.push_str("문서 현황을 읽지 못했습니다.\n"),
    }
    let discoveries: Vec<_> = data
        .discoveries
        .iter()
        .filter(|d| d.project_ids.iter().any(|p| p == project_id))
        .collect();
    out.push_str("\n## 확인한 발견\n\n");
    let reviewed: Vec<_> = discoveries
        .iter()
        .filter(|d| matches!(d.status.as_str(), "accepted" | "corrected"))
        .collect();
    if reviewed.is_empty() {
        out.push_str("사용자가 확인한 발견이 아직 없습니다.\n");
    }
    for d in &reviewed {
        out.push_str(&format!(
            "### {}\n\n{} · {}\n\n{}\n\n",
            line(&d.title),
            if d.basis == "observed" { "기록에서 확인" } else { "해석·추정" },
            d.source,
            d.summary
        ));
        if let Some(correction) = &d.correction {
            out.push_str(&format!("> 사용자 수정: {}\n\n", line(correction)));
        }
        for e in d.evidence.iter().take(5) {
            out.push_str(&format!("- 근거 `{}` “{}”\n", &e.record_id[..e.record_id.len().min(10)], e.quote));
        }
        out.push('\n');
    }
    let pending = discoveries.iter().filter(|d| d.status == "new").count();
    if pending > 0 {
        out.push_str(&format!("검토하지 않은 발견 {pending}개는 포함하지 않았습니다.\n"));
    }
    for (kind, title) in [("decision", "결정"), ("rule", "규칙"), ("learning", "학습"), ("research", "조사 정리"), ("analysis", "분석 노트")] {
        let notes: Vec<_> = data
            .notes
            .iter()
            .filter(|n| n.project_id == project_id && n.kind == kind)
            .collect();
        if notes.is_empty() {
            continue;
        }
        out.push_str(&format!("\n## {title}\n\n"));
        for note in notes {
            let status = note.status.as_deref().map(|s| format!(" · {s}")).unwrap_or_default();
            out.push_str(&format!("### {}\n\n{}{status}\n\n{}\n\n", line(&note.title), note.created_at, note.body.trim()));
        }
    }
    let sources: Vec<_> = data.sources.iter().filter(|s| s.project_id == project_id).collect();
    if !sources.is_empty() {
        out.push_str("\n## 조사 근거\n\n");
        for s in sources {
            out.push_str(&format!(
                "- [{}]({}) · {} · {} · {}\n  - 주장: {}\n",
                line(&s.title),
                s.url,
                s.kind,
                if s.verified { "원문 확인" } else { "원문 미확인" },
                s.version,
                line(&s.claim)
            ));
            if !s.conditions.trim().is_empty() {
                out.push_str(&format!("  - 적용 조건: {}\n", line(&s.conditions)));
            }
        }
    }
    let tasks: Vec<_> = data.tasks.iter().filter(|t| t.project_id == project_id).collect();
    if !tasks.is_empty() {
        out.push_str("\n## 작업 실적\n\n| 작업 | 단계 | 상태 | 측정 시간 | 예상 |\n| --- | --- | --- | --- | --- |\n");
        for t in tasks {
            let status = match (t.completed, t.user_tested) {
                (true, true) => "완료·사용자 확인",
                (true, false) => "구현 종료·확인 전",
                _ => "진행 중",
            };
            let worked = super::planning::worked_milliseconds(t, now);
            let estimate = t
                .estimates
                .last()
                .and_then(|e| e.median_minutes.map(|m| format!("약 {}", minutes(m as i64 * 60_000))))
                .unwrap_or_else(|| "-".into());
            out.push_str(&format!(
                "| {} | {} | {status} | {} | {estimate} |\n",
                line(&t.title).replace('|', "\\|"),
                line(&t.phase).replace('|', "\\|"),
                if t.spans.is_empty() { "측정 없음".into() } else { minutes(worked) }
            ));
        }
    }
    out.push_str(&format!(
        "\n## 범위와 한계\n\n- 분석한 사용자 요청 {}건, 도구가 넣은 메시지 {}건과 첨부 래퍼 {}건은 요청에서 제외했습니다.\n- 시각 근거가 없는 요청 {}건은 기간 집계에서 빠집니다.\n- 측정 시간은 사용자가 켠 타이머 구간의 합집합이며 AI 실행 시간과 구별하지 않았습니다.\n- 해석·추정으로 표시한 발견은 원문 확인이 필요합니다.\n",
        analysis["userRequests"].as_u64().unwrap_or(0),
        analysis["excludedRequests"]["agent"].as_u64().unwrap_or(0),
        analysis["excludedRequests"]["context"].as_u64().unwrap_or(0),
        analysis["missingTimestamps"].as_u64().unwrap_or(0),
    ));
    out
}
