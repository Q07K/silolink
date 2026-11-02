# 네이티브 CLI·데스크톱 검증 사례

## 스킬 초기화와 실행 중인 앱의 프로젝트 연결 — 2026-11-02

| 요구·경계 | 테스트·확인 위치 | 검증 대상 |
| --- | --- | --- |
| 스킬의 CLI init 성공이 앱 프로젝트 연결로 이어짐 | native_cli.rs, native_registry.rs | 최초 등록·재실행 중복 방지·기존 문서 보존·기존 메모와 설정 병합·재실행 후 영속 상태 |
| 실행 중 반영과 AI 수집 독립성 | desktop/tests/native_smoke.py | 실제 동봉 CLI init 후 새로고침 없이 앱 목록 증가·선택 후 실제 문서 읽기·수집 비활성화와 기존 선택 유지·재시작 복구 |
| 실패·충돌이 기존 작업을 훼손하지 않음 | native_registry.rs, desktop/src/App.test.tsx | 등록 경로 쓰기 실패와 재시도·복사된 동일 ID의 위치 충돌·잘못된 JSON·사라진 폴더·junction 부모와 항목 거부·유효 항목 계속 반영·앱 오류 안내 |

최초 재현: `native_init_is_repeatable_and_preserves_existing_documents`에 앱 공유 등록 검증을 추가하자 기존 구현에서 등록 파일 부재로 실패했다. 구현 후 같은 테스트 통과. 파일 게시·junction 검사는 Windows 샌드박스 밖의 격리된 임시 폴더에서 실행한다. 원격 배포·기존에 설치된 실행 파일 교체는 이 테스트로 검증하지 않는다.

실행 결과: `scripts/cargo.ps1 -CargoArguments @('test','--all-targets','--locked')`, 워크스페이스 Clippy, Rust 형식 검사, 프런트엔드 14건과 프로덕션 빌드 통과. 실제 WebView2 스모크 9개 흐름 통과(`.tools/desktop-smoke/05d29db7-5641-44d3-890f-822ec1ac8bf3/result.json`). 새 프로젝트가 나타나는 UI 검증 전에 workspace IPC를 호출하거나 새로고침을 누르지 않았으며, 선택한 문서 원문과 재시작 후 저장 상태까지 확인했다.

기준은 [PRD](../docs/product/prd.md)와 [CLI 계약](../docs/development/cli.md)이다. 기존 JavaScript CLI의 사용자 동작·보존·실패 의무를 Rust로 이식한다. 테스트 함수 수가 아니라 연결된 동작과 최종 상태로 대응한다. 기본 명령은 `cargo test --all-targets --locked`이며 모델 요청을 포함하지 않는다.

## 기존 사례와 Rust 대응

