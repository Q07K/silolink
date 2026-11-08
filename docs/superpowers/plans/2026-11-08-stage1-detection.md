# 단계 1 · 감지 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수집한 기록에서 넓게 맡긴 요청 후보를 요청 단계·표현 신호·대화 결과 신호로 찾아, 판단 이유와 원문을 붙여 보여 주고, 사용자가 ‘일부러 넓게 맡김’으로 표시하거나 위임 표현 사전을 고칠 수 있게 한다.

**Architecture:** 공통 Rust 라이브러리에 결정적 감지 모듈(`src/desktop/detection.rs`)을 두고, 기존 `analyze_records`가 이를 호출해 분석 결과에 후보·단계 집계를 싣는다. 사용자 표시와 사전 설정은 앱 작업 공간(`DesktopData`, `Settings`)에 저장하고, 스냅숏을 만들 때 감지 설정으로 넘긴다. 화면은 사용 분석의 ‘표현’ 탭을 후보 목록으로 바꾸고, 설정에 ‘요청 감지’ 구역을 더한다.

**Tech Stack:** Rust(serde_json), Tauri 2 명령, React·TypeScript, Vitest·Testing Library.

**Spec:** [PRD v0.2](../../product/prd.md) — R02-E, R11-B, R11-H, 5절 근거 표시, 11절 단계 1, 12절 사례.

## Global Constraints

- 감지는 로컬 결정적 계산만 쓴다. 외부 AI 호출, 수집·알림 기본값 변경 없음.
- 사용자를 판정하지 않는다: 문구는 ‘넓게 맡긴 것으로 보이는 요청 후보’, 점수·등급 없음.
- 대화 결과 신호는 표현 신호보다 앞에 판단 이유로 보인다(R11-B).
- 후보마다 신호 종류, 판단 이유, 근거 원문(요청·AI 질문·정정)을 남긴다.
- 탐색 단계 요청과 ‘일부러 넓게 맡김’ 요청은 후보에서 빠진다.
- 근거 표시는 `기록에서 확인`(observed)·`추정`(inferred)·`모호`(ambiguous)·`미확인`(unverified) 4종.
- 짧은 표시: 요청에 `#넓게` 또는 `#탐색`이 있으면 일부러 넓게 맡긴 것으로 본다.
- 위임 표현 사전 항목은 1~40자, 사용자 추가·제외 목록은 각각 최대 100개.

## Review Focus

1. 일을 끝낸 AI 답변 끝의 제안형 질문(“원하면 테스트도 추가할까요?”)을 되물음으로 세지 않는다 → Task 1의 `offer_after_long_reply_is_not_clarification`.
2. 요청과 답변 사이에 도구가 끼워 넣은 메시지가 있어도 정정·재시도를 잘못 붙이지 않는다 → Task 1의 `injected_records_are_skipped_between_turns`.
3. 다른 세션의 다음 메시지를 같은 대화로 잇지 않는다 → Task 1의 `signals_stay_inside_one_session`.
4. 영어 요청(“optimize it”, “make the UI better”)도 영역명만 있는 요청으로 잡는다 → Task 1의 `english_area_only_request`.
5. 사용자가 기본 사전 항목을 제외하면 그 표현으로는 후보가 생기지 않는다 → Task 1의 `removed_phrase_no_longer_matches`.

---

### Task 1: 결정적 감지 모듈

**Files:**
- Create: `src/desktop/detection.rs`
- Modify: `src/desktop/mod.rs` (모듈 등록과 재노출)

**Interfaces:**
- Produces:
  - `pub const DELEGATION_PHRASES: &[&str]` — 기본 위임 표현: `잘해줘`, `잘 해줘`, `잘 적용`, `잘 처리`, `잘 정리`, `알아서`, `적당히`, `깔끔하게`, `예쁘게`, `보기 좋게`, `자연스럽게`, `느낌`, `대충`, `best practice`.
  - `pub const AREA_WORDS: &[&str]` — `UI/UX`, `UI`, `UX`, `디자인`, `최적화`, `성능`, `보안`, `리팩터링`, `리팩토링`, `구조`, `개선`, `접근성`, `반응형`, `optimize`, `performance`, `security`, `refactor`, `better`.
  - `pub struct Detection { pub phrases: Vec<String>, pub intentional: BTreeSet<String> }`, `impl Default` (기본 사전, 빈 표시), `pub fn with_dictionary(added: &[String], removed: &[String], intentional: impl IntoIterator<Item = String>) -> Detection`.
  - `pub fn stage(text: &str) -> &'static str` — `"verify" | "diagnose" | "explore" | "execute" | "other"`.
  - `pub fn detect(requests: &[Request], records: &[Value], detection: &Detection) -> Value` — `{"candidates":[…], "stages":{stage: count}, "intentional": n}`. 후보 하나: `{"recordId","projectId","text","stage","basis","signals":[{"kind":"outcome"|"expression","type":"clarification"|"correction"|"retry"|"phrase"|"area-only","reason","recordId","quote"}]}`. `signals`는 outcome 먼저.

