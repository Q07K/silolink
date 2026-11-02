# 네이티브 CLI와 공통 기록 계약

- 기준일: 2026-11-02
- 상태: Rust 네이티브 CLI. 스킬 설치·초기화·문서 현황과 정리 후보·검토한 문서 변경안 적용/복구·텍스트 이력 조회·로컬 저장·전경 주기 수집을 제공한다.
- 기준: [PRD](../product/prd.md), [공급자 조사](../research/cli-integration.md), [검증 사례](../../tests/CASE_MATRIX.md).

## 설치와 실행

`init`은 폴더의 `.silolink/project.json`을 만든 뒤 공통 사용자 등록부(`~/.silolink/projects/<project-id>.json`)에 절대 경로를 기록한다. CLI는 데스크톱의 `workspace.json`을 직접 수정하지 않는다. 앱은 시작·새로고침 및 실행 중 2초 간격으로 등록부를 읽어 실제 프로젝트 식별자를 확인하고 기존 작업 공간에 병합한다. AI 기록 백그라운드 수집 설정과는 독립적이다. 기존 앱에는 이 경로가 없으므로 업데이트 후 `init`을 다시 실행해야 한다. 등록 실패는 명령 실패로 보고하며, 이미 만든 프로젝트 정보는 재시도에 사용한다. 동일 식별자의 다른 경로는 자동으로 덮어쓰지 않는다.

격리 테스트는 `SILOLINK_PROJECT_REGISTRY_DIR`로 등록부를 지정한다. 미지정 시 `SILOLINK_USER_HOME` 또는 OS 사용자 홈을 사용한다. 등록부에 없는 폴더를 전체 디스크에서 탐색하지 않으며 잘못된 등록 항목은 다른 프로젝트를 막지 않고 앱에 오류로 표시한다.

Windows x64 릴리스 실행 파일은 `silolink.exe` 하나다. 실행에 Node·npm·Rust 설치를 요구하지 않는다. Codex 이력 조회에는 사용자의 공식 Codex 실행 파일이 필요하며 Claude 조회는 기존 로컬 기록을 읽는다. 인증정보를 추출하거나 새 인증을 중계하지 않는다.

저장소에서 빌드할 때는 Rust 1.90 이상, Windows MSVC 도구체인과 C++ Build Tools가 필요하다. SQLite는 정적으로 포함한다. x64 MSVC 빌드의 CRT도 정적으로 연결하며 현재 확인한 의존 DLL은 Windows 시스템 DLL이다. macOS·ARM64 실행은 아직 검증하지 않았다.

```powershell
# 소스 빌드 → 사용자 설치 폴더에 실행 파일 복사 → PATH 등록 → 스킬 설치
.\scripts\install.ps1

# 이미 빌드한 실행 파일 설치: Rust 도구체인을 사용하지 않음
.\scripts\install.ps1 -BinaryPath .\target\release\silolink.exe
```

설치 기본 위치는 `%LOCALAPPDATA%\SiloLink\bin`이다. `-InstallDirectory`로 변경하고 `-HostName codex|claude|antigravity|all`로 설치할 스킬을 선택한다. `-NoPath`는 사용자 PATH 변경을 생략하고 `-SkipSkills`는 스킬 설치를 생략한다. 기존 터미널에서 명령을 못 찾으면 다시 열거나 설치된 실행 파일의 전체 경로를 사용한다. 실행 중인 파일 교체가 거부되면 해당 SiloLink 실행을 종료한 뒤 다시 설치한다.

Windows 태그 자동 배포 워크플로가 추가됐다. 저장소 반영과 첫 원격 실행·공개 릴리스 게시는 별도 단계다. [배포 안내](releasing.md)를 참고한다. 자동 업데이트·공개 마켓플레이스 등록은 아직 제공하지 않는다. Codex용 플러그인 패키지는 아래의 별도 배포 단위다. 임의 npm 동명 패키지 설치가 이 저장소의 설치를 대신하지 않는다.

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

