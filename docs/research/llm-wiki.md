# LLM Wiki 계열 오픈소스 조사

- 조사일: 2026-11-08, Asia/Seoul
- 범위: Karpathy의 LLM Wiki 패턴과 그 구현, 코딩 에이전트 세션을 위키·기억으로 만드는 도구, 프롬프트 코칭 도구. GitHub 저장소 약 70개를 확인했다.
- 근거 수준: 저장소 README와 일부 스킬·스키마·문서 파일을 읽었다. 도구를 설치·실행하지 않았으므로 아래 기능은 각 저장소의 설명이며 동작·품질 검증 결과가 아니다. 스타 수·라이선스·최근 커밋은 2026-11-08 GitHub 페이지·API 기준이다. 서브 조사 결과 중 이 문서의 결론에 쓰인 핵심 주장(Quiz_wiki의 퀴즈, sessionwiki의 Rust·Windows 지원, llm-wiki-compiler의 세션 가져오기·Windows 미검증, Prompt-sensei의 단계 인식, nashsu/llm_wiki의 GPL, nvk/llm-wiki의 규칙 제안)은 원문을 다시 확인했다.
- 제품 요구: [PRD](../product/prd.md). 기존 후보 9종은 [유사 제품 비교](alternatives.md)에 있다.

## 1. 결론

1. **기록 수집·위키화·근거 관리는 이미 선행 사례가 많다.** 코딩 에이전트 세션을 읽어 Markdown 위키로 만들고, 원문 인용·검토 대기열·변경 기록·린트를 갖춘 프로젝트가 수십 개다. SiloLink의 G0(연결 기반)·G2(지식 축적)·G4(일지)·G5(규칙 전파)는 차별화 근거가 되기 어렵고, 검증된 설계를 빌려 오는 편이 낫다.
2. **G1(AI 활용 능력 성장)은 비어 있다.** 위키 계열 약 50개 중 사용자의 넓은 요청을 감지하거나, 모르는 용어로 용어집을 만들거나, 같은 주제 요청의 구체화를 추적하는 프로젝트는 없었다. 사용자를 가르치는 기능은 suwonleee/llmwiki의 결정 퀴즈 하나뿐이다.
3. **가장 가까운 쪽은 프롬프트 코칭 도구다.** Prompt-sensei·prompt-coach·Prompt Journal 등이 요청 품질을 평가하고 습관을 추적한다. 하지만 개인 용어집, 주제별 변화 추적, 영구적인 제외 기억, 한국어 위임 표현(알아서·잘·적당히·깔끔하게) 처리는 아무도 하지 않는다.
4. 따라서 SiloLink의 차별점은 **“위키 + 코칭”의 결합**, 즉 기록에서 넓은 요청을 찾아 사용자에게 보이는 용어집으로 쌓고 다음 요청의 변화까지 근거로 보여 주는 고리다.

## 2. LLM Wiki 패턴

Andrej Karpathy가 Gist로 공개한 [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)는 구현이 아니라 에이전트에게 붙여 넣는 아이디어 문서다. RAG처럼 질문마다 원문을 다시 찾는 대신, LLM이 원문을 읽어 **지속적으로 갱신되는 Markdown 위키를 쌓는다**는 것이 핵심이다.

| 구성 | 내용 |
| --- | --- |
| 원문 | 수정하지 않는 원자료. 진실의 원천 |
| 위키 | LLM이 쓰고 관리하는 요약·개체·개념·비교·종합 페이지 |
| 스키마 | CLAUDE.md·AGENTS.md 같은 규칙 문서. 위키 구조와 작업 절차를 정하며 사람과 LLM이 함께 다듬는다 |

작업은 ingest(원문 반영, 한 번에 10~15페이지 갱신), query(인덱스를 먼저 읽고 인용과 함께 답하며 좋은 답은 다시 위키에 저장), lint(모순·낡은 주장·고아 페이지·빠진 개념 점검) 세 가지다. `index.md`는 내용 목록, `log.md`는 `## [날짜] 작업 | 제목` 형식의 시간순 기록이다. 사람은 원문 선별·질문·판단을, LLM은 나머지 관리 작업을 맡는다.

