import type { DocumentItem, Mutation, Snapshot, ToolConnections } from "../types";
import { createPreviewSnapshot, type PreviewScenario, type PreviewTheme } from "./data";

let scenario: PreviewScenario = "populated";
let theme: PreviewTheme = "light";
let snapshot = createPreviewSnapshot(scenario, theme);

export function configurePreview(next: { scenario?: PreviewScenario; theme?: PreviewTheme }) {
  if (next.theme) theme = next.theme;
  if (next.scenario && next.scenario !== scenario) {
    scenario = next.scenario;
    snapshot = createPreviewSnapshot(scenario, theme);
  }
  snapshot.workspace.settings.theme = theme;
}

class PreviewActionUnavailable extends Error {}
export const previewActions = new EventTarget();

function previewOnly() {
  previewActions.dispatchEvent(new Event("unavailable"));
  return new PreviewActionUnavailable("이 작업은 디자인 미리보기에서 실행할 수 없습니다.");
}

export async function loadWorkspace(): Promise<Snapshot> {
  return structuredClone(snapshot);
}

// Match the application's IPC interface; only the explicit design server resolves this adapter.
export function native<T>(command: string, args?: { [key: string]: unknown }): Promise<T>;
export async function native(command: string, args: { [key: string]: unknown } = {}): Promise<unknown> {
  if (command === "workspace") return loadWorkspace();
  const documents = snapshot.inventories.find((item) => item.projectId === args.projectId)?.report?.documents ?? [];
  if (command === "read_document") {
    const document = documents.find((item) => item.path === args.path && item.revision === args.revision);
    if (!document) throw new Error("이 미리보기에서 선택한 예시 문서를 찾지 못했습니다.");
    return structuredClone(document);
  }
  if (command === "search_documents") {
    const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
    const matches: (DocumentItem & { snippet: string; line: number })[] = documents
      .filter((item) => query && `${item.title} ${item.path} ${item.text}`.toLowerCase().includes(query))
      .map((item) => {
        const lines = item.text?.split("\n") ?? [];
        const index = lines.findIndex((line) => line.toLowerCase().includes(query));
        return { ...item, snippet: lines[index] ?? item.path, line: Math.max(0, index) + 1 };
      });
    return { status: "success", matches: structuredClone(matches), warnings: [], truncated: false };
  }
  if (command === "tool_connections") {
    return { tools: (["codex", "claude", "antigravity"] as const).map((host) => ({
      host, path: "디자인 리뷰용 예시 등록 위치", status: host === "antigravity" ? "not_installed" : "installed",
      invocation: "silolink init", skills: ["silolink"],
    })) } satisfies ToolConnections;
  }
  if (command === "preview_notes") {
    const ids = Array.isArray(args.noteIds) ? args.noteIds : [];
    return { markdown: snapshot.workspace.notes.filter((note) => note.projectId === args.projectId && ids.includes(note.id))
      .map((note) => `# ${note.title}\n\n${note.body}`).join("\n\n---\n\n") };
  }
  if (command === "change_history") return { changes: [] };
  throw previewOnly();
}

export function mutate(_request: Mutation): Promise<{ id: string | null }> {
  return Promise.reject(previewOnly());
}

export function errorMessage(error: unknown): string {
  if (error instanceof PreviewActionUnavailable) return "";
  return error instanceof Error ? error.message : "디자인 미리보기 화면을 불러오지 못했습니다.";
}