규칙(신호·단계 판단이 하나로 정해지도록 고정한다):
- 단계는 앞에서부터 처음 맞는 것: verify(`확인해줘`, `검증`, `테스트해`, `리뷰해`, `검토해`) → diagnose(`왜 `, `안 돼`, `안돼`, `에러`, `오류`, `버그`, `실패`, `error`) → explore(`?`로 끝남, `어떻게`, `뭐가 좋`, `추천`, `비교`, `방법`, `가능할까`, `시안`, `아이디어`) → execute(`해줘`, `해 줘`, `만들어`, `추가해`, `바꿔`, `수정해`, `적용해`, `구현`, `optimize`, `make`) → other.
- 표현 신호 `phrase`: 소문자 비교로 사전 항목 포함. `area-only`: 영역어 포함 && 40자 이하 && 숫자·따옴표·백틱·`/`·`.확장자`·`_`·대문자 낙타표기 식별자 없음. 사전 항목과 함께 나오면 둘 다 남긴다.
- 대화 순서: 같은 `source.provider`+`source.sessionId` 안에서 `occurredAt`, 그다음 저장 순서로 정렬. 사람이 쓰지 않은 user 기록(`request_view`의 agent·context)은 건너뛴다.
- `clarification`: 요청 바로 다음 assistant 기록의 마지막 400자에 `?`가 있고, `어떤`, `어느`, `원하시`, `말씀하시는`, `알려 주세요`, `알려주세요`, `골라 주세요`, `선택해`, `which`, `do you want`, `could you clarify` 중 하나가 있음. 단 답변이 600자를 넘고 질문이 `할까요?`·`드릴까요?`·`want me to`로 끝나면 제외. quote = `?`를 포함한 마지막 문장(160자 이내).
- `correction`: 그 assistant 다음의 사람 요청이 앞 20자 안에 `그거 말고`, `그게 아니라`, `그 말이 아니라`, `아니 `, `아니요`, `내 말은`로 시작·포함. 신호는 앞 요청에 붙고 quote = 정정 요청.
- `retry`: 같은 세션의 다음 사람 요청이 `similarity >= 0.55`이고 둘 다 8자 이상.
- 후보 조건: 신호가 하나 이상 && 단계가 explore가 아님 && 표시되지 않음(`intentional` 집합 또는 `#넓게`·`#탐색`). outcome 신호만 있으면 단계 무관(탐색 제외는 유지).
- basis: outcome 신호가 있으면 `observed`, 표현 신호만 있으면 `inferred`.
- reason 문구(신호 종류별 고정): clarification `요청 뒤에 AI가 무엇을 원하는지 되물었어요`, correction `AI 답 뒤에 요청을 고쳐 말했어요`, retry `비슷한 요청을 다시 보냈어요`, phrase `기준을 ‘{표현}’에 맡긴 표현이 있어요`, area-only `영역({영역어})만 정하고 대상·범위·완료 조건이 없어요`.