| 요구·경계 | 현재 검증 위치·동작 | 유지하는 의무 |
| --- | --- | --- |
| R01 초기화·재실행 | [native_cli.rs](native_cli.rs), [native_project.rs](native_project.rs) | 기존 문서·ID 보존, 빈/기존 폴더 동일 경로, 미지원·손상·부실 메타데이터, 없는 대상·파일·링크 충돌, 진행 중 읽기, 실제 두 프로세스 경쟁·재시도 |
| R02/R03 기록 변환 | [native_records.rs](native_records.rs), [record-contracts.json](fixtures/record-contracts.json) | 원문 ID, 같은 문장의 새 요청, 동일 ID의 수정, 수집 시각과 분리한 revision, 복사 컨테이너, 다른 프로젝트·접두어·외부 링크, 누락 ID·시각, 초 단위 턴 시각, 비텍스트·알 수 없는 종류 |
| R02 프로세스·RPC·페이지 | [native_rpc.rs](native_rpc.rs), [native_history.rs](native_history.rs), [provider.rs](support/provider.rs) | 실제 자식 프로세스 초기화·응답·종료, 없는 실행 파일, RPC 코드·메서드, 비정상 종료·JSON·타임아웃, 두 단계 페이지·반복 커서, 잘못된 세션 항목·프로젝트 귀속, 부분 결과 보존 |
| R02 Claude SDK 탈의존 | [native_adapter.rs](native_adapter.rs), [claude-adapter-contracts.json](fixtures/claude-adapter-contracts.json) | 공식 SDK 0.3.316에서 독립적으로 산출한 14개 사례의 텍스트·역할·원문 ID·리비전·시간·제외 항목까지 비교. 일반·분기·스트리밍 형제·압축·메타·채널·대기·중복·전달 확인 포함 |
| R02 저장·경쟁·복구 | [native_store_edges.rs](native_store_edges.rs) | 재열기·이전 revision·부분/전체 실패 후 보존, 프로젝트/경로/필터 경계, 실제 DB 트리거 실패의 배치 롤백, 라이브 잠금·토큰 소유권, 다른 DB·미지원 버전·링크 보존, 실제 프로세스 강제 종료 후 트랜잭션·잠금 복구 |
| R02 기존 데이터 이행 | [native_storage.rs](native_storage.rs), [legacy-store.json](fixtures/legacy-store.json) | 실제 JavaScript 저장 코드로 만든 합성 SQLite v1 자료를 네이티브에서 읽기. 1,005건 수집→재시작·신규 1건→공급자 없이 저장본 조회 |
| 스킬 설치·CLI 호출 | [native_install.rs](native_install.rs) | 세 도구의 사용자 설치, 프로젝트 공유 경로 중복 방지, 초기화 이전 설치, 재실행, 수정/타사/링크 보존·부분 실패, PATH가 빈 환경에서 설치 메타데이터의 네이티브 실행 |
| CLI 오류·출력 | [native_cli.rs](native_cli.rs), [native_history.rs](native_history.rs), [native_storage.rs](native_storage.rs) | 도움말·준비 오류의 무수정, 옵션·상한·간격 경계, 빈 이력과 모든 공급자 실패 구별, 부분 결과 JSON·종료 코드, 원문을 출력하지 않는 저장 요약 |
| 지속 수집 | [native_watch.rs](native_watch.rs) | 간격 검증, 첫 주기 영구 반영, 대기 중 중지와 추가 주기 방지, 경쟁 실패 후 성공 재시도·중지. 중첩 수집은 순차 await와 프로젝트 잠금으로 차단 |
| R01/R10 문서 현황·정리 후보 | [native_documents.rs](native_documents.rs) | 정리된 docs·흩어진 Markdown·빈 프로젝트, 초기화 필요·조회 무수정·재실행 안정성, 제목/코드/정의된 참조 링크·이미지·한글/공백 URL·외부/범위 밖 구별, 동일 바이트와 제목만 같은 자료의 비교 후보 구분, 역링크와 revision 근거, Windows 대소문자 링크, 프로젝트/하위 Git 제외 규칙·예외·생성 폴더·별도 하위 프로젝트·junction 제외, UTF-8/파일 크기/깊이 제한의 부분 결과 |
| 설치 후 문서 조회 연결 | [native_install.rs](native_install.rs) | 세 호스트 스킬 설치 메타데이터의 실행 파일로 빈 PATH에서 init→docs 실행, 기존 문서 내용 보존. 모델이 스킬의 두 명령을 실제로 선택해 실행하는 최신 흐름은 별도 검증 대상 |
| R01-C/R08 문서 변경·복구 | [native_changes.rs](native_changes.rs) | 실제 전후 내용·역링크 검사 무수정, 통합 내용 작성·기존 문서 삭제·링크 수정·미선택 파일 보존·CRLF 원문 복구, 전체 원본/목적지/읽기 의존성 충돌과 중간 편집 보존, 중복·불완전·다른 프로젝트·보호/상위/예약/중첩 경로·링크 거절, 불변 계획 ID와 프로젝트 귀속, 부분 적용·재시도, 과거 적용과 현재 상태 구별, 기존/새 링크 오류 분리, 없는/타사/미지원·불일치 저널 보존, 외부 스테이징 편집 보존 |
| 실제 중간 종료·저널 장애 | [native_changes.rs](native_changes.rs), [provider.rs](support/provider.rs) | 실제 자식 프로세스를 쓰기 직전·스테이징 후·교체 후/저널 갱신 전·파일 기록 후에 강제 종료. 상태 경로가 달라도 프로젝트 동시 변경 거절, 종료 후 잠금 해제·재개·복구. 복구 중 종료 후 재개와 실제 SQLite 트리거 오류의 체크포인트 롤백·수리 후 재개 |

기존 Node 테스트 62개의 동작 의무를 위의 Rust 통합 테스트와 매개변수 사례로 재구성했다. SDK 호출 자체에 대한 모의 테스트는 JSONL 입력·SDK 독립 기준으로 대체했고, `.js` 런처 테스트는 네이티브 실행 테스트로 바꾸었다. 기대를 완화하거나 일부를 스킵해 맞추지 않는다. SDK 원문·사용자 대화·자격증명은 회귀 자료에 넣지 않는다.

## 실행 근거

### 첫 Windows 데스크톱 추가

| 요구·경계 | 테스트·검증 | 확인하는 결과 |
| --- | --- | --- |
| R01/R02 프로젝트·설정 저장 | [native_desktop.rs](native_desktop.rs) | 명시적 init, 중복 연결 방지, 프로젝트 ID/경로 재확인, 저장 위치 미선택 유지, 재시작 보존 |
| R01/R10 문서 읽기 | [native_desktop.rs](native_desktop.rs) | 스캔과 같은 제외 범위, 상위 경로 거절, 원문 revision 변경 감지, 무수정 |
| R03 요청 집계 | [native_desktop.rs](native_desktop.rs) | 사용자 요청만 집계, 반복 원문 ID 보존, 시각 누락·빈 데이터 구별 |
| R07/R09/R10 노트·작업·일정·계측 | [native_desktop.rs](native_desktop.rs) | 실제 저장과 재시작, 잘못된 시각 보존, 일정 검증, 타이머 구간 종료, 작업 완료와 사용자 확인 구별 |
| R05 공급자 출력 | [ai.rs](../desktop/src-tauri/src/ai.rs) | 실제 응답 텍스트 해석, 공급자 실패·빈 응답을 성공으로 승격하지 않음 |
| R06/R09 화면 계산·빈 상태 | [metrics.test.ts](../desktop/src/metrics.test.ts), [App.test.tsx](../desktop/src/App.test.tsx) | 겹친 구간 중복 합산 방지, 한국 날짜 경계, 시각 누락 제외, 샘플 통계 없는 빈 설치와 주요 진입점 |
| 연결된 네이티브 사용자 흐름 | [native_smoke.py](../desktop/tests/native_smoke.py) | 실제 앱·Rust IPC·임시 프로젝트 초기화/수집/읽기, 내부 Markdown 링크·HTML 격리·상위 경로 거절, 학습/작업/타이머·출처 확인 상태, 본문/외부 계획의 실제 검사·외부 편집 보존·반영/CRLF 복구, 공급자 전환·대화 맥락·실패·취소와 자식 프로세스 종료, 정상 종료/재시작 후 설정·자료·테마 보존 |

