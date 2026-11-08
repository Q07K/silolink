//! Deterministic detection of requests that hand the criteria to the AI ("잘 해줘", "UI 개선해줘").
//! Candidates are suggestions with the reason and the quoted records; they never judge the user.
use super::analysis::{Request, request_view, similarity};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// Korean and English phrasings that leave the result to the AI's taste.
pub const DELEGATION_PHRASES: &[&str] = &[
    "잘해줘",
    "잘 해줘",
    "잘 적용",
    "잘 처리",
    "잘 정리",
    "알아서",
    "적당히",
    "깔끔하게",
    "예쁘게",
    "보기 좋게",
    "자연스럽게",
    "느낌",
    "대충",
    "best practice",
];
/// Area names that, alone, do not say what to change or when it is done.
pub const AREA_WORDS: &[&str] = &[
    "UI/UX",
    "UI",
    "UX",
    "디자인",
    "최적화",
    "성능",
    "보안",
    "리팩터링",
    "리팩토링",
    "구조",
    "개선",
    "접근성",
    "반응형",
    "optimize",
    "performance",
    "security",
    "refactor",
    "better",
];
/// Short marks a user types to say a request is broad on purpose.
const INTENTIONAL_MARKS: &[&str] = &["#넓게", "#탐색"];
const STAGES: &[(&str, &[&str])] = &[
    (
        "verify",
        &["확인해줘", "검증", "테스트해", "리뷰해", "검토해"],
    ),
    (
        "diagnose",
        &[
            "왜 ", "안 돼", "안돼", "에러", "오류", "버그", "실패", "error",
        ],
    ),
    (
        "explore",
        &[
            "어떻게",
            "뭐가 좋",
            "추천",
            "비교",
            "방법",
            "가능할까",
            "시안",
            "아이디어",
        ],
    ),
    (
        "execute",
        &[
            "해줘",
            "해 줘",
            "만들어",
            "추가해",
            "바꿔",
            "수정해",
            "적용해",
            "구현",
            "optimize",
            "make",
        ],
    ),
];
const ASKING: &[&str] = &[
    "어떤",
    "어느",
    "원하시",
    "말씀하시는",
    "알려 주세요",
    "알려주세요",
    "골라 주세요",
    "선택해",
    "which",
    "do you want",
    "could you clarify",
];
const OFFERS: &[&str] = &["할까요?", "드릴까요?", "want me to"];
const CORRECTIONS: &[&str] = &[
    "그거 말고",
    "그게 아니라",
    "그 말이 아니라",
    "아니 ",
    "아니요",
    "내 말은",
];
const AREA_LIMIT: usize = 40;
const LONG_REPLY: usize = 600;
const RETRY_SIMILARITY: f64 = 0.55;

/// The phrase dictionary in use and the requests the user marked as intentionally broad.
pub struct Detection {
    pub phrases: Vec<String>,
    pub intentional: BTreeSet<String>,
}
impl Default for Detection {
    fn default() -> Self {
        Self::with_dictionary(&[], &[], [])
    }
}
impl Detection {
    /// The default phrases minus `removed` plus `added`, trimmed and without duplicates.
    pub fn with_dictionary(
        added: &[String],
        removed: &[String],
        intentional: impl IntoIterator<Item = String>,
    ) -> Self {
        let removed: BTreeSet<&str> = removed.iter().map(|p| p.trim()).collect();
        let mut phrases: Vec<String> = DELEGATION_PHRASES
            .iter()
            .filter(|p| !removed.contains(*p))
            .map(|p| (*p).to_owned())
            .collect();
        for phrase in added.iter().map(|p| p.trim()) {
            if !phrase.is_empty() && !phrases.iter().any(|p| p == phrase) {
                phrases.push(phrase.to_owned());
            }
        }
        Self {
            phrases,
            intentional: intentional.into_iter().collect(),
        }
    }
}

/// The working stage a request is in; the first matching stage wins.
pub fn stage(text: &str) -> &'static str {
    let lower = text.to_lowercase();
    let trimmed = lower.trim_end();
    for (name, cues) in STAGES {
        if (*name == "explore" && (trimmed.ends_with('?') || trimmed.ends_with('？')))
            || cues.iter().any(|cue| lower.contains(cue))
        {
            return name;
        }
    }
    "other"
}