- [ ] **Step 1: 실패하는 테스트 작성** — `detection.rs`의 `#[cfg(test)] mod tests`에 아래 이름과 단언으로.
  - `classifies_stages`: `stage("UI/UX 잘 적용해서 작업해줘")=="execute"`, `stage("홈 화면 시안 몇 개 볼 수 있을까?")=="explore"`, `stage("빌드가 왜 안 돼")=="diagnose"`, `stage("변경 사항 검토해줘")=="verify"`, `stage("안녕")=="other"`.
  - `phrase_and_area_signals`: 요청 “UI/UX 잘 적용해서 작업해줘” → 후보 1, 신호 type `["phrase","area-only"]`, basis `inferred`, reason에 `잘 적용`.
  - `specific_request_is_not_candidate`: “설정 화면 버튼 높이를 40px로 맞춰줘”(영역어 없음) 와 “`Button.tsx` 성능 개선해줘”(백틱) → 후보 0.
  - `explore_stage_is_excluded`: “UI 개선 방법 뭐가 좋을까?” → 후보 0, `stages.explore==1`.
  - `intentional_marks_exclude`: 표시 집합에 든 요청과 “#넓게 알아서 시안 만들어줘” → 후보 0, `intentional==2`.
  - `clarification_signal_from_reply`: 요청 “버튼 좀 자연스럽게 해줘” 다음 assistant “마우스를 올렸을 때 모습을 말씀하시는 건가요?” → 신호 첫째 type `clarification`(kind `outcome`), basis `observed`, quote에 `말씀하시는`.
  - `offer_after_long_reply_is_not_clarification`: 650자 답변이 “원하면 테스트도 추가할까요?”로 끝남 → clarification 없음.
  - `correction_and_retry_signals`: 요청 A “깔끔하게 정리해줘” → assistant → 요청 B “그거 말고 버튼 사이 간격 말한 거야” → A에 correction(quote=B). 요청 C “릴리즈 파일이 안 보여” 다음 D “릴리즈 파일이 왜 안 보이지” → C에 retry.
  - `injected_records_are_skipped_between_turns`: A, assistant, `<system-reminder>`만 있는 user, “그거 말고 …” → correction 붙음; A 다음에 `The following is the Codex agent history…`만 있고 다음 사람 요청이 비슷하지 않으면 retry 없음.
  - `signals_stay_inside_one_session`: A(세션 s1) 다음 assistant(세션 s2)의 질문 → clarification 없음.
  - `english_area_only_request`: “optimize it” → area-only.
  - `removed_phrase_no_longer_matches`: `with_dictionary(&[], &["깔끔하게".into()], [])`로 “화면 깔끔하게 해줘” → 후보 0; `with_dictionary(&["대강".into()], &[], [])`로 “대강 해줘” → phrase.
- [ ] **Step 2: 실패 확인** — Run: `.\scripts\cargo.ps1 test --lib --locked desktop::detection` · Expected: 컴파일 실패(모듈 없음).
- [ ] **Step 3: 구현** — 위 Interfaces와 규칙대로. 세션 묶음은 `BTreeMap<(provider, sessionId), Vec<&Value>>`, `Request`·`request_view`·`similarity`는 `analysis.rs`에서 가져온다.
- [ ] **Step 4: 통과 확인** — 같은 명령 · Expected: 12 passed.
- [ ] **Step 5: 커밋** — `feat(core): detect broadly delegated requests from wording and replies`

### Task 2: 분석 결과에 후보 싣기

**Files:**
- Modify: `src/desktop/analysis.rs` (고정 표현 상수 제거, `analyze_with` 추가, 테스트 갱신)
- Modify: `src/desktop/mod.rs` (재노출)

**Interfaces:**
- Consumes: Task 1의 `Detection`, `detect`.
- Produces: `pub fn analyze_with(records: &[Value], detection: &Detection) -> Value`; `analyze_records(records)`는 `analyze_with(records, &Detection::default())`. 결과에 `"requestSignals"`(=candidates), `"stages"`, `"intentionalRequests"`. `"ambiguousExpressions"`는 후보에서 만든다: `{"recordId","projectId","text","phrases":[신호 quote 아닌 표현·영역어 목록, outcome만이면 신호 type 한국어명],"status":"candidate"}`.

- [ ] **Step 1: 테스트 갱신** — `groups_differently_worded_requests_and_counts_terms`의 `ambiguousExpressions[0].recordId=="5"` 유지(“Tauri 트레이 메뉴 잘해줘”), 새 단언 `analysis["requestSignals"][0]["signals"][0]["type"]=="phrase"`, `analysis["stages"]["execute"]` ≥ 1.
- [ ] **Step 2: 실패 확인** — `.\scripts\cargo.ps1 test --lib --locked desktop::analysis` · Expected: `requestSignals` 없음으로 실패.
- [ ] **Step 3: 구현** — `analyze_with`가 `human_requests` 결과를 `detect`에 넘긴다.
- [ ] **Step 4: 통과 확인** — 같은 명령 · Expected: PASS.
- [ ] **Step 5: 커밋** — `feat(core): include request stages and broad-request candidates in analysis`

