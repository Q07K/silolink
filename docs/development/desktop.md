# Windows 데스크톱 앱

SiloLink의 첫 네이티브 데스크톱이다. 사용자 선택인 ‘발견에서 시작’ 배치를 제공된 브랜드 자산과 함께 구현한다. Tauri 2·React·TypeScript 화면이 공통 Rust 라이브러리를 직접 사용한다. CLI 출력을 파싱하거나 기존 CLI 로직을 JavaScript로 옮기지 않는다.

## 실행과 빌드

Windows x64·MSVC·WebView2를 기준으로 확인한다. 소스 개발에는 Node 22.20 이상과 Rust 1.90 MSVC, C++ Build Tools가 필요하다. 실행 파일에는 Node/npm/Python 런타임을 포함하거나 요구하지 않는다. WebView2는 Windows 시스템 런타임을 사용한다. [Tauri Windows 요구사항](https://v2.tauri.app/start/prerequisites/), [화면과 Rust 명령](https://v2.tauri.app/develop/calling-rust/).

```powershell
# 저장소 루트
.\scripts\desktop.ps1 -Mode dev

# 프로덕션 실행 파일 + Windows 설치 프로그램
.\scripts\desktop.ps1 -Mode build

# 실행 파일만 빌드
.\scripts\desktop.ps1 -Mode build -NoBundle
```

스크립트는 기존 저장소의 로컬 MSVC 도구체인이 있으면 그것을 사용하고, 종료 후 환경 변수를 복구한다. 프런트엔드 의존성은 `desktop/package-lock.json`, Rust 의존성은 루트 `Cargo.lock`으로 고정한다. 루트 Cargo의 기본 대상은 기존 CLI로 유지한다.

실행 파일은 `target/release/silolink-desktop.exe`, NSIS 설치 프로그램은 `target/release/bundle/nsis/`에 생성된다. 설치 프로그램을 빌드하는 것과 사용자 PC에 실제 설치하는 것은 구별한다. 자동 업데이트·코드 서명·macOS 배포는 현재 제공하지 않는다.

데스크톱 스크립트는 먼저 `prepare-desktop.ps1`로 CLI를 빌드하고 Tauri 리소스로 준비한다. 설치 프로그램에 `bin/silolink.exe`가 포함된다. 개발자가 Cargo로 앱을 직접 검사할 때도 먼저 `.\scripts\prepare-desktop.ps1 -Profile debug`를 실행한다. 앱 EXE만 다른 폴더로 복사하면 이 리소스가 누락되므로 설치 프로그램을 사용하거나 `bin`도 함께 보존한다.

실행 중인 앱을 보존하며 별도 체험 빌드를 만들 때는 `CARGO_TARGET_DIR`로 출력 경로를 바꾸고 `-ConfigPath <JSON>`으로 Tauri 설정을 덮어쓸 수 있다. 별도 `identifier`와 `productName`을 사용하면 기존 앱과 설정·단일 실행 제한이 분리된다. `ConfigPath`는 작업 디렉터리를 바꾸기 전에 실제 경로로 해석한다.

## 첫 사용

1. 앱의 ‘프로젝트 연결’에서 폴더를 선택하고 관리 정보 생성 안내를 읽은 뒤 연결한다. 연결 버튼이 공통 init을 명시적으로 요청한다. 초기화 체크박스나 명령어 입력은 요구하지 않는다. 스킬로 이미 연결한 폴더도 같은 프로젝트로 열린다.
2. 새로 연결한 프로젝트를 선택하고 ‘첫 문서 확인’에서 문서 개수·정리 후보·경고를 본다. 원문 목록과 후보 원문으로 바로 이동한다. 문서 0개와 읽기 실패는 구별한다. 이 단계는 기록 보관 위치 없이 동작한다.
3. AI 기록도 원하면 ‘AI 기록 가져오기’ 탭에서 기록과 문서 백업의 저장 폴더를 선택하고 가져오기를 실행한다. 기존 CLI의 state-dir도 사용할 수 있다. 도구별 결과·마지막 반영·누락을 확인한다.
4. 사용 분석·대화·조사·학습·작업·회고 등 필요한 지점에서 이어간다. 고정 순서를 요구하지 않는다.

## AI 도구의 스킬 연결

첫 화면의 ‘AI 도구 연결’ 또는 ‘알림·설정’ 상단에서 Codex·Claude Code·Antigravity의 사용자 스킬을 등록한다. `tool_connections`는 기존 공통 설치 계약을 읽기 전용으로 검사하며, `connect_tool`은 세 호스트만 허용하고 기존 `install::setup`을 호출한다. 설치 파일의 리소스 경로와 OS 사용자 홈은 네이티브에서 결정하며 화면은 임의 실행 파일·저장 경로를 전달하지 않는다. `SILOLINK_USER_HOME`은 기존 CLI와 같은 격리 검증용 홈 재정의다.

등록 상태는 스킬·메타데이터와 실제 동봉 CLI 경로를 대조한다. 원문이 수정됐거나 다른 설치를 가리키거나 링크를 발견하면 ‘기존 스킬 확인 필요’로 표시하고 보존한다. 이미 동일하게 등록됐다면 재실행을 유지한다. 호스트 프로그램 설치·로그인 성공이나 Antigravity 실제 실행을 ‘연결됨’에 포함하지 않는다.

자동 빌드와 태그 배포는 [배포 안내](releasing.md)를 참고한다.

연결 버튼은 통합 스킬과 기능별 스킬 10개를 함께 설치한다. 기존 통합 스킬만 있는 정상 설치에는 ‘기능별 스킬 추가 가능’과 ‘스킬 업데이트’를 제공한다. 상태 조회는 11개 전체를 검사하고, 사용자 수정이나 동명 타사 항목이 있으면 새 스킬 추가도 중단해 기존 파일을 보존한다. Codex용 플러그인 ZIP도 같은 스킬과 한국어 `agents/openai.yaml`을 포함한다.

## 데이터와 코어의 경계

- 앱의 프로젝트 목록·설정·노트·출처·작업·대화·알림은 Tauri app_config_dir 아래 `workspace.json`에 저장한다. 완성한 파일을 교체한 뒤 메모리 상태를 갱신한다. 지원하지 않는 버전·잘못된 JSON은 보존하고 오류로 알린다.
- 기록의 `silolink.sqlite`와 문서 변경의 `document-changes.sqlite`는 사용자가 명시적으로 고른 별도 저장 폴더에 둔다. 기존 CLI의 v1 DB·ID·리비전 계약을 변경하지 않는다.
- 프로젝트는 경로와 ID를 재확인한다. 문서 본문은 코어의 스캔 범위·링크 제외·크기·UTF-8·revision 검사를 거친다.
- 수정·새 문서·삭제를 본문 중심으로 작성하거나 외부 JSON 변경안을 가져올 수 있다. 현재 앱에서 검사한 불변 계획만 반영하고, 실제 충돌·부분 결과·링크 검사·복구는 공통 코어가 결정한다.
- 외부 링크는 네이티브 경계에서 HTTP/HTTPS·호스트·내장 자격증명 여부를 검사한다. Markdown 원문 HTML을 실행하지 않으며 임의 파일 API나 셸 실행 API를 화면에 노출하지 않는다.
- `SILOLINK_DESKTOP_CONFIG_DIR`은 독립적인 검증 프로필에 사용한다. 일반 사용자 실행에서는 설정하지 않는다.

## AI 실행과 분석

로컬 집계는 실제 사용자 요청만 대상으로 한 문장 일치·표현 후보다. 의미 분석·학습·지식 연결·구조 비교·계획은 사용자가 대화 실행을 요청할 때 기존 공식 Codex/Claude Code CLI를 호출한다. 별도의 로그인·토큰 중계를 만들지 않는다.

- 질문·프로젝트·선택한 기록/문서/출처와 이전 대화 맥락을 보존한다. 문서 revision이 바뀌었거나 자료가 64 KB 한도를 넘으면 조용히 잘라 보내지 않고 범위 조정을 요청한다.
- Codex는 읽기 전용 프로젝트 모드, Claude는 파일 도구 없이 실행한다. 대화가 실제 문서를 바로 수정하는 경로로 동작하지 않는다.
- 입력 질문 16 KB, 응답 8 MB, 실행 240초 상한을 적용한다. 종료·실패·취소·중간 종료를 구별하고 이미 보존한 사용자 요청을 유지한다.
- 중지는 해당 자식 프로세스를 종료한다. 앱 완전 종료 전에도 진행 중 요청에 취소를 전달한다.
- CLI 설치·로그인·구독/이용 한도·지원 플래그가 맞아야 실제 모델 응답을 받을 수 있다. 현재 PC의 명령 도움말과 검증용 프로세스로 연결을 확인하며, 검증용 응답을 실제 모델 품질 검증으로 주장하지 않는다.
- 출처 등록은 자동 웹 검색·원문 확인이 아니다. 사용자가 원문 확인 여부를 기록하고 AI 해석과 구별한다.

## 백그라운드와 회고

기본값은 백그라운드·시스템 알림 꺼짐이다. 사용자가 켜면 창을 닫을 때 트레이에 남고 설정한 간격으로 프로젝트를 순차 수집한다. 같은 반복 발견과 같은 날짜의 회고 알림은 식별자로 중복 방지한다. 완전 종료는 트레이나 설정 화면에서 선택한다.

일간·최근 7일은 실제 `occurredAt`과 선택한 시간대 기준으로 집계한다. 시각 근거가 없는 기록은 기간 집계에서 제외하고 누락 수를 드러낸다. 시스템이 완전 종료된 동안의 상시 수집·OS 자동 시작을 구현했다고 보지 않는다.

## 시간과 계획

본인 작업은 시작/중지한 구간으로 기록한다. 작업 관점은 사용자 입력이며 단계 순서를 강제하지 않는다. 겹치는 본인 구간은 합집합으로 계산하고 AI 요청의 경과와 단순 합산하지 않는다. AI 내부 실행·대기는 아직 분리 계측하지 않아 요청 경과를 실행 시간으로 표시하지 않는다. 작업 완료와 사용자 확인은 독립적으로 남긴다. 기록이 부족한 예상은 확정 기간으로 채우지 않는다.

## 검증

```powershell
.\scripts\cargo.ps1 -CargoArguments @('test', '--all-targets', '--locked')
.\scripts\cargo.ps1 -CargoArguments @('test', '-p', 'silolink-desktop', '--lib', '--locked')
.\scripts\cargo.ps1 -CargoArguments @('clippy', '--workspace', '--all-targets', '--locked', '--', '-D', 'warnings')

Set-Location desktop
npm ci
npm run build
npm test
```

`desktop/tests/native_smoke.py`는 빌드한 실제 WebView2 앱과 Rust IPC를 사용한다. Python/Playwright가 있는 개발 환경에서 실행한다. 독립적인 `.tools/desktop-smoke/<UUID>` 프로필과 임시 프로젝트, 검증용 CLI 프로세스를 사용해 사용자 프로젝트·로그인·실제 모델을 호출하지 않는다. 로고(1320px·1040px 창의 밝은·어두운 테마와 사이드바 정렬)·초기화·수집·읽기·Markdown 링크·표현 집계·학습/작업·변경/충돌/복구·공급자 전환/실패/취소·재시작 저장을 확인한다.

실행 전 `cargo build -p silolink-desktop --features custom-protocol --bins --locked`로 개발 실행 파일과 검증용 공급자를 빌드한다. 기본 검증은 개발 실행 파일을 사용하고, `python desktop/tests/native_smoke.py --executable target/release/silolink-desktop.exe`로 배포용 실행 파일도 검사할 수 있다. 앱의 작업 디렉터리는 임시 폴더로 두어 저장소 파일이나 개발 서버에 의존하는지 확인한다.

## 알려진 후속 범위

앱 데이터 JSON은 16 MiB 한도로 보호한다. 장기간의 대화·문맥을 별도 저장소로 분리하고 보관/내보내기 정책을 갖추는 작업은 남아 있다. 문서 전체 재조회 비용, 많은 프로젝트의 백그라운드 성능, 원문 기반 자동 웹 조사, AI 내부 실행/대기 계측, 개인 예측 보정, 다중 저장소 일괄 반영·팀 공유·macOS는 후속 검증/구현 범위다. 현재 버전의 오류·빈 상태를 샘플 데이터나 가짜 성공으로 채우지 않는다.
