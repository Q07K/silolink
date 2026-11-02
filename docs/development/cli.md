# 네이티브 CLI와 공통 기록 계약

- 기준일: 2026-11-02
- 상태: Rust 전환과 JavaScript CLI·npm·Agent SDK 런타임 제거. 스킬 설치·초기화·문서 현황과 정리 후보·텍스트 이력 조회·로컬 저장·전경 주기 수집을 제공한다.
- 기준: [PRD](../product/prd.md), [공급자 조사](../research/cli-integration.md), [검증 사례](../../tests/CASE_MATRIX.md).

## 설치와 실행

Windows x64 릴리스 실행 파일은 `silolink.exe` 하나다. 실행에 Node·npm·Rust 설치를 요구하지 않는다. Codex 이력 조회에는 사용자의 공식 Codex 실행 파일이 필요하며 Claude 조회는 기존 로컬 기록을 읽는다. 인증정보를 추출하거나 새 인증을 중계하지 않는다.

저장소에서 빌드할 때는 Rust 1.90 이상, Windows MSVC 도구체인과 C++ Build Tools가 필요하다. SQLite는 정적으로 포함한다. x64 MSVC 빌드의 CRT도 정적으로 연결하며 현재 확인한 의존 DLL은 Windows 시스템 DLL이다. macOS·ARM64 실행은 아직 검증하지 않았다.

```powershell
# 소스 빌드 → 사용자 설치 폴더에 실행 파일 복사 → PATH 등록 → 스킬 설치
.\scripts\install.ps1

# 이미 빌드한 실행 파일 설치: Rust 도구체인을 사용하지 않음
.\scripts\install.ps1 -BinaryPath .\target\release\silolink.exe
```

설치 기본 위치는 `%LOCALAPPDATA%\SiloLink\bin`이다. `-InstallDirectory`로 변경하고 `-HostName codex|claude|antigravity|all`로 설치할 스킬을 선택한다. `-NoPath`는 사용자 PATH 변경을 생략하고 `-SkipSkills`는 스킬 설치를 생략한다. 기존 터미널에서 명령을 못 찾으면 다시 열거나 설치된 실행 파일의 전체 경로를 사용한다. 실행 중인 파일 교체가 거부되면 해당 SiloLink 실행을 종료한 뒤 다시 설치한다.

공개 릴리스 다운로드·자동 업데이트·마켓플레이스 등록은 아직 제공하지 않는다. 임의 npm 동명 패키지 설치가 이 저장소의 설치를 대신하지 않는다.

직접 빌드·검증하려면 다음 명령을 사용한다. 이 작업 환경의 `scripts/cargo.ps1`은 저장소 안에 격리한 MSVC 도구체인이 있으면 사용하고, 없으면 설치된 Cargo를 사용한다. 도구체인 파일과 캐시는 배포 원본에 포함하지 않는다.

```powershell
cargo build --release --locked --bin silolink
cargo test --all-targets --locked
cargo fmt --all --check
cargo clippy --all-targets --locked -- -D warnings
```

`silolink-provider-fixture`는 외부 프로토콜 검사용 테스트 프로그램이다. 배포·설치는 `--bin silolink`만 선택한다. 개발용 보조 명령의 예는 `.\scripts\cargo.ps1 test --all-targets --locked`다.

## 도구별 스킬 설치와 호출

```powershell
silolink setup --host all
silolink setup --host all --scope project --project "C:\path\to\project"
```

기본은 사용자 범위다. 프로젝트 범위 설치는 `init` 전에 가능하고 Git 저장소를 요구하지 않는다.

| 도구 | 사용자 설치 위치 | 프로젝트 설치 위치 | 호출 |
| --- | --- | --- | --- |
| Codex | `~/.agents/skills/silolink` | `.agents/skills/silolink` | 스킬 메뉴 또는 `$silolink init` |
| Claude Code | `~/.claude/skills/silolink` | `.claude/skills/silolink` | `/silolink init` |
| Antigravity | `~/.gemini/config/skills/silolink` | `.agents/skills/silolink` | 지원 화면의 `/silolink init` |