### Task 3: 표시와 위임 표현 사전 저장

**Files:**
- Modify: `src/desktop/mod.rs` (`Settings`, `DesktopData`, `RequestMark`, `mark_request`, 설정 검증, 테스트)
- Modify: `desktop/src-tauri/src/runtime.rs` (`Mutation::MarkRequest`, 스냅숏에서 `analyze_with`)
- Modify: `desktop/src-tauri/src/insight.rs`, `desktop/src-tauri/src/lifecycle.rs` (분석 호출을 `analyze_with`로)
- Test: `tests/native_desktop.rs`

**Interfaces:**
- Produces:
  - `Settings.delegation_phrases_added: Vec<String>`, `Settings.delegation_phrases_removed: Vec<String>` (serde 기본 빈 목록, camelCase).
  - `pub struct RequestMark { pub record_id: String, pub kind: String /* "intentional" */, pub created_at: String }`, `DesktopData.request_marks: Vec<RequestMark>`.
  - `Desktop::mark_request(&mut self, record_id: &str, intentional: bool) -> Result<()>` — true면 없을 때만 추가, false면 제거. record_id 1~200자.
  - `Desktop::detection(&self) -> Detection` — 설정과 표시에서 만든다.
  - 프런트 변이 `{ operation: "markRequest"; recordId: string; intentional: boolean }`.
  - 설정 검증: 항목 trim 후 1~40자, 목록당 100개 이하, 중복 제거. 위반 시 `invalid("…")`.
- [ ] **Step 1: 테스트** — `tests/native_desktop.rs`에 `request_marks_persist_and_toggle`(표시→재열기 후 남음→해제 후 없음, 두 번 표시해도 1개)와 `delegation_phrases_are_validated`(41자 항목 거부, 101개 거부, 앞뒤 공백 제거).
- [ ] **Step 2: 실패 확인** — `.\scripts\cargo.ps1 test --locked --test native_desktop` · Expected: 컴파일 실패.
- [ ] **Step 3: 구현** — 위 Interfaces대로. 스냅숏(`runtime.rs`)은 저장소 잠금 안에서 `detection()`을 얻은 뒤 `analyze_with`.
- [ ] **Step 4: 통과 확인** — 같은 명령과 `.\scripts\cargo.ps1 test --locked -p silolink-desktop` · Expected: PASS.
- [ ] **Step 5: 커밋** — `feat(desktop): remember intentionally broad requests and the delegation dictionary`

### Task 4: 근거 표시 4종

**Files:**
- Modify: `desktop/src/components.tsx` (`BasisBadge`), `desktop/src/discoveries.tsx`, `desktop/src/types.ts` (`Basis`)
- Test: `desktop/src/components.test.tsx`