2026-11-02: 기존 64건을 보존하고 `native_desktop.rs` 5건을 추가해 루트 `cargo test --all-targets --locked` 69건을 통과했다. 데스크톱 라이브러리 테스트 1건과 UI 테스트 3건도 통과했다. `cargo clippy --workspace --all-targets --locked -- -D warnings`와 프런트엔드 타입/프로덕션 빌드를 통과했다. 새 Rust 인터페이스와 작업 일정 사례의 실패를 먼저 확인한 뒤 구현했다. 추가한 공급자 출력·네이티브 통합 검증은 구현 후 작성했으며 테스트 선행으로 주장하지 않는다.

실제 WebView2 검증은 새 임시 프로필에서 원문·노트·작업·설정의 저장을 확인했다. 최종 개발 빌드 검증 결과는 `.tools/desktop-smoke/4e2fdb02-1f98-4441-a7e2-ba646fc7d968/result.json`이다. Windows 줄바꿈에 따라 테스트 작성기가 바이트를 변환하던 입력을 명시적 CRLF 바이트로 수정했으며, 검사 기대를 완화하지 않고 외부 편집 보존과 원문 바이트 복구를 확인했다. 검증 도구의 문자열 대기를 로케이터 대기로 바꿔 앱의 CSP를 완화하지 않았다.

NSIS 설치 프로그램과 프로덕션 실행 파일도 생성했다. `--executable target/release/silolink-desktop.exe`로 동일한 7개 흐름을 다시 통과했다. 소스 루트 대신 독립적인 임시 작업 디렉터리에서 개발 서버 없이 번들한 화면을 실행했으며 결과는 `.tools/desktop-smoke/dfc07267-0945-4279-8514-c924f1b099c1/result.json`이다. 설치 프로그램의 생성과 실제 설치/제거 검증은 구별한다.

검증용 공급자는 별도 실제 자식 프로세스이며 모델·로그인·구독을 호출하지 않는다. 이 증거는 실제 모델 응답 품질, OS 알림 전달, 오래 켠 다수 프로젝트의 성능, macOS, 최종 사용자 수락의 검증을 대신하지 않는다.

- 이전 기준: Windows·Node 22.20.0에서 `npm test` 62건 통과. 초기 CLI 구현의 과거 결과이며 현재 검증 명령은 아니다.
- Rust 이식: 초기화·CLI·저장의 연결 사례를 실패 확인 후 구현했다. 스트리밍 순서, 대기 요청·전달 확인의 차이는 공식 SDK 기준 테스트로 재현하고 Rust 구현을 수정했다. 기준 해시·SDK 기대를 새 구현에 맞춰 완화하지 않았다.
- 형식 호환: JavaScript 원문 ID·revision 산출 결과와 실제 JavaScript 저장 코드의 합성 DB 구조·payload를 고정 자료로 남겼다. 실제 사용 데이터는 복사하지 않았다.
- 실제 조회: Claude 세 프로젝트 8·11·2건, 현재 Codex 프로젝트 64건에서 기존 구현 대비 ID 누락·추가·revision 차이 0, Rust 경고 0. 이 비교 뒤 SDK 런타임을 제거했다.
- 설치: Windows 릴리스 파일을 공백이 있는 임시 설치 경로에 설치했고 PATH가 빈 환경에서 스킬 등록·실행을 확인했다. 실제 Codex가 스킬 1건을 발견하고 Claude `/silolink init`이 네이티브 실행 파일을 1회 호출해 성공·기존 문서 보존을 확인했다. 이 모델 검증은 기본 테스트에 포함하지 않는다.
- Rust 전환 시점 재검증(2026-11-02): JavaScript 런타임·의존성 제거 후 `cargo test --all-targets --locked` 통합 테스트 37건 통과, 실패·스킵 0건. 위 SDK 독립 비교 14개 사례를 포함한다. Clippy `-D warnings`와 릴리스 빌드도 통과했다. 잘못된 Claude 설정 디렉터리의 실패 처리와 한글·이모지 프로젝트 경로의 UTF-16 인코딩 호환을 회귀 사례로 확인했다.
- Rust 전환 시점 설치 파일: Windows x64 실행 파일 3,009,024바이트. 임시 설치 경로·한글/이모지 프로젝트·빈 PATH에서 설치기→스킬 등록→메타데이터의 실행 파일로 초기화→재초기화를 확인했고 문서·프로젝트 메타데이터가 보존됐다. 실행 파일의 동적 의존성은 Windows 시스템 DLL이며 Node·VC 런타임 설치가 필요하지 않다.
- 시작 시간 관찰: 같은 Windows 환경에서 도움말 실행을 각각 3회 예열 후 20회 교차 측정했다. 이전 Node CLI 중앙값 85.3ms·p95 86.8ms, Rust CLI 중앙값 27.7ms·p95 29.9ms였다. 이는 도움말을 출력하고 종료하는 프로세스 시간이며, 이력 수집·모델 응답 속도의 개선 수치가 아니다.
- 링크: Windows 파일 심볼릭 링크에 관리자 권한을 요구하지 않도록 디렉터리 junction으로 재분류 경계를 검증한다. 테스트 준비 실패를 스킵하지 않는다.
- 문서 현황 단계(2026-11-02): 최초 요구 사례 6건이 미지원 명령으로 실패하는 것을 확인한 뒤 구현했다. Windows 대소문자 링크의 참조 영향 누락도 별도 실패로 재현하고 수정했다. 하위 Git 제외 규칙·예외와 깊이 경계를 더한 문서 테스트는 9건이다. 기존 37건의 의무를 유지해 `cargo test --all-targets --locked` 총 46건 통과, 실패·스킵 0건. `cargo fmt --all`, Clippy `-D warnings`, 릴리스 빌드와 공통 스킬 형식 검증도 통과했다.
- 문서 조회 단계 설치 흐름: 저장소 문서·테스트를 복사한 공백/한글 임시 프로젝트에서 설치기→프로젝트 범위 스킬 등록→메타데이터의 실행 파일로 init→docs→재조회했다. 빈 PATH에서도 문서 9개·검토 후보 2개를 조회했고 경고·깨진 로컬 링크 0건, 복사한 원본 24개와 프로젝트 메타데이터 보존을 확인했다. 당시 실행 파일은 4,883,456바이트다. 이는 해당 단계의 CLI 연결 검증이며 스킬의 모델 선택·실행이나 문서 자동 변경 검증이 아니다.
- 문서 변경 단계(2026-11-02, `25173e2` 이후 작업 트리): 미지원 명령의 연결 실패를 확인한 뒤 구현했다. 스테이징 중 참조 편집·없는 저널 복구의 생성 방지·과거 적용과 현재 상태·저널 순번 불일치도 추가 실패로 재현하고 수정했다. `native_changes.rs` 18건과 기존 46건을 합쳐 `cargo test --all-targets --locked` 64건 통과, 실패·스킵 0건. 실제 프로세스 강제 종료 4개 적용 시점과 복구 시점, SQL 체크포인트 장애, 불변 계획·타 프로젝트·경로 경계를 포함한다. 포맷·Clippy `-D warnings`·릴리스 빌드·스킬 형식 검사도 통과했다.
- 최신 릴리스 연결: 한글/공백 임시 경로에 설치하고 빈 PATH에서 스킬 메타데이터로 init→docs→docs-check→docs-apply→동일 계획 재실행→특정 이력 조회→docs-undo를 실행했다. 두 원문을 실제 새 내용으로 합치고 색인 수정·원본 두 개 삭제를 포함한 4개 작업을 적용했다. 새 링크 오류 0건, 복구 후 원본 파일 28개의 SHA-256과 프로젝트 메타데이터가 일치했고 새 문서는 제거됐다. 기존 기록 DB를 생성하지 않았다. 실행 파일 5,221,376바이트. 의미 통합의 자동 생성이나 호스트 모델 실행을 검증한 결과는 아니다.