도구를 다시 열거나 스킬 새로고침 기능으로 확인한다. Codex와 Antigravity의 프로젝트 경로가 같으면 한 번만 설치한다. `SILOLINK_USER_HOME`은 사용자 범위 설치 기준을 명시적으로 바꿀 때 사용할 수 있다. 이 setup 경로는 독립 스킬 설치다. Codex에는 같은 스킬과 실행 파일을 묶은 로컬 플러그인 체험 배포도 제공한다. 두 방식을 동시에 설치하면 같은 스킬이 두 번 보일 수 있으므로 하나를 선택한다.

스킬 원본은 `integrations/skills/`에 있으며 실행 파일에 포함된다. 기존 `silolink`와 `silolink-init`, `silolink-docs`, `silolink-docs-check`, `silolink-docs-apply`, `silolink-docs-changes`, `silolink-docs-undo`, `silolink-history`, `silolink-sync`, `silolink-records`, `silolink-watch`를 함께 설치한다. 각 스킬에 `SKILL.md`와 `installation.json`이 있고, 기능별 항목에는 한국어 UI 이름·설명·기본 요청을 담은 `agents/openai.yaml`도 설치한다. 기능별 진입점은 함께 설치하는 통합 스킬의 공통 실행·변경 계약을 읽는다.

설치 메타데이터 v2의 `cliPath`는 네이티브 실행 파일의 절대 경로다. 스킬은 구형 PATH 명령과 혼동하지 않도록 그 경로를 우선 실행하고, 설치 메타데이터 없이 수동 복사한 스킬은 PATH의 `silolink`를 사용한다. `.js` 런처나 별도 인터프리터는 사용하지 않는다. PowerShell 전체 경로 호출은 `& "C:\path\to\silolink.exe" init`이다.

동일한 설치는 유지한다. 현재 통합 스킬만 있고 원문·메타데이터가 일치하면 `update_available`로 표시하고 기존 파일을 다시 쓰지 않은 채 빠진 기능별 스킬을 추가한다. 기존 타사·사용자 수정·구형 JavaScript 스킬·링크 경로·다른 실행 파일 경로는 덮어쓰지 않고 충돌로 표시한다. 호스트별로 모든 스킬 이름을 사전 검사하며 충돌 시 새 항목도 만들지 않는다. 실제 쓰기 실패 시 이미 완료된 항목은 개별 결과에 남기고 부분 반영을 보고한다. 일부 성공은 종료 코드 2다. 충돌하는 설치를 교체하려면 내용을 확인·백업하고 해당 스킬을 제거한 뒤 `setup`을 실행한다. 프로젝트 메타데이터나 기록 DB를 지우는 절차가 아니다. 수정된 스킬의 강제 업데이트·제거는 후속 범위다.