fn signal(kind: &str, kind_type: &str, reason: String, record: &Value, quote: &str) -> Value {
    json!({"kind":kind,"type":kind_type,"reason":reason,"recordId":record["id"],"quote":quote})
}
fn clip(text: &str, limit: usize) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= limit {
        flat
    } else {
        format!("{}…", flat.chars().take(limit).collect::<String>())
    }
}
/// True when the words around the area name pin nothing down: no numbers, quotes, paths or code names.
fn unspecific(text: &str) -> bool {
    let mut rest = text.to_owned();
    for area in AREA_WORDS {
        rest = rest.replace(area, " ");
    }
    if rest
        .chars()
        .any(|c| c.is_ascii_digit() || "\"'“”‘’`/_".contains(c))
    {
        return false;
    }
    !rest.split_whitespace().any(|word| {
        let chars: Vec<char> = word.chars().collect();
        let file = word.rsplit_once('.').is_some_and(|(stem, ext)| {
            !stem.is_empty() && !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphabetic())
        });
        let camel = chars
            .windows(2)
            .any(|w| w[0].is_ascii_lowercase() && w[1].is_ascii_uppercase());
        file || camel
    })
}
fn expression_signals(request: &Request, detection: &Detection) -> Vec<Value> {
    let lower = request.text.to_lowercase();
    let mut found = vec![];
    if let Some(phrase) = detection
        .phrases
        .iter()
        .find(|p| lower.contains(&p.to_lowercase()))
    {
        found.push(signal(
            "expression",
            "phrase",
            format!("기준을 ‘{phrase}’에 맡긴 표현이 있어요"),
            request.record,
            phrase,
        ));
    }
    if request.text.chars().count() <= AREA_LIMIT
        && unspecific(&request.text)
        && let Some(area) = AREA_WORDS
            .iter()
            .find(|a| lower.contains(&a.to_lowercase()))
    {
        found.push(signal(
            "expression",
            "area-only",
            format!("영역({area})만 정하고 대상·범위·완료 조건이 없어요"),
            request.record,
            area,
        ));
    }
    found
}
/// The asking sentence that ends a reply, or `None` when the reply does not ask the user to choose.
fn clarifying_question(reply: &str) -> Option<String> {
    let chars: Vec<char> = reply.chars().collect();
    let tail: Vec<char> = chars[chars.len().saturating_sub(400)..].to_vec();
    let end = tail.iter().rposition(|c| matches!(c, '?' | '？'))?;
    let start = tail[..end]
        .iter()
        .rposition(|c| matches!(c, '.' | '!' | '\n' | '?' | '？'))
        .map_or(0, |i| i + 1);
    let question: String = tail[start..=end].iter().collect();
    let question = question.trim();
    let lower = tail.iter().collect::<String>().to_lowercase();
    if !ASKING.iter().any(|cue| lower.contains(cue)) {
        return None;
    }
    let asked = question.to_lowercase();
    if chars.len() > LONG_REPLY && OFFERS.iter().any(|o| asked.contains(o)) {
        return None;
    }
    Some(clip(question, 160))
}

enum Turn<'a> {
    Human(&'a Request<'a>),
    Assistant(&'a Value),
}
/// Outcome signals per request id, found by walking each session in time order.
fn outcome_signals<'a>(
    requests: &'a [Request<'a>],
    records: &'a [Value],
) -> HashMap<&'a str, Vec<Value>> {
    let by_id: HashMap<&str, &Request> = requests
        .iter()
        .filter_map(|r| r.record["id"].as_str().map(|id| (id, r)))
        .collect();
    let mut sessions: BTreeMap<(&str, &str), Vec<&Value>> = BTreeMap::new();
    for record in records {
        let source = &record["source"];
        let key = (
            source["provider"].as_str().unwrap_or(""),
            source["sessionId"].as_str().unwrap_or(""),
        );
        sessions.entry(key).or_default().push(record);
    }
    let mut found: HashMap<&str, Vec<Value>> = HashMap::new();
    for list in sessions.values_mut() {
        list.sort_by(|a, b| {
            a["occurredAt"]
                .as_str()
                .unwrap_or("")
                .cmp(b["occurredAt"].as_str().unwrap_or(""))
        });
        let turns: Vec<Turn> = list
            .iter()
            .filter_map(|record| match record["role"].as_str() {
                Some("assistant") => Some(Turn::Assistant(record)),
                Some("user") => record["id"]
                    .as_str()
                    .and_then(|id| by_id.get(id))
                    .filter(|_| request_view(record).is_some_and(|v| v.origin == "human"))
                    .map(|r| Turn::Human(r)),
                _ => None,
            })
            .collect();
        for (index, turn) in turns.iter().enumerate() {
            let Turn::Human(request) = turn else {
                continue;
            };
            let replies: Vec<&Value> = turns[index + 1..]
                .iter()
                .map_while(|t| match t {
                    Turn::Assistant(r) => Some(*r),
                    Turn::Human(_) => None,
                })
                .collect();
            let next = turns[index + 1 + replies.len()..]
                .first()
                .and_then(|t| match t {
                    Turn::Human(r) => Some(*r),
                    Turn::Assistant(_) => None,
                });
            let signals = found
                .entry(request.record["id"].as_str().unwrap_or(""))
                .or_default();
            if let Some(last) = replies.last()
                && let Some(question) = clarifying_question(last["text"].as_str().unwrap_or(""))
            {
                signals.push(signal(
                    "outcome",
                    "clarification",
                    "요청 뒤에 AI가 무엇을 원하는지 되물었어요".into(),
                    last,
                    &question,
                ));
            }
            let Some(next) = next else {
                continue;
            };
            let head: String = next.text.chars().take(20).collect();
            if !replies.is_empty() && CORRECTIONS.iter().any(|c| head.contains(c)) {
                signals.push(signal(
                    "outcome",
                    "correction",
                    "AI 답 뒤에 요청을 고쳐 말했어요".into(),
                    next.record,
                    &clip(&next.text, 160),
                ));
            } else if request.text.chars().count() >= 8
                && next.text.chars().count() >= 8
                && similarity(&request.text, &next.text) >= RETRY_SIMILARITY
            {
                signals.push(signal(
                    "outcome",
                    "retry",
                    "비슷한 요청을 다시 보냈어요".into(),
                    next.record,
                    &clip(&next.text, 160),
                ));
            }
        }
    }
    found
}