도구를 다시 열거나 스킬 새로고침 기능으로 확인한다. Codex와 Antigravity의 프로젝트 경로가 같으면 한 번만 설치한다. `SILOLINK_USER_HOME`은 사용자 범위 설치 기준을 명시적으로 바꿀 때 사용할 수 있다. 현재 배포 단위는 독립 스킬이며 마켓플레이스 플러그인은 아니다.

스킬 원본은 `integrations/skills/silolink/SKILL.md`이고 실행 파일에 포함된다. 설치 결과는 `SKILL.md`와 `installation.json` 두 파일이다. 설치 메타데이터 v2의 `cliPath`는 네이티브 실행 파일의 절대 경로다. 스킬은 구형 PATH 명령과 혼동하지 않도록 그 경로를 우선 실행하고, 설치 메타데이터 없이 수동 복사한 스킬은 PATH의 `silolink`를 사용한다. `.js` 런처나 별도 인터프리터는 사용하지 않는다. PowerShell 전체 경로 호출은 `& "C:\path\to\silolink.exe" init`이다.

동일한 설치는 유지한다. 기존 타사·사용자 수정·구형 JavaScript 스킬·링크 경로·다른 실행 파일 경로는 덮어쓰지 않고 충돌로 표시한다. 설치·실패 대상을 각각 보고하며 일부 성공은 종료 코드 2다. 구형 설치를 교체하려면 스킬 폴더의 내용을 확인·백업하고 제거한 뒤 네이티브 `setup`을 실행한다. 프로젝트 메타데이터나 기록 DB를 지우는 절차가 아니다. 스킬 자동 업그레이드·제거는 후속 범위다.

