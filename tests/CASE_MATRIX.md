# 네이티브 CLI·데스크톱 검증 사례

## PRD v0.2 단계 1 · 감지 기반 — 2026-11-08

[계획](../docs/superpowers/plans/2026-11-08-stage1-detection.md). 로컬 결정적 계산만 쓰며 외부 AI 호출과 기본값 변경은 없다.

| 요구 | 검증 | 결과 |
| --- | --- | --- |
| R11-B 요청 단계 분류 | `detection.rs` `classifies_stages`, `explore_stage_is_excluded` | 실행·탐색·진단·검증·기타를 첫 일치 규칙으로 분류. 탐색 단계 요청은 후보에서 빠지고 단계 집계에만 남음 |
| R11-B 표현 신호 | `phrase_and_area_signals`, `specific_request_is_not_candidate`, `english_area_only_request` | “UI/UX 잘 적용해서 작업해줘”는 ‘잘 적용’과 영역만 지정 두 신호(근거 ‘추정’). 숫자·백틱·파일명이 있으면 영역만 지정으로 보지 않음. “optimize it”도 영역만 지정. 영어 영역어는 낱말 단위로만 찾아 “build it”·“linux”·“구조체”는 제외(`area_words_match_whole_words`). 다시 보낸 요청만 있는 후보는 요약 화면의 비율에서 빼고 반복한 요청에서 셈(`resent_requests_stay_out_of_the_vague_share`) |
| R02-E·R11-B 대화 결과 신호 | `clarification_signal_from_reply`, `correction_and_retry_signals`, `offer_after_long_reply_is_not_clarification`, `injected_records_are_skipped_between_turns`, `signals_stay_inside_one_session` | AI 답이 질문으로 끝나고 그 문장에 되묻는 말이 있을 때·‘그거 말고’ 정정·답 뒤의 비슷한(같지 않은) 재요청을 원문과 함께 앞 요청에 붙이고 ‘기록에서 확인’으로 표시. 길이와 관계없이 ‘원하시면 … 드릴까요?’ 같은 제안, 코드 속 `?`, 질문에 대한 ‘아니요’, 같은 명령 반복, 도구가 끼워 넣은 메시지, 다른 세션, 시각 없는 기록은 제외. Codex 한 턴의 같은 시각 기록은 요청을 먼저, 답은 final_answer를 기준으로 연결(`codex_turn_order_ties_put_the_request_first`, `short_conditional_offer_is_not_clarification`, `question_marks_in_code_are_ignored`, `question_quote_keeps_file_names`, `declining_an_offer_is_not_a_correction`, `repeated_identical_commands_are_not_retries`, `records_without_time_are_not_linked`) |
| R11-H 일부러 넓게 맡김 | `intentional_marks_exclude`, `native_desktop.rs` `request_marks_persist_and_toggle`, `insight.rs` `mark_request_mutation_is_stored_and_feeds_detection`, `detection.test.tsx` | 화면의 ‘일부러 넓게 맡김’ 표시와 요청 안의 #넓게·#탐색을 후보에서 빼고 개수만 보임. 재시작 후 유지, 표시 해제 가능 |
| R11-B 위임 표현 사전 | `removed_phrase_no_longer_matches`, `delegation_phrases_are_validated`, `settings-navigation.test.tsx` | 설정 ‘요청 감지’에서 기본 표현을 빼고 내 표현을 추가. 1~40자, 목록당 100개, 앞뒤 공백·중복 정리. 기본 목록은 Rust 상수 하나를 스냅숏으로 전달 |
| 5절 근거 표시 4종 | `components.test.tsx`, `cycle.test.tsx` | 기록에서 확인·추정·모호·미확인을 같은 배지로 표시. 발견의 해석 라벨을 ‘추정’으로 통일 |
| 화면 | `detection.test.tsx` | 사용 분석 ‘넓게 맡긴 요청 N’ 탭: 단계 집계, 후보별 단계·근거·신호(대화 결과 먼저)·판단 이유·인용, 빈 상태 안내. 요약 화면의 ‘기준 없이 맡긴 요청’도 같은 후보를 씀 |
| 남은 범위 | — | 실제 사용자 기록에서의 감지 품질, 대화 중 감지(단계 4), 용어집·알림(단계 2)은 미검증·미구현. `design_preview.py`는 탭 이름을 갱신했으나 Python 환경이 없어 이번에 실행하지 않음 |

## 설정 사이드바·HTML 디자인 시스템 검토판 — 2026-11-06

| 요구 | 검증과 결과 |
| --- | --- |
| 설정 진입 시 사이드바 교체, 작업 화면 복귀 | `settings-navigation.test.tsx`에서 기존 작업 메뉴가 남아 실패하는 경우 2개 재현 후 통과. 본문 중복 메뉴·로고 부제 제거, 펼침/접힘에서 이전 화면·탭·프로젝트 유지 확인 |
| 설정 분류 간 초안·저장 유지 | `navigation.test.tsx`의 저장 payload 단언 유지. `native_smoke.py` 실제 설정 저장·재실행 포함 12개 통과, `.tools/desktop-smoke/9892de5a-f310-4992-9312-ad2b9580e349/` |
| 주석을 달 수 있는 독립 HTML 검토판 | `design_preview.py`에서 앱↔검토판 링크, 키보드 탭, 테마, 예시 입력/저장, 설정 사이드바 전환·접기·툴팁, 목록 상세와 좁은 화면 검증. `.tools/design-preview/5c3b3522-b351-48fd-be7b-b555e0b8c49f/`, 오류 없음 |

최종 프런트엔드 테스트 61개와 TypeScript/Vite 빌드 통과. 설정 분류의 선택 표시는 탐색으로 이동하면서 `aria-pressed` 대신 `aria-current=page`를 검증한다. 기존 앱 검증의 메뉴 이동은 설정에서 ‘작업 공간으로’로 돌아온 뒤 이어간다. 설정 저장·프로젝트 범위·재실행 단언은 유지했다. HTML 예시는 검토 전용이며 실제 저장·실행을 호출하지 않는다.

## 변경안 작성 폼의 공통 기준 적용 누락 수정 — 2026-11-06

| 요구 | 검증 | 결과 |
| --- | --- | --- |
| 인라인 레이블로 붙은 입력 영역 | `design-system.test.tsx`, `design_preview.py` | 수정 전 이름 있는 작성 폼·공통 필드 부재로 2개 사례 실패. Field/폼 스택으로 레이블-입력 8px, 항목 사이 24px를 실제 브라우저 좌표로 확인 |
| 검토 버튼의 왼쪽 배치 | 같은 테스트 | 일반/JSON 검토와 실제 반영을 공통 Actions 하단 오른쪽으로 배치. 기본 작성 버튼의 우측 좌표 일치 확인 |
| 기존 작성·검토 동작 유지 | 같은 테스트, `native_smoke.py` | 문서 선택·불러오기·편집, 새 문서·목록 추가, JSON 입력 유지. 원문 revision과 변경 본문을 검토 명령에 전달하며 편집 후 이전 검토 결과는 제거됨. 실제 앱의 반영·원문 충돌 보존·바이트 단위 복구 통과 |

실행: 프런트엔드 테스트 59개 통과(기존 57개 유지), TypeScript/Vite 빌드와 격리 식별자의 Windows 앱 빌드 통과. 밝음/어두움 작성·본문 편집·JSON 캡처는 `.tools/design-preview/6830507a-1be0-4980-933e-0185cd1d71d7/`, 실제 앱 12개 흐름·오류 없음 결과는 `.tools/desktop-smoke/68d5d4c5-f968-446c-8724-265e758c8aa1/`에 저장했다. 미리보기는 기존처럼 쓰기를 거절하며 실제 파일 변경은 격리된 네이티브 검증 폴더에서 확인했다. 기존 검증 단언·사례는 제거하거나 완화하지 않았다.

## 공통 디자인 시스템·메뉴 경로 보정 — 2026-11-06

| 요구 | 변경과 검증 | 결과 |
| --- | --- | --- |
| 모든 화면의 상위가 요약으로 표시됨 | `design-system.test.tsx`, `App.tsx` | 수정 전 요약 버튼 잔류로 실패 재현. 실제 메뉴 그룹·현재 메뉴를 표시하고 그룹 시작 화면으로 이동. 설정은 단독 경로. 문서 읽기의 목록 복귀는 기존 브라우저 사례 유지 |
| 상단·다른 화면의 글자 크기 불일치 | `tokens.css`, `app.css`, `design_preview.py` | 메뉴·경로 상위/현재·프로젝트 선택·버튼 14px, 화면 제목 28px를 실제 computed style로 확인 |
| 간격·크기의 공통 기준 | 같은 CSS, `docs/design/desktop.md` | 사용자가 지정한 8px 눈금: 8·16·24·32·40·48·64. 기본 조작 40px, 탭 44px, 패널 24px. 체크박스 첫 줄의 4px 정렬 보정은 레이아웃 간격과 구별 |
| 반응형·테마·접기 유지 | `design_preview.py` | 밝음/어두움 전체 메뉴, 1448·1040·960px 창과 접힌 메뉴의 글자·좌우 여백·가로 넘침 검증 |

실행: `npm test` 57개 통과(기존 56개 유지), `npm run build` 통과. 새 경로 계약에 따라 기존 `review11.test.tsx`의 프로젝트→홈 복귀는 실제 ‘요약’ 메뉴를 사용하고, 브라우저의 대화→홈 경로 조작은 ‘내 작업’을 사용하도록 변경했다. 프로젝트 선택·문서 목록 복귀·원문 ID·쓰기 거절 등 기존 단언은 유지한다. 최종 브라우저 결과는 `.tools/design-preview/08372acd-5296-4ca4-9ace-b60f6bbfaef5/`에 저장했다(오류 없음). 주요 페이지·패널·제목·탭·폼·목록의 실제 padding/margin/gap이 8의 배수인지도 확인했다. 이번 검증은 실제 브라우저의 공유 React 화면이며 네이티브 바이너리 재빌드·IPC 전체 흐름은 이번 변경에서 재실행하지 않았다.

