# CLI·MCP·플러그인과 AI 실행 연동

- 조사·통합일: 2026-11-01, Asia/Seoul
- 범위: CLI·MCP 비교, 초기 AI CLI 연동 조사, 양방향 기록 플랫폼 설계 제안을 통합했다.
- 근거 수준: 기존 기록의 공식 문서·저장소·연구 초록 및 당시 로컬 도움말 확인. 이번 정리에서 외부 자료를 재확인하거나 모델을 호출하지 않았다.
- 제품 요구와 구성: [제품 정의](../product/definition.md). 아래 지원 설명과 수치는 조사 당시의 기록이며, 구현·현재 버전 호환성·효율 개선을 보장하지 않는다.

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

## 5. AI CLI 실행에 관해 확인했던 범위

아래는 초기 조사에서 공식 문서와 로컬 도움말로 확인했다고 기록한 호출 형태다. 이번 정리에서 해당 명령을 실행하거나 설치 버전을 재검증하지 않았다.

| 도구 | 당시 확인한 방식 | 확인 범위 |
| --- | --- | --- |
| Claude Code | `claude -p`, `--output-format json` 또는 `stream-json` | [비대화형 문서](https://code.claude.com/docs/en/headless)와 `claude --help` |
| Codex | `codex exec --json`, 앱 통합용 `codex app-server` | [비대화형 문서](https://learn.chatgpt.com/docs/non-interactive-mode)와 `codex exec --help`. [App Server](https://learn.chatgpt.com/docs/app-server)는 문서만 확인 |
| Antigravity | `agy -p`, `--output-format json` 또는 `stream-json` | [Headless 문서](https://antigravity.google/docs/cli/headless/)와 `agy --help` |

당시 Antigravity의 공식 문서는 기본 제한을 5분, 설치본 도움말은 `0s`·완료까지 대기로 표시했다. 따라서 연결부의 시간 제한과 기능은 실제 설치 버전으로 확인해야 한다. Codex 도움말에는 임시 디렉터리·PATH 별칭 생성 권한 경고가 있었으나 도움말 종료 코드는 0이었다. 이 결과는 모델 실행 성공을 뜻하지 않는다.

[Claude Code 플러그인](https://code.claude.com/docs/en/plugins), [당시 Codex 플러그인](https://learn.chatgpt.com/docs/plugins)·[훅 문서](https://learn.chatgpt.com/docs/hooks), [OpenAI 스킬 구성](https://developers.openai.com/plugins/build/skills)도 참고했다. 호출 문법·매니페스트·신뢰 설정은 호스트별로 확인해야 하며 플러그인 제작·설치·훅 실행은 검증하지 않았다.

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

## 7. 개발 측에서 검증할 항목

로그인·모델 호출·웹 조사·인증 이용 범위·구조화 출력 호환·취소·전체 기록 수집·동시 쓰기는 아직 실행 검증하지 않았다. 우선 Codex·Claude Code의 과거·진행 중 기록과 설치본의 실제 실행 기능을 확인해야 한다.

검증용 작업은 프로젝트 기록 저장·검색·근거 읽기, 같은 요청 재실행, 외부 편집 반영, 잘못된 프로젝트·권한 부족·부분 실패 복구, 데스크톱과 외부 AI의 양방향 조회다. 한 도구로 연결한 뒤 두 번째 도구로 공통 규격의 재사용을 확인하는 방법을 제안한다.

CLI·MCP 효율을 비교한다면 같은 모델·작업·완료 기준에서 양쪽을 적절히 최적화하고, 실제 사용 인터페이스·탐색 비용·최종 저장 상태·토큰·지연·사람의 복구 시간을 확인한다. 이 항목들은 개발 검증 기준이며 제품 사용자가 따라야 할 작업 순서가 아니다.
