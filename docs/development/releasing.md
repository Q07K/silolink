# Windows 자동 빌드와 배포

[Windows workflow](../../.github/workflows/windows.yml)는 GitHub Windows 호스팅 러너에서 Rust 1.90.0·Node 22.20.0과 lockfile을 사용한다. `main` 푸시, PR, 수동 실행은 검사·빌드·아티팩트만 만들고, `v…` 태그 푸시는 동일 검사를 통과한 파일을 GitHub Releases에 게시한다. 워크플로 추가와 실제 원격 실행·공개 게시를 구별한다.

## 릴리스 준비

다음 버전을 같은 값으로 맞춘다. `scripts/release-version.ps1`이 불일치를 거절한다.

- 루트 `Cargo.toml`과 `desktop/src-tauri/Cargo.toml`의 패키지 버전, `Cargo.lock` 반영
- `desktop/src-tauri/tauri.conf.json`의 앱 버전
- `desktop/package.json`의 버전과 `package-lock.json` 반영
- `integrations/plugins/silolink/plugin.json`의 플러그인 버전

현재 소스 버전은 0.3.1이다. 변경을 저장소에 반영한 뒤 같은 커밋에 `v0.3.1` 같은 태그를 만들어 원격에 푸시하면 배포가 시작된다. `v0.3.2`를 배포하려면 먼저 소스 버전을 0.3.2로 올린다. 태그 생성·푸시는 워크플로 추가에 자동으로 포함되지 않는다.

저장소에서 Actions 실행이 허용되어야 하며 게시 job의 `contents: write` 권한을 조직 정책이 허용해야 한다. 별도 개인 토큰 없이 해당 저장소의 `GITHUB_TOKEN`을 사용한다. PR 검증 job은 읽기 권한만 가지며 `pull_request_target`은 사용하지 않는다.

## 생성 파일과 게시

- `SiloLink-Setup-<version>-windows-x64.exe`: 신규 설치와 기존 설치 업데이트에 사용하는 앱 설치 프로그램. `bin/silolink.exe`를 포함하며 앱에서 세 AI 도구의 사용자 스킬을 등록한다.
- `SiloLink-Codex-Windows-<version>.zip`: 앱에서 직접 스킬을 등록하는 방식 대신 Codex 플러그인으로 관리할 때 사용하는 선택 배포물.
- `SHA256SUMS.txt`: 두 파일의 SHA-256.

검사·빌드·설치기·브랜딩 검증 후 `scripts/package-release.ps1`이 파일을 모은다. 실제 WebView2 화면을 조작하는 `desktop/tests/native_smoke.py`는 호스팅 러너에서 WebView2 원격 디버깅 포트가 열리지 않아 워크플로에서 제외했다. 태그를 만들기 전에 아래 로컬 검증에서 실행한다. 별도 게시 job은 전달받은 파일 개수·체크섬을 확인하고 초안 릴리스에 업로드한 뒤 공개한다. 실패하면 초안 상태로 남을 수 있다. 같은 태그의 초안은 재실행으로 이어갈 수 있고, 이미 공개한 릴리스는 덮어쓰지 않는다. 수정 배포는 새 버전을 만든다. 하이픈이 들어간 버전 태그는 prerelease로 표시한다.

일반 빌드 결과는 Actions의 `windows-release` 아티팩트에 14일 보관한다. 공개 Releases 게시와 아티팩트 다운로드는 별도 경로다. 코드 서명·자동 업데이트·macOS 배포는 현재 포함하지 않는다.

## 설치 EXE의 화면과 버전 처리

`desktop/src-tauri/windows/installer.nsi`는 Tauri CLI 2.12.4의 공식 NSIS 템플릿을 바탕으로 한다. 파일·리소스 복사, WebView2 준비, 실행 중 앱 종료 확인, 등록·바로가기·제거는 기존 Tauri 기능을 사용한다. 화면과 버전 정책은 `cinematic.nsh`, 한국어·영어 문구는 `cinematic-languages.nsh`에 있다. CLI를 올릴 때는 공식 템플릿과의 차이도 검토한다. 원본의 MIT 라이선스는 같은 폴더에 보관한다.

| 기존 상태 | EXE 동작 |
| --- | --- |
| 설치 없음 | 설치 위치·바로가기 선택 후 설치 |
| 이전 버전 | 현재→새 버전 표시, 기존 설치 위치에 업데이트 |
| 동일 버전 | 앱 파일 다시 설치 |
| 더 최신 버전 | 구버전 설치 차단, 종료만 제공 |

업데이트·재설치는 앱을 먼저 제거하지 않으며 프로젝트, 기록 저장 위치, 앱 설정을 삭제하지 않는다. 기존 설치 위치를 사용하고 임의의 새 경로로 중복 등록하지 않는다. `/S`, `/P`, `/UPDATE`에서도 더 최신 버전을 덮어쓰지 않으며, 대화상자 대기 없이 실패 코드로 종료한다. 기존 MSI가 발견되면 명시적인 제거 후 재시작을 안내하고 자동 마이그레이션하지 않는다. 네트워크 자동 업데이트와 설치 EXE를 직접 가져와 실행하는 업데이트는 구별한다.