**Interfaces:**
- Produces: `export type Basis = "observed" | "inferred" | "ambiguous" | "unverified"`; `export function BasisBadge({ basis }: { basis: Basis })` — 라벨 `기록에서 확인`(tone success)·`추정`·`모호`(tone warning)·`미확인`. `Discovery.basis: Basis`.
- [ ] **Step 1: 테스트** — `BasisBadge`가 네 값마다 위 라벨을 그린다.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/components.test.tsx` · Expected: FAIL.
- [ ] **Step 3: 구현** — `discoveries.tsx:87`의 두 갈래 배지를 `BasisBadge`로 바꾼다.
- [ ] **Step 4: 통과 확인** — 같은 명령 · Expected: PASS.
- [ ] **Step 5: 커밋** — Task 5와 함께.

### Task 5: 사용 분석의 후보 목록

**Files:**
- Modify: `desktop/src/types.ts` (`RequestSignal`, `RequestCandidate`, `Analysis.requestSignals?`, `stages?`, `intentionalRequests?`, 변이), `desktop/src/pages/insights.tsx` (‘표현’ 탭 → ‘넓게 맡긴 요청’), `desktop/src/usage-overview.tsx` (정의 문구), `desktop/src/design-preview/data.ts` (예시 후보)
- Test: `desktop/src/review12.test.tsx` 또는 새 `desktop/src/detection.test.tsx`

**Interfaces:**
- Consumes: Task 2의 분석 필드, Task 3의 `markRequest`, Task 4의 `BasisBadge`.
- 화면: 탭 이름 `넓게 맡긴 요청 {n}`. 위에 한 줄 `요청 {합}건 · 탐색 {a} · 진단 {b} · 실행 {c} · 검증 {d} · 일부러 넓게 맡김 {m}건 제외`. 후보 카드: 단계 배지, `BasisBadge`, 신호 배지(`대화 결과 · AI가 되물음`/`대화 결과 · 정정`/`대화 결과 · 다시 요청`/`표현 · {표현}`/`표현 · 영역만 지정`), 요청 원문, 신호별 reason과 quote, 버튼 `개념과 요청을 함께 다듬기`(기존 질문 그대로)와 `일부러 넓게 맡김`. 표시한 요청은 접힌 목록 `일부러 넓게 맡긴 요청 {m}`에서 `표시 해제`.
- 요약 화면 정의: `‘잘’, ‘알아서’처럼 기준을 맡긴 표현이나, AI의 되물음·정정으로 넓게 맡긴 것으로 보이는 요청의 비율이에요. 일부러 넓게 맡긴 요청은 빼요.`
- [ ] **Step 1: 테스트** — `detection.test.tsx`: 후보 둘(되물음·표현)이 있는 스냅숏에서 (1) 탭 이름에 `넓게 맡긴 요청 2` (2) 되물음 후보의 신호 배지가 표현 배지보다 앞 (3) `일부러 넓게 맡김` 클릭 시 `mutate({operation:"markRequest",recordId,intentional:true})` (4) 빈 경우 Empty 문구 `넓게 맡긴 요청 후보가 없습니다`.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/detection.test.tsx` · Expected: FAIL.
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `npx vitest run` 전체 · Expected: 모두 PASS.
- [ ] **Step 5: 커밋** — `feat(desktop): list broad-request candidates with reasons and evidence labels`

### Task 6: 설정의 요청 감지 사전

**Files:**
- Modify: `desktop/src/settings-sections.ts` (`{ id: "detection", label: "요청 감지", description: "넓게 맡긴 요청을 찾을 때 쓰는 표현을 고칩니다." }`, 아이콘 `ScanSearch`), `desktop/src/pages/operations.tsx` (구역 화면), `desktop/src/types.ts` (`Settings` 필드)
- Test: `desktop/src/settings-navigation.test.tsx`

**Interfaces:**
- Consumes: Task 3의 설정 필드, 기본 사전은 프런트 상수 `DEFAULT_DELEGATION_PHRASES`(Task 1 목록과 같은 값)로 표시.
- 화면: 기본 표현 목록(각각 `빼기`/`다시 쓰기`), 추가한 표현 목록(`삭제`), 입력 `표현 추가`와 버튼 `추가`. 저장은 기존 `settings` 변이. `#넓게`·`#탐색` 짧은 표시 안내 한 줄.
- [ ] **Step 1: 테스트** — 구역이 보이고, `깔끔하게` 빼기 → settings 변이에 `delegationPhrasesRemoved:["깔끔하게"]`, `대강` 추가 → `delegationPhrasesAdded:["대강"]`.
- [ ] **Step 2: 실패 확인** · **Step 3: 구현** · **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** — `feat(desktop): edit the delegation phrase dictionary in settings`

### Task 7: 문서와 전체 검증

**Files:**
- Modify: `tests/CASE_MATRIX.md` (단계 1 사례: 영역만 지정·되물음·정정·재시도·탐색 제외·표시 제외·사전 편집), `docs/product/prd.md` 9절 R11·R02 행

- [ ] **Step 1: 전체 검증** — `.\scripts\cargo.ps1 test --all-targets --locked`, `clippy --all-targets --locked -- -D warnings`, `fmt --all -- --check`, `desktop`에서 `npx tsc --noEmit`, `npx vitest run` · Expected: 모두 통과.
- [ ] **Step 2: 디자인 미리보기 확인** — 포트 7431, 사용 분석 → 넓게 맡긴 요청, 설정 → 요청 감지, 밝게·어둡게. 끝나면 서버를 닫는다.
- [ ] **Step 3: 커밋** — `docs: record stage 1 detection coverage`
