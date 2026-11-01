# SiloLink

여러 프로젝트와 AI 도구에 흩어진 기록을 연결하고, 사용 맥락을 바탕으로 조사·학습·프로젝트 운영을 지원하는 CLI·플러그인·데스크톱 제품을 구상합니다.

현재는 제품 정의와 선행 조사를 정리한 단계입니다. PRD, 첫 구현 범위와 기술 스택은 아직 확정하지 않았습니다.

## 시작하기

| 문서 | 확인할 내용 |
| --- | --- |
| [제품 정의](docs/product/definition.md) | 인터뷰·제품 방향·초기 구상을 통합한 요구, 원칙, 남은 결정 |
| [유사 제품과 개발 가치](docs/research/alternatives.md) | 후보 8종, 비교 근거, 구현 가치와 검증 과제 |
| [CLI·플러그인 연동 조사](docs/research/cli-integration.md) | CLI·MCP 비교, AI CLI 연결, 설계 후보와 확인 범위 |
| [Basic Memory 분석](docs/research/basic-memory.md) | 사람·AI 공동 문서 관리와 실제로 비교할 지점 |

## 폴더 구성

```text
docs/
  product/
    definition.md
  research/
    alternatives.md
    cli-integration.md
    basic-memory.md
```

제품 요구는 제품 정의에서 관리하고, 외부 자료의 사실·주장·검증 한계는 조사 문서에 둡니다. 제안과 확정 사항을 구별하며, 인터뷰의 예시를 고정 사용 절차로 확대하지 않습니다.

2026-11-01 문서 정리에서 인계 메모·인터뷰·제품 방향의 중복을 통합하고, 인계용 프롬프트·HTML·매니페스트와 폐기된 권고의 별도 문서를 삭제했습니다. 정리 전 원문은 Git 이력에서 확인할 수 있습니다.
