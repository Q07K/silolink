# Groundwork 유사 오픈소스·서비스 조사 — 상세 기록

- 기준일: 2026-11-01 (Asia/Seoul).
- 사용자 요청: 지금까지 논의한 제품과 유사한 오픈소스·서비스를 GitHub 등에서 조사.
- 기록 성격: 조사자의 검토 의견. 제품 채택·포크·신규 구현·레포 생성은 미확정.
- 비교 기준: 로컬 사람용 화면, 기존 코딩 CLI 실행, 외부 에이전트의 기록 저장/조회, 프로젝트 귀속, 리서치·브레인스토밍과 공유 문서.
- 판정 경계: 문서상 지원 확인과 실행 검증을 구분. 미확인은 기능 부재가 아님.

```report-json
{
  "id": "GROUNDWORK-SURVEY-2026-11-01",
  "title": "Groundwork 유사 오픈소스·서비스 조사",
  "date": "2026-11-01",
  "kind": "research",
  "scope": "GitHub 저장소와 공식 제품 자료를 바탕으로 주요 후보 8개 비교. 설치·성능·사용성 검증은 제외",
  "recordType": "recommendation",
  "dataMode": "actual",
  "judgment": "구상과 직접 겹치는 제품이 있습니다. The Vault·Basic Memory의 실제 부족한 점부터 확인할 것을 권고합니다",
  "reasons": [
    "The Vault는 앞서 제안한 공통 기록 코어·데스크톱·CLI·MCP와 프로젝트별 기억을 이미 공개 구현·배포 구조로 제시합니다. 완전히 새로운 구조라고 보기는 어렵습니다.",
    "Basic Memory는 양 도구용 플러그인까지 제공하고, Pieces·projectmem·Claude-Mem·Entire·Emdash·Open Notebook도 요구의 여러 부분을 다룹니다.",
    "Groundwork의 잠재적 차별점은 정형 조사·브레인스토밍을 근거와 검토 상태가 있는 공유 정리서로 만드는 경험입니다. 경쟁 제품에 없다고 검증된 기능이나 수요 검증 결과는 아닙니다."
  ],
  "nextActions": [
    "개발 판단 전 The Vault·Basic Memory에서 동일한 프로젝트 기록 저장→앱/편집기 조회→다른 에이전트 재사용 시나리오를 비교하는 방안을 제안합니다. 실행·설치는 이번 조사에 포함하지 않았습니다.",
    "기존 제품으로 충족되는 부분, 설정/확장으로 가능한 부분, 새 개발이 필요한 부분을 확인한 뒤 신규 구현·확장·조합 중 선택합니다. 채택·포크·서비스 출시 결정은 아직 없습니다."
  ],
  "issues": [
    {
      "state": "not_run",
      "topic": "지원 선언과 실제 작동의 차이",
      "detail": "기능은 저장소 README·공식 문서와 일부 배포/빌드 자료를 확인한 결과입니다. 설치·로그인·MCP 호출·취소·동시 저장·문서 보존·검색 품질을 직접 시험하지 않았습니다.",
      "action": "도입 후보를 실제 시나리오로 시험하기 전 완성도·안정성·시간 절약을 단정하지 않습니다."
    },
    {
      "state": "uncertain",
      "topic": "미확인 기능은 부재 판정이 아님",
      "detail": "조사 폼·브레인스토밍·HTML 정리서·양방향 자동 수집이 한 제품에서 모두 충족되는지는 확정하지 못했습니다. 검색 누락과 문서 변경 가능성도 있습니다.",
      "action": "아래 비교의 미확인을 기능 없음으로 읽지 않습니다. 제품 운영자 자료는 독립 실사용 평가와 구분합니다."
    },
    {
      "state": "exception",
      "topic": "저장 원문 보존과 프로젝트 오분류에 관한 실제 변경 이력",
      "detail": "The Vault v0.6.5 릴리스에는 저장 후 AI 요약 잘림과 관련 파일에 따른 프로젝트 오분류의 수정 이력이 있습니다. 현재 버전에서 같은 오류를 재현한 결과는 아닙니다. [S3]",
      "action": "후보 검증에서 원문 보존·정확한 프로젝트 귀속·검색 근거를 확인합니다."
    },
    {
      "state": "exception",
      "topic": "로컬 도구·서비스·라이선스 범위",
      "detail": "로컬 저장과 모델 추론의 외부 전송은 다릅니다. Pieces MCP는 Pro 표기이며 Basic Memory 루트는 AGPL-3.0입니다. 모든 공개 저장소를 같은 재사용 조건으로 보지 않습니다. [S4, S8]",
      "action": "채택 시 실제 버전·패키지·모델 제공자·요금 범위를 별도 확인합니다. 이번 조사에서 라이선스 의무의 법적 해석은 하지 않았습니다."
    }
  ],
  "sections": [
    {
      "title": "가장 가까운 세 후보를 먼저 볼 이유",
      "table": {
        "headers": [
          "후보",
          "비교할 핵심",
          "Groundwork 판단에 주는 의미"
        ],
        "rows": [
          [
            "The Vault [S1–S3]",
            "데스크톱·CLI·MCP·공통 코어, 결정·계획·인계·산출물, Windows 배포 기록",
            "전체 구성을 새로 만드는 가치가 어디인지 먼저 검증할 후보"
          ],
          [
            "Basic Memory [S4–S6]",
            "Markdown을 사람과 AI가 함께 사용하고 Codex·Claude Code용 플러그인으로 기록",
            "양방향 문서 관리 자체를 차별점으로 삼기 어려움"
          ],
          [
            "Emdash [S13–S14]",
            "기존 코딩 CLI를 데스크톱에서 실행·재개하고 프로젝트 작업을 관리",
            "실행 환경 전체를 새로 만들지, 문서 작업 흐름에 집중할지 판단할 참고점"
          ]
        ]
      }
    },
    {
      "title": "주요 후보 8개 비교 — 문서상 지원",
      "table": {
        "headers": [
          "후보",
          "가까운 영역",
          "확인한 내용",
          "중요 차이·미확인"
        ],
        "rows": [
          [
            "The Vault",
            "전체 구조가 가장 가까움",
            "공통 코어·Electron 데스크톱·CLI·MCP, 프로젝트별 결정·계획·인계·산출물, Codex·Claude 연결 [S1–S3]",
            "정형 조사 폼→검토→공유 정리서 경험은 미확인. 설치·보존·연동 실사용 검증 필요"
          ],
          [
            "Basic Memory",
            "문서와 AI의 양방향 재사용에 가까움",
            "로컬 Markdown·프로젝트·검색·CLI·MCP, Obsidian과 같은 파일 사용, 양 도구용 플러그인 [S4–S6]",
            "전용 코딩 CLI 실행 데스크톱은 확인 못함. 기록 구조와 플러그인 사례가 주요 참고점"
          ],
          [
            "Pieces",
            "사용 경험이 가까운 서비스",
            "데스크톱의 작업 타임라인·검색·산출물 생성, 여러 AI 도구에 MCP 연결 [S7–S9]",
            "화면·작업 회상 중심. 저장소별 산출물 경계·자체 CLI와 실행 통합은 별도 확인; MCP는 Pro 표기"
          ],
          [
            "projectmem",
            "프로젝트 연결과 개발 기록에 가까움",
            "프로젝트 초기화·이슈/시도/수정/결정 이벤트·계획 파일·MCP·프로젝트별/통합 대시보드 [S10]",
            "로컬 웹·정적 대시보드 중심. 기존 기록 일괄 가져오기는 README에서 향후 기능으로 구분"
          ],
          [
            "Claude-Mem",
            "세션 자동 기록과 다음 작업의 회상에 가까움",
            "훅 기반 관찰·요약·검색·세션 간 문맥 전달, 로컬 웹 뷰어·My Work, 다중 에이전트 지원 [S11]",
            "사람이 편집하는 조사 정리서보다 에이전트 기억 중심. 추론 제공자와 선택적 클라우드 구성을 확인해야 함"
          ],
          [
            "Entire CLI",
            "개발 세션과 코드 변경의 근거 추적에 가까움",
            "Git 커밋과 연결한 세션 체크포인트, 여러 코딩 에이전트·플러그인, 프로젝트 메모리와 서비스 기능 [S12]",
            "자유로운 리서치·브레인스토밍 문서 관리와는 중심이 다름. 로컬 CLI와 호스팅 서비스 범위 구분 필요"
          ],
          [
            "Emdash",
            "데스크톱에서 코딩 CLI를 실행하는 쪽에 가까움",
            "Claude Code·Codex 등 CLI 실행, 프로젝트/워크트리별 작업, 프롬프트·스킬·MCP 라이브러리 [S13–S14]",
            "외부에서 만든 기록을 공통 지식 저장소에 쓰고 재사용하는 기능은 확인 못함"
          ],
          [
            "Open Notebook + MCP",
            "자료 기반 조사·노트·외부 AI 접근에 가까움",
            "자료·노트북·대화·검색을 로컬 서비스에서 관리, 별도 팀의 MCP 서버로 노트·자료·대화 접근 [S15–S17]",
            "코딩 프로젝트 등록과 CLI 세션 수집이 주된 범위인지는 확인 못함. MCP는 별도 패키지"
          ]
        ]
      }
    },
    {
      "title": "사용자가 말한 두 방향을 나눠 비교",
      "table": {
        "headers": [
          "후보",
          "화면에서 작업·기록 관리",
          "외부 에이전트가 기록 이용",
          "프로젝트 단위",
          "한계"
        ],
        "rows": [
          [
            "The Vault",
            "데스크톱·작업 런타임 설명",
            "자체 CLI·MCP·도구별 가이드",
            "프로젝트·인계·결정",
            "모든 코딩 CLI가 앱 안에서 같은 방식으로 실행되는지는 미검증"
          ],
          [
            "Basic Memory",
            "Obsidian/편집기·클라우드 UI, 로컬 파일",
            "CLI·MCP·도구별 플러그인",
            "프로젝트·저장소/브랜치 근거",
            "전용 CLI 실행 데스크톱은 미확인"
          ],
          [
            "Pieces",
            "데스크톱 회상·문서성 결과 생성",
            "MCP·Codex 연결 가이드",
            "주제/작업 단위 설명",
            "저장소별 명시적 프로젝트 경계는 미확인"
          ],
          [
            "projectmem",
            "프로젝트별·통합 로컬 대시보드",
            "CLI·MCP·초기화와 프로젝트 라우팅",
            "저장소별 원문 + 통합 조회",
            "브레인스토밍 에디터·공유 정리서 경험은 미확인"
          ],
          [
            "Claude-Mem",
            "로컬 My Work·세션 뷰어",
            "훅·플러그인·검색 도구",
            "프로젝트 이력·세션",
            "검토된 문서와 자동 관찰의 사용성 차이를 확인해야 함"
          ],
          [
            "Entire CLI",
            "서비스/CLI의 변경·세션 조회",
            "에이전트 연동·Git 훅·플러그인",
            "저장소·커밋·서비스 프로젝트",
            "범용 리서치 문서 폼은 미확인"
          ],
          [
            "Emdash",
            "데스크톱에서 코딩 CLI 직접 사용",
            "외부 지식 기록 저장소로의 접근은 미확인",
            "프로젝트·워크트리·작업",
            "MCP 라이브러리 관리와 자체 기록 MCP 제공을 구분"
          ],
          [
            "Open Notebook",
            "자료·노트·대화용 로컬 웹 서비스",
            "별도 open-notebook-mcp로 자료/노트/대화 접근",
            "노트북",
            "코딩 프로젝트·에이전트 세션과의 자동 연결은 미확인"
          ]
        ]
      },
      "note": "이 표는 출처별 지원 설명을 같은 기준으로 재구성한 것입니다. 기능을 직접 실행해 통과 여부를 표시한 시험표가 아닙니다."
    },
    {
      "title": "확인한 배포·패키지 정보",
      "bullets": [
        "The Vault: package.json에 core·cli·mcp-server·desktop 빌드가 분리돼 있고 저장소와 릴리스에서 v0.6.7을 확인했습니다. 릴리스에는 번들 MCP 런타임 포함이 명시돼 있습니다. 설치 파일 실행·내부 테스트 재현은 하지 않았습니다. [S2–S3]",
        "Basic Memory: 공식 저장소에 Claude Code와 Codex 플러그인 README가 각각 있습니다. 세션 인계·결정 기록·프로젝트 매핑을 설명하며 두 도구의 동작이 완전히 같다는 의미는 아닙니다. [S5–S6]",
        "Open Notebook MCP: 주 제품에 단순 내장된 것으로 가정하지 않았습니다. 공식 문서가 연결하는 Epochal-dev의 별도 서버 저장소까지 확인했습니다. [S16–S17]"
      ]
    },
    {
      "title": "라이선스·서비스 구분 — 확인 시점의 표시",
      "table": {
        "headers": [
          "후보",
          "저장소/제품에 표시된 구분"
        ],
        "rows": [
          [
            "The Vault",
            "MIT [S1–S2]"
          ],
          [
            "Basic Memory",
            "루트 AGPL-3.0. 구성 요소별 조건은 실제 채택 버전에서 확인 [S4]"
          ],
          [
            "Pieces",
            "서비스 제품. MCP는 Pro 포함으로 표시. 전체 앱의 오픈소스 재사용 대상으로 판단하지 않음 [S8]"
          ],
          [
            "projectmem",
            "MIT [S10]"
          ],
          [
            "Claude-Mem",
            "현재 루트 Apache-2.0. 별도 클라우드/관찰자 옵션 구분 [S11]"
          ],
          [
            "Entire CLI",
            "CLI는 MIT. CLI와 호스팅 서비스는 범위를 구분 [S12]"
          ],
          [
            "Emdash",
            "Apache-2.0 [S13]"
          ],
          [
            "Open Notebook",
            "주 제품과 확인한 별도 MCP 서버는 각각 MIT 표시 [S15, S17]"
          ]
        ]
      },
      "note": "현재 저장소 표시의 사실 기록입니다. 과거 버전·의존성·상표·서비스 약관까지 같은 조건이라는 뜻이 아니며 도입의 법적 검토를 대신하지 않습니다."
    },
    {
      "title": "Groundwork에 남는 차별화 후보 — 조사자의 추론",
      "bullets": [
        "리서치 질문·환경·비교 기준을 입력하고, 출처·실험·미확인 사항을 갖춘 기술 정리서까지 완성하는 흐름.",
        "브레인스토밍의 제안, 실제 결정, 구현 결과, 검증 결과를 연결하면서 각각의 상태와 원문을 보존하는 편집 경험.",
        "어느 도구에서 만들었든 같은 프로젝트 기록으로 묶고, 다음 세션과 사람이 읽는 공유 문서 양쪽에 재사용하는 적은 설정 부담.",
        "한글 기술 정리서와 현재 선호한 판단→이유→다음 조치 구성을 쉽게 적용하는 기능. 언어 지원 자체가 경쟁 제품에 없다는 주장은 아님."
      ],
      "note": "차별화 후보는 사용자 구상에 대한 가설입니다. 경쟁 제품의 부재·구매 의향·제품 시장 적합성을 검증한 결과가 아닙니다."
    },
    {
      "title": "개발 전 비교할 실제 시나리오 제안",
      "bullets": [
        "테스트용 프로젝트 하나에 기존 조사 2건·결정 1건을 등록하고 Claude Code에서 찾아 다음 조사에 활용합니다. 이 숫자는 제안하는 시험 입력이며 실제 수행 수치가 아닙니다.",
        "새 아이디어·결정·출처를 저장한 후 다른 Codex 세션과 사람용 화면에서 같은 원문과 귀속 프로젝트를 확인합니다.",
        "기존 문서와 연결해 미확인 사항을 보존한 공유용 정리서를 내보내고, 앱을 닫아도 CLI 기록 조회가 되는지 확인합니다.",
        "누락·중복·프로젝트 오분류·원문 손실·추가 설정 부담을 기록하고, 제품 설정·확장으로 해소되는지 확인한 뒤 새 개발 범위를 정합니다."
      ]
    }
  ],
  "supporting": [
    {
      "title": "보고서 검증 결과와 화면 확인 실패",
      "paragraphs": [
        "생성 HTML과 동일 원문의 재생성 결과 일치, 원문 SHA-256, 후보 비교표 두 개의 각 8행, 참조 링크와 로컬 파일 존재, 제안·미실행 표기를 자동 확인했습니다.",
        "Chrome headless로 데스크톱 캡처를 시도했으나 이미지 파일이 생성되지 않았습니다. 새 보고서의 화면·모바일·인쇄 상태를 확인했다고 보고하지 않습니다. 이 실패는 제품 설치·실사용 검증 결과가 아닙니다. 기존 보고서 템플릿은 변경하지 않았습니다."
      ]
    },
    {
      "title": "조사 방법과 범위",
      "paragraphs": [
        "2026-11-01 Asia/Seoul 기준 공개 웹 검색으로 후보를 찾고 GitHub 원 저장소·공식 제품 문서·일부 릴리스와 빌드 구성을 열어 확인했습니다. 검색 축은 로컬 데스크톱/CLI/MCP 프로젝트 메모리, 코딩 에이전트 기록, 자료 기반 리서치입니다.",
        "비교 대상은 사용자 구상과 연결되는 8개 주요 후보입니다. 모든 유사 제품을 망라하지 않았고 검색 순위나 스타 수로 품질·수요를 판정하지 않았습니다. 커뮤니티 비교표·수익·토큰 절감·공급자 자체 성능 수치는 독립 검증 결과로 옮기지 않았습니다.",
        "일부 The Vault raw 파일·packages 목록·master-plan-status 문서는 도구에서 가져오지 못했습니다. 대신 읽을 수 있었던 README·루트 빌드 파일·릴리스 기록으로 확인 범위를 한정했습니다. 이 저장소의 전면 코드 감사는 수행하지 않았습니다."
      ]
    },
    {
      "title": "수행하지 않은 일",
      "bullets": [
        "레포 복제·설치·로그인·유료 가입·실제 문서 업로드·전역 설정 변경·앱 구현.",
        "도구별 호환성·수집 완전성·검색 정확도·장기 유지보수·사용성·보안의 실행 검증.",
        "Groundwork 이름의 상표·도메인·패키지 충돌 조사. 이름은 가칭으로 사용."
      ]
    }
  ],
  "references": [
    {
      "label": "S1 The Vault 저장소·README",
      "url": "https://github.com/aliihsaad/the-vault"
    },
    {
      "label": "S2 The Vault 빌드 구성",
      "url": "https://github.com/aliihsaad/the-vault/blob/main/package.json"
    },
    {
      "label": "S3 The Vault 릴리스 기록",
      "url": "https://github.com/aliihsaad/the-vault/releases"
    },
    {
      "label": "S4 Basic Memory 저장소·README",
      "url": "https://github.com/basicmachines-co/basic-memory"
    },
    {
      "label": "S5 Basic Memory Claude Code 플러그인",
      "url": "https://github.com/basicmachines-co/basic-memory/blob/main/plugins/claude-code/README.md"
    },
    {
      "label": "S6 Basic Memory Codex 플러그인",
      "url": "https://github.com/basicmachines-co/basic-memory/blob/main/plugins/codex/README.md"
    },
    {
      "label": "S7 Pieces 데스크톱 제품 설명",
      "url": "https://pieces.app/"
    },
    {
      "label": "S8 Pieces MCP",
      "url": "https://pieces.app/mcp"
    },
    {
      "label": "S9 Pieces Codex 연결 가이드",
      "url": "https://docs.pieces.app/products/mcp/openai-codex-cli"
    },
    {
      "label": "S10 projectmem 저장소·README",
      "url": "https://github.com/riponcm/projectmem"
    },
    {
      "label": "S11 Claude-Mem 저장소·README",
      "url": "https://github.com/thedotmack/claude-mem"
    },
    {
      "label": "S12 Entire CLI 저장소·README",
      "url": "https://github.com/entireio/cli"
    },
    {
      "label": "S13 Emdash 저장소·README",
      "url": "https://github.com/generalaction/emdash"
    },
    {
      "label": "S14 Emdash 공식 기능·플랫폼 문서",
      "url": "https://emdash.com/docs"
    },
    {
      "label": "S15 Open Notebook 저장소·README",
      "url": "https://github.com/lfnovo/open-notebook"
    },
    {
      "label": "S16 Open Notebook 공식 MCP 연결 문서",
      "url": "https://github.com/lfnovo/open-notebook/blob/main/docs/5-CONFIGURATION/mcp-integration.md"
    },
    {
      "label": "S17 Open Notebook 외부 MCP 연결 서버",
      "url": "https://github.com/Epochal-dev/open-notebook-mcp"
    },
    {
      "label": "기존 양방향 구상",
      "path": "docs/reports/2026-11-01-project-records-platform.md"
    },
    {
      "label": "프로젝트 인계 메모",
      "path": "docs/handoffs/local-research-app.md"
    }
  ]
}
```

