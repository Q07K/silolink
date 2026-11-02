# CLI·MCP·플러그인과 AI 실행 연동

- 조사·통합일: 2026-11-01, Asia/Seoul
- 범위: CLI·MCP 비교와 AI 실행·과거 기록 수집 검증. 1~4절의 비교 조사는 기존 자료를 유지하고 5~7절은 실제 Windows 확인 결과로 갱신했다.
- 근거 수준: 외부 비교 수치는 기존 조사 기록이다. 공급자 연동은 공식 문서를 다시 열고 로컬 CLI·SDK·App Server로 확인했다. 구현 완료나 다른 버전의 호환성을 뜻하지 않는다.
- 제품 요구와 구성: [PRD](../product/prd.md). 실제 검증·공식 문서의 지원 설명·설계 제안을 구별한다.

## 1. 인터페이스를 구별해 비교하기

| 구성 | 역할 |
| --- | --- |
| AI 자체의 CLI | Codex·Claude Code처럼 AI 작업을 실행하는 환경 |
| AI가 호출하는 제품 CLI | Git·GitHub CLI·SiloLink 명령처럼 업무 기능을 제공 |
| MCP | 도구 발견·호출·스키마·응답을 위한 공통 프로토콜 |
| 스킬 | 어떤 상황에서 어떤 절차로 도구를 사용할지 설명 |
| 플러그인 | 호스트별 스킬·지침·MCP·훅 등의 배포 묶음 |
| 실행기·샌드박스 | 프로세스·파일·네트워크·행동 범위를 관리 |

CLI와 MCP는 완전한 대체재가 아니다. 터미널 에이전트가 MCP를 쓰거나 MCP 내부가 CLI를 호출할 수도 있다. MCP에는 로컬 프로세스의 stdio와 Streamable HTTP가 있으므로 로컬·원격의 구분으로 단순화하지 않는다. [MCP Transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)

## 2. CLI+스킬이 주목받는 이유와 한계

아래는 당시 사례에서 도출한 해석이다. 시장 전체의 채택 성장률을 측정한 결과는 아니다.

- 셸·파일·Git·빌드·테스트 환경을 이미 가진 에이전트가 기존 명령을 재사용할 수 있다.
- 도움말과 하위 명령을 필요한 범위만 탐색하고 스킬을 점진적으로 읽을 수 있다. 처음 보는 CLI의 옵션 탐색·실패 비용도 포함해야 한다.
- 필터링·정렬·반복·파일 저장을 모델 밖에서 처리해 중간 결과와 왕복을 줄일 수 있다. 큰 JSON을 매번 그대로 전달하면 이점이 줄어든다.
- 사람·스크립트·CI에서 같은 명령을 재실행하며 조사할 수 있다.