/// Broad-request candidates with their stage, signals (outcome first) and evidence basis.
pub fn detect(requests: &[Request], records: &[Value], detection: &Detection) -> Value {
    let mut outcome = outcome_signals(requests, records);
    let mut stages: BTreeMap<&str, usize> = BTreeMap::new();
    let mut intentional = 0;
    let mut candidates = vec![];
    for request in requests {
        let id = request.record["id"].as_str().unwrap_or("");
        let step = stage(&request.text);
        *stages.entry(step).or_default() += 1;
        if detection.intentional.contains(id)
            || INTENTIONAL_MARKS.iter().any(|m| request.text.contains(m))
        {
            intentional += 1;
            continue;
        }
        if step == "explore" {
            continue;
        }
        let mut signals = outcome.remove(id).unwrap_or_default();
        let observed = !signals.is_empty();
        signals.extend(expression_signals(request, detection));
        if signals.is_empty() {
            continue;
        }
        candidates.push(json!({
            "recordId": id,
            "projectId": request.record["projectId"],
            "provider": request.record["source"]["provider"],
            "occurredAt": request.record["occurredAt"],
            "text": clip(&request.text, 400),
            "stage": step,
            "basis": if observed { "observed" } else { "inferred" },
            "signals": signals,
        }));
    }
    json!({"candidates": candidates, "stages": stages, "intentional": intentional})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::desktop::human_requests;
    use serde_json::{Value, json};

    fn message(id: &str, session: &str, role: &str, text: &str, minute: u32) -> Value {
        json!({"id":id,"role":role,"projectId":"p","text":text,
            "occurredAt":format!("2026-11-02T10:{minute:02}:00Z"),
            "source":{"provider":"claude","sessionId":session,"itemId":id,"sourceKind":null}})
    }
    fn user(id: &str, text: &str, minute: u32) -> Value {
        message(id, "s", "user", text, minute)
    }
    fn reply(id: &str, text: &str, minute: u32) -> Value {
        message(id, "s", "assistant", text, minute)
    }
    fn run(records: &[Value], detection: &Detection) -> Value {
        let (requests, _) = human_requests(records);
        detect(&requests, records, detection)
    }
    fn types(candidate: &Value) -> Vec<&str> {
        candidate["signals"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["type"].as_str().unwrap())
            .collect()
    }

    #[test]
    fn classifies_stages() {
        assert_eq!(stage("UI/UX 잘 적용해서 작업해줘"), "execute");
        assert_eq!(stage("홈 화면 시안 몇 개 볼 수 있을까?"), "explore");
        assert_eq!(stage("빌드가 왜 안 돼"), "diagnose");
        assert_eq!(stage("변경 사항 검토해줘"), "verify");
        assert_eq!(stage("안녕"), "other");
    }
    #[test]
    fn phrase_and_area_signals() {
        let result = run(
            &[user("1", "UI/UX 잘 적용해서 작업해줘", 0)],
            &Detection::default(),
        );
        let candidate = &result["candidates"][0];
        assert_eq!(result["candidates"].as_array().unwrap().len(), 1);
        assert_eq!(types(candidate), ["phrase", "area-only"]);
        assert_eq!(candidate["basis"], "inferred");
        assert!(
            candidate["signals"][0]["reason"]
                .as_str()
                .unwrap()
                .contains("잘 적용")
        );
    }
    #[test]
    fn specific_request_is_not_candidate() {
        let result = run(
            &[
                user("1", "설정 화면 버튼 높이를 40px로 맞춰줘", 0),
                user("2", "`Button.tsx` 성능 개선해줘", 1),
            ],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn explore_stage_is_excluded() {
        let result = run(
            &[user("1", "UI 개선 방법 뭐가 좋을까?", 0)],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
        assert_eq!(result["stages"]["explore"], 1);
    }
    #[test]
    fn intentional_marks_exclude() {
        let detection = Detection::with_dictionary(&[], &[], ["1".to_owned()]);
        let result = run(
            &[
                user("1", "UI/UX 잘 적용해서 작업해줘", 0),
                user("2", "#넓게 알아서 시안 만들어줘", 1),
            ],
            &detection,
        );
        assert_eq!(result["candidates"], json!([]));
        assert_eq!(result["intentional"], 2);
    }
    #[test]
    fn clarification_signal_from_reply() {
        let result = run(
            &[
                user("1", "버튼 좀 자연스럽게 해줘", 0),
                reply("2", "마우스를 올렸을 때 모습을 말씀하시는 건가요?", 1),
            ],
            &Detection::default(),
        );
        let candidate = &result["candidates"][0];
        assert_eq!(candidate["signals"][0]["type"], "clarification");
        assert_eq!(candidate["signals"][0]["kind"], "outcome");
        assert_eq!(candidate["basis"], "observed");
        assert!(
            candidate["signals"][0]["quote"]
                .as_str()
                .unwrap()
                .contains("말씀하시는")
        );
    }
    #[test]
    fn offer_after_long_reply_is_not_clarification() {
        let long = format!(
            "{} 원하면 테스트도 추가할까요?",
            "작업을 마쳤습니다. 변경한 파일은 다음과 같습니다. ".repeat(25)
        );
        assert!(long.chars().count() > 600);
        let result = run(
            &[user("1", "로그인 화면 만들어줘", 0), reply("2", &long, 1)],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn correction_and_retry_signals() {
        let result = run(
            &[
                user("a", "깔끔하게 정리해줘", 0),
                reply("r", "파일 구조를 정리했습니다.", 1),
                user("b", "그거 말고 버튼 사이 간격 말한 거야", 2),
                user("c", "릴리즈 워크플로에서 설치 파일이 안 보여", 3),
                user("d", "릴리즈 워크플로에서 설치 파일이 왜 안 보이지", 4),
            ],
            &Detection::default(),
        );
        let find = |id: &str| {
            result["candidates"]
                .as_array()
                .unwrap()
                .iter()
                .find(|c| c["recordId"] == id)
                .cloned()
                .unwrap()
        };
        let a = find("a");
        assert_eq!(a["signals"][0]["type"], "correction");
        assert_eq!(
            a["signals"][0]["quote"],
            "그거 말고 버튼 사이 간격 말한 거야"
        );
        assert!(types(&find("c")).contains(&"retry"));
    }
    #[test]
    fn injected_records_are_skipped_between_turns() {
        let result = run(
            &[
                user("a", "화면 정리해줘", 0),
                reply("r", "정리했습니다.", 1),
                user("x", "<system-reminder>ctx</system-reminder>", 2),
                user("b", "그거 말고 메뉴 순서", 3),
                user("c", "릴리즈 노트 써줘", 4),
                user(
                    "y",
                    "The following is the Codex agent history added since",
                    5,
                ),
                user("d", "아이콘 색 바꿔줘", 6),
            ],
            &Detection::default(),
        );
        let candidates = result["candidates"].as_array().unwrap();
        let a = candidates.iter().find(|c| c["recordId"] == "a").unwrap();
        assert_eq!(a["signals"][0]["type"], "correction");
        assert!(!candidates.iter().any(|c| c["recordId"] == "c"));
    }
    #[test]
    fn signals_stay_inside_one_session() {
        let result = run(
            &[
                message("1", "s1", "user", "버튼 손봐줘", 0),
                message("2", "s2", "assistant", "어떤 버튼을 말씀하시는 건가요?", 1),
            ],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn english_area_only_request() {
        let result = run(&[user("1", "optimize it", 0)], &Detection::default());
        assert_eq!(types(&result["candidates"][0]), ["area-only"]);
    }
    #[test]
    fn removed_phrase_no_longer_matches() {
        let without = Detection::with_dictionary(&[], &["깔끔하게".to_owned()], []);
        let result = run(&[user("1", "화면 깔끔하게 해줘", 0)], &without);
        assert_eq!(result["candidates"], json!([]));
        let with = Detection::with_dictionary(&["대강".to_owned()], &[], []);
        let result = run(&[user("1", "대강 해줘", 0)], &with);
        assert_eq!(types(&result["candidates"][0]), ["phrase"]);
    }
}