## 비개발자의 설치와 첫 문서 확인 — 2026-11-02

| 요구·경계 | 사례·검증 위치 | 결과와 한계 |
| --- | --- | --- |
| R01-E 설치할 로컬 플러그인 제공 | [native_plugin_package.rs](native_plugin_package.rs) | 공백·한글 경로에 패키지 생성, 별도 캐시 위치로 복사한 동봉 CLI의 빈 PATH init→docs, 원문 보존, 없는 실행 파일·기존 출력 보존. 패키지 인터페이스 부재로 최초 실패한 뒤 구현 |
| 명령어·보관 위치 없이 첫 문서 확인 | [App.test.tsx](../desktop/src/App.test.tsx) | 폴더 선택→연결→실제 문서 목록 진입, 자동 기록 수집 없음, 두 번째 연결의 선택 프로젝트 전환, 취소·실패·문서 0개·부분 읽기 구분. 기존 초기화 체크박스와 결과 화면 부재로 먼저 실패 확인 |
| 정리 후보와 원문 연결 | [App.test.tsx](../desktop/src/App.test.tsx), [native_smoke.py](../desktop/tests/native_smoke.py) | 후보 유형·참조 링크 수·원문 진입 제공. 코어의 실제 결과는 `proposals`이며 초기 UI 타입의 `candidates` 가정은 틀렸음. 실제 코어 결과 대조로 테스트 자료를 수정해 화면 실패를 재현하고 타입·UI를 수정. 후보 UI 추가 검증은 구현 후 작성 |
| Codex 설치 원본·캐시 경계 | 실제 `Codex에 등록.cmd`와 공식 Codex CLI, 격리된 `CODEX_HOME` | 등록→available 목록→설치·활성화→설치 캐시의 실행 파일로 문서 조회 확인. 사용자 설정·프로젝트·로그인 변경 없음. 앱 플러그인 화면에서의 실제 클릭 설치와 모델의 자연어 스킬 선택은 별도 검증 대상 |
| 실제 앱의 첫 결과와 기존 기능 보존 | [native_smoke.py](../desktop/tests/native_smoke.py) | 초기화 체크박스가 없는 실제 앱 연결→문서 2개 결과→목록→원문 바이트 보존, 이어서 기존 7개 흐름 통과. 직접 폴더 경로 입력으로 검증하며 OS 폴더 선택 대화상자의 클릭은 UI 단위 테스트로만 대체 |

