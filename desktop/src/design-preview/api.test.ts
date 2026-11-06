import { expect, it, vi } from "vitest";
import { loadWorkspace, mutate, native } from "./api";
import type { DocumentItem } from "../types";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));

it("디자인 전용 작업 공간과 문서를 실제 데스크톱 없이 탐색한다", async () => {
  const snapshot = await loadWorkspace();
  expect(snapshot.workspace.projects).toHaveLength(2);
  const inventory = snapshot.inventories[0];
  const source = inventory.report!.documents[0];
  const document = await native<DocumentItem>("read_document", {
    projectId: inventory.projectId, path: source.path, revision: source.revision,
  });
  expect(document.text).toContain("디자인 리뷰용 예시");
});

it("미리보기에서 파일·스킬·AI 실행을 실제 성공으로 표시하지 않는다", async () => {
  await expect(native("start_chat", {})).rejects.toHaveProperty("message", expect.stringContaining("디자인 미리보기"));
  await expect(native("connect_tool", { host: "codex" })).rejects.toHaveProperty("message", expect.stringContaining("디자인 미리보기"));
  await expect(mutate({ operation: "readNotices" })).rejects.toHaveProperty("message", expect.stringContaining("디자인 미리보기"));
});
