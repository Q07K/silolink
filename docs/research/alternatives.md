# 유사 제품과 개발 가치 검토

- 조사·통합일: 2026-11-01, Asia/Seoul
- 범위: 초기 유사 제품 8종 조사와 개발 타당성 검토를 통합했다.
- 근거 수준: 기존 기록의 공식 저장소·제품 문서·일부 빌드·릴리스 확인. 이번 문서 정리에서 외부 자료를 다시 열람하거나 제품을 설치하지 않았다.
- 제품 요구: [제품 정의](../product/definition.md). 아래 기능 설명은 조사 당시 상태이며 현재 버전의 지원 보장이 아니다.

## 1. 비교 결과

전체 구성의 비교 대상으로 The Vault, 사람과 AI의 문서 공유·재사용은 Basic Memory, 데스크톱 AI CLI 실행은 Emdash가 가까웠다. 기존 도구와 겹치는 기능이 있으므로 로컬 저장이나 여러 AI 연결 자체를 차별화 근거로 삼기는 어렵다. 사용자도 당시 유사 제품을 사용해 보지 않았다.

| 후보 | 당시 공식 자료의 지원 설명 | 차이·미확인 사항 |
| --- | --- | --- |
| [The Vault](https://github.com/aliihsaad/the-vault) | 공통 코어·데스크톱·CLI·MCP, 프로젝트별 결정·계획·인계·산출물, Codex·Claude 연결 | 정형 조사·검토·공유 정리서 경험과 실제 연동·보존 품질 미검증 |
| [Basic Memory](https://github.com/basicmachines-co/basic-memory) | 로컬 Markdown·프로젝트·검색·CLI·MCP, 기존 편집기와 파일 공유, Codex·Claude Code 플러그인 | 전용 코딩 CLI 실행 데스크톱은 미확인. 문서·Cloud 기능은 [별도 분석](basic-memory.md) 참고 |
| [Pieces](https://pieces.app/) | 데스크톱 작업 타임라인·검색·산출물 생성, 외부 AI의 MCP 접근 | 저장소별 프로젝트 경계와 자체 CLI 실행 통합 미확인. MCP는 당시 Pro 표기 |
| [projectmem](https://github.com/riponcm/projectmem) | 초기화·개발 이벤트·계획·CLI·MCP, 프로젝트별·통합 대시보드 | 로컬 웹·정적 대시보드 중심. README의 기존 기록 일괄 가져오기는 당시 향후 기능 |
| [Claude-Mem](https://github.com/thedotmack/claude-mem) | 훅 기반 관찰·요약·검색·세션 회상, 로컬 뷰어·My Work와 다중 에이전트 연동 | 검토된 사람용 문서와 자동 관찰의 경험 차이, 추론 제공자·클라우드 구성 확인 필요 |
| [Entire CLI](https://github.com/entireio/cli) | Git 커밋에 연결한 세션 체크포인트, 에이전트·플러그인 연동과 프로젝트 기억 | 코드 변경·세션 추적 중심. 범용 조사 문서와 로컬 CLI·서비스의 범위 구분 필요 |
| [Emdash](https://github.com/generalaction/emdash) | 여러 코딩 CLI 실행·재개, 프로젝트·워크트리 작업, 프롬프트·스킬·MCP 라이브러리 | 외부 기록을 공통 지식 저장소에 저장·재사용하는 기능은 미확인 |
| [Open Notebook](https://github.com/lfnovo/open-notebook) | 자료·노트북·대화·검색, 별도 MCP 서버를 통한 외부 AI 접근 | 코딩 프로젝트·CLI 세션 자동 수집은 미확인. MCP 서버는 별도 패키지 |

‘미확인’은 기능 부재 판정이 아니다. 제공자의 설명과 실제 사용성·정확성·안정성은 구별해야 한다.

## 2. 도입·구현을 검토할 때 중요한 근거

- **The Vault:** [빌드 구성](https://github.com/aliihsaad/the-vault/blob/main/package.json)에 코어·CLI·MCP·데스크톱이 구분돼 있었다. [릴리스](https://github.com/aliihsaad/the-vault/releases)에서 v0.6.7과 Windows 배포·번들 MCP 런타임 설명을 확인했다. v0.6.5의 요약 잘림·프로젝트 오분류 수정 이력은 원문 보존과 프로젝트 귀속을 검증할 이유이며, 현재 오류의 재현 결과가 아니다. 일부 raw 파일·패키지 목록·상태 문서는 열람하지 못했고 코드 전체 감사도 하지 않았다.
- **Basic Memory:** [Claude Code 플러그인](https://github.com/basicmachines-co/basic-memory/blob/main/plugins/claude-code/README.md)과 [Codex 플러그인](https://github.com/basicmachines-co/basic-memory/blob/main/plugins/codex/README.md)은 결정·체크포인트·프로젝트 매핑을 설명했다. 두 도구의 동작이 완전히 같다는 의미는 아니다.
- **Pieces:** [MCP 제품 설명](https://pieces.app/mcp)과 [Codex 연결 가이드](https://docs.pieces.app/products/mcp/openai-codex-cli)를 확인했다. 데스크톱 회상과 저장소별 기록 관리가 얼마나 맞는지는 직접 비교해야 한다.
- **Emdash:** [공식 문서](https://emdash.com/docs)와 저장소의 CLI 실행 경험을 참고했다. MCP 라이브러리 관리와 자체 기록용 MCP 제공은 다른 기능이다.
- **Open Notebook:** [공식 MCP 안내](https://github.com/lfnovo/open-notebook/blob/main/docs/5-CONFIGURATION/mcp-integration.md)가 연결하는 [별도 서버](https://github.com/Epochal-dev/open-notebook-mcp)까지 확인했다. 주 제품에 모두 내장된 것으로 취급하지 않았다.

당시 루트 라이선스 표기는 The Vault·projectmem·Entire CLI·Open Notebook와 확인한 별도 MCP 서버가 MIT, Basic Memory가 AGPL-3.0, Claude-Mem·Emdash가 Apache-2.0이었다. Pieces는 서비스 제품이다. 이는 당시 표시 기록이며, 채택 버전·구성 요소·의존성·서비스 조건을 확인한 재사용 판단을 대신하지 않는다.

## 3. 개발 가치와 남은 검증

| 관점 | 직접 구현할 가치 후보 | 검증할 부담·조건 |
| --- | --- | --- |
| 작업 경험 | 실제 요청·선택·학습·회고를 프로젝트 맥락과 연결 | 기존 도구의 설정·템플릿·스킬로 충분한지 비교 |
| 기록 활용 | 결정·근거·구현·검증을 사람과 AI가 재사용 | 원문 손실·오분류·검색 누락·기록 관리 수고 확인 |
| 프로젝트 운영 | 공통·로컬 규칙, 문서 비교와 변경 반영 | 규칙 예외·동시 변경·되돌리기 책임 발생 |
| 데이터 통제 | 원하는 형식·검토 상태·내보내기 설계 | 기존 로컬 도구와의 실질적인 차이 확인 |
| 학습·제품화 | 반복 사용하며 기능을 다듬고 다른 사용자로 확장 | 개인 학습 가치·생산성 향상·외부 수요를 각각 검증 |

초기에는 정형 조사·브레인스토밍을 출처와 검토 상태가 있는 공유 정리서로 연결하는 경험이 차별화 후보였다. 이후 인터뷰에서 개인 사용 패턴 분석·학습·규칙 관리·실적 기반 계획으로 목표가 구체화됐다. 어느 쪽도 경쟁 제품에 없는 기능이나 검증된 전환 이유로 단정하지 않는다.

기존 도구로 충분하면 활용하거나 확장하는 선택도 비교 기준이다. 기록·검색은 충분하고 특정 단계만 불편하면 그 단계에 집중할 수 있다. 반복 사용과 개선 효과가 확인되면 확장하고, 관리 부담이 이득보다 커지면 범위를 줄이는 것이 개발 타당성 검토의 기준이다. 비교 체험을 개발 전 필수 승인 절차로 확정한 것은 아니다.

## 4. 비교 시 확인할 경험

실제 프로젝트 기록을 도구에 넣고 다음 경험을 비교하는 방안을 제안한다. 시험용 기록 개수나 아래 순서를 제품의 고정 사용 절차로 삼지는 않는다.

- 외부 AI에서 쓴 기록을 사람용 화면에서 같은 프로젝트로 확인하고 다른 AI 작업에서 재사용한다.
- 근거·조건·미확인 사항을 유지하고, 다른 판단과 연결하거나 사람이 읽을 정리서로 공유한다.
- 원문 유실·중복·프로젝트 오분류·검색 누락·동시 수정과 복구를 확인한다.
- 설치·정리·추가 설정·수정에 드는 수고와 자발적인 반복 사용을 비교한다.

제품 설치·로그인·MCP 호출·문서 업로드·검색 품질·취소·장기 사용은 실행 검증하지 않았다. 주요 후보 8개를 조사한 것으로 모든 유사 제품을 망라하지 않는다. 사용자 수·시간 절감·유료 수요·브랜드명 충돌도 확인하지 않았다.