## 1.2차 디자인 코멘트 반영 — 2026-11-06

| 코멘트 | 변경과 검증 | 결과 |
| --- | --- | --- |
| 1·2 툴팁 잔류·접기 아이콘 | `review12.test.tsx`, `design_preview.py` | 포커스 후 클릭에도 툴팁이 닫히고 마우스 이탈 시 제거됨. 접기는 사이드바 내부 조작 행의 40px 버튼으로 배치하고 영역 내 위치 확인 |
| 3·4 대화 정렬·알림 위치 | 같은 검사 | 대화와 제목의 왼쪽 좌표 일치. 알림은 벨 아래의 헤더 팝오버, 열기 전후 본문 좌표 동일. Escape·바깥 클릭으로 닫고 Escape 시 벨 포커스 복원 |
| 5–8 홈 제목·불명확한 분석 영역 | UI 회귀·브라우저 | 전체 프로젝트 h1과 공통 섹션 제목 사용. 반복 요청·표현 후보 분석은 사용 분석에서 유지하고 홈의 중복 분석 행은 제거. 프로젝트·작업·실제 현황 경로 보존 |
| 9·21 주요 버튼 위치 | UI 회귀·브라우저 | 계획 작성·학습 저장·조사 저장·설정·연결·회고·내보내기에 공통 Actions 사용. 하단 오른쪽 정렬, 주요 행동을 마지막에 배치. 실제 계획/학습 저장 버튼의 오른쪽 좌표 검사 |
| 10–13 탭 접근 | UI 회귀·브라우저·실제 앱 | 공통 tablist/tab/tabpanel, aria-selected/controls/labelledby, roving tabindex, 좌우·Home·End 이동. 작업·회고·문서·분석·조사·프로젝트 탭의 44px 이상 높이와 키보드 선택 확인 |
| 14–20 조사·학습의 과도한 초기 정보 | 같은 검사 | 조사 자료/노트 분리, 상세 선택 후 열기, 학습 목록→추가→작성/취소. 내보내기는 요청 시 열고 화면의 노트 종류로 제한. 원문 확인 상태·실제 저장·학습 적용·종류별 노트 ID는 보존 |

처음 새 회귀 5건에서 클릭 후 남은 툴팁, 내부 접기/팝오버·공통 탭·제목·학습의 단계별 노출 부재를 확인했다. 수정 뒤 `desktop`의 `npm test` **56건 통과**(기존 51건 유지), TypeScript/Vite·별도 `io.silolink.designchecks` 네이티브 빌드 통과. 최종 Edge 화면·키보드·정렬·정보 노출 검사는 `.tools/design-preview/e5447a13-1723-4ef0-90be-221b1ea76520/`, 실제 앱의 12개 흐름·JavaScript 오류 0건은 `.tools/desktop-smoke/9bded535-f851-48b5-b28b-d2259ca967c6/`에 있다.

기존 탭 검사의 역할을 button에서 tab으로, 홈 제목은 전체 프로젝트로 바꿨다. 접기는 사용자가 거부한 경계 배치 대신 내부 조작 행으로 검사한다. 학습 작성과 노트 내보내기는 먼저 여는 동작을 추가하고, 학습·조사 필드명을 사용자용 문구로 맞췄다. 데이터 귀속·입력 내용·원문 상태·선택 ID·저장·수집·복구의 기존 단언은 유지했다. WAI-ARIA 탭 패턴과 NN/g의 일관성·정보 최소화 원칙을 참고했으며, 이 검사를 전체 WCAG 인증 또는 사용자 사용성 평가로 확대하지 않는다.

## 1.1차 디자인 코멘트 반영 — 2026-11-06

| 코멘트 | 변경과 검증 | 결과 |
| --- | --- | --- |
| 1·4 장식적인 시작 화면·중복 제목 | `review11.test.tsx`, `design_preview.py` | 큰 네이비 안내·단계 카드·반복 제목 제거. 짧은 연결 안내→실제 연결, 프로젝트 표→선택 프로젝트 진입. 홈의 실제 집계와 미완료 작업 동작 유지 |
| 2 접기 위치 | 같은 UI 회귀와 실제 브라우저/앱 | 접기 버튼을 사이드바 상단 경계로 이동. 기존 72px 접기·툴팁·포커스·범위 보존 유지 |
| 3 경로가 작동하지 않음 | 같은 검사 | 다른 메뉴→상단 요약 버튼→홈, 문서 읽기→상위 기록·문서→목록 왕복. 이동할 목적지가 없는 메뉴 그룹 표시는 제거 |
| 5·6 새 대화 중복·과도한 강조 | `review11.test.tsx`, 기존 페르소나·앱 검사 | 전역 상단·사이드바 새 대화 제거. 사이드바 대화 메뉴로 진입하고 대화 화면 안에서만 새로 시작. 기존 기록 열기·긴 제목 저장·실패 재시도 동작 보존 |
| 7 대화 사용 순서 불명확 | UI 회귀, 브라우저, 실제 앱 | 질문·도구 선택을 우선 표시하고 자료 선택은 접어 둠. 예시 문서 요약 질문과 문서를 채운 뒤 명시적 전송, 실제 리비전/본문 연결·이전 대화·도구 전환·실패·취소·자식 종료·노트 저장 통과 |

새 사례 4건의 프로젝트 표·경계 접기·빈 안내·질문 예시 부재 실패를 확인하고 구현했다. `desktop`의 `npm test` **51건 통과**(기존 47건 유지), TypeScript/Vite 빌드와 별도 앱 ID의 네이티브 빌드 통과. 최종 브라우저 결과는 `.tools/design-preview/8b939471-e8a9-49d4-8ef0-2a868fefb230/`, 실제 Windows 앱의 12개 흐름·JavaScript 오류 0건 결과는 `.tools/desktop-smoke/a2f539f7-cd55-4336-b73b-500fa88b928f/`에 있다.

기존 테스트의 첫 사용/대화/홈 제목은 이번 문구·중복 제목 제거 요구에 맞췄다. 새 대화의 전역 버튼으로 진입하던 검사는 대화 메뉴로, 프로젝트 선택 검사는 명시적으로 자료 선택을 연 뒤 확인하도록 이동했다. 연결·자료 범위·요청 본문·저장·실패·취소의 기존 기대는 유지했다. 홈의 시각적 위치 검사는 제거한 소개 제목 대신 실제 프로젝트 표를 확인한다. 네이티브 명령·데이터 정책·의존성은 변경하지 않았으며 실제 모델 응답 품질·설치 업데이트는 검증 범위가 아니다.

## 1차 디자인 코멘트 반영 — 2026-11-05

| 사용자 코멘트 | 변경과 검증 | 결과 |
| --- | --- | --- |
| 1·2 상단 안내의 역할 불명확·현재 위치를 최상단으로 | `navigation.test.tsx`, `design_preview.py`, `native_smoke.py` | 장식 안내 제거, 현재 위치·프로젝트·알림·새로고침을 64px 상단에 통합. 실제 작업 중 표시 유지 |
| 3 접기·아이콘·호버 제목 | 같은 검사 | 72px 접기/펼치기, 메뉴와 프로젝트 범위 유지. 포털 툴팁이 스크롤에 잘리지 않고 호버·포커스로 열림, Escape로 닫힘. 두 테마·1320/1040/960 창의 실제 앱 검사 통과 |
| 4 설정 아이콘과 항목 분류 | `navigation.test.tsx`, `design_preview.py`, `native_smoke.py` | 설정 아이콘 1개에서 5개 분류로 이동. 화면 테마·회고 입력을 다른 분류에서 함께 저장하고 실제 재시작 후 값 보존. 수집 저장 위치·기본 복귀·앱 종료 경로 보존 |
| 5 하단 상태줄 역할 불명확 | 같은 검사 | 하단 장식·중복 집계 제거. 프로젝트 수는 헤더 선택 목록, 수집 완료는 반영 상태와 원문 수, CLI의 실시간 연결은 선택 목록의 새 프로젝트로 검증하여 기존 의무 유지 |

새 회귀 3건의 헤더 배치·접기 버튼·설정 아이콘 부재 실패를 먼저 확인한 뒤 구현했다. `desktop`의 `npm test` **47건 통과**(기존 44건 보존), TypeScript/Vite 빌드와 별도 `io.silolink.designchecks` ID의 네이티브 빌드 통과. 브라우저 결과는 `.tools/design-preview/7d72c8b9-7edd-41db-b964-31da2902597d/`, 실제 앱의 12개 흐름·JavaScript 오류 0건 결과는 `.tools/desktop-smoke/89724110-1e86-47a1-aea0-628e139abf37/`에 있다.

기존 네이티브 검사의 헤더 선택자·설정 메뉴 이름과 분류 진입 경로는 이번 코멘트에 맞춰 변경했다. 제거한 footer 검사 대신 같은 상태를 확인하는 UI와 실제 저장 상태를 함께 검사했다. 새 데이터 저장 정책이나 의존성을 추가하지 않았다. 접힘 상태의 재시작 보존은 이번 범위에 포함하지 않으며, 설치 앱 업데이트와 실제 모델 응답 품질도 이번 실행의 검증 범위가 아니다.

## 주석용 디자인 미리보기 — 2026-11-05

