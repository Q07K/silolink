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
/// Offers made after finishing the work ("원하시면 … 드릴까요?"); they ask nothing about the request.
const OFFERS: &[&str] = &[
    "원하시면",
    "원하면",
    "필요하시면",
    "필요하면",
    "드릴까요",
    "if you want",
    "if you'd like",
    "want me to",
];
const CORRECTIONS: &[&str] = &["그거 말고", "그게 아니라", "그 말이 아니라", "내 말은"];
/// A bare "no" corrects the AI only when its reply did not end by asking something.
const REFUSALS: &[&str] = &["아니요", "아니 "];
/// Korean compounds that contain an area word without being about that area.
const KOREAN_COMPOUNDS: &[&str] = &["구조체"];
const AREA_LIMIT: usize = 40;
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

/// True when `word` occurs in `text`; ASCII words must stand alone ("UI" is not in "build").
fn contains_word(text: &str, word: &str) -> bool {
    if !word.is_ascii() {
        return text.contains(word);
    }
    text.match_indices(word).any(|(at, _)| {
        let before = text[..at].chars().next_back();
        let after = text[at + word.len()..].chars().next();
        !before.is_some_and(|c| c.is_ascii_alphanumeric())
            && !after.is_some_and(|c| c.is_ascii_alphanumeric())
    })
}

