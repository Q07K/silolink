# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)

This policy applies to the Windows release files of SiloLink published on [GitHub Releases](https://github.com/Q07K/silolink/releases):

- `SiloLink-Setup-<version>-windows-x64.exe` (the app installer) and the executables it installs: `silolink-desktop.exe` and `bin/silolink.exe`
- `silolink.exe` inside `SiloLink-Codex-Windows-<version>.zip`

Only files built from this repository's source code by the [Windows build and release workflow](.github/workflows/windows.yml) on GitHub-hosted runners are submitted for signing. Locally built files and files from other sources are never signed with this certificate.

## Team roles

- Committers and reviewers: [Q07K](https://github.com/Q07K)
- Approvers: [Q07K](https://github.com/Q07K)

Committers may change the source code directly. Every change proposed by anyone else (for example, a pull request) is reviewed by a committer before it is merged. Every signing request is approved manually by an approver; no release is signed automatically. All team members use multi-factor authentication for GitHub and SignPath.

## Build and signing process

1. A version tag (`v<version>`) on a reviewed commit starts the workflow. The workflow checks formatting, lints, tests, the installer and process branding before anything is signed.
2. The app and CLI executables are uploaded as a workflow artifact and submitted to SignPath. After approval, the signed executables are placed back into the build.
3. The installer is bundled again around the signed executables, then submitted to SignPath as a second request that needs its own approval.
4. The workflow verifies that the installer, the installed executables and the CLI carry a valid signature before it publishes the files and their SHA-256 checksums.

Every signed file carries the product name `SiloLink` and the release version, enforced by the SignPath artifact configurations in [`.signpath/`](.signpath/).

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

SiloLink stores project records and settings on the local computer. Information leaves the computer only through actions the user starts or turns on:

- **AI tools the user connects and runs.** When the user asks SiloLink to analyze records or chat, or turns on background analysis (off by default), SiloLink runs the user's own locally installed AI tool (for example, Codex or Claude Code) with the context the user selected. That tool sends the context to its provider under the provider's own terms and privacy policy, for example [OpenAI](https://openai.com/policies/privacy-policy/) and [Anthropic](https://www.anthropic.com/legal/privacy).
- **Fetching a web page.** When the user enters a public HTTPS address under "URL에서 원문 가져오기", SiloLink downloads that page to store it as a source.

SiloLink has no telemetry, analytics, or automatic update checks.

## Uninstallation

The installer registers an uninstaller in Windows **Settings → Apps**. Uninstalling removes the app files. Project documents and records the user stored in a chosen location are kept, as described in the [getting started guide](docs/user/getting-started.md).

---

## 한국어 요약

SiloLink의 Windows 배포 파일은 [SignPath Foundation](https://signpath.org)의 무료 오픈소스 코드 서명을 받습니다. 이 저장소의 소스로 GitHub 호스팅 러너에서 빌드한 파일만 서명하며, 서명할 때마다 승인자가 직접 승인합니다. 앱은 사용자가 요청하거나 켠 동작(연결한 AI 도구 실행, 입력한 URL의 원문 가져오기) 외에는 어떤 정보도 외부로 보내지 않습니다. 원격 측정이나 자동 업데이트 확인은 없습니다.