| 요구·경계 | 검증 | 결과 |
| --- | --- | --- |
| 실제 React 화면 재사용과 예시 데이터 읽기 | `desktop/src/design-preview/api.test.ts`, `Preview.test.tsx` | 일반 네이티브 API의 `DESKTOP_REQUIRED`로 최초 2건 실패를 확인한 뒤 디자인 전용 어댑터 구현. 실제 App의 메뉴→목록→문서 읽기 통과 |
| 표시된 예시 상태·테마·메뉴 유지 | `Preview.test.tsx`, `desktop/tests/design_preview.py` | 테마 변경 시 현재 메뉴 유지, 첫 사용/데이터 있는 화면 왕복. 두 테마의 메뉴 10개와 설정, 프로젝트 전환·상대 문서 이동·화면 가로 넘침 검사 통과 |
| 실제 변경 경로와 분리 | `api.test.ts`, `design-preview/api.test.ts`, `Preview.test.tsx` | 일반 앱의 브라우저 실행은 계속 거절. 디자인 미리보기의 작업 완료·스킬 등록·AI 실행 등은 성공으로 표시하지 않음. UI 경로에서 Tauri invoke 0회 |
| 실제 브라우저 렌더링·배포 제외 | `design_preview.py`, `npm run build` | 루트 주소→디자인 표시, 예시 원문 읽기, 쓰기 안내와 JavaScript 오류 0건. 프로덕션 번들에 예시 데이터 없음·기존 앱 번들 해시 유지 |

`desktop`에서 `npm test` **44건 통과**(기존 38건 보존, 미리보기·일반 브라우저 경계 6건 추가), TypeScript/Vite 빌드 통과. 실제 Edge 검사는 기존 Playwright와 번들 Python을 사용했으며 결과는 `.tools/design-preview/813c640d-9d43-4714-8c2b-5e11d9c0b7bd/`에 있다. 첫 브라우저 실행에서 내부 Markdown 이동을 link로 찾는 검증 도구 오류가 있었고, 기존 Markdown 컴포넌트의 실제 button 역할에 맞춘 뒤 같은 원문 이동 검사를 통과했다.

내장 브라우저 패널 열기는 큐에 등록했다. 내장 브라우저 제어 도구는 kernel assets 경로 오류로 화면을 읽지 못해 Edge로 렌더링을 확인했다. 사용자 Annotate 코멘트 저장·채팅 전달은 아직 직접 확인하지 않았다. 별도 제품 화면·사용자 데이터 저장소·외부 배포를 만들지 않았으며 디자인 서버는 localhost에서만 제공한다.

## 데스크톱 전체 구성·메뉴 개선 — 2026-11-05

| 요구·경계 | 검증 | 결과 |
| --- | --- | --- |
| 목적별 메뉴, 대화·변경 검토·회고 직접 진입과 현재 위치 | `desktop/src/navigation.test.tsx`, `desktop/tests/native_smoke.py` | 연결 프로젝트에서 직접 이동·선택 표시, 빈 상태에서 변경 검토→프로젝트 연결. 새 메뉴·버튼 부재의 최초 3건 실패 후 구현·통과 |
| 프로젝트 범위 보존 | 같은 UI 회귀와 실제 앱 검사 | 프로젝트 B로 전환→새 AI 대화의 선택 자료→문서 화면까지 범위 유지. 실제 앱의 메뉴 10개도 선택 프로젝트 보존 |
| 전체 현황과 후속 작업 | `navigation.test.tsx` | 완료 작업을 제외한 실제 미완료 개수와 작업 화면 이동 확인. 현황 카드 검사는 구현 후 추가 |
| 메뉴 전환 시 본문 처음부터 표시 | 같은 UI 회귀와 실제 앱 검사 | 이전 스크롤 500이 남는 실패를 재현한 뒤 수정·통과. 실제 앱에서 본문을 끝까지 내린 뒤 메뉴 이동→제목이 화면 안에 표시됨 |
| 두 테마·창 크기·기존 기능 | `native_smoke.py` | 1320×900, 1040×800, 최소 960×640에서 밝음/어두움 × 메뉴 10개 = 60개 조합과 설정 검사. 본문·앱 가로 넘침 없음. 기존 문서·복구·대화·재시작 저장 포함 12개 흐름, JavaScript 오류 0건 |

현재 작업 트리의 `desktop`에서 `npm test` **38건 통과**(기존 33건 보존, 탐색 회귀 5건 추가), `npm run build` 통과. `TAURI_CONFIG`의 별도 `io.silolink.designchecks` 앱 ID로 `scripts/cargo.ps1 -CargoArguments @('build','-p','silolink-desktop','--features','custom-protocol','--bins','--locked')`를 실행했다. 빌드 뒤 번들 Python과 기존 `.tools/python-test-deps`의 Playwright로 `desktop/tests/native_smoke.py`를 통과했다. 새 라이브러리를 설치하거나 검사 기대를 약화하지 않았다.

최종 결과·스크린샷은 `.tools/desktop-smoke/ad0c0331-a3d6-48e6-b332-980f60c475cb/`에 있다. 사용자 홈·등록·데이터는 격리된 임시 경로를 사용했다. 실행 중인 설치 앱은 유지했다. 이번 변경은 화면·탐색에 한정하며 설치 프로그램의 재생성·설치/업데이트와 실제 모델 응답 품질은 이 실행의 검증 범위가 아니다. 기존 저장·수집 코어와 알려진 후속 범위는 유지한다.

## 0.2.0 개선 검증 — 2026-11-05

아래 결과는 앞선 페르소나 실행에서 발견한 두 결함과 다섯 공백, 줄바꿈 검사 실패를 개선한 작업 트리의 실행 기록이다. 기존 0.1.0 관찰과 실패 이력은 다음 절에 보존한다.

| 이슈 | 연결한 변경과 검증 | 결과 |
| --- | --- | --- |
| 01 문서 질문 맥락 | `personas.test.tsx`와 실제 앱 P01에서 읽기→질문→저장된 요청 맥락 확인. 프로젝트·경로·리비전 전달과 기존 원문 검사 사용 | 문서 선택 1개와 실제 본문 전달 확인 |
| 02 긴 제목 저장 | 같은 UI 회귀와 실제 앱 P04. 자동 제목을 Unicode 문자 경계에서 UTF-8 240바이트 이내 생성 | 과거 자동 제목 247바이트로 실패했던 질문이 239바이트 제목으로 노트 1개 저장. 노트·후속 작업 경로 검사 |
| 03 실적 재사용 | UI 회귀, `ai::tests::planning_reads_selected_persisted_tasks_and_rejects_foreign_scope`, 실제 앱 P03 | 다른 고객의 선택 작업·시간 구간·완료 상태가 새 프로젝트 계획에 포함. 선택 프로젝트 밖 작업 ID 거부 |
| 04 복구 안내 | UI의 실패 대화 열기→한국어 안내→같은 질문·이전 대화 ID로 재시도, 실제 앱 P02 | 질문 보존과 한국어 복구 행동·재시도 전달 통과 |
| 05 본문 검색 | `native_personas.rs`와 UI 회귀, 실제 앱 P01 | 본문 전용 검색어로 결과 1개. 제외 문서 보존, 변경 후 캐시 갱신, 결과에서 원문 리비전 읽기 통과 |
| 06 줄바꿈 검사 | `native_install.rs`의 줄 단위 이름 검사. 이름·공통 참조·메타데이터·실행 파일·호스트별 설치의 나머지 검사는 유지 | CRLF 원본에서 기존 실패 사례 통과 |
| 07 Markdown 공유 | 실제 앱 P05에서 규칙 선택→미리보기, `native_personas.rs`에서 선택 노트·다른 프로젝트 제외·파일 쓰기·기존 파일 실패 보존 | 미리보기와 파일 저장 코어 통과. Windows 저장 대화상자 직접 조작은 컴퓨터 제어 앱 승인 시간 초과로 미완료 |
| 08 URL 원문 가져오기 | HTML 추출·활성 요소 제외·URL/내부 주소 제한 단위 검사, 출처의 기존 JSON 호환·재시작 저장, 실제 앱에서 `https://example.com` 가져오기 | 실제 HTTPS 본문·최종 URL·수집 시점 저장. 원문 확인 `false` 유지. 실제 모델의 조사 품질은 미측정 |

최종 네이티브 전체 검사 `scripts/cargo.ps1 -CargoArguments @('test','--workspace','--all-targets','--locked','--no-fail-fast')` **90건 통과**, UI·Markdown·계산 검사 `npm.cmd test` **33건 통과**, TypeScript/Vite 빌드와 워크스페이스 Clippy `-D warnings` 통과. 로그는 `.tools/persona-validation/native-0.2.0.log`, `clippy-0.2.0.log`에 있다. 새 UI 사례 6개의 기존 실패를 먼저 확인했다. 새 네이티브 인터페이스는 처음에 미구현 컴파일 실패를 확인하고 구현 후 실제 동작 단언을 통과시켰다. 파일 저장 코어 검사는 코어 추출 후 추가했다. 작업이 100개를 넘는 기존 프로젝트에서도 원래 계획의 50개 참고 범위를 유지하는 회귀 사례를 추가했다.

기존 실제 앱 11개 연결 흐름은 `.tools/desktop-smoke/c0a54070-9ec7-463b-b60c-b6e324f0680c/result.json`에서 통과했다. 개선한 다섯 페르소나의 **18개 검사·다섯 프로필 재시작 보존**은 `.tools/desktop-smoke/10d2eafa-6cb3-49d9-9e79-0672aa07a438/personas.json`과 `.tools/persona-validation/results-0.2.0.json`에 있다. 공급자 응답과 과거 대화는 검증용 자료이며 URL 수집은 실제 네트워크 실행이다. 설치된 사용자 앱과 격리한 `io.silolink.persona-validation` 빌드를 사용했다.

중간 실행의 앱 종료 응답과 창 종료 사이의 경쟁은 프로세스의 정상 종료 코드까지 확인하도록 테스트를 보완했다. 원문 수집은 HTML 제목과 추출 본문이 구별되는 점에 맞춰 잘못된 본문 기대를 수정했다. 검색 결과에 행 번호를 추가한 뒤 UI 단언도 해당 행과 구절을 확인하도록 조정했다. 실제 제품 결함을 숨기는 재시도나 검사 제외는 하지 않았다.

버전은 앱·CLI·프런트엔드·플러그인과 lockfile을 0.2.0으로 맞췄다. 공개 웹 검색·자료 진위 자동 판정·팀 공동 편집은 후속 범위로 두며 이번 공유는 선택한 노트의 Markdown 내보내기다. Windows 저장창 직접 조작·설치/제거·실제 모델 품질의 검증 공백을 유지한다.