이 개선 작업 트리에서 루트 `cargo test --all-targets --locked` 71건과 프런트엔드 `npm test` 8건을 통과했다. 기존 Windows junction 검증은 샌드박스에서 준비 단계가 차단돼 일반 실행에서 동일 사례를 포함해 통과했다. `cargo clippy --all-targets --locked -- -D warnings`와 TypeScript/Vite 빌드도 통과했다. 루트 전체 테스트 뒤 공통 스킬의 설명 문구와 문서가 추가 수정됐으며 네이티브 코어 정책은 바뀌지 않았다.

사용 중인 `target/release/silolink-desktop.exe`를 보존하기 위해 `.tools/onboarding-build`와 별도 앱 ID `io.silolink.preview`로 프로덕션 체험 빌드를 생성했다. NSIS 설치 파일은 `.tools/onboarding-build/release/bundle/nsis/SiloLink Preview_0.1.0_x64-setup.exe`다. 이 빌드의 실제 WebView2 결과와 첫 화면·첫 문서 결과 스크린샷은 `.tools/desktop-smoke/f19f9c1e-345f-4ae0-ab97-a5b9b5ca4b67/`에 있다. 오류 0건이며 설치 프로그램 자체의 설치·제거 또는 실사용자 수락 테스트를 대신하지 않는다.

공개 다운로드·공개 디렉터리 배포·코드 서명·자동 업데이트·앱과 플러그인의 통합 설치·공급자 설치/로그인 준비 상태 안내는 남아 있다. 제품 우선순위와 수용 기준은 [PRD](../docs/product/prd.md)의 첫 설치 개선 기준에 기록한다.

최종 플러그인 ZIP도 한글·공백 경로에 압축 해제한 뒤 등록 파일→공식 Codex 설치→캐시 실행 파일의 init 재실행·docs를 확인했다. 문서 1개·프로젝트 ID·기존 원문 보존을 확인했고 결과는 `.tools/plugin-final-check/77e73428-1f4d-44b4-9d0c-63ca76ca241c/result.json`에 있다.

## 시네마틱 설치와 수동 업데이트 — 2026-11-02

| 요구·경계 | 사례·검증 위치 | 기대와 범위 |
| --- | --- | --- |
| 검정 앱 아이콘·네이티브 설치 화면 | [installer_smoke.ps1](../desktop/tests/installer_smoke.ps1), 실제 화면 PNG | 새 설치의 설치 버튼, 버전별 문구, 한글·공백 경로. 기존 기본 화면에서 새 설치 버튼이 없어 실패한 뒤 구현 |
| 설치 전 취소 | 같은 시험의 cancel-before-installation | 설치 등록·앱 파일을 만들지 않고 종료 |
| 신규→업데이트→동일 버전 재설치 | fresh-install-persisted, update-version-and-original-path, same-version-reinstall | 동일 제품의 실제 NSIS 등록 버전과 앱 파일·원래 설치 위치 확인 |
| 데이터 보존 | update-and-reinstall-preserve-data | 격리 프로필의 설정·기록 파일과 설치 폴더의 사용자 파일 SHA-256 유지 |
| 구버전 차단 | interactive-downgrade-blocked, silent-passive-update-downgrades-blocked | 대화형 종료, `/S`, `/P`, `/S /UPDATE`의 실패 코드와 기존 버전·데이터 보존. 최초 `/P`의 모달 대기로 실패를 재현하고 수정 |
| 기본 제거의 데이터 보존 | default-uninstall-preserves-data | 앱 파일 제거 후 설정·기록·사용자 파일 바이트 유지. 명시적 앱 데이터 삭제 선택은 기존 Tauri 기능으로 유지 |
| 실제 컴포넌트 스타일 | styled-controls-rendered | 실제 렌더링의 기본 흰 버튼 모서리로 먼저 실패 확인. 둥근 버튼 모서리와 어두운 폴더 선택 버튼의 픽셀 색 검사 |
| 스타일과 네이티브 조작 유지 | styled-checkbox-keyboard-and-click, styled-folder-edit-browse-and-cancel | Space·클릭 체크 전환, 한글 경로 직접 입력, 폴더 탐색기 열기→취소→입력값 유지. 기존 설치·업데이트·재설치·차단·데이터 보존 사례도 유지 |
| 시안 크기와 단일 헤더 | compact-reference-window-size, custom-header-drag-and-close-guard | 기존 과대 창의 실제 너비 실패를 먼저 확인. 기준 660×606px 측정, 드래그 히트 영역, 보이는 X와 기존 NSIS 취소 제한 및 설치 전 종료 확인 |
| 실행 프로세스 이름·아이콘 | [process_branding.ps1](../desktop/tests/process_branding.ps1), 루트 build.rs | 앱·설치기 SiloLink, CLI SiloLink CLI 표시 이름 및 브랜드 아이콘을 PE 리소스에서 검사. CLI의 빈 표시 이름으로 실패를 확인한 뒤 보완. 실행 중 앱의 SiloLink 창과 런타임 아이콘도 격리 프로필에서 확인 |

정식 제품과 같은 생성 NSIS 스크립트·커스텀 페이지를 사용하며 제품 식별자·프로필·셸 폴더·앱 페이로드만 격리한다. 실제 실행 중 앱 강제 종료 확인·WebView2가 전혀 없는 PC·영문 Windows·다중 모니터 DPI 이동·정전 및 파일 잠금 중 복구·정식 제품의 실사용자 설치는 별도 검증 대상이다. 프런트엔드나 데이터베이스 스키마를 변경하는 작업이 아니다.