`build.beforeBundleCommand`가 `scripts/prepare-installer.ps1`을 실행해 고해상도 배경을 만든다. `installer-artwork.cs`는 정식 앱 아이콘을 Y축 −23°·Z축 14°·750px 원근으로 투영하고, 옆면 두께·윤곽 하이라이트·부드러운 그림자를 합성한다. 단순한 평면 회전으로 대체하지 않는다. 별도 브라우저 런타임 없이 설치 UI를 표시한다.

기본 창은 일반 화면 배율에서 시안과 같은 660×606px이며, 125%를 넘는 배율에서는 함께 확대한다. 폰트 크기·컨트롤 안쪽 여백도 같은 디자인 배율을 사용한다. Windows 기본 제목 표시줄과 앱 헤더를 하나의 드래그 가능한 헤더로 합친다. 헤더 X는 기존 NSIS 취소 버튼을 재사용하므로 설치 도중 취소 제한과 키보드 동작을 유지한다.

버튼·체크박스·경로 입력란은 `cinematic-controls.cpp`의 Win32 컨트롤 서브클래싱으로 그린다. 둥근 모서리·회색 포커스·호버/누름/비활성 색상과 입력란 안쪽 여백을 적용하며, 기존 네이티브 입력·선택·키보드·접근성·NSIS 이벤트를 유지한다. 설치 진행 화면의 상세 보기와 완료 화면의 실행 체크박스에도 적용한다. 폴더 탐색 대화상자는 Windows 기본 탐색기를 사용한다.

`scripts/build-installer-controls.ps1`은 Visual Studio C++ Build Tools의 x86/x64 구성 요소와 Windows SDK를 사용한다. NSIS의 실행 프로세스가 32비트이므로 컨트롤 DLL도 x86으로 빌드한다. `/MT`로 C++ 런타임을 정적 연결하며 DLL은 설치기의 임시 폴더에서만 사용한다. GUI 종료 시 서브클래스와 그래픽 자원을 정리한다. C++ 빌드는 번들 전 자동 실행되므로 별도 수동 DLL 복사가 필요하지 않다.

실제 NSIS 동작은 `powershell -NoProfile -ExecutionPolicy Bypass -File desktop/tests/installer_smoke.ps1`로 검증한다. 먼저 정상 번들을 만들어 `target/release/nsis/x64/installer.nsi`가 있어야 한다. 검증은 같은 스크립트·네이티브 UI에 작은 시험용 실행 파일을 넣고, 고유한 시험 제품명·레지스트리와 `.tools/installer-smoke/<id>`의 한글·공백 경로 및 셸 폴더를 사용한다. 실제 사용자 설치를 바꾸지 않는다. 화면 PNG·컨트롤 배치·검증 결과를 그 폴더에 남긴다. 실제 제품 페이로드 포함 여부는 정식 빌드에서 별도로 확인한다.

프로세스 표시 정보는 `powershell -NoProfile -ExecutionPolicy Bypass -File desktop/tests/process_branding.ps1`로 확인한다. 앱·CLI·설치기의 `FileDescription`·`ProductName`과 EXE 아이콘을 Windows 셸 API로 읽어 브랜드 ICO와 대조하고, 격리 프로필로 앱을 실행해 실제 `SiloLink` 창과 런타임 아이콘도 확인한다. 결과 JSON과 추출한 아이콘은 `.tools/process-branding/<id>/`에 남는다. 원본 ICO와 EXE 모두 동일한 Windows 아이콘 추출 API를 사용한다. 실행 창에서는 Tao가 지정하는 작은 아이콘도 조회하고, 별도 가장자리 여백이 있는 ICO의 32px 항목 대신 창에 사용하는 원본 128px PNG를 같은 크기로 정규화해 대조한다.

업데이트 도중 강제 종료·정전 시 전체 파일 교체를 원자적으로 되돌리는 기능과 실제 서명된 공개 배포는 이 범위에 포함하지 않는다.

## 로컬 검증

```powershell
.\scripts\release-version.ps1 -Tag v0.3.1
.\scripts\prepare-desktop.ps1 -Profile debug
.\scripts\cargo.ps1 -CargoArguments @('test', '--all-targets', '--locked')
.\scripts\cargo.ps1 -CargoArguments @('test', '-p', 'silolink-desktop', '--lib', '--locked')
.\scripts\desktop.ps1 -Mode build
.\scripts\cargo.ps1 -CargoArguments @('build', '-p', 'silolink-desktop', '--bin', 'silolink-desktop-provider-fixture', '--locked')
python desktop\tests\native_smoke.py --executable target\release\silolink-desktop.exe
.\scripts\package-release.ps1 -OutputDirectory .tools\release-assets -Tag v0.3.1
```

출력 폴더는 새 경로를 사용한다. 기존 출력은 덮어쓰지 않는다. `package-release.ps1`은 설치 프로그램 1개와 빌드된 CLI·동봉 CLI의 동일성을 확인한 뒤 패키지를 만든다. `native_smoke.py`에는 Python과 `playwright==1.64.1`이 필요하다. 정적 검사·설치기·브랜딩 검증의 전체 명령은 워크플로에 있다.

자료: [Tauri 리소스 동봉](https://v2.tauri.app/develop/resources/), [GitHub Rust 빌드·아티팩트](https://docs.github.com/en/actions/tutorials/build-and-test-code/rust), [GitHub CLI 릴리스 생성](https://cli.github.com/manual/gh_release_create).