호출·설치 위치 근거: [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code Skills](https://code.claude.com/docs/en/skills), [Antigravity Skills](https://antigravity.google/docs/skills). 실제 Codex 스킬 발견과 Claude의 `/silolink init` 실행을 확인했다. Antigravity 앱 내 사용·Codex 모델 실행·각 도구의 UI 메뉴 조작은 미검증이다.

## 프로젝트 초기화

```powershell
silolink init --project "C:\path\to\project"
```

현재 폴더 대상이면 `--project`를 생략한다. 기존 프로젝트와 새로 만든 빈 폴더 모두 같은 명령을 사용한다. 존재하지 않는 대상 폴더는 자동 생성하지 않는다.

`.silolink/project.json` v1은 UUID 프로젝트 ID·이름·생성 시각을 저장한다. 재실행 시 ID와 기존 파일을 보존한다. 경로 자체를 프로젝트 정체성으로 저장하지 않는다. 미지원 버전·손상·링크·파일 충돌을 덮어쓰지 않는다. `init.lock`으로 진행 중 읽기와 동시 초기화를 거절한다. 비정상 종료 시 남은 초기화 잠금의 자동 복구는 아직 없으며 실제 초기화 진행 여부를 확인해야 한다.

`init`은 기록 수집·문서 재구조화·서비스 설치를 완료했다고 표시하지 않는다. 공통 스킬은 성공 후 같은 프로젝트에 `docs`를 실행해 현황과 정리 후보를 안내한다. 네이티브 `init` 자체는 기존 계약대로 ID만 초기화한다. 문서 통합·재작성·삭제는 후속 구현이다.

## 문서 현황과 정리 후보

```powershell
silolink docs --project "C:\path\to\project"
```

초기화한 프로젝트의 `.md`·`.markdown` 파일을 읽고 JSON 보고서를 출력한다. 모델 호출·네트워크 접근·파일 변경·저장 DB가 필요하지 않다. 프로젝트 내부 `docs/`와 흩어진 문서를 함께 보되 특정 문서 구성을 강제하지 않는다. 보고서를 별도 파일로 저장하려면 사용자가 지정한 위치로 stdout을 리디렉션할 수 있다.

| 필드 | 의미 |
| --- | --- |
| `documents` | 프로젝트 상대 경로, 프로젝트 ID·경로로 만든 문서 ID, 원문 바이트의 SHA-256 `revision`, 크기, 첫 비어 있지 않은 Markdown 제목, 제목별 줄 위치, 링크·이미지 |
| `proposals` | 검토 후보와 근거, 대상 문서·revision, 관련 참조 문서의 경로·revision·링크 줄. 모두 `requiresReview: true`이며 적용 작업이 아님 |
| `coverage` | 확장자·제외 규칙·크기/개수/깊이 상한·미지원 분석 범위 |
| `excluded` | 직접 제외한 경로·사유. Git 제외 규칙으로 건너뛴 모든 파일을 별도 열거하는 목록은 아님 |
| `warnings` | 읽기 실패·미지원 UTF-8·상한 도달·불완전한 제외 규칙 등. 읽은 문서를 보존하고 종료 코드 2로 표시 |

파일 편집은 문서 ID를 유지하고 revision을 바꾼다. 현재 문서 ID는 경로에 의존하므로 이동 후 동일 문서 연결은 후속 변경 이력에서 다뤄야 한다. 조회 결과는 순회 중 읽은 내용이며 프로젝트 전체의 원자적 스냅샷이 아니다. 후속 적용 시 각 원문의 hash를 다시 비교해야 한다.

조회 범위는 프로젝트와 하위 폴더의 `.gitignore`를 따른다. Git 저장소가 없어도 작동하며 상위 폴더·사용자 전역 Git 설정·`.git/info/exclude`·`.ignore`는 사용하지 않는다. 숨김 문서는 포함하되 `.git`, `.silolink`, `.tools`, `node_modules`, `target`, `vendor`, `dist`, `build`, `.venv`, `venv`, `.next` 디렉터리는 제외한다. 링크·Windows junction을 따라가지 않으며 `.silolink/project.json`이 있는 하위 프로젝트는 별도 범위로 남긴다. 이는 Git 추적 파일 목록과 동일하다는 의미가 아니다.

한 파일 2MiB, 읽은 입력 합계 32MiB, 문서 2,000개, 순회 항목 100,000개, 디렉터리 깊이 64를 상한으로 둔다. 제외 규칙에 따른 정상 제외와 상한·읽기 실패에 따른 불완전한 조회를 구별한다. 문서가 없으면 `review-documentation-gap`을 표시하되 채팅 등 다른 자료가 없다는 뜻으로 확대하지 않는다.

정리 후보는 다음 근거로 제한한다.

- `review-identical-content`: 비어 있지 않은 파일의 원문 바이트가 동일하다. 참조 경로·용도가 다를 수 있으므로 자동 삭제나 통합 결정은 아니다.
- `compare-same-title`: 제목 문자열이 같고 내용 revision은 다르다. 비교할 후보이며 정책 충돌·의미 중복을 확정하지 않는다.
- `repair-local-links`: 실제로 없는 로컬 경로와 해당 링크 줄을 제시한다.
- `add-document-title`: Markdown 제목이 없어 문서 식별 개선을 검토한다. 내용의 품질·사용자의 이해 수준을 판정하지 않는다.

Markdown은 [pulldown-cmark](https://docs.rs/pulldown-cmark/latest/pulldown_cmark/)로 파싱해 코드 블록·인라인 코드의 예시를 링크로 취급하지 않는다. 인라인·정의된 참조 링크·이미지와 ATX/Setext 제목을 다룬다. [ignore](https://docs.rs/ignore/latest/ignore/struct.WalkBuilder.html)의 프로젝트 내 제외 규칙과 [percent-encoding](https://docs.rs/percent-encoding/latest/percent_encoding/)의 UTF-8 URL 경로 복원을 사용한다. 고정 버전은 `Cargo.lock`을 기준으로 한다.

로컬 링크는 문서 위치를 기준으로, `/`로 시작하면 프로젝트 루트를 기준으로 해석한다. Windows에서는 대소문자만 다른 경로도 실제 파일 표기로 연결한다. 링크 상태는 `exists`, `missing`, `excluded`, `outside-project`, `external`, `fragment-unchecked`, `invalid-path`, `unreadable`로 구별한다. `exists`는 파일·폴더 경로 확인만 뜻하며 `fragmentChecked`는 항상 false다. 외부 URL을 열거나 프로젝트 밖 자료를 읽지 않는다. HTML·위키 링크·정의되지 않아 일반 텍스트로 해석된 참조 표기·제외된 원문에서의 역참조는 분석 범위 밖이다.

### 다음 변경·복구 계약 — 설계, 실행 명령은 미구현

`docs`는 재구조화에 필요한 근거를 제공하는 첫 단계다. 호스트 AI는 관련 원문을 읽고 유지·통합·재작성·삭제의 이유와 전후 내용, 링크 영향을 설명할 수 있다. 제목·파일 hash만으로 내용 통합안을 자동 생성하지 않는다. 사용자와 다듬은 구체적인 변경안을 실제 적용·복구하는 다음 단계는 아래 계약을 따른다.

1. **변경안**: 프로젝트 ID·계획 ID·선택한 상대 경로·원본 SHA-256 또는 원본 없음·변경 후 UTF-8 내용·삭제 여부·판단 근거를 포함한다. 이동은 목적지 작성과 원본 제거, 통합·재작성은 실제 새 내용으로 표현한다. 링크 수정도 같은 변경안에 들어가며 단순 이동을 정리 완료로 표시하지 않는다.
2. **사전 비교**: 선택한 프로젝트의 모든 대상·참조 문서와 목적지를 검증한다. 원본 변경·예상하지 못한 목적지·프로젝트 밖 경로·링크·보호된 관리 경로를 충돌로 보고 첫 쓰기 전에 중단한다. 제외 범위의 참조를 모두 확인했다고 주장하지 않는다.
3. **적용 이력**: 기존 기록 SQLite v1을 변경하지 않고, 명시적 상태 경로의 별도 저널에 변경안·이전 바이트·예상 이후 hash·파일별 진행을 저장한다. 저널을 복구 가능하게 기록한 후 파일을 교체하며 프로젝트별 동시 변경을 막는다. 작업 중 외부 편집도 파일별로 다시 확인한다.
4. **부분 실패**: 여러 파일을 한 번에 원자적으로 교체할 수 있다고 가정하지 않는다. `applying`, `applied`, `partial`/`interrupted`, `rolled-back`, `conflict`와 실제 파일별 상태를 조회할 수 있게 한다. 적용 후 파일·링크 검사까지 기록하고, 동일 계획 재시도는 완료한 쓰기를 중복 실행하지 않는다.
5. **복구**: 해당 계획이 쓴 이후 상태와 일치하는 파일에만 이전 바이트·이전 부재 상태를 복원한다. 적용 후 사용자가 편집한 내용은 덮어쓰지 않고 충돌로 남긴다. 중간 종료 후에는 저널과 현재 hash로 반영 여부를 확인하며 코드 되돌리기만으로 문서를 복구했다고 표시하지 않는다.

다음 구현의 수용 사례는 통합·재작성·삭제와 역링크 수정, 미선택 문서 보존, 원본·목적지 충돌의 무수정, 도중 실패·강제 종료 후 복구, 재시도 멱등성, 복구 직전 사용자 편집 보존이다. 이 설계가 테스트를 통과한 구현이라는 의미는 아니다. 저널 보관·정리 정책과 다중 프로젝트의 독립 적용은 해당 구현 단계에서 구체화한다.

## 이력 조회

```powershell
silolink history --project "C:\path\to\project" --provider all --limit 1000
```

`--provider`는 `codex`, `claude`, `all`이며 기본값은 `all`이다. 초기화된 프로젝트를 기준으로 읽고 워크트리·하위 프로젝트·옛 경로를 자동 통합하지 않는다. 경로 귀속은 본문 수집 전에 확인한다. 형제 폴더의 접두어 일치나 외부를 가리키는 링크를 프로젝트 일치로 처리하지 않는다.

- Codex는 공식 App Server를 자식 프로세스로 실행해 세션·턴 페이지를 JSON-RPC로 조회한다. `metadataScope: state-db-only`이므로 DB에 색인되지 않은 옛 JSONL 복구는 포함하지 않는다. 프로토콜·프로세스 종료·타임아웃과 반복 커서를 구별하고 자신이 실행한 프로세스를 닫는다. `SILOLINK_CODEX_EXECUTABLE`로 사용할 공식 실행 파일을 명시할 수 있다.
- Claude는 `CLAUDE_CONFIG_DIR` 또는 기본 `~/.claude`의 프로젝트 JSONL을 직접 읽는다. `metadataScope: local-transcripts`, `adapter: claude-jsonl-v1`로 SDK 경유 조회와 구별한다. SDK와 비교한 일반·분기·스트리밍·압축·대기 요청·전달 확인·중복·메타/채널 사례를 처리한다. 원래 세션과 복사 컨테이너를 구별한다.

Claude 로컬 JSONL은 공개 SDK와 동일한 안정적 API라는 보장이 없다. 현재 검증 범위는 2.1 계열의 수집 사례다. 미검증 버전·깨진 줄·미완료 줄·해석하지 못한 압축/대기 요청은 경고와 부분 범위로 남긴다. 모든 버전·메시지 유형의 완전한 호환을 주장하지 않는다. 새로운 형식은 회귀 자료를 추가해 어댑터를 갱신한다. 프로젝트 이름 인코딩이 충돌해도 원문 cwd를 확인하며 링크된 기록 디렉터리·파일을 임의로 따라가지 않는다.

보고서는 `schemaVersion: 1`, `mode: text-history`, `scope: exact-root`, 프로젝트·수집 시각·기록 배열·공급자별 상태를 포함한다. 사용자/AI 텍스트가 대상이고 도구·이미지·비텍스트는 제외 종류·건수로 표시한다. 전체 대화 원본의 완전한 내보내기는 아니다. 모델을 호출하거나 자격증명을 복사하지 않는다. 공급자 자체는 정상 실행 중 홈의 상태·임시 파일을 사용할 수 있다.

`--limit`는 공급자별 원문 항목 수이며 `history` 기본값은 1000이다. 상한에 닿으면 추가 이력 유무를 확인하지 못한 부분 결과다. Codex는 최신 턴부터, Claude는 최근 세션의 활성 메시지 경로 시작부터 읽는다. 전체 출력의 공통 시간순 또는 최신 N개 의미는 없다. 한 공급자가 실패해도 다른 결과와 이미 읽은 기록을 보존한다.

## 로컬 저장과 주기 수집

```powershell
silolink sync --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state"
silolink records --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state"
silolink watch --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state" --interval 30
```

세 명령은 `--state-dir` 또는 `SILOLINK_STATE_DIR`로 위치를 명시해야 한다. 대화가 저장되므로 Git 경로 밖의 전용 폴더를 권장한다. 위치 미지정은 공급자 실행·저장 전에 오류다. 제품 기본 저장 위치·여러 PC 동기화는 아직 미정이다.

- `sync`는 지원 이력을 다시 읽어 추가·수정·동일 기록을 구분한다. 기본 상한은 `Number.MAX_SAFE_INTEGER`와 같은 9,007,199,254,740,991개로 유지했다. `--limit`를 줄이면 부분 범위를 표시한다. stdout에는 원문 대신 변경 건수·진단·저장 경로를 출력한다.
- `records`는 공급자를 실행하지 않고 현재 저장본과 `lastRun`을 읽는다. `status: success`는 저장본 조회 성공이며 수집 성공·최신성은 `lastRun`에서 판단한다.
- `watch`는 즉시 수집하고 완료 후 기본 30초 간격으로 반복한다. CLI 간격은 1~86400초다. 수집을 겹쳐 실행하지 않고 도메인 오류는 다음 주기에 재시도한다. 결과는 JSON 한 줄씩 출력한다. 재조회 상한으로 새 메시지가 계속 빠지는 것을 피하려고 `--limit`를 지원하지 않는다.

현재는 매 주기 전체 재조회다. ID와 revision으로 저장 중복·변경을 처리하지만 공급자 증분 커서·페이지별 영구 체크포인트·파일 훅 최적화는 아직 없다. 데이터가 많으면 읽기·메모리 비용이 증가할 수 있다. 다음 조회에서 사라졌거나 일부 수집이 실패한 기록을 삭제하지 않는다.

저장은 `silolink.sqlite` v1이다. 현재 기록·이전 revision·마지막 수집 결과·프로젝트별 잠금을 보관하며 원문 텍스트를 암호화 없이 로컬에 저장한다. 기존 JavaScript SQLite v1을 읽을 수 있고 기록 ID·리비전 해시도 유지한다. 새 기록과 수집 결과는 한 트랜잭션으로 반영해 실패 시 이전 상태를 보존한다. 다른 DB·미지원 버전·링크를 덮어쓰지 않는다. 동일 ID의 다른 경로를 자동 병합하지 않는다.

동시 수집은 거절하고, 죽은 프로세스의 잠금은 PID 종료가 확인되면 회수한다. PID 재사용이나 접근 실패는 보수적으로 사용 중으로 본다. `watch`는 전경 프로세스이며 Windows Ctrl+C, Unix SIGTERM 수신 시 진행 중 수집을 마치고 다음 주기를 시작하지 않는다. 강제 종료의 미완료 DB 변경은 SQLite 복구 대상이고 재시작은 전체 재조회로 재개한다. DB 형식을 바꿀 때는 코드 되돌리기와 별도로 백업·이행을 설계해야 한다.

| 결과 | 출력 | 종료 코드 |
| --- | --- | --- |
| 성공·빈 이력 | stdout JSON | 0 |
| 경고·일부 실패·조회 상한·일부 스킬 설치 | stdout 부분 결과 | 2 |
| 모든 공급자/설치 실패 | stdout 실패 보고서 | 1 |
| 인자·프로젝트·저장 준비 오류 | stderr 오류 JSON | 1 |
| 요청한 watch 중지 | 주기별 보고서 후 종료 | 130 |

## 기록 v1과 구현 연결

ID는 공급자·원래 세션 ID·항목 ID 배열의 SHA-256이다. 본문이 같아도 새 항목 ID면 다른 요청이다. revision은 역할·텍스트 조각·발생 시각·시간 근거·응답 단계의 해시다. 수집 시각은 제외하고 기존 JavaScript 직렬화 순서를 보존한다.

`source`는 공급자·원래 세션·항목·턴·소스 종류와 필요한 경우 `containerSessionId`를 갖는다. `textParts`와 합친 `text`, `role`, `phase`, `observedAt`을 보존한다. Codex 턴 시각은 초 단위를 UTC로 바꾼 `turn-start` 근거이며 정확한 메시지 시각으로 승격하지 않는다. Claude 타임스탬프가 없거나 잘못되면 null·`unknown`이다. 역할만으로 실제 작성자가 사람인지 자동화인지 확정하지 않는다. 전체 분기 그래프는 후속 범위다.

| 위치 | 책임 |
| --- | --- |
| `src/main.rs`, `src/cli.rs` | 실행·인자·출력·종료 코드 |
| `src/project.rs`, `src/records.rs` | 프로젝트 정체성·귀속·공통 기록·해시 |
| `src/documents.rs` | 읽기 전용 문서 현황·링크·revision·근거 기반 정리 후보 |
| `src/providers/` | 공식 Codex RPC와 Claude 로컬 형식 해석 |
| `src/history.rs`, `src/store.rs`, `src/sync.rs` | 결과 결합·저장·복구·주기 수집 |
| `src/install.rs`, `integrations/skills/`, `scripts/install.ps1` | 실행 파일과 스킬 설치 |

다음은 문서 변경안의 적용·충돌·저널·복구 구현이다. 현재 문서 현황과 규칙 기반 검토 후보를 조회할 수 있으며, 내용 이해에 따른 통합·재작성·삭제는 완료하지 않았다. 데스크톱 프레임워크·상주 수집·분석·채팅은 아직 구현하지 않았다.