SiloLink에 대응시키면 수집한 대화 기록과 프로젝트 문서가 원문, 노트·발견·용어집이 위키, 설치하는 스킬과 규칙 문서가 스키마다. 다만 SiloLink는 원칙상 LLM이 위키를 마음대로 고치지 않고 사용자 검토를 거친다.

이름이 겹치는 저장소가 여럿 있다. `llmwiki`라는 이름은 atomicstrata/llm-wiki-compiler(명령 이름), lucasastorian/llmwiki, microsoft/llmwiki, suwonleee/llmwiki가 쓴다. 이 문서는 특정 저장소가 아니라 패턴과 그 구현 전체를 다룬다.

## 3. 분류별 비교

### 3.1 코딩 에이전트 세션 → 위키·기억 (SiloLink의 기록 수집과 가장 가까움)

| 저장소 | 스타·라이선스 | 특징 | SiloLink에 주는 것 |
| --- | --- | --- | --- |
| [suwonleee/llmwiki](https://github.com/suwonleee/llmwiki) (Quiz_wiki) | 17·Apache-2.0 | Claude Code·Codex·OpenCode 기록을 프로젝트별 `docs/wiki/`로. **결정 내용을 간격 반복 퀴즈**(1·3·7·16·35·60일)로 묻는다. 주장마다 세션 원문 인용 각주. 명시적 요청에만 저장하고 저장 힌트는 한 번만. 한국어 README, Windows 지원 | 철학이 가장 가깝고 대상 사용자도 겹친다. 원문 인용 각주 형식, 간격 반복 엔진을 용어집 복습에 적용, “힌트는 한 번, 자동 저장 없음” |
| [youdie006/sessionwiki](https://github.com/youdie006/sessionwiki) | 33·MIT | **Rust 단일 바이너리**, Windows PowerShell 설치. Claude Code·Codex·Gemini·Cline·Aider 등 세션을 SQLite FTS5로 색인. 파일→세션 추적(`trace`·`blame`), 원래 도구가 지워도 남기는 보관 모드, `digest --since 7d` 주간 요약, 에이전트 시간 보기, 한국어 UI | 기록 가져오기 계층의 기술적 비교 기준. 파일→세션 추적과 보관 모드는 R02·R09에 유용 |
| [Pratiyush/llm-wiki](https://github.com/Pratiyush/llm-wiki) | 400·MIT | 도구별 어댑터로 Claude Code·Codex·Cursor·Gemini 세션을 위키와 정적 사이트로. 기본 마스킹·제외 파일, 16개 린트 규칙, 초안→검토→확인→낡음→보관 상태, Windows 작업 스케줄러 | 어댑터마다 지원 스키마 버전과 픽스처 테스트, 마스킹 기본값, 검토 상태 모델 |
| [miniLV/coding-agent-memory](https://github.com/miniLV/coding-agent-memory) | 12·Apache-2.0 | Codex·Claude 세션 → 일간 위키 → 주간 검토에서 안정된 교훈만 승격. 티켓 ID 기준 종합, 검토 전 후보는 장기 기억이 되지 않음 | 일간·주간 일지(R06-F)와 기능 ID 기준 실적 묶음(R09-F) |
| [tonydzi/second-brain-starter-kit](https://github.com/tonydzi/second-brain-starter-kit) | 15·MIT | `/intake`가 새 규칙 하나를 CLAUDE.md·메모리·훅 중 맞는 곳에 중복 검사 후 배치. `/skill-gap`이 반복 수작업을 찾아 스킬을 제안. `/declined` 거절 목록. `maintained_by: human` 노트는 수정 금지 | 규칙 전파(R08-F)와 “거절한 제안은 다시 올리지 않음”(R11-E) |
| [syiibfs-hash/cc-agent-brain](https://github.com/syiibfs-hash/cc-agent-brain) | 83·MIT | 훅 6개로 Claude Code 요청·답변·도구 호출을 SQLite FTS5(CJK 바이그램)에 저장. 사실을 덮어쓰지 않고 대체 관계·유효 기간으로 관리 | 덮어쓰기 대신 대체 체인, 한국어 검색 토큰화 |
| [mindmuxai/brain.md](https://github.com/mindmuxai/brain.md) | 594·Apache-2.0 | 페이지마다 다시 쓰는 “현재 사실”과 추가만 하는 근거 타임라인. AGENTS.md·CLAUDE.md의 표시된 블록만 갱신 | 규칙 문서의 표시 블록만 고치는 안전한 전파 방식 |
| [foundry-works/llm-wiki](https://github.com/foundry-works/llm-wiki) | 1·라이선스 없음 | 주장을 `[!source]`·`[!analysis]`·`[!unverified]`·`[!gap]`으로 구분하고 린터가 강제. 원문 해시 변경 감지 | 근거·추정 구분을 문서 형식으로 강제하는 방법 |
| [cookyman74/llmwiki-harness](https://github.com/cookyman74/llmwiki-harness) | 46·MIT | 한국어 Claude Code 하네스. 4단계 기억, 반복 횟수로 승격(3회→사실, 2회→절차), 출처 수로 계산하는 신뢰도, 금요일 주간 회고 | 반복 횟수 기반 승격을 반복되는 넓은 요청 감지에 적용 |
| [afrendeiro/agentlog](https://github.com/afrendeiro/agentlog) | 0 | 세션마다 전·한 일·후 요약. **15분 넘는 공백 제외, 자정 분할**로 활동 시간 계산, 주별 프로젝트 시간 | 실적 시간 계산(R09-B)의 참고 |
| [ub3dqy/llm-wiki](https://github.com/ub3dqy/llm-wiki) | 7·MIT | Stop 훅이 대화에서 설계 결정을 감지해 저장을 권한다 | 대화 중 감지·알림(R11-A)의 가장 가까운 형태 |

이 밖에 cobibean/agent-memory-wiki(일간·세션 로그, 검토가 필요할 때만 알림), zelixag/ai-memex-cli(전역→프로젝트 지식 투영), coleam00/claude-memory-compiler(1,321★, 훅 기반 일간 로그·자동 컴파일), chrisvaillancourt/agent-journal(성과 평가용 일간·주간 기록), oliver-kriska/scribe(Antigravity 포함 세션 수집, CLAUDE.md·AGENTS.md에 안내 블록 삽입)를 확인했다.

### 3.2 LLM Wiki 앱·데스크톱·지식 컴파일러

| 저장소 | 스타·라이선스 | 특징 | SiloLink에 주는 것 |
| --- | --- | --- | --- |
| [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) | 21,445·GPL-3.0 | 가장 인기 있는 데스크톱 앱. **Tauri v2·Rust·React로 SiloLink와 같은 구성**, Windows `.msi`. 문서·URL 가져오기, `purpose.md`, 정해진 행동만 고르는 검토 대기열, 로컬 HTTP API와 읽기 전용 에이전트 스킬. API 키 필요, 세션 가져오기 없음 | 화면 경험의 비교 기준이자 경쟁 제품. GPL이므로 코드 재사용 불가, 아이디어만 |
| [atomicstrata/llm-wiki-compiler](https://github.com/atomicstrata/llm-wiki-compiler) | 2,244·MIT | `llmwiki ingest-session`으로 Claude·Codex·Cursor 세션 가져오기. **사용자의 Claude Code·Codex 로그인으로 실행**. 문장마다 파일·줄 범위 인용, 검토한 본문 해시에 묶인 승인, 신선도 상태, 가장 안전한 다음 행동을 알려 주는 `next`. Windows는 미검증이라고 명시 | 원칙이 가장 가깝고 재사용 가능. 승인과 본문 해시 결합은 SiloLink의 변경안 검토와 같은 발상 |
| [axoviq-ai/synthadoc](https://github.com/axoviq-ai/synthadoc) | 1,929·AGPL-3.0 | 세션 `.jsonl` 가져오기, Claude Code 공급자. **사람이 검토한 페이지는 보호하고 충돌은 항목으로만 표시**, 상태 전환마다 스냅숏과 되돌리기(되돌리기도 되돌릴 수 있음), 작업별 비용 기록, cron 정기 점검 | “자동 병합 금지·복구 가능한 편집” 원칙의 구현 예. AGPL이므로 아이디어만 |
| [swarmclawai/swarmvault](https://github.com/swarmclawai/swarmvault) | 733·MIT | 모든 관계에 `extracted`·`inferred`·`ambiguous` 표시, 승인 묶음과 후보 폴더, 에이전트 작업 원장(목표·결정·결과), 읽기 기록·타임라인 대시보드, 40여 개 에이전트용 훅 설치 | 근거·추정 표시, 작업 원장을 실적·일지의 기반으로 |
| [TencentCloud/TencentDB-Agent-Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) | 30,612·MIT | 과거 에이전트 세션에서 계층 기억과 **버전·적용 경계가 있는 스킬을 추출**. 개인 항목은 기본 비공개, 팀 공유는 사람 검토 후 | 세션에서 규칙을 뽑아 검토 후 전파하는 흐름(R08-F) |
| [lucasastorian/llmwiki](https://github.com/lucasastorian/llmwiki) | 1,757·Apache-2.0 | LLM을 직접 부르지 않고 사용자의 Claude 구독이 MCP로 위키를 쓴다. 에이전트가 먼저 부르는 `guide` 도구, LLM 없는 결정적 린트. 쓰기는 즉시 반영 | 작은 MCP 도구 세트와 `guide` 우선 호출 |
| [ddsyasas/llm-wiki](https://github.com/ddsyasas/llm-wiki) | 69·MIT | Windows 검증. 사람·LLM 편집 모두 이전 버전 백업, 작업 전 비용 미리보기, 대화를 페이지로 승격 | 실행 전 비용·이용 한도 미리보기(R11-F) |
| [inkeep/open-knowledge](https://github.com/inkeep/open-knowledge) | 4,808·GPL-3.0 | Claude·Codex와 나란히 편집하는 Markdown 편집기, Windows 앱. 설치된 에이전트를 감지해 한 번에 연결 | 도구 감지·일괄 연결의 첫 사용 경험 |

그 밖에 microsoft/llmwiki(Copilot 구독으로 동작하는 VS Code 확장, 원문 대비 위키 범위 %), crow-hq/llm-wiki-v2(작성자가 붙는 로그, 구조 변경은 제안 후 확인), wosledon/Hetu(Tauri 2 + .NET, 대화를 노트로 정제), zhuzhaoyun/Molio(설치된 에이전트 CLI를 실행 환경으로 사용, 제한적 라이선스), Tencent/WeKnora(추출 후 사용자 확인하는 장기 기억), PKU-DAIR/AutoSci(Claude Code 스킬만으로 구성)를 확인했다.

### 3.3 에이전트 스킬·플러그인·Obsidian 템플릿

| 저장소 | 스타·라이선스 | 특징 | SiloLink에 주는 것 |
| --- | --- | --- | --- |
| [AgriciDaniel/claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) | 16,238·MIT | Claude Code 플러그인, 여러 에이전트로 스킬 배포. 모든 쓰기를 대상 해시 기록→계획→저널 적용→실패 시 복구하는 트랜잭션으로 처리. 주장 상태(채택·잠정·논쟁·근거 없음·폐기)와 “모순 근거를 보존하고 조용히 승자를 고르지 않는다”. 네이티브 Windows는 쓰기 불가(WSL 필요) | SiloLink의 변경안 저널과 같은 설계 확인. 주장 상태 원장 |
| [Ar9av/obsidian-wiki](https://github.com/Ar9av/obsidian-wiki) | 3,697·MIT | `/wiki-history-ingest claude|codex|…`로 에이전트 기록 수집, 위키를 쓰지 않는 세션 색인, 주장마다 추출·추정·모호 표시와 “추정으로 흐르는 페이지” 린트, `/wiki-digest day|week|month`, 프로젝트·전역 분리 | 기능이 가장 많이 겹친다. 주간 요약 스킬은 일지(R06-F)의 틀 |
| [nvk/llm-wiki](https://github.com/nvk/llm-wiki) | 1,510·MIT | 세션의 정정·선호·승인을 검토 대기 후보(`.sessions/feedback/`)로 저장하고 명시적으로만 승격. **`/wiki:ll --rules`가 CLAUDE.md·AGENTS.md 규칙 추가를 제안**. 용어집 출력, Codex용 Windows 훅 | “대화에서 배우고, 제안하고, 사용자가 승인”의 가장 가까운 사례. 규칙 전파(R08-F)와 감지 후보 대기열(R11) |
| [Astro-Han/karpathy-llm-wiki](https://github.com/Astro-Han/karpathy-llm-wiki) | 2,694·MIT | 숫자·날짜·인용이 원문에 글자 그대로 있어야 하는 규칙과 검사, 3단계 린트(안전한 자동 수정 / 기계적 보고 / 판단 보고), “반영할 내용 없음” 처리 | 3단계 린트 권한, 원문 글자 일치 검사 |
| [ussumant/llm-wiki-compiler](https://github.com/ussumant/llm-wiki-compiler) | 330·MIT | CLAUDE.md·AGENTS.md를 직접 고치지 않고 훅으로 맥락 주입, 단계적 채택(시험→권장→기본), 출처 수 기반 범위 표시, 18개월 넘은 주장 경고 | 규칙 문서를 건드리지 않는 단계적 전파 |
| [kytmanov/obsidian-llm-wiki-local](https://github.com/kytmanov/obsidian-llm-wiki-local) | 850·MIT | 초안 승인·거절·비교, **거절 이유를 다음 생성에 반영**, 5회 거절 시 자동 차단, 근거 적은 이름은 별도 후보 원장 | 사용자의 “아니, 왜냐하면”으로 다음 제안을 개선. 확정 전 용어 후보 원장 |
| [GD4AI/obsidian-llm-wiki](https://github.com/GD4AI/obsidian-llm-wiki) | 777·Apache-2.0 | `reviewed: true` 페이지 보호, 별칭 필수(언어 간 중복 제거), 한국어 포함 11개 언어 | 한·영 용어 쌍을 별칭으로 묶는 용어집 구조 |
| [zosmaai/pi-llm-wiki](https://github.com/zosmaai/pi-llm-wiki) | 625·MIT | 세션 중 결정·발견을 시각과 함께 기록하는 `wiki_observe`, 일간·주간 요약, “전에 해 본 적 있나?” 회상 | 중복 조사 알림(R04-F)과 일지의 입력 |

이 밖에 SamurAIGPT/llm-wiki-agent(3,684★, 기계적 점검과 의미 린트 분리), sdyckjq-lab/llm-wiki-skill(이름 변경·삭제 전 영향 미리보기, UNVERIFIED 표시), vanillaflava/llm-wiki-skills(세션 끝에 결정·발견·질문을 정리하는 crystallize), hanupratap/llm-wiki-okf(모순 시 비교를 보여 주고 먼저 묻기), Ansub/wiki-os를 확인했다. 큐레이션 목록 [awesome-llm-wiki](https://github.com/gavischneider/awesome-llm-wiki)에는 약 560개 항목이 있으며, 그중 arturseo-geo/llm-knowledge-base(플래시카드·FSRS 복습·린트에서 찾은 빈틈 `gaps.md`)와 Brainstead(Claude Code·Codex·Copilot·Antigravity를 다루는 Windows·macOS 데스크톱, 원문 인용 검증·변경 되돌리기)가 SiloLink와 관련이 깊다. 이 둘은 목록 설명과 일부 README만 확인했다.

### 3.4 프롬프트 코칭 (G1과 가장 가까움)

| 저장소 | 스타·라이선스 | 특징 | SiloLink에 주는 것 |
| --- | --- | --- | --- |
| [chengzhongwei/Prompt-sensei](https://github.com/chengzhongwei/Prompt-sensei) | 109·Apache-2.0 | Claude Code·Codex 스킬과 선택 훅. 요청을 탐색·진단·실행·검증 등 **단계로 먼저 나누고 해당 차원만 평가**해 “fix this test”를 나쁜 요청이 아닌 초기 단계로 본다. 한 번에 습관 하나, 실시간 코칭과 과거 기록 조회의 동의를 따로 받고 원문 대신 해시만 저장 | 철학이 가장 가깝다. 탐색 요청 존중(R11-E), 동의 분리(13절 결정) |
| [waqar40/prompt-improvement-framework](https://github.com/waqar40/prompt-improvement-framework) | 1·MIT | 요청 기록(Windows `.ps1` 포함), 14차원 LLM 평가. **진척은 결정적 계산**(차원별 지수이동평균, 근거 적을 때 축소, 숙달·퇴보 판정). 사용자 자신의 요청으로 전후 예시. 가로채거나 고치지 않음 | “요청이 구체적으로 바뀌었나”(R07-F)의 계산 방식 |
| [OlivierAlter/prompt-coach](https://github.com/OlivierAlter/prompt-coach) | 0·라이선스 없음 | 더 나은 요청을 비교 형식으로, 모르는 사실은 지어내지 않고 `[빈칸]`으로. 두 번 반복된 지시만 CLAUDE.md 추가 제안, 제외 버튼, 도움 됨/안 됨 평가를 다음 코칭에 반영, 습관 졸업. 다음에 실제 보낸 요청과 비교하는 기능을 계획 | 알림 화면의 형식(R11-D)과 수락·제외 흐름 |
| [EricTsai83/prompt-profile](https://github.com/EricTsai83/prompt-profile) | 1·MIT | Claude Code·Codex 기록을 사용자의 CLI 구독으로 분석. 원문 인용을 검증한 근거와 해석을 분리, “평가 안 함은 낮은 점수가 아님”, 실행 전 호출 수 미리보기와 상한, Windows 바이너리, CJK 지원 | 근거·추정 분리와 비용 미리보기(R11-F) |
| [severity1/claude-code-prompt-improver](https://github.com/severity1/claude-code-prompt-improver) | 1,968·MIT | UserPromptSubmit 훅이 “정말 모호할 때만” 이유를 밝히고 저장소를 조사해 선택지가 있는 질문 1~6개를 묻는다. `*` 접두어로 건너뛰기. 기록·학습 없음 | 대화 중 감지(R11-A)의 기준점. 수요도 확인됨 |

이 밖에 hancengiz/claude-code-prompt-coach-skill(147★, AI가 되물은 질문을 모호함의 근거로 사용), bear2u/my-skills(940★, 한국어 스킬 모음의 Prompt Coach·Prompt Enhancer, 라이선스 없음), ctxray/ctxray(여러 도구 기록 스캔, TF-IDF 주제 묶음, 기간 비교), ahmetseha/prompt-trace(사용자 자신의 잘된 요청에서 기준 예시 생성), VKirill/codex-starter-kit(일반인 요청을 전문 용어 브리프로 바꾸지만 에이전트에게만 전달), SamitMohnot/prompt-preflight(요청 대체·승인·수정·거절 흐름), sanketagarwal/prompt-prof(“아니, 내 말은” 정정과 재시도를 근거로 사용), zarazhangrui/codebase-to-course(5,783★, 비개발자를 위한 용어 툴팁·퀴즈)를 확인했다. `TimothyWebb09/Prompt-sensei`는 없는 주소이며 실제 저장소는 chengzhongwei/Prompt-sensei다.

## 4. 대부분이 수렴한 설계

- **세 층:** 수정하지 않는 원문 / LLM이 관리하는 위키(원문 요약·개체·개념·종합) / 실제 로직이 담긴 스키마 문서.
- **`index.md`와 `log.md`:** 진입점 목록과 grep 가능한 추가 전용 기록. `purpose.md`(위키의 목적)를 따로 두는 경우가 늘고 있다.
- **프런트매터:** type·title·tags·sources·created/updated·aliases, 점점 confidence·reliability와 Open Knowledge Format(OKF) v0.2 호환이 추가된다. OKF 명세 원문은 이번에 직접 확인하지 않았다.
- **작업:** ingest(분류→생성·병합→연쇄 갱신→모순 표시), query(인덱스 먼저·인용·기본은 읽기 전용·요청 시 저장), lint(기계적 수정은 자동, 의미 판단은 보고만).
- **모순:** 해결하지 않고 표시한다. 좋은 프로젝트는 해결 전에 묻는다.
- **근거 표시:** extracted·inferred·ambiguous(·unverified) 네 가지 표시가 여러 프로젝트에서 독립적으로 나타났다.
- **에이전트 연결:** 스킬·플러그인과 SessionStart 훅으로 맥락 주입, CLAUDE.md·AGENTS.md는 표시된 블록만 고치거나 아예 건드리지 않는다.

## 5. SiloLink에 가져올 것

| PRD 목표·요구 | 가져올 설계 | 참고 저장소 |
| --- | --- | --- |
| G1·R11 감지 | 요청을 단계(탐색·실행 등)로 먼저 분류하고 단계별 기준 적용. “정말 모호할 때만”, 판단 이유 표시, 건너뛰기 접두어. AI가 되물은 질문·“그거 말고” 정정·재시도를 넓은 요청의 근거로 사용 | Prompt-sensei, prompt-improver, hancengiz, prompt-prof |
| G1·R11 용어집 | 확정 전 후보 원장, 한·영 별칭 필수, 거절 이유를 다음 제안에 반영, 거절 목록의 영구 기억 | kytmanov, GD4AI, tonydzi `/declined` |
| G1·R07 학습·변화 | 간격 반복 복습(용어·요청 예시), 결정적 진척 계산(지수이동평균·숙달·퇴보), 사용자 자신의 요청으로 전후 예시, 다음 실제 요청과 비교 | suwonleee Quiz_wiki, Prompt Journal, prompt-trace, prompt-coach |
| G0·R02 수집 | 도구별 어댑터와 지원 형식 버전·픽스처 테스트, 기본 마스킹·제외 파일, 원래 도구가 지워도 남기는 보관, 파일→세션 추적 | Pratiyush, sessionwiki |
| 근거 원칙 | 주장마다 원문 인용(세션·시각·화자), extracted·inferred·ambiguous·unverified 표시와 “추정으로 흐름” 린트, 원문 글자 일치 검사 | suwonleee, Ar9av, swarmvault, Astro-Han, foundry-works |
| 검토·복구 | 검토한 본문 해시에 묶인 승인, 사람이 검토한 내용 보호(새 근거는 충돌 항목으로만), 상태 전환 스냅숏 | atomicstrata, synthadoc, claude-obsidian, GD4AI |
| G2·R04-F 중복 조사 | “전에 해 본 적 있나?” 회상, 조사 전 기존 노트 먼저 제시 | pi-llm-wiki, zelixag |
| G4·R06-F 일지 | 세션 끝 정리(결정·발견·남은 질문), 일간→주간 승격과 검토 관문 | vanillaflava, miniLV, Ar9av `/wiki-digest` |
| G3·R09 실적 | 15분 공백 제외·자정 분할의 활동 시간, 티켓·기능 ID 기준 묶음, 작업 원장, 작업별 비용 기록 | agentlog, miniLV, swarmvault, synthadoc |
| G5·R08-F 규칙 전파 | 세션의 정정·선호를 후보로 저장해 규칙 추가 제안, 두 번 반복된 지시만 제안, 표시 블록만 수정·단계적 채택 | nvk `/wiki:ll --rules`, prompt-coach, brain.md, ussumant |
| 비용·동의 | 실시간 코칭과 과거 기록 조회의 동의 분리, 실행 전 호출 수·이용 한도 미리보기와 상한, 원문 대신 해시·메타데이터 저장 옵션 | Prompt-sensei, prompt-profile, ddsyasas |

## 6. 아무도 하지 않는 것 — 차별화 후보

- 사용자 자신의 넓은 표현(“UI/UX 잘 적용해서”, 알아서·잘·적당히·깔끔하게·예쁘게)을 구체적인 용어 후보와 연결해 **사용자에게 보이는** 개인 용어집으로 쌓는 기능. VKirill은 용어를 만들지만 에이전트에게만 넘긴다.
- 같은 주제(예: 프로젝트 X의 UI 요청)의 이전·이후 요청을 원문 근거로 비교하는 변화 추적. 기존 도구는 전체 평균이나 차원별 평균만 본다.
- 사용자가 제외한 코칭 항목을 영구히 기억하고, 제안된 용어를 직접 고치게 하는 기능.
- 의도적으로 넓게 맡긴 요청을 기록하고 이후 평가에 불리하게 쓰지 않는 표시.
- 한국어 위임 표현 사전과 한국어 요청 처리.
- 기록 가져오기와 Windows 데스크톱 앱, 코칭을 한 제품으로 묶은 사례.
- 위키 계열과 코칭 계열의 결합. 위키 쪽은 사람을 가르치지 않고, 코칭 쪽은 지식을 쌓지 않는다.

‘아무도 하지 않음’은 이번에 확인한 범위의 관찰이며, 존재하지 않는다는 판정이 아니다.

## 7. 경쟁과 라이선스

- **가장 가까운 경쟁:** suwonleee/llmwiki(철학·대상 사용자 겹침), nashsu/llm_wiki(같은 Tauri·Rust 구성의 인기 데스크톱), Ar9av/obsidian-wiki(기능 겹침), Prompt-sensei(G1 접근), Brainstead(Windows 데스크톱·여러 에이전트, 목록 설명만 확인).
- **코드 재사용 불가(아이디어만):** GPL-3.0의 nashsu/llm_wiki·inkeep/open-knowledge, AGPL-3.0의 synthadoc·crow-hq/llm-wiki-v2(0.2.0 이전 Apache 버전 제외), 제한적 라이선스의 Molio.
- **라이선스 파일 없음:** foundry-works/llm-wiki, hereisSwapnil/memwiki, OlivierAlter/prompt-coach, hancengiz/claude-code-prompt-coach-skill, bear2u/my-skills, zarazhangrui/codebase-to-course. 재사용하지 않는다.
- **재사용 가능(MIT·Apache-2.0):** atomicstrata/llm-wiki-compiler, sessionwiki, Pratiyush/llm-wiki, swarmvault, suwonleee/llmwiki, Prompt-sensei, nvk/llm-wiki, Ar9av/obsidian-wiki 등. 실제 채택 시 버전·구성 요소·의존성 라이선스를 다시 확인한다.

## 8. 다음 확인 과제

1. suwonleee/llmwiki, Prompt-sensei, sessionwiki를 같은 실제 프로젝트 기록으로 설치해 비교한다. 특히 “UI/UX 잘 적용해서” 같은 요청을 어떻게 다루는지 본다.
2. Claude Code의 UserPromptSubmit 훅과 Codex 훅으로 요청 시점 감지가 가능한지, Windows에서 어떤 제약이 있는지 실측한다(R11-A, PRD 13절 결정).
3. 용어집·노트 형식에 OKF v0.2 프런트매터와 extracted·inferred·ambiguous·unverified 표시를 채택할지 정한다.
4. 프롬프트 코칭 도구들의 평가 기준(단계 인식, 차원별 루브릭)과 SiloLink의 고정 표현 10개 감지를 실제 기록으로 비교한다.
5. 브랜드명 충돌, 사용자 수, 유료 수요는 확인하지 않았다.
