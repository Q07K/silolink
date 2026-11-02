# SiloLink

여러 프로젝트와 AI 도구에 흩어진 기록을 연결하고, 사용 맥락을 바탕으로 조사·학습·프로젝트 운영을 지원하는 CLI·플러그인·데스크톱 제품을 개발합니다.

현재는 **Rust 네이티브 CLI**로 도구별 스킬 설치, 프로젝트 초기화, 문서 현황·정리 후보 조회, 검토한 문서 변경안의 적용·복구, Codex·Claude 텍스트 이력 조회·저장·주기 수집을 제공합니다. JavaScript CLI와 npm·Agent SDK 런타임은 제거했습니다. 데스크톱 상주 수집·분석은 후속 구현입니다.

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
| [유사 제품과 개발 가치](docs/research/alternatives.md) | 후보 9종, 비교 근거, 구현 가치와 검증 과제 |
| [CLI·플러그인 연동 조사](docs/research/cli-integration.md) | 실제 Windows 검증 결과, CLI·MCP 비교, 공급자별 지원·인증 조건과 다음 과제 |
| [Basic Memory 분석](docs/research/basic-memory.md) | 사람·AI 공동 문서 관리와 실제로 비교할 지점 |

## 폴더 구성

```text
Cargo.toml            Rust 패키지와 의존성
Cargo.lock            고정된 의존성 버전
src/                  네이티브 CLI·프로젝트·기록·공급자·저장 코어
scripts/              Windows 설치와 개발 빌드 보조
integrations/skills/  각 도구에 설치할 공통 스킬
tests/                요구 기반 테스트와 사례 목록
docs/
  development/
    cli.md
  product/
    prd.md
  research/
    alternatives.md
    cli-integration.md
    basic-memory.md
```

제품 요구는 PRD에서 관리하고, 외부 자료의 사실·주장·검증 한계는 조사 문서에 둡니다. 제안과 확정 사항을 구별하며, 인터뷰의 예시를 고정 사용 절차로 확대하지 않습니다.

2026-11-01 문서 정리에서 인계 메모·인터뷰·제품 방향의 중복을 통합하고, 인계용 프롬프트·HTML·매니페스트와 폐기된 권고의 별도 문서를 삭제했습니다. 정리 전 원문은 Git 이력에서 확인할 수 있습니다.