최종 작업 트리에서 Windows PowerShell 5의 `installer_smoke.ps1` 9개 흐름이 통과했다. 결과와 실제 화면은 `.tools/installer-smoke/23dba055-a422-41da-9ceb-5f2f479d07a4/`에 있다. `native_release` 2건, TypeScript/Vite 프로덕션 빌드, 정식 `desktop.ps1 -Mode build`, actionlint와 diff 공백 검사를 통과했다. 최종 번들에 대한 실제 창 표시→설치 전 취소도 확인했다. 최종 설치 EXE·플러그인 ZIP·체크섬과 실제 화면 PNG는 `.tools/releases/SiloLink-0.1.0-cinematic-final/`에 생성했다. 공개 릴리스나 실제 사용자 설치 완료를 의미하지 않는다.

컴포넌트 스타일 보완 검증에서는 위 9개 흐름에 실제 색상·모서리, 체크박스 키보드/클릭, 경로 입력/폴더 선택 취소를 추가해 총 12개 흐름을 Windows PowerShell 5에서 통과했다. 결과는 `.tools/installer-smoke/8fb1376c-3e29-4223-8f3e-f3a7456ac8eb/`다. NSIS의 미선언 변수 경고 6000도 컴파일 실패로 검사한다. C++ `/W4 /WX` 빌드와 번들 생성, actionlint·diff 공백 검사, DLL의 Windows 시스템 DLL 의존성만 존재함을 확인했다. 새 배포 파일과 체크섬·실제 설치 창 PNG는 `.tools/releases/SiloLink-0.1.0-cinematic-styled/`에 생성했고 이 EXE의 실제 창 표시→설치 전 취소와 체크섬 일치도 확인했다.

2026-11-03 입체 로고·시안 크기 보완에서는 원근 투영과 옆면·림 조명·그림자를 실제 배경에 합성하고, 중복 제목 표시줄을 단일 헤더로 바꿨다. 660×606px 측정·드래그·보이는 X·네이티브 취소 제한을 포함한 14개 흐름이 통과했다. 결과는 `.tools/installer-smoke/5c172655-1b7f-4f6b-b2d0-2361bf60a239/`다. 최종 실제 EXE의 화면을 다시 열어 확인하고 설치 전 취소했다. C++ 경고 오류화 빌드·번들·패키징·actionlint·공백 검사·체크섬 검증을 통과했으며 파일과 실제 화면은 `.tools/releases/SiloLink-0.1.0-cinematic-compact/`에 있다.

2026-11-03 프로세스 표시 보완에서는 CLI의 빈 `FileDescription`으로 먼저 실패를 확인한 뒤 `SiloLink CLI` 이름·검정 로고를 공개 CLI EXE에 포함하고 앱 컨텍스트에도 창·트레이 아이콘을 명시했다. 최종 `process_branding.ps1`의 EXE 3개 및 실제 실행 창 검증 4개가 통과했으며 모든 아이콘 비교 차이는 0이다. 결과는 `.tools/process-branding/34e60ce7-3135-447b-8da6-1baf0bd58a8e/`다. 최초 런타임 검사는 큰 아이콘만 조회하고 ICO의 32px 항목과 128px 창 아이콘을 비교하는 시험 결함이 있어, 작은 아이콘 조회와 같은 해상도의 PNG 기준 비교로 수정했다. CLI·릴리스 테스트 6건, 최종 설치 스크립트 14개 흐름(`.tools/installer-smoke/bef542d9-ef30-443b-a4f8-b0a0983d0544/`), 포맷·CLI/데스크톱 Clippy·actionlint·릴리스 빌드·배포 체크섬 검증을 통과했다. 설치 EXE·플러그인 ZIP·체크섬은 `.tools/releases/SiloLink-0.1.0-process-branding/`에 있다. Windows 작업 관리자 자체의 UI나 세부 정보 탭의 파일명 변경을 검증했다고 주장하지 않는다.

## Markdown 문서·노트·대화 표시 — 2026-11-03

| 요구·상태 경계 | 사례·검증 위치 | 기대 |
| --- | --- | --- |
| 표·정렬·셀 내부 구문 | [markdown.test.tsx](../desktop/src/markdown.test.tsx), [markdown.md](../desktop/tests/fixtures/markdown.md) | 시작 조건 표를 실제 table로 표시. 좌/중앙/우 정렬과 강조·인라인 코드·이스케이프 파이프 보존 |
| 체크 목록·취소선·URL | 같은 컴포넌트 시험 | 완료/미완료 상태와 중첩 목록. 읽기 전용이며 원문 변경 호출 없음. 일반 URL은 사용자가 누를 때만 기존 외부 참조 명령 호출 |
| 같은 문서 제목·각주 | 같은 시험, [native_smoke.py](../desktop/tests/native_smoke.py) | 한글·중복 제목, 각주·돌아가기의 실제 스크롤/포커스. 같은 본문을 다시 읽지 않고 여러 본문 ID도 충돌하지 않음 |
| 다른 문서의 제목 | 같은 시험 및 실제 App→DocumentsPage→Rust 읽기 | 한글·공백 상대 경로와 리비전을 유지하고 `#제목`을 전달해 읽기 완료 후 위치 이동 |
| 코드·활성 콘텐츠 경계 | 같은 시험과 네이티브 픽스처 | 코드 안의 표/HTML/체크 문법은 원문 보존. HTML·script URL·이미지는 실행하거나 자동 요청하지 않음. 프로젝트 밖 읽기 거절 유지 |
| 넓은 표·긴 코드·테마 | 실제 앱 1320px 밝음/1040px 어두움 | 문서 내부 스크롤 영역으로 제한하고 전체 화면의 가로 오버플로 없음. 기존 앱 데이터 표는 별도 스타일 유지 |