최종 Windows 최적화 빌드와 NSIS 번들을 생성했다. 기존 0.1.0 빌드 결과를 보존하고 0.2.0 파일만 별도 스테이징해 `package-release.ps1`로 `.tools/releases/SiloLink-0.2.0/`에 설치 EXE·Codex 플러그인 ZIP·`SHA256SUMS.txt`를 만들었다. 설치 EXE·앱·CLI와 플러그인의 버전, 두 배포물의 체크섬, ZIP 안 CLI와 최종 빌드 CLI의 동일성, 앱에 최종 화면 자산 `index-CIqGAPrV.js`가 포함된 것을 확인했다. 로컬 배포물 생성 결과이며 GitHub 공개 게시와 실제 사용자 설치는 별도 단계다.

## 페르소나 사용 흐름 실행 — 2026-11-05

사용자 요청으로 민준·서연·지훈·유진·도윤의 목표를 실제 Windows WebView2 UI에서 실행했다. 대상은 당시 미커밋 변경을 포함한 작업 트리다. 앱 식별자를 `io.silolink.persona-validation`으로 바꾼 검증 빌드와 페르소나별 임시 프로필·프로젝트를 사용했다. AI 응답은 저장소의 검증용 공급자 프로세스, 수집 원문은 합성 Claude JSONL이며 실제 Rust IPC·문서·SQLite·앱 저장을 사용했다. 실제 모델의 분석 품질과 실제 사용자의 이해도는 미측정이다.

### 사례 정의와 이번 관찰

| 사례 | 요구·페르소나의 연결된 행동 | 기대 | 이번 관찰 |
| --- | --- | --- | --- |
| P01 | R02·R03·R05, 민준이 과거 인증 결정을 찾고 두 프로젝트를 비교한 뒤 AI 도구 전환 | 선택한 원문을 포함해 다음 작업을 이어감 | 제목 검색과 직접 선택한 두 문서·이전 응답 전달은 통과. 본문 키워드 검색은 결과 0개. 읽기 화면의 ‘이 맥락으로 질문’으로 이동하면 문서 선택 0개이며 저장된 요청 맥락에 프로젝트 이름만 포함되는 결함을 재현 |
| P02 | R01·R03·R07, 서연이 문서 없는 폴더 연결→기록 수집→표현 후보→학습 대화→노트→적용 작업 | 실제 선택 원문과 학습 항목을 연결하고 중복 작업 추가를 방지 | 연결·3개 합성 요청 수집·선택 원문 1개 전달·근거 노트·적용 작업·중복 방지 통과. 공급자 실패는 영어 오류와 CLI 로그인·이용 조건 확인 설명을 표시하며 한국어 복구 행동 안내가 부족 |
| P03 | R05·R09, 지훈이 고객 A의 시간 기록·완료·사용자 확인 후 계획하고 고객 B로 전환 | 실적과 완료 경계를 보존하고 선택 범위의 고객 문서만 전달 | A 실적을 A 계획 질문에 포함, 완료와 사용자 확인 독립, 미선택 B 문서 제외 통과. 새 B 계획에는 B 작업만 들어가며 A 작업 실적을 선택하는 UI가 없어 프로젝트 간 실적 재사용이 끊김 |
| P04 | R04·R05·R10, 유진이 공식·커뮤니티 자료의 주장·조건·버전·확인 상태 등록→비교 대화→조사 노트 저장 | 자료의 상태를 보존하고 조사 결과를 다음 작업에 저장 | 두 자료와 서로 다른 확인 상태·버전·조건이 요청에 포함됨. 앱 기본 비교 질문의 자동 제목이 UTF-8 247바이트가 되어 코어 240바이트 제한에 걸림. `Text is missing or exceeds the allowed length.` 오류, 노트 0개를 재현. 원문 자동 조사와 실제 비교 품질은 미검증 |
| P05 | R08·R10, 도윤이 두 저장소 규칙 비교→규칙 노트→A만 실제 변경→복구→기여자 전달 | 적용 대상을 지키고 원문 복구 및 공유 가능 | 두 문서 전달·규칙 노트·A 변경·B 보존·A 원문 바이트 복구 통과. 확인한 화면에 공유·내보내기 진입점이 없으며 팀 공유는 후속 범위 |
| P06 | 다섯 페르소나 모두 앱 종료→재시작→상태 재조회 | 성공적으로 저장한 프로젝트·노트·출처·작업·대화가 동일 | 다섯 독립 프로필에서 통과. P04에서 실패한 노트는 계속 0개이며 기존 출처·대화는 보존 |

### 실행 근거와 한계

- UI 자동 검사 `npm.cmd test` 25건 통과, `npm.cmd run build` 통과.
- 네이티브 `scripts/cargo.ps1 -CargoArguments @('test','--workspace','--all-targets','--locked','--no-fail-fast')` 전체 83건 중 82건 통과, 1건 실패. `setup_installs_separate_discoverable_entries_for_each_project_operation`의 `native_install.rs:159`는 LF 문자열을 기대하지만 현재 스킬 원본·설치 내용은 CRLF다. 실제 앱의 11개 스킬 설치·조회와 동봉 CLI 실행은 별도 흐름에서 통과했으며 이 단언 실패를 설치 기능 전체의 실패로 확대하지 않는다.
- 최초 샌드박스 실행은 파일 교체·junction 생성의 접근 거부로 중단됐다. 일반 실행에서 해당 문서 변경 18건이 모두 통과했다. 기본 앱 식별자로 실행한 첫 UI 검증은 실행 중 앱의 단일 실행 제한으로 종료되어 별도 식별자로 다시 빌드했다.
- 기존 `desktop/tests/native_smoke.py` 실제 앱 11개 연결 흐름 통과, 페이지 오류 0개. 근거는 `.tools/desktop-smoke/2f2a52a2-3e5e-45d9-934a-5670e9ec425c/result.json`이다.
- 페르소나 실행은 기존 native smoke의 실행·관찰 함수를 재사용한 `.tools/persona-validation/run.py`로 수행했다. 최종 종합 결과는 `.tools/persona-validation/results.json`이다. 민준·서연·지훈·도윤의 근거와 화면은 `.tools/desktop-smoke/cee750b0-610e-4e11-b53f-c02fbdc9143d/`, 유진의 최종 근거와 오류 화면은 `.tools/desktop-smoke/fc3e3186-85f5-492e-9908-67617db3dcb7/yujin/`에 있다. 이 경로들은 로컬 검증 산출물이다.
- 최초 페르소나 스크립트의 정확한 label 일치와 후보 정렬 가정 때문에 실행이 중단된 사례는 스크립트를 수정한 뒤 재실행했다. 실제 재현된 문서 맥락 누락과 조사 노트 저장 실패는 최종 결과에 실패로 유지했다. 통과한 연결 검사는 11개, 재현 결함은 2개, 기능·경험의 공백은 5개이며 다섯 페르소나의 최종 실행 예외는 0개다.
- 설치 EXE의 설치·제거, OS 폴더 선택 대화상자의 실제 클릭, 실제 계정 인증·모델 실행, 장기 기록 규모, 팀 사용자 간 공유는 이번 실행에 포함하지 않았다.

## 스킬 초기화와 실행 중인 앱의 프로젝트 연결 — 2026-11-02

| 요구·경계 | 테스트·확인 위치 | 검증 대상 |
| --- | --- | --- |
| 스킬의 CLI init 성공이 앱 프로젝트 연결로 이어짐 | native_cli.rs, native_registry.rs | 최초 등록·재실행 중복 방지·기존 문서 보존·기존 메모와 설정 병합·재실행 후 영속 상태 |
| 실행 중 반영과 AI 수집 독립성 | desktop/tests/native_smoke.py | 실제 동봉 CLI init 후 새로고침 없이 앱 목록 증가·선택 후 실제 문서 읽기·수집 비활성화와 기존 선택 유지·재시작 복구 |
| 실패·충돌이 기존 작업을 훼손하지 않음 | native_registry.rs, desktop/src/App.test.tsx | 등록 경로 쓰기 실패와 재시도·복사된 동일 ID의 위치 충돌·잘못된 JSON·사라진 폴더·junction 부모와 항목 거부·유효 항목 계속 반영·앱 오류 안내 |

최초 재현: `native_init_is_repeatable_and_preserves_existing_documents`에 앱 공유 등록 검증을 추가하자 기존 구현에서 등록 파일 부재로 실패했다. 구현 후 같은 테스트 통과. 파일 게시·junction 검사는 Windows 샌드박스 밖의 격리된 임시 폴더에서 실행한다. 원격 배포·기존에 설치된 실행 파일 교체는 이 테스트로 검증하지 않는다.

실행 결과: `scripts/cargo.ps1 -CargoArguments @('test','--all-targets','--locked')`, 워크스페이스 Clippy, Rust 형식 검사, 프런트엔드 14건과 프로덕션 빌드 통과. 실제 WebView2 스모크 9개 흐름 통과(`.tools/desktop-smoke/05d29db7-5641-44d3-890f-822ec1ac8bf3/result.json`). 새 프로젝트가 나타나는 UI 검증 전에 workspace IPC를 호출하거나 새로고침을 누르지 않았으며, 선택한 문서 원문과 재시작 후 저장 상태까지 확인했다.

기준은 [PRD](../docs/product/prd.md)와 [CLI 계약](../docs/development/cli.md)이다. 기존 JavaScript CLI의 사용자 동작·보존·실패 의무를 Rust로 이식한다. 테스트 함수 수가 아니라 연결된 동작과 최종 상태로 대응한다. 기본 명령은 `cargo test --all-targets --locked`이며 모델 요청을 포함하지 않는다.

## 기존 사례와 Rust 대응

