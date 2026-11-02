# SiloLink

AI와 작업하다 보면 문서는 여러 폴더에 흩어지고, 전에 결정한 내용은 대화 속에 묻힙니다. SiloLink는 프로젝트 문서와 AI 대화 기록을 연결해, 정리할 부분과 다음 작업에 쓸 맥락을 살펴보도록 돕습니다.

## 처음 사용하는 분께

**먼저 [설치와 첫 사용 안내](docs/user/getting-started.md)를 읽어 주세요.** 명령어를 몰라도 시작할 수 있는 Windows 체험 흐름을 안내합니다.

- **사용 중인 AI 도구에서 사용:** Windows 앱을 설치하고 **AI 도구 연결** 또는 **알림·설정 → AI 도구 연결**에서 Codex·Claude Code·Antigravity의 연결 버튼을 누릅니다. 도구를 다시 열고 **silolink-init · 프로젝트 연결**을 선택해 요청하세요. 문서 확인·기록 가져오기·변경안 적용과 복구도 각각 선택할 수 있습니다. 실행 파일이 앱에 포함되어 있어 별도 CLI 설치가 필요하지 않습니다.
- **SiloLink 앱에서 사용:** Windows 설치 프로그램으로 앱을 설치하고, ‘프로젝트 연결’에서 작업하던 폴더를 선택합니다. 문서 현황을 먼저 보고, AI 대화 기록은 원하는 때에 가져옵니다.

Codex 플러그인으로 관리하려면 실행 파일이 포함된 플러그인 ZIP도 사용할 수 있습니다. 앱에서 스킬을 등록하는 방식과 하나를 선택하면 됩니다.

Windows 자동 빌드·배포 [워크플로](.github/workflows/windows.yml)를 제공합니다. `main` 푸시·PR·수동 실행은 검사와 빌드 결과를 만들고, 소스 버전과 일치하는 `v…` 태그 푸시는 검증된 설치 EXE·플러그인 ZIP·체크섬을 GitHub Releases에 게시합니다. 저장소 반영과 첫 원격 실행은 별도 단계이며, 로컬 빌드만으로 공개 릴리스가 생기지는 않습니다. [배포 방법](docs/development/releasing.md)을 참고하세요.

공개 플러그인 디렉터리 등록·코드 서명·자동 업데이트는 아직 제공하지 않습니다. Markdown(.md) 문서를 지원하며 Word·PDF는 지원하지 않습니다. AI에게 문서와 기록을 근거로 작업하도록 요청할 때 맥락을 활용합니다.

아래는 개발자가 소스에서 실행 파일과 체험 패키지를 만드는 방법입니다.

**Rust 네이티브 CLI와 Windows 데스크톱**이 같은 코어를 사용합니다. CLI의 스킬 설치·초기화·이력 수집·문서 검사/반영/복구를 유지하면서, 데스크톱에서 실제 기록 분석·근거 대화·조사/학습 노트·작업/일정·회고와 선택적 백그라운드 안내를 연결합니다. 앱의 기본 데이터에 시안용 예시를 넣지 않습니다. [구현 범위와 사용법](docs/development/desktop.md)을 참고하세요.

## 데스크톱 실행

Windows x64·WebView2를 기준으로 개발합니다. 실행 파일에는 Node/npm/Rust 설치가 필요하지 않습니다. 저장소에서 소스 빌드를 할 때는 Node 22.20 이상과 Rust 1.90 MSVC·C++ Build Tools가 필요합니다.

```powershell
# 개발 창
.\scripts\desktop.ps1 -Mode dev

# 실행 파일과 설치 프로그램 빌드
.\scripts\desktop.ps1 -Mode build

# 빌드한 앱 실행
.\target\release\silolink-desktop.exe
```

첫 실행에서 프로젝트 폴더와 기록/문서 백업 저장 위치를 선택합니다. 기존 CLI의 state-dir을 사용할 수 있습니다. 앱의 설정·프로젝트 목록과 실제 프로젝트 파일을 구별합니다. 백그라운드와 시스템 알림은 설정에서 켜며, 완전 종료 중에는 수집·알림을 실행하지 않습니다.

## 저장소에서 설치하고 사용하기

Windows x64를 우선 지원합니다. 실행에는 Node/npm/Rust 설치가 필요하지 않습니다. 소스 빌드에만 Rust 1.90 이상·MSVC 도구체인·C++ Build Tools가 필요합니다.

```powershell
.\scripts\install.ps1

# 이미 빌드한 실행 파일을 설치할 때
.\scripts\install.ps1 -BinaryPath .\target\release\silolink.exe
```