## 근거 바로가기

- [S1 The Vault 저장소·README](https://github.com/aliihsaad/the-vault)
- [S2 The Vault 빌드 구성](https://github.com/aliihsaad/the-vault/blob/main/package.json)
- [S3 The Vault 릴리스 기록](https://github.com/aliihsaad/the-vault/releases)
- [S4 Basic Memory 저장소·README](https://github.com/basicmachines-co/basic-memory)
- [S5 Basic Memory Claude Code 플러그인](https://github.com/basicmachines-co/basic-memory/blob/main/plugins/claude-code/README.md)
- [S6 Basic Memory Codex 플러그인](https://github.com/basicmachines-co/basic-memory/blob/main/plugins/codex/README.md)
- [S7 Pieces 데스크톱 제품 설명](https://pieces.app/)
- [S8 Pieces MCP](https://pieces.app/mcp)
- [S9 Pieces Codex 연결 가이드](https://docs.pieces.app/products/mcp/openai-codex-cli)
- [S10 projectmem 저장소·README](https://github.com/riponcm/projectmem)
- [S11 Claude-Mem 저장소·README](https://github.com/thedotmack/claude-mem)
- [S12 Entire CLI 저장소·README](https://github.com/entireio/cli)
- [S13 Emdash 저장소·README](https://github.com/generalaction/emdash)
- [S14 Emdash 공식 기능·플랫폼 문서](https://emdash.com/docs)
- [S15 Open Notebook 저장소·README](https://github.com/lfnovo/open-notebook)
- [S16 Open Notebook 공식 MCP 연결 문서](https://github.com/lfnovo/open-notebook/blob/main/docs/5-CONFIGURATION/mcp-integration.md)
- [S17 Open Notebook 외부 MCP 연결 서버](https://github.com/Epochal-dev/open-notebook-mcp)