[Playwright CLI](https://github.com/microsoft/playwright-cli#playwright-cli-vs-playwright-mcp)는 에이전트에 CLI+스킬을 권장하면서 MCP의 적용 조건도 남겼다. [Google Workspace CLI](https://github.com/googleworkspace/cli)는 JSON·스키마·dry-run·스킬을 제공했으나 Google의 공식 지원 제품은 아니라고 명시했다.

[GitHub CLI](https://cli.github.com/manual/gh_help_formatting)의 `--json`·`--jq`처럼 필요한 필드만 추출하는 방식이 참고가 된다. 스킬은 [Agent Skills 형식](https://agentskills.io/home)의 점진적 로딩을 활용할 수 있다.

같은 최적화는 MCP에도 가능하다. `tools/list`로 목록을 얻는 것과 모든 스키마를 프롬프트에 넣는 것은 다르며, 전체 주입은 프로토콜의 필수 비용이 아니다. [MCP Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

[Cloudflare Code Mode](https://blog.cloudflare.com/code-mode/)는 MCP 호출을 코드로 구성해 데이터 처리와 도구 노출을 줄이는 방식을 제시했다. 코드가 모델에게 익숙해서 유리하다는 설명은 공급자 가설이며 모든 모델에서의 우위가 검증된 것은 아니다.

## 3. 비용·성능 수치를 해석하는 기준

| 자료 | 당시 보고한 내용 | 일반화의 한계 |
| --- | --- | --- |
| [Scalekit 실험](https://www.scalekit.com/blog/mcp-vs-cli-use), 2026-03-11 | Sonnet 4·GitHub 작업 5개·세 방식의 총 75회. MCP 스키마 43개. 작업별 중앙값의 MCP 토큰이 일반 CLI의 약 4~32배. MCP 25회 중 7회 연결 시간 초과 | 한 모델·서비스·작은 작업 집합. 전체 스키마 구성과 원격 연결 실패를 분리해야 하며, 도구 검색으로 최적화한 MCP와의 비교가 아님 |
| [Scalekit 저장소](https://github.com/scalekit-inc/mcp-vs-cli-benchmark) | README의 단일 실행 수치와 작업별 30회 방법론 설명 | 블로그의 방식별·작업별 5회 중앙값과 집계가 다르므로 합치지 않음 |
| [The Scaffolding Matters More Than the Interface](https://arxiv.org/abs/2608.08654), 2026-08-09 | 초록상 실행기 7개·모델 5개·고정 작업 1개. 짝지은 비용 비율 13개가 0.43~29배. 지정 인터페이스를 무시하는 현상 보고 | 초록만 확인. 전문·원시 데이터·동료심사·재현 미확인. 작업 종류 하나로 전체 우열을 판단할 수 없음 |
| [Anthropic 코드 실행](https://www.anthropic.com/research/code-execution-with-mcp), 2025-11-04 | MCP 최적화 예시의 150,000→2,000토큰, 98.7% 감소 | CLI 대비 평균 절약률이 아님 |
| [Anthropic Tool Search](https://www.anthropic.com/research/advanced-tool-use), 2025-11-24 | 도구 정의 관련 약 85% 감소 | 공급자 구성에서의 최적화 수치 |
| [Cloudflare MCP](https://github.com/cloudflare/mcp/blob/main/README.md#token-comparison) | 약 2,500개 API를 도구 정의 약 1,100토큰으로 제공한다고 설명 | 인터페이스 정의 비용이며 전체 작업 토큰·성공률이 아님 |

이번 조사에서 벤치마크를 재현하지 않았다. CLI도 원격 API를 쓰면 네트워크 장애가 발생할 수 있고, 메시지 크기만으로 전체 비용을 비교할 수 없다. 측정에는 다음을 포함해야 한다.

- 도움말·스킬·스키마의 설명·탐색 비용.
- 중간 결과와 최종 결과 크기, 모델 왕복·재시도·인증·연결 지연.
- 입력·출력·캐시 토큰과 실제 청구 기준.
- 최종 상태의 정확성, 실패와 사람의 복구 시간.

## 4. 선택 조건

| 조건 | 우선 비교할 방식 | 확인할 점 |
| --- | --- | --- |
| 로컬 개발·파일·Git·테스트 작업 | CLI+스킬 | 기존 실행 환경 재사용과 명령 탐색 비용 |
| 대량 데이터 필터링·변환 | CLI 또는 코드 실행형 MCP | 중간 처리가 모델 밖에서 끝나는지 |
| 셸이 없는 호스트·여러 MCP 호스트 연결 | MCP | 호스트별 발견·호출·입력 검증 지원 |
| 원격 계정에 위임된 권한으로 접근 | 인증된 원격 MCP 또는 별도 API | 사용자·조직별 권한·철회·격리 |
| 장기 실행·상태·취소 | 실제 구현 비교 | CLI 세션·데몬과 MCP 상태 관리 모두 구현 확인 필요 |

[MCP Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)은 HTTP 인증을 다루지만 지원 자체는 선택 사항이며 stdio는 환경의 자격증명을 사용한다. MCP만으로 권한·조직 격리·감사 로그가 완성되지는 않는다. CLI도 OAuth를 사용할 수 있으며 [Workspace CLI 인증](https://github.com/googleworkspace/cli#authentication)이 당시 참고 사례다. 인터페이스 이름보다 실제 권한 검사와 실행 범위를 확인해야 한다.

CLI 기반 제공과 사람용 화면은 함께 설계할 수 있다. [Playwright CLI의 모니터링](https://github.com/microsoft/playwright-cli#monitoring)은 참고 사례다. 기존 편집기·정적 출력과의 비교는 사람의 검토·공유 부담을 확인하는 기준으로 남긴다. 현재 SiloLink는 데스크톱 경험을 제품 목표에 포함한다.

## 5. Windows에서 실제 확인한 결과

확인일은 2026-11-01이다. Node.js 22.20.0에서 프로세스와 JSON 입출력을 확인했다. Claude SDK는 임시 폴더에 설치해 사용하고 삭제했으며 저장소의 제품 의존성으로 추가하지 않았다.

| 구성 | 확인 버전 | 역할 |
| --- | --- | --- |
| Codex CLI | 0.160.0 | App Server, 과거 기록, 실제 생성·스트리밍·취소 |
| Claude Code | 2.1.292 | 로컬 기록 형식, 실제 생성·스트리밍·취소와 제어 프로토콜 |
| Claude Agent SDK | 0.3.316 | 공식 세션 목록·메시지 조회 함수 |

### 검증 결과표

| ID | 확인한 대상 | 결과와 경계 |
| --- | --- | --- |
| V01 | Codex 로컬 기록 | 현재 저장소에 속한 JSONL 표본 109개 행 파싱, 오류 0. 프로젝트 경로·세션·역할·시각 확인. 읽는 동안 파일 해시 동일 |
| V02 | Claude 로컬 기록 | 기존 세션 표본 74개 행 파싱, 오류 0. `cwd`, `sessionId`, 메시지 역할·시각 확인. 읽는 동안 파일 해시 동일 |
| V03 | Codex 버전별 프로토콜 스키마 | 설치 CLI의 `generate-json-schema` 성공. 초기화·세션 목록/읽기·턴/항목 페이지·턴 시작/취소 스키마 존재 |
| V04 | Codex 실제 과거 세션 API | 현재 프로젝트 필터로 `thread/list` 2건, 기존 세션의 `thread/read`, `thread/turns/list` 2건 성공. 사용자/AI 항목, 안정적 ID·경로·시각·기간 필드 확인 |
| V05 | Codex 실제 생성과 출력 | 임시·읽기 전용·비영구 세션에서 지정한 짧은 응답 수신. 텍스트 델타 7개와 `completed` 확인 |
| V06 | Codex 활성 작업 취소 | 별도 비영구 세션의 `turn/start` 수락 직후 `turn/interrupt` 성공, 같은 턴의 최종 `interrupted` 확인. 첫 텍스트 전 취소이며 부분 출력 이후 취소까지 확인한 결과는 아님 |
| V07 | Claude SDK 과거 기록 API | `listSessions`와 `getSessionMessages` 성공. 현재 저장소 기록은 0건이어서 기존 다른 프로젝트의 최신 세션에서 메시지 3건만 조회. 사용자/AI 역할·UUID·세션 ID·타임스탬프 확인 |
| V08 | Claude 로컬 제어 연결 | 인증을 싣지 않은 격리 `--bare` 프로세스에서 초기화 성공, 대기 상태 `interrupt`에 `still_queued` 응답. 프롬프트 전송·모델 생성·활성 작업 취소는 수행하지 않음 |
| V09 | Claude 공식 CLI의 기존 로그인과 실제 생성 | `claude auth status`에서 로그인됨·`authMethod: oauth_token`·`apiProvider: firstParty` 확인. 기존 인증을 유지한 임시 작업 공간에서 지정 응답 수신, 텍스트 델타 3개와 `success`·`is_error: false` 확인 |
| V10 | Claude 공식 CLI의 생성 중 취소 | 두 번째 요청의 `message_start` 이후 `interrupt` 성공. 중단 영수증과 최종 `error_during_execution`·`is_error: true` 확인. 텍스트 출력 전 취소이며 Codex의 `interrupted`와 표현이 다름 |
| V11 | 구현한 CLI와 공통 기록 변환 | 실제 CLI로 현재 저장소 초기화·Codex 조회 후 본인 생성 메타데이터만 정리. 원문 항목 100개 상한에서 텍스트 43건·부분 결과·종료 코드 2 확인. 기존 다른 프로젝트의 Claude 조회는 텍스트 3건·경고 0, 그중 2건의 원래 세션과 조회 컨테이너가 다름을 보존 |

이 숫자는 제한한 조회·표본의 결과이며 전체 세션 수나 파서의 일반적인 정확도가 아니다. 보고서에 원문 대화·세션 식별자·인증정보를 복사하지 않았다. 검증에 쓴 프로세스·임시 폴더는 정리했다.

### 확인 과정에서 드러난 조건

- 기본 샌드박스의 읽기 제한 상태에서는 기존 Codex 홈의 SQLite 런타임 초기화가 실패했다. 정상 초기화에 필요한 실행 권한으로 다시 확인하자 V04가 성공했다. 공식 조회 API를 쓰는 프로세스도 자체 상태·임시 파일 쓰기가 필요할 수 있으므로 원문 읽기와 프로세스 실행 권한을 구별해야 한다.
- 새로 만든 격리 세션은 모델 턴이 없는 상태에서 메타데이터 읽기가 가능했지만 턴 이력 조회는 실패하고 목록은 비어 있었다. 과거 이력 검증은 이 표본으로 결론 내리지 않고 실제 저장된 세션으로 수행했다.
- 첫 취소 시험은 텍스트 델타를 기다리다가 45초에 도달해 종료했다. 이후 턴 수락 직후 취소하는 V06으로 활성 작업의 종료를 확인했다. 출력이 오기 전의 실행·취소 상태를 UI에 표현해야 한다.
- Claude 제어 시험의 빈 MCP 설정은 `{}`로 전달하면 거부됐다. `{"mcpServers":{}}`로 수정한 뒤 V08이 성공했다. 이 결과는 모델 인증이나 생성 성공을 의미하지 않는다.
- Claude SDK 0.3.316의 조회 메시지는 실제로 `timestamp`를 반환했다. 모든 버전의 계약이라고 가정하지 말고 설치 버전과 결과 필드를 확인해야 한다.
- V09~V10은 `--bare` 대신 기존 로그인을 유지하는 공식 CLI를 사용했다. 임시 작업 공간, 도구 비활성화, 설정·MCP 자동 연결 제한, 비영구 세션 옵션으로 응답과 제어만 확인했다. API 키로 전환하거나 사용자 토큰을 직접 읽지 않았다.
- 취소 성공과 일반 실행 실패가 같은 오류 계열로 표현될 수 있다. 취소 요청·수락·실제 종료를 연결해 앱 상태를 정규화하고 `is_error` 하나로 모든 결과를 분류하지 않는다.
- 실제 Claude 파일·SDK 조회에서는 복사된 과거 메시지의 원래 세션 ID가 조회 파일의 ID와 달랐다. 프로젝트 경로를 먼저 검사하고 원래 메시지의 세션 ID·UUID를 정체성으로 쓰며 조회 컨테이너를 별도로 보존하도록 초기 CLI 계약을 보완했다. 이력이 복사됐다는 이유만으로 같은 요청을 여러 번 센 것으로 분석하지 않는다.

### 연동 방식의 공식 근거

[Codex App Server](https://learn.chatgpt.com/docs/app-server)는 초기화, 세션/이력 조회, 턴 시작·이벤트·취소를 제공한다. 목록의 기본 소스 필터와 페이지 처리, 읽기와 재개를 구별해야 한다. V04는 `cwd`와 `sourceKinds`를 명시하고 `useStateDbOnly`로 조회했다. V05~V06은 별도 임시 작업 공간과 비영구 세션을 사용했다.

Claude의 [세션 문서](https://code.claude.com/docs/en/agent-sdk/sessions)와 [TypeScript SDK](https://code.claude.com/docs/en/agent-sdk/typescript)는 세션 열거·메시지 읽기와 스트리밍 입력 중 제어 기능을 설명한다. V07은 SDK의 공개 조회 함수로 확인했으며, V08의 직접 제어 메시지는 로컬 확인용이다. 제품의 제어 연결은 SDK를 우선 검토한다.

[Claude 비대화형 실행](https://code.claude.com/docs/en/headless)과 설치 도움말에서 JSON/stream-json 입출력을 확인했다. `--bare`는 구독 로그인과 같은 인증 동작을 그대로 유지하는 모드가 아니므로 격리 시험의 실행 옵션을 제품 기본값으로 복사하지 않는다.

### 구독과 제품 내 실행: 공식 CLI 호스팅과 자체 인증 구별

[Claude Agent SDK 개요](https://code.claude.com/docs/en/agent-sdk/overview)는 제3자 제품의 claude.ai 로그인·사용 한도 제공 제한과 API 인증을 안내한다. 이 문구만으로 사용자 소유 CLI 호스팅까지 API 키 필수라고 판단했던 초기 해석은 정정한다.

[Claude Code 공식 제품 제공·인증 안내](https://code.claude.com/docs/en/legal-and-compliance)는 다음을 구별한다.

- 제품에서 Claude Code를 설치·실행하는 경우 미수정 공식 바이너리와 내장 인증 방식을 유지하고 적용되는 계약 조건을 따른다.
- 최종 사용자는 자기 API 키·구독·지원 공급자 인증으로 직접 이용하고 비용·사용량은 해당 사용자에게 귀속한다.
- 제3자 자체 로그인 제공·사용자 구독으로 요청 대리 중계·자격증명 수집/저장/중계는 제한한다.
- 플랫폼이 Claude Code를 호스팅하더라도 사용자가 미수정 공식 바이너리에 자기 구독으로 로그인하는 것을 막는 것은 아니라고 명시한다.

SiloLink는 사용자가 설치한 공식 CLI를 로컬에서 실행하고 공식 인증 흐름을 유지하는 방식을 우선 설계한다. API 키 강제 전환이나 Claude 내장 실행 제외를 제품의 필수 결정으로 요구하지 않는다. SDK 사용 여부 하나만으로 인증 구조를 판정하지 않고 실제 바이너리·로그인 소유·요청 경로를 확인한다.

V05와 V09는 이 PC의 기존 로그인 환경에서 성공한 결과다. 모든 계정·구독·배포 형태를 실행 검증했거나 각 오픈소스 제품의 계약·승인 여부를 확인한 결과는 아니다.

### Orca ADE와 다른 오픈소스의 실제 구현

2026-11-01 아래 공개 소스의 고정 커밋을 읽었다. 저장소를 설치·실행한 비교는 아니며 코드에서 확인한 연결 구조다.

| 제품·확인 커밋 | 확인한 구조 | 근거 |
| --- | --- | --- |
| Orca ADE, `a37a5b3e` | 설치된 CLI·터미널 로그인·기존 `~/.claude` 활용을 안내한다. 구조화 채팅도 SDK의 `query()`에 사용자의 로컬 CLI 경로와 자체 프로세스 생성 함수를 전달한다. 인증 정책은 로컬 계정 선택을 따른다 | [사용 안내](https://github.com/stablyai/orca/blob/a37a5b3e2dc4b92eae3db48ce06a62de9d1cb079/docs/site/content/docs/agents/claude-code.mdx), [SDK 연결](https://github.com/stablyai/orca/blob/a37a5b3e2dc4b92eae3db48ce06a62de9d1cb079/src/main/claude/claude-stream-json-connection.ts#L99-L124), [프로세스 생성](https://github.com/stablyai/orca/blob/a37a5b3e2dc4b92eae3db48ce06a62de9d1cb079/src/main/claude/claude-agent-sdk-process-spawn.ts), [인증 정책](https://github.com/stablyai/orca/blob/a37a5b3e2dc4b92eae3db48ce06a62de9d1cb079/src/main/claude-accounts/claude-structured-auth-policy.ts) |
| Emdash, `ab766e8f` | CLI의 `auth login`과 API 키를 별도 인증 선택지로 등록한다. ACP 채팅 어댑터에 `CLAUDE_CODE_EXECUTABLE`로 호스트 설치 CLI를 지정하며, 코드가 어댑터의 SDK 사용을 설명한다 | [인증·설치·실행 연결](https://github.com/generalaction/emdash/blob/ab766e8fbb436584dcf0f299740e79d559b8ed31/packages/plugins/src/agents/impl/claude/index.ts), [ACP 어댑터](https://github.com/generalaction/emdash/blob/ab766e8fbb436584dcf0f299740e79d559b8ed31/packages/plugins/src/agents/impl/claude/adapter.ts), [CLI 인증 조회](https://github.com/generalaction/emdash/blob/ab766e8fbb436584dcf0f299740e79d559b8ed31/packages/plugins/src/agents/impl/claude/auth.ts) |
| CloudCLI / Claude Code UI, `13e9ef64` | SDK `query()`를 사용하고 설치된 CLI가 있으면 실행 경로를 지정한다. 인증 코드는 API 키·OAuth 환경 변수·기존 로그인 파일을 구분한다. 로그인 파일을 직접 읽는 부분까지 SiloLink에 채택한다는 뜻은 아님 | [SDK 실행·CLI 경로](https://github.com/siteboon/claudecodeui/blob/13e9ef64977d909eaf881eb83fec250c679f3d5c/server/modules/providers/list/claude/claude-runtime.provider.ts), [인증 구현](https://github.com/siteboon/claudecodeui/blob/13e9ef64977d909eaf881eb83fec250c679f3d5c/server/modules/providers/list/claude/claude-auth.provider.ts) |

공식 로컬 CLI를 터미널이나 구조화 연결로 감싸는 실제 사례다. SDK 사용을 별도 모델 API 직접 호출이나 API 키 필수와 동일시하지 않는다. SiloLink의 화면·연결 방식·인증 수단을 구별해 설계하고, 공식 CLI의 인증을 앱의 독자적인 인증·토큰 중계로 바꾸지 않는다.

### 이번에 재검증하지 않은 초기 자료

Antigravity의 `agy -p`, JSON/stream-json 지원은 [초기 Headless 문서](https://antigravity.google/docs/cli/headless/)와 당시 도움말에서 확인한 기록을 유지한다. 당시 공식 문서의 기본 제한은 5분, 설치본 도움말은 `0s`·완료까지 대기였다. 이번에는 실행·재확인하지 않았다.

[Codex 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode), [Claude Code 플러그인](https://code.claude.com/docs/en/plugins), [Codex 플러그인](https://learn.chatgpt.com/docs/plugins)·[훅](https://learn.chatgpt.com/docs/hooks), [OpenAI 스킬 구성](https://developers.openai.com/plugins/build/skills)은 기존 연동 참고 자료다. 플러그인 설치·훅 실행·실제 자동 수집의 종단 간 검증은 남아 있다.

## 6. SiloLink 설계에 남길 제안

다음은 구현이 확정된 설계가 아니다.

- **공통 기능 재사용:** 코어에 저장·검색·검증을 두고 CLI·데스크톱·필요시 MCP에서 재사용한다. UI 종료 중 CLI 사용 가능성도 검토한다.
- **기계 판독 계약:** JSON 출력, 안정적인 식별자, 결과 수·필드 제한, 큰 본문의 파일 입출력, 명시적인 오류·종료 코드·규격 버전을 정의한다.
- **프로젝트와 기록 식별:** 프로젝트 ID와 경로·저장소·워크트리·공급자 세션을 연결한다. 폴더명·원격 URL만으로 자동 병합하지 않는다.
- **근거와 이력:** 원본 위치·출처·생성 도구·시각·버전·선택 문서의 리비전·관련 기록을 연결한다. 종류와 제안·검토·확정 상태를 구별한다.
- **다중 쓰기:** 중복·재시도·외부 편집·동시 수정·색인 재구축·복구를 처리한다. Markdown·첨부 원본과 재구축 가능한 색인은 후보이며 저장 엔진은 미선정이다.
- **실행 연결:** 실행 ID·공급자·버전·세션·이벤트·오류를 연결하고 진행·추가 입력·실패·취소·부분 결과를 구별한다.
- **입력과 작업 경계:** 사용자 입력은 인자·표준 입력으로 전달하고 셸 문자열로 이어 붙이지 않는다. 참고 자료와 실행 지침, 초안 작업과 원본 반영을 구별하는 방안을 검토한다.
- **인증과 비용:** 공급자 지원 인증을 사용하고 자격증명을 기록물에 복사하지 않는다. 기존 구독의 이용 범위, 실제 설치본 호출과 도구 번들 배포의 차이를 확인한다.
- **추천과 검증:** 관련 문서의 근거 위치·연결 이유·버전·조건을 보여주고 잘못된 연결을 고칠 수 있게 한다. 최신 문서라는 이유만으로 이전 결론을 자동 폐기하지 않는다. 형식 검사는 내용 검증을 대신하지 않는다.

태그·링크·키워드·메타데이터 검색부터 비교하고, 의미 검색이나 지식그래프는 실제 누락·탐색 문제에 따라 검토하는 제안이 있었다. 특정 검색 방식이나 그래프 기능의 최종 포함·제외는 정하지 않았다.

## 7. 검증 결과에 따른 초기 설계와 남은 확인

### 먼저 구현할 수 있는 범위

초기 Node 검증에서는 Codex App Server와 Claude SDK 공개 인터페이스를 우선 사용했다. 2026-11-02 사용자 요청으로 Rust에 이식하면서 Codex 공식 App Server 연결을 유지하고 Claude는 로컬 JSONL 어댑터로 전환했다. 로컬 형식을 안정적 공개 API로 취급하지 않으며 어댑터·검증 버전·미해석 항목을 드러낸다. 공식 인터페이스가 달라지면 해당 어댑터를 교체할 수 있도록 공통 기록과 분리한다.

이 경로의 초기 구현은 [CLI·공통 기록 계약](../development/cli.md)에 연결했다. 자동 테스트에서는 실제 자식 프로세스 프로토콜과 공개 Claude SDK의 합성 기록 읽기를 확인하고, V11에서는 사용자 기록을 복사하지 않은 실제 조회를 확인했다.

2026-11-02 Rust 전환 확인: Node 없이 초기화·조회·저장·스킬 설치를 수행하며 프로젝트·기록·SQLite v1을 유지한다. 공식 SDK 0.3.316으로 만든 14개 합성 일반/분기/스트리밍/압축/메타/대기/전달 확인 사례를 독립 회귀 자료로 보존했다. 실제 Claude 세 프로젝트의 8·11·2건과 현재 Codex 프로젝트의 64건을 기존 구현과 대조했을 때 ID 누락·추가·revision 차이·경고가 모두 0이었다. 원문은 저장소에 복사하지 않았다. 비교한 상태와 버전의 근거이며 전체 기록·모든 버전의 호환을 보증하지 않는다.

네이티브 Windows 설치기는 임시 설치 경로에서 확인했고, PATH가 빈 환경의 실행·Codex 스킬 발견·기존 Claude 로그인에서 `/silolink init`의 실제 네이티브 호출·기존 문서 보존을 확인했다. 사용자 전역 스킬·PATH는 검증 중 바꾸지 않았다. Node 런타임·SDK 배포 파일은 제거했고 공개 릴리스 배포·Antigravity 실제 실행은 아직 검증하지 않았다.

연결부가 공급자·세션·원문 항목 ID·프로젝트 경로·발생 시각·수집 시각·리비전·부분 결과 상태를 공통 기록으로 변환하는 방식을 제안한다. 공급자별 ID의 이름공간을 구별하고 같은 항목의 재수집과 갱신을 나눈다. 누락 필드·알 수 없는 형식·불확실한 프로젝트 귀속을 드러낸다.

### 데스크톱 실행과 외부 CLI 관찰

검증용 연결부가 직접 시작한 Codex 작업의 이벤트 수신은 V05~V06으로 확인했다. 별도 터미널에서 사용자가 시작한 기존 CLI의 모든 이벤트를 다른 프로세스에서 같은 방식으로 구독할 수 있는지는 확인하지 않았다.

외부 CLI는 공개 훅과 재수집을 조합하는 안을 검증해야 한다. [Claude 훅](https://code.claude.com/docs/en/hooks)은 세션·작업 경로·원문 경로 등을 제공하지만, 종료 훅 시점에 마지막 응답이 항상 파일에 반영되어 있지는 않다고 설명한다. 이벤트 후 재조회·보완이 필요할 수 있다. 이번에 훅을 설정하거나 실행한 것은 아니다.

시간 정보가 있어도 사용자의 집중 작업 시간과 같게 취급하지 않는다. 앱의 직접 실행·외부 CLI 관찰·본인 작업·사용자 테스트를 구별하고 수집할 수 없는 시간은 추정·미확인으로 표시한다.

### 다음 검증 항목

- 외부 Codex·Claude Code의 요청·응답·도구 결과·종료·중단을 플러그인/훅에서 관찰해 수집할 수 있는 범위.
- 기록의 부분 쓰기, 이벤트 재전송, 재시작, 갱신·압축·분기·삭제와 재수집의 일관성.
- 같은 폴더명·경로 이동·워크트리·작업 디렉터리 변경을 포함한 프로젝트 식별.
- 실제 원문 저장·색인·동시 변경·복구, 데스크톱과 외부 AI의 양방향 재사용.
- 두 공급자의 승인 대기·추가 입력·도구 실행·부분 결과·취소 후 재시도, 정상 완료와 취소/실패의 상태 변환.
- 공식 자료 접근과 조사 도구의 실제 동작, 필요한 권한·비용과 근거 연결.

CLI·MCP 효율을 비교한다면 같은 모델·작업·완료 기준에서 양쪽을 적절히 최적화하고 탐색 비용·최종 상태·토큰·지연·사람의 복구 시간을 포함한다. 이는 개발 검증이며 사용자에게 고정된 작업 절차를 요구하는 것은 아니다.