설치기는 사용자 폴더에 실행 파일을 복사하고 PATH와 스킬을 등록합니다. 그다음 사용할 프로젝트를 도구에서 열고 Claude Code·Antigravity에서는 `/silolink init`, Codex에서는 스킬 메뉴 또는 `$silolink init`으로 호출합니다. 기존·신규 프로젝트 모두 같은 명령을 사용합니다. 스킬은 네이티브 CLI를 직접 실행합니다. 공개 릴리스 배포·자동 업데이트는 아직 제공하지 않습니다.

`init`은 프로젝트 ID만 만들고 기존 문서를 보존합니다. 공통 스킬은 초기화 뒤 `silolink docs`로 Markdown의 제목·중복 내용·로컬 링크와 정리 후보를 안내합니다. 직접 `silolink docs --project "C:\path\to\project"`로 조회할 수도 있습니다. 사용자·AI가 원문을 검토해 작성한 변경안은 `docs-check`로 전후 내용과 영향을 보고, `docs-apply`로 적용하고, `docs-changes`와 `docs-undo`로 상태 확인·복구할 수 있습니다. 형식과 재개·충돌 처리는 [CLI 계약](docs/development/cli.md)에 정리했습니다.

기록 조회는 `silolink history`, 로컬 저장·반복 수집은 다음과 같습니다. 저장 위치는 명시적으로 선택하며 여러 PC 동기화 정책은 아직 미정입니다.

```powershell
silolink sync --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state"
silolink records --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state"
silolink watch --project "C:\path\to\project" --state-dir "C:\path\to\silolink-state" --interval 30
```

`watch`는 전경에서 실행됩니다. 사용법·구형 설치 교체·조회 범위·저장 형식·종료 코드는 [CLI 계약](docs/development/cli.md)에 정리합니다. 검증 명령은 `cargo test --all-targets --locked`이며 [테스트 사례](tests/CASE_MATRIX.md)에 SDK 비교 자료와 기존 저장 형식 호환 범위를 기록합니다.

## 시작하기

| 문서 | 확인할 내용 |
| --- | --- |
| [초기 CLI와 공통 기록 계약](docs/development/cli.md) | 실행 방법, 프로젝트·기록 형식, 페이지·실패·재조회와 현재 한계 |
| [PRD v0.1](docs/product/prd.md) | 사용자 요구, 범용 지원 원칙, 수용 기준, 첫 구현 범위 제안과 남은 결정 |
| [데스크톱 레퍼런스·PARA 검토](docs/research/desktop-references-para.md) | 실제 서비스 화면·정보 운영 비교, PARA의 효용과 한계, 원본과 분류를 구별하는 적용안 |
| [데스크톱 사용과 개발](docs/development/desktop.md) | 빌드/실행·저장·네이티브 경계·검증·현재 한계 |
| [데스크톱 디자인](docs/design/desktop.md) | 채택한 시안·제공된 로고·브랜드 컬러·실제 공통 모듈과 요구 반영 |
| [유사 제품과 개발 가치](docs/research/alternatives.md) | 후보 9종, 비교 근거, 구현 가치와 검증 과제 |
| [CLI·플러그인 연동 조사](docs/research/cli-integration.md) | 실제 Windows 검증 결과, CLI·MCP 비교, 공급자별 지원·인증 조건과 다음 과제 |
| [Basic Memory 분석](docs/research/basic-memory.md) | 사람·AI 공동 문서 관리와 실제로 비교할 지점 |

## 폴더 구성

```text
Cargo.toml            Rust 패키지와 의존성
Cargo.lock            고정된 의존성 버전
src/                  네이티브 CLI·프로젝트·기록·공급자·저장 코어
desktop/              React 화면·Tauri 네이티브 연결·Windows 앱
assets/branding/      제공된 SiloLink 로고 원본
scripts/              Windows 설치와 개발 빌드 보조
integrations/skills/  각 도구에 설치할 공통 스킬
tests/                요구 기반 테스트와 사례 목록
docs/
  design/              채택한 데스크톱·브랜드·공통 모듈 기준
  development/
    cli.md
    desktop.md
  product/
    prd.md
  research/
    alternatives.md
    cli-integration.md
    basic-memory.md
```

제품 요구는 PRD에서 관리하고, 외부 자료의 사실·주장·검증 한계는 조사 문서에 둡니다. 제안과 확정 사항을 구별하며, 인터뷰의 예시를 고정 사용 절차로 확대하지 않습니다.

2026-11-01 문서 정리에서 인계 메모·인터뷰·제품 방향의 중복을 통합하고, 인계용 프롬프트·HTML·매니페스트와 폐기된 권고의 별도 문서를 삭제했습니다. 정리 전 원문은 Git 이력에서 확인할 수 있습니다.
