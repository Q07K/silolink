import { invoke, isTauri } from "@tauri-apps/api/core";
import type { NativeError, Mutation, Snapshot } from "./types";

export function native<T>(
  command: string,
  args?: { [key: string]: unknown },
): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: "DESKTOP_REQUIRED",
      message:
        "SiloLink 데스크톱 앱으로 실행해 주세요. 브라우저에서는 로컬 프로젝트에 접근하지 않습니다.",
    } satisfies NativeError);
  return invoke<T>(command, args);
}
export const loadWorkspace = () => native<Snapshot>("workspace");
export const mutate = (request: Mutation) =>
  native<{ id: string | null }>("mutate", { request });
export function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const code =
      "code" in error && typeof error.code === "string" ? error.code : "";
    const messages: { [code: string]: string } = {
      PROJECT_NOT_INITIALIZED:
        "아직 연결하지 않은 폴더입니다. 프로젝트 화면에서 폴더를 선택하고 연결해 주세요.",
      STATE_DIRECTORY_REQUIRED:
        "기록과 문서 백업을 저장할 폴더를 먼저 선택해 주세요.",
      DOCUMENT_REVISION_CONFLICT:
        "검토 이후 원문이 바뀌었습니다. 새 내용을 읽고 다시 검토해 주세요.",
      PROJECT_LOCATION_CONFLICT:
        "프로젝트의 경로나 식별자가 달라졌습니다. 연결 상태를 확인해 주세요.",
      PROJECT_REGISTRY_FAILED:
        "스킬의 프로젝트 연결 정보를 읽거나 저장하지 못했습니다. 폴더 접근 상태를 확인하고 다시 연결해 주세요.",
      AI_CONTEXT_TOO_LARGE:
        "선택한 자료가 너무 큽니다. 문서나 기록의 범위를 줄여 주세요.",
      INVALID_AI_CONTEXT: "선택한 자료의 범위와 개수를 확인해 주세요. 한 요청에 프로젝트 10개·문서 20개·작업과 기록 각각 100개까지 사용할 수 있습니다.",
      PROVIDER_UNAVAILABLE:
        "선택한 공식 CLI를 실행하지 못했습니다. 설치와 로그인 상태를 확인해 주세요.",
      AI_PROCESS_FAILED: "AI 도구가 답변을 완료하지 못했습니다. 선택한 도구를 직접 열어 로그인·이용 한도를 확인한 뒤 다시 시도해 주세요.",
      AI_TIMEOUT: "답변 대기 시간을 초과했습니다. 질문이나 선택 자료를 줄인 뒤 다시 시도해 주세요.",
      AI_CANCELLED: "요청을 중지했습니다. 같은 질문으로 다시 시도할 수 있습니다.",
      INVALID_DESKTOP_INPUT: "입력 내용이 없거나 허용 길이를 넘었습니다. 제목과 본문 길이를 확인해 주세요.",
      REFERENCE_FETCH_FAILED: "원문을 가져오지 못했습니다. 주소와 네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      REFERENCE_TOO_LARGE: "원문이 가져오기 제한을 넘습니다. 더 작은 자료를 선택해 주세요.",
      REFERENCE_UNSUPPORTED: "텍스트나 HTML 원문을 선택해 주세요. 이 자료의 형식이나 문자 인코딩은 지원하지 않습니다.",
      INVALID_REFERENCE: "공개된 HTTPS 원문 주소를 입력해 주세요. 로그인 정보가 포함된 주소와 내부 네트워크 주소는 사용할 수 없습니다.",
      INVALID_SEARCH: "검색할 내용을 입력해 주세요. 검색어는 UTF-8 기준 1,024바이트까지 사용할 수 있습니다.",
      EXPORT_FAILED: "보고서를 저장하지 못했습니다. 저장 위치와 파일 접근 상태를 확인한 뒤 다시 시도해 주세요.",
      ANALYSIS_NOT_ENOUGH_DATA: "분석할 사용자 요청이 아직 3개 미만입니다. AI 기록을 더 수집한 뒤 다시 실행해 주세요.",
      ANALYSIS_RUNNING: "이미 분석이 진행 중입니다. 끝난 뒤 다시 실행하거나 진행 중인 분석을 중지해 주세요.",
      INVALID_ANALYSIS_RESPONSE: "AI 도구가 분석 결과를 정해진 형식으로 돌려주지 않았습니다. 다시 실행하거나 다른 AI 도구를 선택해 주세요.",
      ANALYSIS_SAMPLE_CHANGED: "분석하는 동안 기록이 바뀌었습니다. 다시 실행해 주세요.",
      INVALID_RULE_PLAN: "Markdown 문서와 섹션 제목, 규칙 1~100개를 확인해 주세요.",
      INVALID_RULE_SCOPE: "비교할 프로젝트를 1~10개 선택해 주세요.",
      PLAN_REVIEW_REQUIRED: "현재 앱에서 변경안을 검토한 뒤 적용해 주세요.",
      CLI_UNAVAILABLE: "앱에 포함된 SiloLink 실행 파일을 찾지 못했습니다. 최신 설치 파일로 SiloLink를 다시 설치해 주세요.",
      SKILL_INSTALL_CONFLICT: "기존 스킬이 수정되었거나 다른 설치를 가리킵니다. 표시된 등록 폴더를 확인·백업한 뒤 다시 연결해 주세요. 기존 파일은 보존했습니다.",
      SKILL_INSTALL_FAILED: "스킬 폴더에 저장하지 못했습니다. 사용자 폴더 접근 권한을 확인한 뒤 다시 시도해 주세요.",
      INSTALL_DIRECTORY_NOT_FOUND: "사용자 스킬을 저장할 폴더를 찾지 못했습니다. 사용자 폴더의 접근 상태를 확인해 주세요.",
    };
    return messages[code] ?? error.message;
  }
  return error instanceof Error
    ? error.message
    : "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}