/// The working stage a request is in; the first matching stage wins.
pub fn stage(text: &str) -> &'static str {
    let lower = text.to_lowercase();
    let trimmed = lower.trim_end();
    for (name, cues) in STAGES {
        if (*name == "explore" && (trimmed.ends_with('?') || trimmed.ends_with('？')))
            || cues.iter().any(|cue| contains_word(&lower, cue))
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
/// The first area word in the request, matched case-insensitively as a whole word.
fn area_in(text: &str) -> Option<&'static str> {
    let mut lower = text.to_lowercase();
    for compound in KOREAN_COMPOUNDS {
        lower = lower.replace(compound, " ");
    }
    AREA_WORDS
        .iter()
        .find(|a| contains_word(&lower, &a.to_lowercase()))
        .copied()
}
/// True when the words around the area name pin nothing down: no numbers, quotes, paths or code names.
fn unspecific(text: &str) -> bool {
    let mut rest = text.to_lowercase();
    for area in AREA_WORDS {
        rest = rest.replace(&area.to_lowercase(), " ");
    }
    if rest
        .chars()
        .any(|c| c.is_ascii_digit() || "\"'“”‘’`/_".contains(c))
    {
        return false;
    }
    let file = rest.split_whitespace().any(|word| {
        word.rsplit_once('.').is_some_and(|(stem, ext)| {
            !stem.is_empty() && !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphabetic())
        })
    });
    let camel = text.split_whitespace().any(|word| {
        let chars: Vec<char> = word.chars().collect();
        chars
            .windows(2)
            .any(|w| w[0].is_ascii_lowercase() && w[1].is_ascii_uppercase())
    });
    !(file || camel)
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
        && let Some(area) = area_in(&request.text)
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
/// The reply's prose: fenced and inline code removed, so `?` in code is not a question.
fn without_code(reply: &str) -> String {
    let mut prose = String::new();
    for (index, block) in reply.split("```").enumerate() {
        if index % 2 == 0 {
            for (part, text) in block.split('`').enumerate() {
                if part % 2 == 0 {
                    prose.push_str(text);
                }
            }
            prose.push('\n');
        }
    }
    prose
}
/// The question a reply ends with, or `None` when it ends otherwise.
fn final_question(reply: &str) -> Option<String> {
    let prose = without_code(reply);
    let chars: Vec<char> = prose.trim_end().chars().collect();
    if !matches!(chars.last(), Some('?' | '？')) {
        return None;
    }
    let end = chars.len() - 1;
    // A period ends a sentence only before a space, so "App.tsx" stays in one piece.
    let start = (0..end)
        .rev()
        .find(|&i| {
            matches!(chars[i], '!' | '\n' | '?' | '？')
                || (chars[i] == '.' && chars.get(i + 1).is_some_and(|c| c.is_whitespace()))
        })
        .map_or(0, |i| i + 1);
    Some(
        chars[start..=end]
            .iter()
            .collect::<String>()
            .trim()
            .to_owned(),
    )
}
/// The asking sentence that ends a reply, or `None` when the reply does not ask the user to choose.
fn clarifying_question(reply: &str) -> Option<String> {
    let question = final_question(reply)?;
    let lower = question.to_lowercase();
    if !ASKING.iter().any(|cue| lower.contains(cue)) || OFFERS.iter().any(|o| lower.contains(o)) {
        return None;
    }
    Some(clip(&question, 160))
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
    // Records without a time cannot be placed in the conversation, so they are not linked.
    for record in records
        .iter()
        .filter(|r| r["occurredAt"].as_str().is_some_and(|at| !at.is_empty()))
    {
        let source = &record["source"];
        let key = (
            source["provider"].as_str().unwrap_or(""),
            source["sessionId"].as_str().unwrap_or(""),
        );
        sessions.entry(key).or_default().push(record);
    }
    let mut found: HashMap<&str, Vec<Value>> = HashMap::new();
    for list in sessions.values_mut() {
        // Codex items of one turn share the turn's start time; the request comes before its replies.
        list.sort_by_key(|r| (r["occurredAt"].as_str().unwrap_or(""), r["role"] != "user"));
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
            // The answer the user saw: Codex marks it final_answer; otherwise the last reply.
            let answer = replies
                .iter()
                .rev()
                .find(|r| r["phase"] == "final_answer")
                .or(replies.last())
                .copied();
            let answer_text = answer.and_then(|r| r["text"].as_str()).unwrap_or("");
            if let Some(last) = answer
                && let Some(question) = clarifying_question(answer_text)
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
            if replies.is_empty() {
                continue;
            }
            let head: String = next.text.chars().take(20).collect();
            let declined =
                REFUSALS.iter().any(|r| head.contains(r)) && final_question(answer_text).is_none();
            if CORRECTIONS.iter().any(|c| head.contains(c)) || declined {
                signals.push(signal(
                    "outcome",
                    "correction",
                    "AI 답 뒤에 요청을 고쳐 말했어요".into(),
                    next.record,
                    &clip(&next.text, 160),
                ));
            } else if request.text.chars().count() >= 8
                && next.text.chars().count() >= 8
                // An identical command ("다음 태스크 진행해줘") continues the work; a retry rephrases.
                && clip(&request.text, 400) != clip(&next.text, 400)
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
                reply("r2", "워크플로 파일을 확인했습니다.", 4),
                user("d", "릴리즈 워크플로에서 설치 파일이 왜 안 보이지", 5),
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
    fn codex(id: &str, role: &str, text: &str, at: &str, phase: Value) -> Value {
        json!({"id":id,"role":role,"projectId":"p","text":text,"occurredAt":at,"phase":phase,
            "source":{"provider":"codex","sessionId":"t","itemId":id,"sourceKind":"cli"}})
    }
    #[test]
    fn codex_turn_order_ties_put_the_request_first() {
        // Every item of a Codex turn shares the turn's start time and the store orders by hash.
        let (first, second) = ("2026-11-02T10:00:00Z", "2026-11-02T10:05:00Z");
        let records = [
            codex(
                "a2",
                "assistant",
                "어떤 항목을 넣을지 알려 주세요?",
                second,
                json!("final_answer"),
            ),
            codex("q1", "user", "로그인 화면 만들어줘", first, Value::Null),
            codex(
                "a1",
                "assistant",
                "만들었습니다.",
                first,
                json!("final_answer"),
            ),
            codex("q2", "user", "설정 화면 만들어줘", second, Value::Null),
        ];
        let result = run(&records, &Detection::default());
        let candidates = result["candidates"].as_array().unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0]["recordId"], "q2");
        assert_eq!(candidates[0]["signals"][0]["type"], "clarification");
    }
    #[test]
    fn records_without_time_are_not_linked() {
        // A request without a time sorts first; it must not borrow the next reply in the session.
        let mut untimed = user("1", "버튼 손봐줘", 0);
        untimed["occurredAt"] = Value::Null;
        let result = run(
            &[untimed, reply("2", "어떤 버튼을 말씀하시는 건가요?", 1)],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn short_conditional_offer_is_not_clarification() {
        let result = run(
            &[
                user("1", "로그인 화면 만들어줘", 0),
                reply(
                    "2",
                    "로그인 화면을 추가했습니다. 원하시면 테스트도 추가해 드릴까요?",
                    1,
                ),
            ],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn question_marks_in_code_are_ignored() {
        let result = run(
            &[
                user("1", "fix the parser bug in src/parse.rs line 40", 0),
                reply(
                    "2",
                    "Fixed it, which avoids the panic.\n```rust\nlet v = parse(input)?;\n```\nDone.",
                    1,
                ),
            ],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn question_quote_keeps_file_names() {
        let result = run(
            &[
                user("1", "버튼 고쳐줘", 0),
                reply("2", "어떤 파일을 고칠지 App.tsx도 포함할까요?", 1),
            ],
            &Detection::default(),
        );
        let quote = result["candidates"][0]["signals"][0]["quote"]
            .as_str()
            .unwrap();
        assert!(quote.contains("App.tsx"));
    }
    #[test]
    fn repeated_identical_commands_are_not_retries() {
        let result = run(
            &[
                user("1", "다음 태스크 진행해줘", 0),
                reply("2", "진행했습니다.", 1),
                user("3", "다음 태스크 진행해줘", 2),
            ],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn declining_an_offer_is_not_a_correction() {
        let result = run(
            &[
                user("1", "로그인 화면 만들어줘", 0),
                reply("2", "추가했습니다. 영어 버전도 만들까요?", 1),
                user("3", "아니요 괜찮아요", 2),
            ],
            &Detection::default(),
        );
        assert_eq!(result["candidates"], json!([]));
    }
    #[test]
    fn area_words_match_whole_words() {
        for text in ["build it", "linux에서 돌려줘", "이 구조체에 필드 추가해줘"] {
            let result = run(&[user("1", text, 0)], &Detection::default());
            assert_eq!(result["candidates"], json!([]), "{text}");
        }
        let result = run(&[user("1", "make the UI better", 0)], &Detection::default());
        assert_eq!(result["candidates"][0]["signals"][0]["quote"], "UI");
        let result = run(&[user("1", "ui/ux 개선해줘", 0)], &Detection::default());
        assert_eq!(types(&result["candidates"][0]), ["area-only"]);
    }
}