| 요구·경계 | 현재 검증 위치·동작 | 유지하는 의무 |
| --- | --- | --- |
| R01 초기화·재실행 | [native_cli.rs](native_cli.rs), [native_project.rs](native_project.rs) | 기존 문서·ID 보존, 빈/기존 폴더 동일 경로, 미지원·손상·부실 메타데이터, 없는 대상·파일·링크 충돌, 진행 중 읽기, 실제 두 프로세스 경쟁·재시도 |
| R02/R03 기록 변환 | [native_records.rs](native_records.rs), [record-contracts.json](fixtures/record-contracts.json) | 원문 ID, 같은 문장의 새 요청, 동일 ID의 수정, 수집 시각과 분리한 revision, 복사 컨테이너, 다른 프로젝트·접두어·외부 링크, 누락 ID·시각, 초 단위 턴 시각, 비텍스트·알 수 없는 종류 |
| R02 프로세스·RPC·페이지 | [native_rpc.rs](native_rpc.rs), [native_history.rs](native_history.rs), [provider.rs](support/provider.rs) | 실제 자식 프로세스 초기화·응답·종료, 없는 실행 파일, RPC 코드·메서드, 비정상 종료·JSON·타임아웃, 두 단계 페이지·반복 커서, 잘못된 세션 항목·프로젝트 귀속, 부분 결과 보존 |
| R02 Claude SDK 탈의존 | [native_adapter.rs](native_adapter.rs), [claude-adapter-contracts.json](fixtures/claude-adapter-contracts.json) | 공식 SDK 0.3.316에서 독립적으로 산출한 14개 사례의 텍스트·역할·원문 ID·리비전·시간·제외 항목까지 비교. 일반·분기·스트리밍 형제·압축·메타·채널·대기·중복·전달 확인 포함 |
| R02 저장·경쟁·복구 | [native_store_edges.rs](native_store_edges.rs) | 재열기·이전 revision·부분/전체 실패 후 보존, 프로젝트/경로/필터 경계, 실제 DB 트리거 실패의 배치 롤백, 라이브 잠금·토큰 소유권, 다른 DB·미지원 버전·링크 보존, 실제 프로세스 강제 종료 후 트랜잭션·잠금 복구 |
| R02 기존 데이터 이행 | [native_storage.rs](native_storage.rs), [legacy-store.json](fixtures/legacy-store.json) | 실제 JavaScript 저장 코드로 만든 합성 SQLite v1 자료를 네이티브에서 읽기. 1,005건 수집→재시작·신규 1건→공급자 없이 저장본 조회 |
| 스킬 설치·CLI 호출 | [native_install.rs](native_install.rs) | 세 도구의 사용자 설치, 프로젝트 공유 경로 중복 방지, 초기화 이전 설치, 재실행, 수정/타사/링크 보존·부분 실패, PATH가 빈 환경에서 설치 메타데이터의 네이티브 실행 |
| CLI 오류·출력 | [native_cli.rs](native_cli.rs), [native_history.rs](native_history.rs), [native_storage.rs](native_storage.rs) | 도움말·준비 오류의 무수정, 옵션·상한·간격 경계, 빈 이력과 모든 공급자 실패 구별, 부분 결과 JSON·종료 코드, 원문을 출력하지 않는 저장 요약 |
| 지속 수집 | [native_watch.rs](native_watch.rs) | 간격 검증, 첫 주기 영구 반영, 대기 중 중지와 추가 주기 방지, 경쟁 실패 후 성공 재시도·중지. 중첩 수집은 순차 await와 프로젝트 잠금으로 차단 |
| R01/R10 문서 현황·정리 후보 | [native_documents.rs](native_documents.rs) | 정리된 docs·흩어진 Markdown·빈 프로젝트, 초기화 필요·조회 무수정·재실행 안정성, 제목/코드/정의된 참조 링크·이미지·한글/공백 URL·외부/범위 밖 구별, 동일 바이트와 제목만 같은 자료의 비교 후보 구분, 역링크와 revision 근거, Windows 대소문자 링크, 프로젝트/하위 Git 제외 규칙·예외·생성 폴더·별도 하위 프로젝트·junction 제외, UTF-8/파일 크기/깊이 제한의 부분 결과 |
| 설치 후 문서 조회 연결 | [native_install.rs](native_install.rs) | 세 호스트 스킬 설치 메타데이터의 실행 파일로 빈 PATH에서 init→docs 실행, 기존 문서 내용 보존. 모델이 스킬의 두 명령을 실제로 선택해 실행하는 최신 흐름은 별도 검증 대상 |
| R01-C/R08 문서 변경·복구 | [native_changes.rs](native_changes.rs) | 실제 전후 내용·역링크 검사 무수정, 통합 내용 작성·기존 문서 삭제·링크 수정·미선택 파일 보존·CRLF 원문 복구, 전체 원본/목적지/읽기 의존성 충돌과 중간 편집 보존, 중복·불완전·다른 프로젝트·보호/상위/예약/중첩 경로·링크 거절, 불변 계획 ID와 프로젝트 귀속, 부분 적용·재시도, 과거 적용과 현재 상태 구별, 기존/새 링크 오류 분리, 없는/타사/미지원·불일치 저널 보존, 외부 스테이징 편집 보존 |
| 실제 중간 종료·저널 장애 | [native_changes.rs](native_changes.rs), [provider.rs](support/provider.rs) | 실제 자식 프로세스를 쓰기 직전·스테이징 후·교체 후/저널 갱신 전·파일 기록 후에 강제 종료. 상태 경로가 달라도 프로젝트 동시 변경 거절, 종료 후 잠금 해제·재개·복구. 복구 중 종료 후 재개와 실제 SQLite 트리거 오류의 체크포인트 롤백·수리 후 재개 |

기존 Node 테스트 62개의 동작 의무를 위의 Rust 통합 테스트와 매개변수 사례로 재구성했다. SDK 호출 자체에 대한 모의 테스트는 JSONL 입력·SDK 독립 기준으로 대체했고, `.js` 런처 테스트는 네이티브 실행 테스트로 바꾸었다. 기대를 완화하거나 일부를 스킵해 맞추지 않는다. SDK 원문·사용자 대화·자격증명은 회귀 자료에 넣지 않는다.

## 실행 근거

### 첫 Windows 데스크톱 추가

| 요구·경계 | 테스트·검증 | 확인하는 결과 |
| --- | --- | --- |
| R01/R02 프로젝트·설정 저장 | [native_desktop.rs](native_desktop.rs) | 명시적 init, 중복 연결 방지, 프로젝트 ID/경로 재확인, 저장 위치 미선택 유지, 재시작 보존 |
| R01/R10 문서 읽기 | [native_desktop.rs](native_desktop.rs) | 스캔과 같은 제외 범위, 상위 경로 거절, 원문 revision 변경 감지, 무수정 |
| R03 요청 집계 | [native_desktop.rs](native_desktop.rs) | 사용자 요청만 집계, 반복 원문 ID 보존, 시각 누락·빈 데이터 구별 |
| R07/R09/R10 노트·작업·일정·계측 | [native_desktop.rs](native_desktop.rs) | 실제 저장과 재시작, 잘못된 시각 보존, 일정 검증, 타이머 구간 종료, 작업 완료와 사용자 확인 구별 |
| R05 공급자 출력 | [ai.rs](../desktop/src-tauri/src/ai.rs) | 실제 응답 텍스트 해석, 공급자 실패·빈 응답을 성공으로 승격하지 않음 |
| R06/R09 화면 계산·빈 상태 | [metrics.test.ts](../desktop/src/metrics.test.ts), [App.test.tsx](../desktop/src/App.test.tsx) | 겹친 구간 중복 합산 방지, 한국 날짜 경계, 시각 누락 제외, 샘플 통계 없는 빈 설치와 주요 진입점 |
| 연결된 네이티브 사용자 흐름 | [native_smoke.py](../desktop/tests/native_smoke.py) | 실제 앱·Rust IPC·임시 프로젝트 초기화/수집/읽기, 내부 Markdown 링크·HTML 격리·상위 경로 거절, 학습/작업/타이머·출처 확인 상태, 본문/외부 계획의 실제 검사·외부 편집 보존·반영/CRLF 복구, 공급자 전환·대화 맥락·실패·취소와 자식 프로세스 종료, 정상 종료/재시작 후 설정·자료·테마 보존 |

2026-11-02: 기존 64건을 보존하고 `native_desktop.rs` 5건을 추가해 루트 `cargo test --all-targets --locked` 69건을 통과했다. 데스크톱 라이브러리 테스트 1건과 UI 테스트 3건도 통과했다. `cargo clippy --workspace --all-targets --locked -- -D warnings`와 프런트엔드 타입/프로덕션 빌드를 통과했다. 새 Rust 인터페이스와 작업 일정 사례의 실패를 먼저 확인한 뒤 구현했다. 추가한 공급자 출력·네이티브 통합 검증은 구현 후 작성했으며 테스트 선행으로 주장하지 않는다.

실제 WebView2 검증은 새 임시 프로필에서 원문·노트·작업·설정의 저장을 확인했다. 최종 개발 빌드 검증 결과는 `.tools/desktop-smoke/4e2fdb02-1f98-4441-a7e2-ba646fc7d968/result.json`이다. Windows 줄바꿈에 따라 테스트 작성기가 바이트를 변환하던 입력을 명시적 CRLF 바이트로 수정했으며, 검사 기대를 완화하지 않고 외부 편집 보존과 원문 바이트 복구를 확인했다. 검증 도구의 문자열 대기를 로케이터 대기로 바꿔 앱의 CSP를 완화하지 않았다.

NSIS 설치 프로그램과 프로덕션 실행 파일도 생성했다. `--executable target/release/silolink-desktop.exe`로 동일한 7개 흐름을 다시 통과했다. 소스 루트 대신 독립적인 임시 작업 디렉터리에서 개발 서버 없이 번들한 화면을 실행했으며 결과는 `.tools/desktop-smoke/dfc07267-0945-4279-8514-c924f1b099c1/result.json`이다. 설치 프로그램의 생성과 실제 설치/제거 검증은 구별한다.

