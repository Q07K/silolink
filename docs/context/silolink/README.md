# SiloLink 프로젝트 인계 패키지

기준일: 2026-11-01 (Asia/Seoul). 이전 대화를 전달하기 위한 문서 묶음이다. 제품 구현이나 새 레포를 생성한 결과가 아니다.

## 새 프로젝트에 옮기는 방법

1. 사용자가 기존 폴더별 권한·SSH 구성에 맞춰 SiloLink 레포와 작업 폴더를 준비한다.
2. 이 폴더 전체를 새 레포의 `docs/context/silolink/`에 복사한다. 하위 `sources/`도 함께 옮긴다.
3. 새 프로젝트에서 채팅을 열고 [PROMPT.md](PROMPT.md)의 시작 문구를 전달한다.
4. 먼저 [CONTEXT.md](CONTEXT.md)를 읽고, 비교가 필요할 때 [RESEARCH.md](RESEARCH.md)와 원문을 읽는다.

[사람용 인계 요약](overview.html) · [인계 요약 원문](overview.md)

## 무엇을 읽으면 되는가

| 파일 | 역할 |
| --- | --- |
| [CONTEXT.md](CONTEXT.md) | 이름·사용자 의도·확인 사실·제안·미정 사항·다음 작업 |
| [RESEARCH.md](RESEARCH.md) | 유사 제품 8종과 비교의 한계·공식 출처 |
| [PROMPT.md](PROMPT.md) | 새 채팅에 복사할 시작 문구 |
| [sources/README.md](sources/README.md) | 원문 스냅샷 목록과 읽는 방법 |
| manifest.json | 원문 스냅샷의 원래 위치와 SHA-256. 포장 시 생성 |

## 적용 범위

- 제품명은 **SiloLink(사일로링크)**로 사용자 확인을 받았다. 이전 Groundwork·Research Desk는 같은 구상의 과거 이름이다.
- 레포 생성·원격 설정·SSH 설정·제품 구현은 이번 작업에서 수행하지 않는다.
- 새 레포의 실제 소유자·공개 범위·원격 URL·로컬 위치는 사용자가 관리한다. 레포 표기 `silolink`는 권고이며 원격 생성 확인이 아니다.
- 이 패키지는 제품 맥락 자료다. 기존 test2의 AGENTS.md·보고서 의무·전역 설정을 새 프로젝트 지침으로 자동 적용하지 않는다.
- 새 프로젝트에서는 그 프로젝트의 기존 지침을 확인하고 필요한 협업 규칙을 별도로 정한다.

