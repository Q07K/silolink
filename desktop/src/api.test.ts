import { expect, it, vi } from "vitest";
import { loadWorkspace, native } from "./api";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));

it("일반 앱 경로는 브라우저에서 예시 성공 대신 데스크톱 실행을 요구한다", async () => {
  await expect(loadWorkspace()).rejects.toHaveProperty("code", "DESKTOP_REQUIRED");
  await expect(native("start_chat", {})).rejects.toHaveProperty("code", "DESKTOP_REQUIRED");
});