기본 GFM 사례 5건(표·체크/취소선·자동 URL·제목·각주)의 실패를 먼저 확인한 뒤 구현했다. 문서 간 앵커 누락도 별도 실패를 확인하고 수정했다. 기존 14건에 Markdown 10건을 더한 `npm test` 24건, 타입 검사/Vite 빌드와 정식 Windows 릴리스 빌드를 통과했다. 실제 배포용 EXE의 `native_smoke.py` 10개 연결 흐름이 오류 없이 통과했으며 `.tools/desktop-smoke/2b6b90e0-cfd4-491a-850a-f605dcf2eeb3/`에 밝음/어두움 Markdown 화면과 결과가 있다. 이 실행에는 기존 도구 연결·초기화·수집·문서 읽기·학습·작업·변경 충돌/복구·대화 실패/취소·재시작 보존 흐름을 포함한다. 최종 빌드의 프로세스 표시 4항목도 통과했다(`.tools/process-branding/0d8eea6d-3b55-406f-a6dd-285ffc900f7a/`). 설치 EXE·플러그인 ZIP·검증한 체크섬은 `.tools/releases/SiloLink-0.1.0-markdown-rendering/`에 있다.

전용 Mermaid/수식 엔진, HTML 실행, 이미지 자동 로드는 이 변경의 지원 주장에 포함하지 않는다. 각 미지원 구문의 현재 표시 방식은 [Markdown 표시 계약](../docs/development/desktop.md#markdown-표시-계약)에 구분했다.

## 한계와 후속 검증

### 기능별 스킬 선택과 기존 설치 확장 — 2026-11-02

| 요구·경계 | 검증 | 결과 |
| --- | --- | --- |
| init·docs·sync 등 각각 선택 | [native_install.rs](native_install.rs), [native_plugin_package.rs](native_plugin_package.rs) | 세 호스트에 통합 1개+기능별 10개 설치. 각 진입점의 이름·공통 규칙 참조·메타데이터·한국어 UI 파일 확인. 플러그인도 동일한 11개를 포함 |
| 기존 단일 스킬 유지 | [native_install.rs](native_install.rs), [App.test.tsx](../desktop/src/App.test.tsx) | 단일 스킬은 `update_available`로 표시하고 업데이트 버튼으로 빠진 기능만 추가. 기존 SKILL.md·v2 메타데이터 바이트 보존. 초기 단일 항목 설치·업데이트 버튼 부재 실패 후 구현 |
| 동명 타사 항목 보존 | [native_install.rs](native_install.rs) | 묶음의 모든 이름을 사전 검사하고 충돌 시 통합/새 진입점 모두 새로 만들지 않음. 수정·링크·다른 CLI 경로 보존 및 기존 설치 회귀 유지 |
| 스킬 품질·실제 발견 | skill-creator quick_validate, 실제 Codex `skills/list` | 11개 SKILL.md 유효성, 새 UI 설명 25–64자·기본 요청의 스킬명·공통 참조 확인. 사용자 Codex에 새 10개를 추가하고 실제 목록에서 11개 활성화·한국어 displayName 확인. 결과 `.tools/skill-discovery/8dc97712-f0af-45b2-9fa5-abd4a30e3a14/result.json` |
| 실제 업데이트·원문·기존 기능 | [native_smoke.py](../desktop/tests/native_smoke.py) | 단일 v2 설치에서 업데이트→세 호스트 11개 등록→빈 PATH CLI 실행→중복/수정 보존→재시작까지 8개 흐름·오류 0건. `.tools/desktop-smoke/8e54b306-364d-4f8e-9e80-9c8ee0eda929/` |

이 작업 트리의 루트 테스트 78건과 UI·화면 계산 13건이 통과했다. 워크스페이스 Clippy·Rust 형식·TypeScript/Vite 빌드·actionlint도 통과했다. 새 체험 NSIS와 11개 스킬을 포함하는 플러그인 ZIP·체크섬은 `.tools/releases/SiloLink-0.1.0-operation-skills/`에 생성했다.

사용 중인 Preview와 같은 앱 ID로 프로덕션 검증을 시작했을 때 단일 실행 제한으로 검증 앱이 즉시 종료됐다. 사용자 앱을 종료하지 않고 `io.silolink.skillchecks` ID의 디버그 빌드로 같은 실제 UI 흐름을 통과했다. 위 결과를 새 프로덕션 설치 프로그램 자체의 설치·제거 또는 실제 호스트 모델 실행 검증으로 확대하지 않는다. 현재 사용자 Codex 등록에서는 기존 통합 스킬과 설치 CLI 경로를 보존한 채 새 진입점만 추가했으며 사용자 프로젝트를 초기화하거나 기록을 수집하지 않았다.

### 앱의 세 도구 연결과 태그 자동 배포 — 2026-11-02

| 요구·경계 | 테스트·확인 위치 | 확인 결과와 한계 |
| --- | --- | --- |
| 사용자 스킬 상태와 설치 정책의 일치 | [native_install.rs](native_install.rs) | 무수정 조회→세 호스트 설치→재조회, 수정한 스킬·junction 부모의 보존, 없는 CLI 거절. 초기 `inspect_user` 부재 실패 후 구현. 기존 설치 회귀 포함 5건 통과 |
| 비개발자의 연결 버튼과 실패 복구 | [App.test.tsx](../desktop/src/App.test.tsx) | 첫 화면→설정→도구별 한 건 등록→상태 재조회, 조회 실패 재시도·충돌을 성공으로 표시하지 않음. 버튼 부재의 최초 4건 실패 후 구현. 상태 문구가 안내·배너에 각각 있어 조회 범위를 해당 도구 영역으로 좁혔으며 기대와 의무는 유지 |
| 실제 동봉 실행 파일과 세 도구 사용자 파일 | [native_smoke.py](../desktop/tests/native_smoke.py) | 격리된 사용자 홈에서 실제 세 버튼 등록, 메타데이터가 앱의 `bin/silolink.exe`를 가리킴, 빈 PATH에서 init→docs와 원문 보존, 중복 연결·수정 파일 보존·알 수 없는 호스트 거절·재시작 상태 확인. 호스트 모델의 실제 스킬 선택·로그인은 검증하지 않음 |
| 릴리스 버전·출력 보존 | [native_release.rs](native_release.rs), [release-version.ps1](../scripts/release-version.ps1), [package-release.ps1](../scripts/package-release.ps1) | 일치 태그 성공, 버전 불일치·잘못된 태그 거절, 기존 출력 보존·없는 빌드의 출력 생성 방지. 최초 릴리스 인터페이스 부재 실패 후 구현 |
| 워크플로와 최종 파일 | [windows.yml](../.github/workflows/windows.yml) | actionlint 1.7.12 통과. 실제 로컬 앱 설치 프로그램과 동봉 CLI 해시를 대조하고 설치 EXE·플러그인 ZIP·SHA256SUMS 생성. 게시 job의 GitHub API 실행과 호스팅 러너 종단 간 실행은 미검증 |

이 작업 트리에서 루트 테스트 75건, 데스크톱 라이브러리 1건, UI·화면 계산 12건을 통과했다. 워크스페이스 Clippy `-D warnings`, Rust 형식, TypeScript/Vite 빌드와 actionlint를 통과했다. 실제 프로덕션 체험 앱의 새 도구 연결 흐름과 기존 흐름 7개를 합쳐 8개 흐름·오류 0건이다. 결과와 `tool-connections.png`는 `.tools/desktop-smoke/fe22333d-57f7-40af-88fb-64eae2b5d591/`에 있다. 호스트 사용자 폴더는 `SILOLINK_USER_HOME`으로 격리했으며 실제 사용자 스킬·프로젝트·로그인을 변경하지 않았다.

세 도구 등록은 파일·네이티브 실행 검증이다. Antigravity 앱에서의 발견·실행과 새 코드의 호스트 모델 선택, Windows 설치 프로그램 자체의 설치·제거, GitHub에서의 첫 워크플로 실행·Releases 게시는 별도 검증 대상이다. 코드 서명·자동 업데이트·호스트 로그인 준비 상태 자동 점검은 남아 있다. 자동 빌드와 배포를 구현한 것이 기존 설치를 자동으로 업그레이드한다는 뜻은 아니다. 수정된 스킬은 계속 보존하며 재연결 시 확인이 필요할 수 있다.

Windows x64·Rust 1.90 MSVC 환경을 확인했다. Antigravity 앱 내 발견·실행, Codex 모델의 실제 스킬 실행, 각 도구 UI 메뉴, macOS·ARM64·공개 릴리스 배포·업데이트는 미검증이다. Claude JSONL은 안정적인 공식 API가 아니며 미검증 형식·큐 전달/압축·깨진 줄은 경고로 드러낸다. 원문 입력 형식이 바뀌면 새 독립 자료를 추가해야 한다.

전경 주기 수집·수집 종료·재시작 복구를 검증하며 데스크톱 상주·훅·문서 재구조화·분석·사용자 테스트의 완료를 주장하지 않는다. 현재 전체 재조회 비용과 장시간 많은 프로젝트를 관찰하는 성능은 후속 범위다.

문서 조회는 규칙 기반 후보 제공이며 의미 이해의 검증이 아니다. 실제 변경·복구는 별도 변경안으로 검증하며 최종 통합 내용의 타당성을 자동 판정하지 않는다. HTML·위키 링크·앵커·제외한 원문에서의 역링크와 프로젝트 전체의 원자적 스냅샷은 보장하지 않는다. 파일 수·입력 합계·전체 순회 상한은 방어 제한으로 구현하며 조회 자동 사례는 파일별 크기와 깊이 경계를 직접 검증한다. Windows 대소문자 링크 사례는 Windows 전용이며 다른 OS의 동작 검증을 뜻하지 않는다.

변경·복구의 현재 범위는 로컬 UTF-8 Markdown이다. 전원 장애·네트워크 파일시스템·macOS·파일시스템 전체 ACL/소유권/타임스탬프 복구·저널 자동 보관/정리·호스트 모델이 최신 변경 스킬을 실제 선택하는 흐름은 미검증 또는 미구현이다. 외부 편집기가 잠금을 따르지 않으면 마지막 검사와 교체 사이의 경쟁까지 원자적으로 차단하지는 못한다. 저널과 파일의 실제 반영 상태를 별도로 보고한다.
