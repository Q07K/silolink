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
      PROVIDER_UNAVAILABLE:
        "선택한 공식 CLI를 실행하지 못했습니다. 설치와 로그인 상태를 확인해 주세요.",
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
