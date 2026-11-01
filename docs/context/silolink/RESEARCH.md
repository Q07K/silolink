# SiloLink 유사 제품 조사 인계

조사 기준일: 2026-11-01. 당시 가칭은 Groundwork였다. 이름이 다르더라도 같은 제품 구상을 다룬 조사다.

## 주요 관찰

전체 구조는 The Vault, 사람과 AI가 문서를 함께 쓰는 흐름은 Basic Memory, 데스크톱에서 코딩 CLI를 실행하는 부분은 Emdash와 가깝다. 신규성·경쟁 제품의 부재·사용자 수요가 확인된 상황은 아니다.

| 후보 | 공식 자료에서 확인한 겹침 | 비교 시 주의할 차이 |
| --- | --- | --- |
| [The Vault](https://github.com/aliihsaad/the-vault) | 공통 코어·데스크톱·CLI·MCP와 프로젝트별 결정·인계·산출물 | 정형 조사 폼·검토·공유 정리서 경험은 미확인 |
| [Basic Memory](https://github.com/basicmachines-co/basic-memory) | 로컬 Markdown·프로젝트·검색·CLI·MCP, Codex·Claude Code 플러그인 | 전용 코딩 CLI 실행 데스크톱은 미확인 |
| [Pieces](https://pieces.app/mcp) | 데스크톱 작업 회상과 외부 AI의 MCP 접근 | 저장소별 프로젝트 경계와 자체 실행 통합은 미확인. MCP는 당시 Pro 표기 |
| [projectmem](https://github.com/riponcm/projectmem) | 프로젝트 초기화·개발 이벤트·계획·CLI·MCP·대시보드 | 로컬 웹/정적 대시보드 중심. 문서성 공유 정리서 경험은 미확인 |
| [Claude-Mem](https://github.com/thedotmack/claude-mem) | 세션 관찰·요약·검색·회상, 로컬 뷰어와 다중 에이전트 연동 | 검토된 사람용 문서보다 세션 기억이 중심. 제공자·클라우드 설정 구분 필요 |
| [Entire CLI](https://github.com/entireio/cli) | Git 커밋과 연결한 세션 체크포인트·프로젝트 기억 | 범용 리서치 폼보다는 코드 변경과 세션 추적에 가까움 |
| [Emdash](https://github.com/generalaction/emdash) | 데스크톱에서 여러 코딩 CLI 실행·프로젝트/워크트리 작업 관리 | 외부 기록을 저장·재사용하는 공통 지식 저장소 기능은 미확인 |
| [Open Notebook](https://github.com/lfnovo/open-notebook) | 자료·노트·대화·검색, 별도 MCP 서버를 통한 외부 AI 접근 | 코딩 프로젝트 연결·CLI 세션 자동 수집은 미확인 |

## 세부 근거

- [The Vault 빌드 구성](https://github.com/aliihsaad/the-vault/blob/main/package.json), [릴리스](https://github.com/aliihsaad/the-vault/releases): 코어·CLI·MCP·데스크톱 빌드 구분과 Windows 배포 기록 확인.
- [Basic Memory Claude Code 플러그인](https://github.com/basicmachines-co/basic-memory/blob/main/plugins/claude-code/README.md), [Codex 플러그인](https://github.com/basicmachines-co/basic-memory/blob/main/plugins/codex/README.md): 결정·체크포인트·프로젝트 맥락을 다루는 각각의 연결 구성.
- [Pieces Codex 연결](https://docs.pieces.app/products/mcp/openai-codex-cli), [Emdash 공식 문서](https://emdash.com/docs).
- [Open Notebook 공식 MCP 연결 문서](https://github.com/lfnovo/open-notebook/blob/main/docs/5-CONFIGURATION/mcp-integration.md), [별도 MCP 서버](https://github.com/Epochal-dev/open-notebook-mcp).

## 사실 경계

- 확인한 것은 README·공식 문서·일부 릴리스/빌드 구성이다. 설치·로그인·성능·사용성·원문 보존·검색·취소를 직접 시험하지 않았다.
- ‘미확인’은 ‘기능 없음’이 아니다. 자료는 변할 수 있으므로 채택 전에 현재 버전과 실제 동작을 확인해야 한다.
- 당시 루트 표시: The Vault·projectmem·Entire CLI·Open Notebook은 MIT, Basic Memory는 AGPL-3.0, Claude-Mem·Emdash는 Apache-2.0. 구성 요소·버전에 따라 확인이 필요하며 법적 의무 해석은 하지 않았다.
- 사용자도 기존 도구를 사용하지 않았다. 현재 불편과 경쟁 제품에서 해결되지 않는 불편을 같은 것으로 보지 않는다.
- 비교 제품이 존재한다는 사실만으로 충분한 수요·전환 의향·개발 가치가 입증되는 것은 아니다.

## 차별화 후보 — 미검증 가설

정형 리서치·브레인스토밍을 출처·실험·판단 조건·검토 상태가 있는 공유 정리서까지 연결하는 경험이 후보로 논의됐다. 경쟁 제품에 없는 기능이라는 결론은 아니다.

자세한 원문은 [sources/README.md](sources/README.md)의 유사 제품 조사와 개발 타당성 검토를 읽는다.