호출·설치 위치 근거: [OpenAI Skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code Skills](https://code.claude.com/docs/en/skills), [Antigravity Skills](https://antigravity.google/docs/skills). 실제 Codex 스킬 발견과 Claude의 `/silolink init` 실행을 확인했다. Antigravity 앱 내 사용·Codex 모델 실행·각 도구의 UI 메뉴 조작은 미검증이다.

## 프로젝트 초기화

### Codex 로컬 플러그인 체험 패키지

개발자는 CLI를 빌드한 뒤 새 출력 경로로 패키지를 만든다. 기존 출력이나 ZIP은 덮어쓰지 않는다.

```powershell
.\scripts\package-plugin.ps1 -OutputDirectory .tools\releases\silolink-preview
```

ZIP에는 허용 목록의 플러그인 매니페스트·브랜드 아이콘·공통 스킬·`bin/silolink.exe`, 로컬 마켓플레이스, 한국어 HTML 안내와 `Codex에 등록.cmd`를 포함한다. 사용자 대화·프로젝트 문서·설정·개발 도구체인은 복사하지 않는다. 루트 `plugin.json`과 `.codex-plugin/plugin.json` 호환 매니페스트를 제공한다. 설치 캐시로 복사된 스킬은 실제 스킬 경로에서 `../../bin/silolink.exe`를 찾아 사용하므로 PATH·원본 checkout·빌드 도구에 의존하지 않는다.

등록 파일은 설치된 Codex의 `plugin marketplace add`를 호출해 이 패키지를 로컬 설치 목록에 등록한다. 플러그인 설치·활성화는 앱의 플러그인 화면에서 이어간다. PATH의 `codex.exe`와 기본 Windows Codex 설치 위치를 확인하며, 그 외 위치는 아직 자동 탐지하지 않는다. [사용자 안내](../user/getting-started.md)와 [공식 로컬 플러그인 안내](https://developers.openai.com/plugins/build/plugins)를 참고한다. 기존 사용자 설정을 직접 덮어쓰거나 사용자 프로젝트를 초기화하는 등록기가 아니다.

### CLI 직접 실행

```powershell
silolink init --project "C:\path\to\project"
```

현재 폴더 대상이면 `--project`를 생략한다. 기존 프로젝트와 새로 만든 빈 폴더 모두 같은 명령을 사용한다. 존재하지 않는 대상 폴더는 자동 생성하지 않는다.

`.silolink/project.json` v1은 UUID 프로젝트 ID·이름·생성 시각을 저장한다. 재실행 시 ID와 기존 파일을 보존한다. 경로 자체를 프로젝트 정체성으로 저장하지 않는다. 미지원 버전·손상·링크·파일 충돌을 덮어쓰지 않는다. `init.lock`으로 진행 중 읽기와 동시 초기화를 거절한다. 비정상 종료 시 남은 초기화 잠금의 자동 복구는 아직 없으며 실제 초기화 진행 여부를 확인해야 한다.

`init`은 기록 수집·문서 재구조화·서비스 설치를 완료했다고 표시하지 않는다. 공통 스킬은 성공 후 같은 프로젝트에 `docs`를 실행해 현황과 정리 후보를 안내한다. 네이티브 `init` 자체는 기존 계약대로 ID만 초기화한다. 실제 문서 변경은 아래의 명시적 변경안 적용으로 수행한다.

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

## 문서 변경안 검사·적용·복구

`docs`의 후보와 실제 원문을 보고 사용자·호스트 AI가 다듬은 구체적인 JSON 변경안을 적용한다. CLI 자체가 의미를 추측해 통합 내용을 만들거나 변경안을 읽기만 해도 적용하지 않는다. 통합·재작성은 실제 새 내용으로, 삭제는 명시적 삭제로, 링크 수정도 같은 변경안의 작업으로 표현한다.

```powershell
silolink docs-check --plan "C:\path\to\reviewed-plan.json" --project "C:\path\to\project"
silolink docs-apply --plan "C:\path\to\reviewed-plan.json" --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state"
silolink docs-changes --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state"
silolink docs-undo --change "변경안의-UUID" --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state"
```

`--project` 생략 시 현재 프로젝트다. 적용·조회·복구는 `--state-dir` 또는 `SILOLINK_STATE_DIR`가 필요하다. `docs-check`는 저장 위치 없이 원문·의존성·목적지를 검사하고 전후 전체 내용·역링크·원본 revision·계획에서 다루지 않은 참조를 보여준다. 파일이나 잠금·저널을 만들지 않는다. 검사 성공은 원본 조건이 맞는다는 의미이며, 내용의 타당성이나 모든 링크의 검증 완료를 뜻하지 않는다.

변경안 v1의 필드는 다음과 같다. 미지원 필드와 빠진 필수 필드는 오류다.

| 필드 | 계약 |
| --- | --- |
| `schemaVersion` | `1` |
| `id` | 새 소문자 UUID. 저장 후에는 같은 ID의 내용·순서·근거를 바꿀 수 없음 |
| `projectId` | 대상 `.silolink/project.json`의 실제 ID |
| `rationale` | 선택한 통합·재작성·삭제의 이유 |
| `operations` | 순서대로 적용할 작업. 각 항목의 `path`, `expectedRevision`, `content`를 모두 명시 |
| `operations[].path` | 프로젝트 상대 `.md`·`.markdown` 경로. 절대 경로·상위 이동·역슬래시·Windows 예약 이름·모호한 이름·관리/생성 폴더·링크·별도 하위 프로젝트를 거절 |
| `operations[].expectedRevision` | 기존 UTF-8 파일 원문 바이트의 SHA-256. `null`이면 목적지가 없어야 함 |
| `operations[].content` | 변경 후 전체 UTF-8 문자열. `null`이면 기존 파일 삭제. 단순 이동은 새 경로 작성+원본 삭제로 표현 |
| `guards` | 선택한 읽기 의존성의 `path`와 `expectedRevision`. 생략하면 빈 배열. 적용 중에도 원문 변경을 재확인 |

예를 들어 아래는 새 문서 한 개를 쓰는 형식이다. ID는 예시이며 실제 프로젝트 ID와 새 변경안 ID로 바꾸고, 실제 통합·재작성 내용과 필요한 삭제·링크 수정을 작업 배열에 함께 넣는다.

```json
{
  "schemaVersion": 1,
  "id": "22222222-2222-4222-8222-222222222222",
  "projectId": "11111111-1111-4111-8111-111111111111",
  "rationale": "검토한 설계 결정과 적용 조건을 한 문서로 정리한다.",
  "operations": [
    {"path": "docs/guide.md", "expectedRevision": null, "content": "# Guide\n\n검토한 설계 결정과 적용 조건.\n"}
  ],
  "guards": []
}
```

한 계획은 작업 128개·읽기 의존성 256개까지, 파일당 2MiB, 새 내용 합계와 이전 내용 합계 각각 8MiB, 입력 JSON 16MiB까지다. 같은 경로·대소문자만 다른 경로·파일과 하위 폴더가 겹치는 경로·실제 변경 없는 작업은 거절한다. 문서 없는 프로젝트에서는 `expectedRevision: null`인 작성으로 시작할 수 있다. 문서 내용은 실행할 코드나 명령으로 해석하지 않는다.

적용은 전체 원본 조건을 확인한 뒤 별도 `document-changes.sqlite` v1에 변경안·UTF-8 이전 내용·파일별 진행을 저장한다. 기존 기록용 `silolink.sqlite` v1은 변경하지 않는다. 원문과 백업은 암호화 없이 저장하므로 상태 경로는 Git 밖의 전용 폴더를 권장한다. 기존 타사·미지원 DB·연결 경로를 덮어쓰지 않는다.

프로젝트의 `.silolink/document-changes.lock`에 [Rust 파일 잠금](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock)을 사용한다. 상태 폴더가 달라도 같은 프로젝트의 동시 변경을 거절하고 프로세스 종료 시 잠금이 해제된다. 잠금 파일은 남기며 파일 존재만으로 실행 중이라고 판단하지 않는다. 다른 프로젝트는 같은 저널을 사용할 수 있다.

각 파일은 이전 조건을 다시 확인한 뒤 같은 폴더의 전용 스테이징 파일에 작성·동기화하고 [파일 교체](https://doc.rust-lang.org/std/fs/fn.rename.html)로 반영한다. 단계는 `pending`, `writing`, `applied`, `reverting`, `reverted`로 기록한다. 여러 파일 전체가 하나의 원자적 변경은 아니다. 외부 편집은 스테이징 전후와 파일별로 검사하지만, 다른 편집기가 잠금을 따르지 않으면 마지막 검사와 교체 사이의 경쟁까지 원자적으로 차단하지는 못한다.

| 변경 상태 | 의미·다음 동작 |
| --- | --- |
| `ready` | 읽기 전용 검사에서 현재 원본 조건이 맞음 |
| `applying`, `rolling-back` | 적용 또는 복구 중. `active`와 파일별 단계를 함께 확인 |
| `applied` | 계획의 파일 작업을 반영함. 새 링크 오류·불완전한 조회가 있으면 결과 `status: partial`, 종료 코드 2 |
| `partial` | 도중 실패. 이미 반영된 파일과 원문을 보존하며 동일 계획으로 재개하거나 복구 |
| `interrupted` | 실행 중 상태로 기록됐지만 현재 프로세스 잠금이 없음. 저널·현재 내용·스테이징 상태를 대조해 재개/복구 |
| `conflict` | 외부 편집·경로/프로젝트 충돌. 덮어쓰지 않으며 해당 시도의 쓰기를 중단 |
| `rolled-back` | 이전 바이트·이전 파일 부재 상태로 복구함. 재적용은 새 계획 ID 사용 |

`docs-changes`는 현재 프로젝트의 최근 100개 계획을 조회하고, `--change <UUID>`로 특정 계획을 조회한다. `changeState`는 기록한 작업 상태이며 `files[].currentState`의 `before`, `after`, `external-change`, `unreadable`은 현재 파일과의 비교다. 역사적으로 적용됐더라도 현재 내용이 달라졌다면 항목 상태는 `partial`이다. 목록의 `status: success`는 이력 조회 성공이지 모든 변경의 완료를 뜻하지 않는다.

동일한 불변 계획의 재실행은 이미 반영된 쓰기를 반복하지 않는다. 파일 교체 후 저널 갱신 전에 종료된 경우도 이전/이후 내용과 기록한 작업 의도로 판별한다. 저널 기록 실패 시 문서가 이미 바뀌었을 수 있으므로 오류를 전체 롤백으로 해석하지 말고 `docs-changes`로 확인한다. 초기 검사에서 원본·목적지·읽기 의존성이 충돌하면 문서를 쓰지 않는다. 재개 시 충돌 결과에도 기존 파일별 상태를 제공한다.

복구는 원래 작업의 역순으로 수행하고 이전 원문 바이트(CRLF 포함)와 파일 부재를 복원한다. 기록한 이후 내용 또는 이미 복구 중이던 이전 내용과 일치해야 한다. 이후 사용자의 편집·알 수 없는 스테이징 변경·타 프로젝트/다른 경로의 동일 프로젝트 ID는 보존하고 충돌로 표시한다. 일괄 사전 비교에서 충돌하면 복구 쓰기를 시작하지 않는다. 중간 복구 실패나 강제 종료도 같은 `docs-undo`로 재개한다. 새로 만든 빈 폴더는 자동 삭제하지 않는다. 파일시스템 전체의 ACL·소유권·타임스탬프 복제는 제공하지 않으며 현재 보존 범위는 내용과 readonly/Unix 권한 비트다.

반영·복구 후에는 문서 조회를 다시 실행해 `validation`에 링크·범위·경고를 남긴다. 기존부터 끊어져 있던 링크와 이번 작업으로 생긴 `newBrokenLinks`를 구별한다. 새 링크 오류가 있으면 파일이 반영됐어도 검증 완료로 표시하지 않는다. 앵커·제외 범위·HTML/위키 링크의 한계는 그대로다. 전원 장애·네트워크 파일시스템·macOS에서의 내구성은 아직 검증하지 않았다.

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
| `src/changes/` | 불변 변경안·전후 검사·별도 저널·프로젝트 잠금·파일 적용/복구·재개 |
| `src/providers/` | 공식 Codex RPC와 Claude 로컬 형식 해석 |
| `src/history.rs`, `src/store.rs`, `src/sync.rs` | 결과 결합·저장·복구·주기 수집 |
| `src/install.rs`, `integrations/skills/`, `scripts/install.ps1` | 실행 파일과 스킬 설치 |

문서의 현황 조회→검토할 실제 변경안→검사·적용→충돌·복구를 CLI로 연결했다. 의미에 따른 최종 통합 내용은 사용자·호스트 AI가 작성하며 CLI가 임의로 결정하지 않는다. 다음은 최소 데스크톱의 프로젝트·문서·기록 조회를 연결할 기술 선택과 구현이다. 상주 수집·개인화 분석·조사·채팅은 아직 구현하지 않았다.