검증용 공급자는 별도 실제 자식 프로세스이며 모델·로그인·구독을 호출하지 않는다. 이 증거는 실제 모델 응답 품질, OS 알림 전달, 오래 켠 다수 프로젝트의 성능, macOS, 최종 사용자 수락의 검증을 대신하지 않는다.

- 이전 기준: Windows·Node 22.20.0에서 `npm test` 62건 통과. 초기 CLI 구현의 과거 결과이며 현재 검증 명령은 아니다.
- Rust 이식: 초기화·CLI·저장의 연결 사례를 실패 확인 후 구현했다. 스트리밍 순서, 대기 요청·전달 확인의 차이는 공식 SDK 기준 테스트로 재현하고 Rust 구현을 수정했다. 기준 해시·SDK 기대를 새 구현에 맞춰 완화하지 않았다.
- 형식 호환: JavaScript 원문 ID·revision 산출 결과와 실제 JavaScript 저장 코드의 합성 DB 구조·payload를 고정 자료로 남겼다. 실제 사용 데이터는 복사하지 않았다.
- 실제 조회: Claude 세 프로젝트 8·11·2건, 현재 Codex 프로젝트 64건에서 기존 구현 대비 ID 누락·추가·revision 차이 0, Rust 경고 0. 이 비교 뒤 SDK 런타임을 제거했다.
- 설치: Windows 릴리스 파일을 공백이 있는 임시 설치 경로에 설치했고 PATH가 빈 환경에서 스킬 등록·실행을 확인했다. 실제 Codex가 스킬 1건을 발견하고 Claude `/silolink init`이 네이티브 실행 파일을 1회 호출해 성공·기존 문서 보존을 확인했다. 이 모델 검증은 기본 테스트에 포함하지 않는다.
- Rust 전환 시점 재검증(2026-11-02): JavaScript 런타임·의존성 제거 후 `cargo test --all-targets --locked` 통합 테스트 37건 통과, 실패·스킵 0건. 위 SDK 독립 비교 14개 사례를 포함한다. Clippy `-D warnings`와 릴리스 빌드도 통과했다. 잘못된 Claude 설정 디렉터리의 실패 처리와 한글·이모지 프로젝트 경로의 UTF-16 인코딩 호환을 회귀 사례로 확인했다.
- Rust 전환 시점 설치 파일: Windows x64 실행 파일 3,009,024바이트. 임시 설치 경로·한글/이모지 프로젝트·빈 PATH에서 설치기→스킬 등록→메타데이터의 실행 파일로 초기화→재초기화를 확인했고 문서·프로젝트 메타데이터가 보존됐다. 실행 파일의 동적 의존성은 Windows 시스템 DLL이며 Node·VC 런타임 설치가 필요하지 않다.
- 시작 시간 관찰: 같은 Windows 환경에서 도움말 실행을 각각 3회 예열 후 20회 교차 측정했다. 이전 Node CLI 중앙값 85.3ms·p95 86.8ms, Rust CLI 중앙값 27.7ms·p95 29.9ms였다. 이는 도움말을 출력하고 종료하는 프로세스 시간이며, 이력 수집·모델 응답 속도의 개선 수치가 아니다.
- 링크: Windows 파일 심볼릭 링크에 관리자 권한을 요구하지 않도록 디렉터리 junction으로 재분류 경계를 검증한다. 테스트 준비 실패를 스킵하지 않는다.
- 문서 현황 단계(2026-11-02): 최초 요구 사례 6건이 미지원 명령으로 실패하는 것을 확인한 뒤 구현했다. Windows 대소문자 링크의 참조 영향 누락도 별도 실패로 재현하고 수정했다. 하위 Git 제외 규칙·예외와 깊이 경계를 더한 문서 테스트는 9건이다. 기존 37건의 의무를 유지해 `cargo test --all-targets --locked` 총 46건 통과, 실패·스킵 0건. `cargo fmt --all`, Clippy `-D warnings`, 릴리스 빌드와 공통 스킬 형식 검증도 통과했다.
- 문서 조회 단계 설치 흐름: 저장소 문서·테스트를 복사한 공백/한글 임시 프로젝트에서 설치기→프로젝트 범위 스킬 등록→메타데이터의 실행 파일로 init→docs→재조회했다. 빈 PATH에서도 문서 9개·검토 후보 2개를 조회했고 경고·깨진 로컬 링크 0건, 복사한 원본 24개와 프로젝트 메타데이터 보존을 확인했다. 당시 실행 파일은 4,883,456바이트다. 이는 해당 단계의 CLI 연결 검증이며 스킬의 모델 선택·실행이나 문서 자동 변경 검증이 아니다.
- 문서 변경 단계(2026-11-02, `25173e2` 이후 작업 트리): 미지원 명령의 연결 실패를 확인한 뒤 구현했다. 스테이징 중 참조 편집·없는 저널 복구의 생성 방지·과거 적용과 현재 상태·저널 순번 불일치도 추가 실패로 재현하고 수정했다. `native_changes.rs` 18건과 기존 46건을 합쳐 `cargo test --all-targets --locked` 64건 통과, 실패·스킵 0건. 실제 프로세스 강제 종료 4개 적용 시점과 복구 시점, SQL 체크포인트 장애, 불변 계획·타 프로젝트·경로 경계를 포함한다. 포맷·Clippy `-D warnings`·릴리스 빌드·스킬 형식 검사도 통과했다.
- 최신 릴리스 연결: 한글/공백 임시 경로에 설치하고 빈 PATH에서 스킬 메타데이터로 init→docs→docs-check→docs-apply→동일 계획 재실행→특정 이력 조회→docs-undo를 실행했다. 두 원문을 실제 새 내용으로 합치고 색인 수정·원본 두 개 삭제를 포함한 4개 작업을 적용했다. 새 링크 오류 0건, 복구 후 원본 파일 28개의 SHA-256과 프로젝트 메타데이터가 일치했고 새 문서는 제거됐다. 기존 기록 DB를 생성하지 않았다. 실행 파일 5,221,376바이트. 의미 통합의 자동 생성이나 호스트 모델 실행을 검증한 결과는 아니다.

## 비개발자의 설치와 첫 문서 확인 — 2026-11-02

| 요구·경계 | 사례·검증 위치 | 결과와 한계 |
| --- | --- | --- |
| R01-E 설치할 로컬 플러그인 제공 | [native_plugin_package.rs](native_plugin_package.rs) | 공백·한글 경로에 패키지 생성, 별도 캐시 위치로 복사한 동봉 CLI의 빈 PATH init→docs, 원문 보존, 없는 실행 파일·기존 출력 보존. 패키지 인터페이스 부재로 최초 실패한 뒤 구현 |
| 명령어·보관 위치 없이 첫 문서 확인 | [App.test.tsx](../desktop/src/App.test.tsx) | 폴더 선택→연결→실제 문서 목록 진입, 자동 기록 수집 없음, 두 번째 연결의 선택 프로젝트 전환, 취소·실패·문서 0개·부분 읽기 구분. 기존 초기화 체크박스와 결과 화면 부재로 먼저 실패 확인 |
| 정리 후보와 원문 연결 | [App.test.tsx](../desktop/src/App.test.tsx), [native_smoke.py](../desktop/tests/native_smoke.py) | 후보 유형·참조 링크 수·원문 진입 제공. 코어의 실제 결과는 `proposals`이며 초기 UI 타입의 `candidates` 가정은 틀렸음. 실제 코어 결과 대조로 테스트 자료를 수정해 화면 실패를 재현하고 타입·UI를 수정. 후보 UI 추가 검증은 구현 후 작성 |
| Codex 설치 원본·캐시 경계 | 실제 `Codex에 등록.cmd`와 공식 Codex CLI, 격리된 `CODEX_HOME` | 등록→available 목록→설치·활성화→설치 캐시의 실행 파일로 문서 조회 확인. 사용자 설정·프로젝트·로그인 변경 없음. 앱 플러그인 화면에서의 실제 클릭 설치와 모델의 자연어 스킬 선택은 별도 검증 대상 |
| 실제 앱의 첫 결과와 기존 기능 보존 | [native_smoke.py](../desktop/tests/native_smoke.py) | 초기화 체크박스가 없는 실제 앱 연결→문서 2개 결과→목록→원문 바이트 보존, 이어서 기존 7개 흐름 통과. 직접 폴더 경로 입력으로 검증하며 OS 폴더 선택 대화상자의 클릭은 UI 단위 테스트로만 대체 |

이 개선 작업 트리에서 루트 `cargo test --all-targets --locked` 71건과 프런트엔드 `npm test` 8건을 통과했다. 기존 Windows junction 검증은 샌드박스에서 준비 단계가 차단돼 일반 실행에서 동일 사례를 포함해 통과했다. `cargo clippy --all-targets --locked -- -D warnings`와 TypeScript/Vite 빌드도 통과했다. 루트 전체 테스트 뒤 공통 스킬의 설명 문구와 문서가 추가 수정됐으며 네이티브 코어 정책은 바뀌지 않았다.

사용 중인 `target/release/silolink-desktop.exe`를 보존하기 위해 `.tools/onboarding-build`와 별도 앱 ID `io.silolink.preview`로 프로덕션 체험 빌드를 생성했다. NSIS 설치 파일은 `.tools/onboarding-build/release/bundle/nsis/SiloLink Preview_0.1.0_x64-setup.exe`다. 이 빌드의 실제 WebView2 결과와 첫 화면·첫 문서 결과 스크린샷은 `.tools/desktop-smoke/f19f9c1e-345f-4ae0-ab97-a5b9b5ca4b67/`에 있다. 오류 0건이며 설치 프로그램 자체의 설치·제거 또는 실사용자 수락 테스트를 대신하지 않는다.

공개 다운로드·공개 디렉터리 배포·코드 서명·자동 업데이트·앱과 플러그인의 통합 설치·공급자 설치/로그인 준비 상태 안내는 남아 있다. 제품 우선순위와 수용 기준은 [PRD](../docs/product/prd.md)의 첫 설치 개선 기준에 기록한다.

