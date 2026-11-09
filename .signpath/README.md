# SignPath 설정 원본

SignPath는 아티팩트 구성을 저장소가 아니라 SignPath 웹 화면에서 읽습니다. 이 폴더의 XML이 원본이며, 바꾸면 SignPath 프로젝트의 같은 이름(slug) 구성에도 그대로 붙여 넣습니다.

| 파일 | SignPath 아티팩트 구성 slug | 서명 대상 |
| --- | --- | --- |
| `artifact-configurations/binaries.xml` | `binaries` | `silolink-desktop.exe`, `silolink.exe` |
| `artifact-configurations/installer.xml` | `installer` | `SiloLink_<version>_x64-setup.exe` |

워크플로는 `version` 파라미터에 릴리스 버전을 넘기고, 모든 파일의 제품 이름(`SiloLink`)과 제품 버전이 일치해야 서명됩니다. 전체 절차는 [배포 문서](../docs/development/releasing.md#코드-서명)와 [코드 서명 정책](../CODE_SIGNING.md)을 참고합니다.
