# SiloLink logo assets

투명 배경 PNG 로고 4종입니다. 앱 아이콘은 사각형 바깥만 투명하며, 내부의 어두운 바탕은 유지합니다.

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| `silolink-logo-horizontal.png` | 2172 × 724 | 밝은 배경의 웹 헤더, 소개 페이지 |
| `silolink-symbol-blue.png` | 1254 × 1254 | 기본 심볼, 프로필, 버튼 |
| `silolink-symbol-black.png` | 1254 × 1254 | 밝은 배경의 단색 심볼 |
| `silolink-app-icon.png` | 1254 × 1254 | 앱 아이콘, 어두운 사각형 배경 포함 |

원하는 PNG를 서비스의 정적 파일 디렉터리에 복사해 사용합니다. 비율을 유지하고 CSS로 표시 크기를 조절하세요. 심볼 옆에 서비스명이 있으면 이미지의 대체 텍스트는 비워 중복 낭독을 피할 수 있습니다.

예시: 파일을 서비스의 `/branding/` 경로에 배치한 경우:

```html
<img src="/branding/silolink-logo-horizontal.png"
     alt="SiloLink" width="240" height="80" />
```

2026-11-02: 기존 시안을 내장 이미지 생성 도구로 분리했습니다. 원본 픽셀을 그대로 자른 결과가 아니라 참조 기반으로 분리한 래스터 이미지이므로 형태에 미세한 차이가 있습니다. SVG 원본은 포함하지 않습니다. PNG의 크기, 알파 채널과 투명 픽셀 존재를 확인했습니다.

생성에 사용한 프롬프트는 `generation-notes.md`에 기록했습니다.