최종 플러그인 ZIP도 한글·공백 경로에 압축 해제한 뒤 등록 파일→공식 Codex 설치→캐시 실행 파일의 init 재실행·docs를 확인했다. 문서 1개·프로젝트 ID·기존 원문 보존을 확인했고 결과는 `.tools/plugin-final-check/77e73428-1f4d-44b4-9d0c-63ca76ca241c/result.json`에 있다.

## 시네마틱 설치와 수동 업데이트 — 2026-11-02

| 요구·경계 | 사례·검증 위치 | 기대와 범위 |
| --- | --- | --- |
| 검정 앱 아이콘·네이티브 설치 화면 | [installer_smoke.ps1](../desktop/tests/installer_smoke.ps1), 실제 화면 PNG | 새 설치의 설치 버튼, 버전별 문구, 한글·공백 경로. 기존 기본 화면에서 새 설치 버튼이 없어 실패한 뒤 구현 |
| 설치 전 취소 | 같은 시험의 cancel-before-installation | 설치 등록·앱 파일을 만들지 않고 종료 |
| 신규→업데이트→동일 버전 재설치 | fresh-install-persisted, update-version-and-original-path, same-version-reinstall | 동일 제품의 실제 NSIS 등록 버전과 앱 파일·원래 설치 위치 확인 |
| 데이터 보존 | update-and-reinstall-preserve-data | 격리 프로필의 설정·기록 파일과 설치 폴더의 사용자 파일 SHA-256 유지 |
| 구버전 차단 | interactive-downgrade-blocked, silent-passive-update-downgrades-blocked | 대화형 종료, `/S`, `/P`, `/S /UPDATE`의 실패 코드와 기존 버전·데이터 보존. 최초 `/P`의 모달 대기로 실패를 재현하고 수정 |
| 기본 제거의 데이터 보존 | default-uninstall-preserves-data | 앱 파일 제거 후 설정·기록·사용자 파일 바이트 유지. 명시적 앱 데이터 삭제 선택은 기존 Tauri 기능으로 유지 |
| 실제 컴포넌트 스타일 | styled-controls-rendered | 실제 렌더링의 기본 흰 버튼 모서리로 먼저 실패 확인. 둥근 버튼 모서리와 어두운 폴더 선택 버튼의 픽셀 색 검사 |
| 스타일과 네이티브 조작 유지 | styled-checkbox-keyboard-and-click, styled-folder-edit-browse-and-cancel | Space·클릭 체크 전환, 한글 경로 직접 입력, 폴더 탐색기 열기→취소→입력값 유지. 기존 설치·업데이트·재설치·차단·데이터 보존 사례도 유지 |
| 시안 크기와 단일 헤더 | compact-reference-window-size, custom-header-drag-and-close-guard | 기존 과대 창의 실제 너비 실패를 먼저 확인. 기준 660×606px 측정, 드래그 히트 영역, 보이는 X와 기존 NSIS 취소 제한 및 설치 전 종료 확인 |
| 실행 프로세스 이름·아이콘 | [process_branding.ps1](../desktop/tests/process_branding.ps1), 루트 build.rs | 앱·설치기 SiloLink, CLI SiloLink CLI 표시 이름 및 브랜드 아이콘을 PE 리소스에서 검사. CLI의 빈 표시 이름으로 실패를 확인한 뒤 보완. 실행 중 앱의 SiloLink 창과 런타임 아이콘도 격리 프로필에서 확인 |

정식 제품과 같은 생성 NSIS 스크립트·커스텀 페이지를 사용하며 제품 식별자·프로필·셸 폴더·앱 페이로드만 격리한다. 실제 실행 중 앱 강제 종료 확인·WebView2가 전혀 없는 PC·영문 Windows·다중 모니터 DPI 이동·정전 및 파일 잠금 중 복구·정식 제품의 실사용자 설치는 별도 검증 대상이다. 프런트엔드나 데이터베이스 스키마를 변경하는 작업이 아니다.

최종 작업 트리에서 Windows PowerShell 5의 `installer_smoke.ps1` 9개 흐름이 통과했다. 결과와 실제 화면은 `.tools/installer-smoke/23dba055-a422-41da-9ceb-5f2f479d07a4/`에 있다. `native_release` 2건, TypeScript/Vite 프로덕션 빌드, 정식 `desktop.ps1 -Mode build`, actionlint와 diff 공백 검사를 통과했다. 최종 번들에 대한 실제 창 표시→설치 전 취소도 확인했다. 최종 설치 EXE·플러그인 ZIP·체크섬과 실제 화면 PNG는 `.tools/releases/SiloLink-0.1.0-cinematic-final/`에 생성했다. 공개 릴리스나 실제 사용자 설치 완료를 의미하지 않는다.

컴포넌트 스타일 보완 검증에서는 위 9개 흐름에 실제 색상·모서리, 체크박스 키보드/클릭, 경로 입력/폴더 선택 취소를 추가해 총 12개 흐름을 Windows PowerShell 5에서 통과했다. 결과는 `.tools/installer-smoke/8fb1376c-3e29-4223-8f3e-f3a7456ac8eb/`다. NSIS의 미선언 변수 경고 6000도 컴파일 실패로 검사한다. C++ `/W4 /WX` 빌드와 번들 생성, actionlint·diff 공백 검사, DLL의 Windows 시스템 DLL 의존성만 존재함을 확인했다. 새 배포 파일과 체크섬·실제 설치 창 PNG는 `.tools/releases/SiloLink-0.1.0-cinematic-styled/`에 생성했고 이 EXE의 실제 창 표시→설치 전 취소와 체크섬 일치도 확인했다.

2026-11-03 입체 로고·시안 크기 보완에서는 원근 투영과 옆면·림 조명·그림자를 실제 배경에 합성하고, 중복 제목 표시줄을 단일 헤더로 바꿨다. 660×606px 측정·드래그·보이는 X·네이티브 취소 제한을 포함한 14개 흐름이 통과했다. 결과는 `.tools/installer-smoke/5c172655-1b7f-4f6b-b2d0-2361bf60a239/`다. 최종 실제 EXE의 화면을 다시 열어 확인하고 설치 전 취소했다. C++ 경고 오류화 빌드·번들·패키징·actionlint·공백 검사·체크섬 검증을 통과했으며 파일과 실제 화면은 `.tools/releases/SiloLink-0.1.0-cinematic-compact/`에 있다.

2026-11-03 프로세스 표시 보완에서는 CLI의 빈 `FileDescription`으로 먼저 실패를 확인한 뒤 `SiloLink CLI` 이름·검정 로고를 공개 CLI EXE에 포함하고 앱 컨텍스트에도 창·트레이 아이콘을 명시했다. 최종 `process_branding.ps1`의 EXE 3개 및 실제 실행 창 검증 4개가 통과했으며 모든 아이콘 비교 차이는 0이다. 결과는 `.tools/process-branding/34e60ce7-3135-447b-8da6-1baf0bd58a8e/`다. 최초 런타임 검사는 큰 아이콘만 조회하고 ICO의 32px 항목과 128px 창 아이콘을 비교하는 시험 결함이 있어, 작은 아이콘 조회와 같은 해상도의 PNG 기준 비교로 수정했다. CLI·릴리스 테스트 6건, 최종 설치 스크립트 14개 흐름(`.tools/installer-smoke/bef542d9-ef30-443b-a4f8-b0a0983d0544/`), 포맷·CLI/데스크톱 Clippy·actionlint·릴리스 빌드·배포 체크섬 검증을 통과했다. 설치 EXE·플러그인 ZIP·체크섬은 `.tools/releases/SiloLink-0.1.0-process-branding/`에 있다. Windows 작업 관리자 자체의 UI나 세부 정보 탭의 파일명 변경을 검증했다고 주장하지 않는다.

## Markdown 문서·노트·대화 표시 — 2026-11-03

| 요구·상태 경계 | 사례·검증 위치 | 기대 |
| --- | --- | --- |
| 표·정렬·셀 내부 구문 | [markdown.test.tsx](../desktop/src/markdown.test.tsx), [markdown.md](../desktop/tests/fixtures/markdown.md) | 시작 조건 표를 실제 table로 표시. 좌/중앙/우 정렬과 강조·인라인 코드·이스케이프 파이프 보존 |
| 체크 목록·취소선·URL | 같은 컴포넌트 시험 | 완료/미완료 상태와 중첩 목록. 읽기 전용이며 원문 변경 호출 없음. 일반 URL은 사용자가 누를 때만 기존 외부 참조 명령 호출 |
| 같은 문서 제목·각주 | 같은 시험, [native_smoke.py](../desktop/tests/native_smoke.py) | 한글·중복 제목, 각주·돌아가기의 실제 스크롤/포커스. 같은 본문을 다시 읽지 않고 여러 본문 ID도 충돌하지 않음 |
| 다른 문서의 제목 | 같은 시험 및 실제 App→DocumentsPage→Rust 읽기 | 한글·공백 상대 경로와 리비전을 유지하고 `#제목`을 전달해 읽기 완료 후 위치 이동 |
| 코드·활성 콘텐츠 경계 | 같은 시험과 네이티브 픽스처 | 코드 안의 표/HTML/체크 문법은 원문 보존. HTML·script URL·이미지는 실행하거나 자동 요청하지 않음. 프로젝트 밖 읽기 거절 유지 |
| 넓은 표·긴 코드·테마 | 실제 앱 1320px 밝음/1040px 어두움 | 문서 내부 스크롤 영역으로 제한하고 전체 화면의 가로 오버플로 없음. 기존 앱 데이터 표는 별도 스타일 유지 |

기본 GFM 사례 5건(표·체크/취소선·자동 URL·제목·각주)의 실패를 먼저 확인한 뒤 구현했다. 문서 간 앵커 누락도 별도 실패를 확인하고 수정했다. 기존 14건에 Markdown 10건을 더한 `npm test` 24건, 타입 검사/Vite 빌드와 정식 Windows 릴리스 빌드를 통과했다. 실제 배포용 EXE의 `native_smoke.py` 10개 연결 흐름이 오류 없이 통과했으며 `.tools/desktop-smoke/2b6b90e0-cfd4-491a-850a-f605dcf2eeb3/`에 밝음/어두움 Markdown 화면과 결과가 있다. 이 실행에는 기존 도구 연결·초기화·수집·문서 읽기·학습·작업·변경 충돌/복구·대화 실패/취소·재시작 보존 흐름을 포함한다. 최종 빌드의 프로세스 표시 4항목도 통과했다(`.tools/process-branding/0d8eea6d-3b55-406f-a6dd-285ffc900f7a/`). 설치 EXE·플러그인 ZIP·검증한 체크섬은 `.tools/releases/SiloLink-0.1.0-markdown-rendering/`에 있다.

전용 Mermaid/수식 엔진, HTML 실행, 이미지 자동 로드는 이 변경의 지원 주장에 포함하지 않는다. 각 미지원 구문의 현재 표시 방식은 [Markdown 표시 계약](../docs/development/desktop.md#markdown-표시-계약)에 구분했다.

## 한계와 후속 검증

### 기능별 스킬 선택과 기존 설치 확장 — 2026-11-02

| 요구·경계 | 검증 | 결과 |
| --- | --- | --- |
| init·docs·sync 등 각각 선택 | [native_install.rs](native_install.rs), [native_plugin_package.rs](native_plugin_package.rs) | 세 호스트에 통합 1개+기능별 10개 설치. 각 진입점의 이름·공통 규칙 참조·메타데이터·한국어 UI 파일 확인. 플러그인도 동일한 11개를 포함 |
| 기존 단일 스킬 유지 | [native_install.rs](native_install.rs), [App.test.tsx](../desktop/src/App.test.tsx) | 단일 스킬은 `update_available`로 표시하고 업데이트 버튼으로 빠진 기능만 추가. 기존 SKILL.md·v2 메타데이터 바이트 보존. 초기 단일 항목 설치·업데이트 버튼 부재 실패 후 구현 |
| 동명 타사 항목 보존 | [native_install.rs](native_install.rs) | 묶음의 모든 이름을 사전 검사하고 충돌 시 통합/새 진입점 모두 새로 만들지 않음. 수정·링크·다른 CLI 경로 보존 및 기존 설치 회귀 유지 |
| 스킬 품질·실제 발견 | skill-creator quick_validate, 실제 Codex `skills/list` | 11개 SKILL.md 유효성, 새 UI 설명 25–64자·기본 요청의 스킬명·공통 참조 확인. 사용자 Codex에 새 10개를 추가하고 실제 목록에서 11개 활성화·한국어 displayName 확인. 결과 `.tools/skill-discovery/8dc97712-f0af-45b2-9fa5-abd4a30e3a14/result.json` |
| 실제 업데이트·원문·기존 기능 | [native_smoke.py](../desktop/tests/native_smoke.py) | 단일 v2 설치에서 업데이트→세 호스트 11개 등록→빈 PATH CLI 실행→중복/수정 보존→재시작까지 8개 흐름·오류 0건. `.tools/desktop-smoke/8e54b306-364d-4f8e-9e80-9c8ee0eda929/` |

이 작업 트리의 루트 테스트 78건과 UI·화면 계산 13건이 통과했다. 워크스페이스 Clippy·Rust 형식·TypeScript/Vite 빌드·actionlint도 통과했다. 새 체험 NSIS와 11개 스킬을 포함하는 플러그인 ZIP·체크섬은 `.tools/releases/SiloLink-0.1.0-operation-skills/`에 생성했다.

사용 중인 Preview와 같은 앱 ID로 프로덕션 검증을 시작했을 때 단일 실행 제한으로 검증 앱이 즉시 종료됐다. 사용자 앱을 종료하지 않고 `io.silolink.skillchecks` ID의 디버그 빌드로 같은 실제 UI 흐름을 통과했다. 위 결과를 새 프로덕션 설치 프로그램 자체의 설치·제거 또는 실제 호스트 모델 실행 검증으로 확대하지 않는다. 현재 사용자 Codex 등록에서는 기존 통합 스킬과 설치 CLI 경로를 보존한 채 새 진입점만 추가했으며 사용자 프로젝트를 초기화하거나 기록을 수집하지 않았다.

### 앱의 세 도구 연결과 태그 자동 배포 — 2026-11-02

| 요구·경계 | 테스트·확인 위치 | 확인 결과와 한계 |
| --- | --- | --- |
| 사용자 스킬 상태와 설치 정책의 일치 | [native_install.rs](native_install.rs) | 무수정 조회→세 호스트 설치→재조회, 수정한 스킬·junction 부모의 보존, 없는 CLI 거절. 초기 `inspect_user` 부재 실패 후 구현. 기존 설치 회귀 포함 5건 통과 |
| 비개발자의 연결 버튼과 실패 복구 | [App.test.tsx](../desktop/src/App.test.tsx) | 첫 화면→설정→도구별 한 건 등록→상태 재조회, 조회 실패 재시도·충돌을 성공으로 표시하지 않음. 버튼 부재의 최초 4건 실패 후 구현. 상태 문구가 안내·배너에 각각 있어 조회 범위를 해당 도구 영역으로 좁혔으며 기대와 의무는 유지 |
| 실제 동봉 실행 파일과 세 도구 사용자 파일 | [native_smoke.py](../desktop/tests/native_smoke.py) | 격리된 사용자 홈에서 실제 세 버튼 등록, 메타데이터가 앱의 `bin/silolink.exe`를 가리킴, 빈 PATH에서 init→docs와 원문 보존, 중복 연결·수정 파일 보존·알 수 없는 호스트 거절·재시작 상태 확인. 호스트 모델의 실제 스킬 선택·로그인은 검증하지 않음 |
| 릴리스 버전·출력 보존 | [native_release.rs](native_release.rs), [release-version.ps1](../scripts/release-version.ps1), [package-release.ps1](../scripts/package-release.ps1) | 일치 태그 성공, 버전 불일치·잘못된 태그 거절, 기존 출력 보존·없는 빌드의 출력 생성 방지. 최초 릴리스 인터페이스 부재 실패 후 구현 |
| 워크플로와 최종 파일 | [windows.yml](../.github/workflows/windows.yml) | actionlint 1.7.12 통과. 실제 로컬 앱 설치 프로그램과 동봉 CLI 해시를 대조하고 설치 EXE·플러그인 ZIP·SHA256SUMS 생성. 게시 job의 GitHub API 실행과 호스팅 러너 종단 간 실행은 미검증 |

이 작업 트리에서 루트 테스트 75건, 데스크톱 라이브러리 1건, UI·화면 계산 12건을 통과했다. 워크스페이스 Clippy `-D warnings`, Rust 형식, TypeScript/Vite 빌드와 actionlint를 통과했다. 실제 프로덕션 체험 앱의 새 도구 연결 흐름과 기존 흐름 7개를 합쳐 8개 흐름·오류 0건이다. 결과와 `tool-connections.png`는 `.tools/desktop-smoke/fe22333d-57f7-40af-88fb-64eae2b5d591/`에 있다. 호스트 사용자 폴더는 `SILOLINK_USER_HOME`으로 격리했으며 실제 사용자 스킬·프로젝트·로그인을 변경하지 않았다.

세 도구 등록은 파일·네이티브 실행 검증이다. Antigravity 앱에서의 발견·실행과 새 코드의 호스트 모델 선택, Windows 설치 프로그램 자체의 설치·제거, GitHub에서의 첫 워크플로 실행·Releases 게시는 별도 검증 대상이다. 코드 서명·자동 업데이트·호스트 로그인 준비 상태 자동 점검은 남아 있다. 자동 빌드와 배포를 구현한 것이 기존 설치를 자동으로 업그레이드한다는 뜻은 아니다. 수정된 스킬은 계속 보존하며 재연결 시 확인이 필요할 수 있다.

Windows x64·Rust 1.90 MSVC 환경을 확인했다. Antigravity 앱 내 발견·실행, Codex 모델의 실제 스킬 실행, 각 도구 UI 메뉴, macOS·ARM64·공개 릴리스 배포·업데이트는 미검증이다. Claude JSONL은 안정적인 공식 API가 아니며 미검증 형식·큐 전달/압축·깨진 줄은 경고로 드러낸다. 원문 입력 형식이 바뀌면 새 독립 자료를 추가해야 한다.

전경 주기 수집·수집 종료·재시작 복구를 검증하며 데스크톱 상주·훅·문서 재구조화·분석·사용자 테스트의 완료를 주장하지 않는다. 현재 전체 재조회 비용과 장시간 많은 프로젝트를 관찰하는 성능은 후속 범위다.

문서 조회는 규칙 기반 후보 제공이며 의미 이해의 검증이 아니다. 실제 변경·복구는 별도 변경안으로 검증하며 최종 통합 내용의 타당성을 자동 판정하지 않는다. HTML·위키 링크·앵커·제외한 원문에서의 역링크와 프로젝트 전체의 원자적 스냅샷은 보장하지 않는다. 파일 수·입력 합계·전체 순회 상한은 방어 제한으로 구현하며 조회 자동 사례는 파일별 크기와 깊이 경계를 직접 검증한다. Windows 대소문자 링크 사례는 Windows 전용이며 다른 OS의 동작 검증을 뜻하지 않는다.

변경·복구의 현재 범위는 로컬 UTF-8 Markdown이다. 전원 장애·네트워크 파일시스템·macOS·파일시스템 전체 ACL/소유권/타임스탬프 복구·저널 자동 보관/정리·호스트 모델이 최신 변경 스킬을 실제 선택하는 흐름은 미검증 또는 미구현이다. 외부 편집기가 잠금을 따르지 않으면 마지막 검사와 교체 사이의 경쟁까지 원자적으로 차단하지는 못한다. 저널과 파일의 실제 반영 상태를 별도로 보고한다.
