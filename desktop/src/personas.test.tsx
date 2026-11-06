// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { emptySnapshot } from "./test-fixture";
import { loadWorkspace, mutate, native } from "./api";
import type { Snapshot } from "./types";

vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  loadWorkspace: vi.fn(), native: vi.fn(), mutate: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));
let snapshot: Snapshot;
beforeEach(() => {
  vi.mocked(native).mockReset();
  vi.mocked(mutate).mockReset();
  snapshot = structuredClone(emptySnapshot);
  snapshot.workspace.projects = [{ id: "a", name: "고객 A", root: "C:\\a" }, { id: "b", name: "고객 B", root: "C:\\b" }];
  snapshot.inventories = [{ projectId: "a", report: { status: "success", warnings: [], proposals: [], documents: [
    { id: "doc", title: "인증 결정", path: "README.md", revision: "r1", bytes: 50, links: [] },
  ] } }];
  vi.mocked(loadWorkspace).mockImplementation(async () => structuredClone(snapshot));
  vi.mocked(native).mockImplementation(async (command) => {
    if (command === "read_document") return { ...snapshot.inventories[0].report!.documents[0], text: "# 인증 결정\nrefresh-token-rotation" };
    if (command === "search_documents") return { status: "success", matches: [{ ...snapshot.inventories[0].report!.documents[0], snippet: "refresh-token-rotation", line: 2 }], warnings: [], truncated: false };
    if (command === "preview_notes") return { markdown: "# 검토 기준\n변경 이유를 남긴다" };
    return { id: "chat" };
  });
  vi.mocked(mutate).mockResolvedValue({ id: "saved" });
});
afterEach(cleanup);

it("읽던 문서의 리비전과 본문 선택을 대화 요청까지 연결한다", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "기록·문서" }));
  fireEvent.click(screen.getByRole("button", { name: "읽기" }));
  await screen.findByText("refresh-token-rotation");
  fireEvent.click(screen.getByRole("button", { name: "이 맥락으로 질문" }));
  fireEvent.click(screen.getByRole("button", { name: "질문하기" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("start_chat", expect.objectContaining({ request: expect.objectContaining({ documents: [{ projectId: "a", path: "README.md", revision: "r1" }] }) })));
});

it("긴 한글 질문의 답변을 노트와 후속 작업으로 저장할 때 제목 바이트 제한을 지킨다", async () => {
  snapshot.workspace.chats = [{ id: "chat", projectId: "a", provider: "codex", context: "", evidenceIds: [], status: "completed", error: null, startedAt: snapshot.loadedAt, endedAt: snapshot.loadedAt, messages: [
    { role: "user", text: "한글🙂".repeat(50), createdAt: snapshot.loadedAt },
    { role: "assistant", text: "조사 결과", createdAt: snapshot.loadedAt },
  ] }];
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "대화" }));
  fireEvent.click(screen.getByRole("button", { name: "열기" }));
  fireEvent.click(screen.getByRole("button", { name: "노트로 남기기" }));
  await waitFor(() => expect(mutate).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "후속 작업 추가" }));
  await waitFor(() => expect(vi.mocked(mutate).mock.calls.length).toBe(2));
  for (const [request] of vi.mocked(mutate).mock.calls) {
    if (request.operation === "note" || request.operation === "addTask") {
      expect(new TextEncoder().encode(request.title).length).toBeLessThanOrEqual(240);
      expect(request.title).not.toContain("�");
    }
  }
});

it("새 프로젝트 계획에서 명시적으로 선택한 다른 프로젝트 작업 실적을 전달한다", async () => {
  snapshot.workspace.tasks = [{ id: "past", projectId: "b", title: "예약 기능 검토", phase: "검토", completed: true, userTested: true, dueAt: null, createdAt: snapshot.loadedAt, spans: [{ startedAt: "2026-11-01T00:00:00Z", endedAt: "2026-11-01T01:00:00Z" }] }];
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "작업·일정" }));
  fireEvent.click(screen.getByRole("tab", { name: "다음 계획" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /고객 B.*예약 기능 검토/ }));
  fireEvent.click(screen.getByRole("button", { name: "계획 작성" }));
  fireEvent.click(screen.getByRole("button", { name: "질문하기" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("start_chat", expect.objectContaining({ request: expect.objectContaining({ taskIds: ["past"], projectIds: ["a", "b"] }) })));
});

it("제목에 없는 본문 검색어로 문서를 찾고 일치 구절에서 원문을 읽는다", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "기록·문서" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "문서 찾기" }), { target: { value: "refresh-token-rotation" } });
  fireEvent.click(screen.getByRole("button", { name: "본문까지 검색" }));
  await screen.findByText(/2행 · refresh-token-rotation/);
  fireEvent.click(screen.getByRole("button", { name: "읽기" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("read_document", { projectId: "a", path: "README.md", revision: "r1" }));
});

it("선택한 규칙 노트만 Markdown 내보내기에 포함한다", async () => {
  snapshot.workspace.notes = [{ id: "rule", projectId: "a", kind: "rule", title: "검토 기준", body: "변경 이유를 남긴다", evidenceIds: [], createdAt: snapshot.loadedAt }];
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "프로젝트" }));
  fireEvent.click(screen.getByRole("tab", { name: "공통·로컬 규칙" }));
  fireEvent.click(screen.getByRole("button", { name: "노트 내보내기" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "검토 기준 내보내기 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "내보내기 미리보기" }));
  await screen.findByRole("heading", { name: "내보내기 미리보기" });
  expect(screen.queryByRole("button", { name: "내보내기 미리보기" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "선택 수정" }));
  expect((screen.getByRole("checkbox", { name: "검토 기준 내보내기 선택" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "내보내기 미리보기" }));
  fireEvent.click(await screen.findByRole("button", { name: "Markdown 파일로 저장" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("export_notes", { projectId: "a", noteIds: ["rule"] }));
});

it("URL 원문을 가져와 검토 가능한 초안을 채우고 미확인 상태로 저장한다", async () => {
  vi.mocked(native).mockResolvedValue({ url: "https://example.org/doc", title: "공식 설명", text: "원문 내용", fetchedAt: snapshot.loadedAt });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "조사" }));
  fireEvent.click(screen.getByRole("button", { name: "자료 추가" }));
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "자료 이름" }));
  fireEvent.change(screen.getByRole("textbox", { name: "HTTPS 원문 링크" }), { target: { value: "https://example.org/doc" } });
  fireEvent.click(screen.getByRole("button", { name: "URL에서 원문 가져오기" }));
  await screen.findByText("원문 내용");
  expect((screen.getByRole("checkbox", { name: /내가 원문 내용을 확인했습니다/ }) as HTMLInputElement).checked).toBe(false);
});

it("실패한 질문을 한국어 복구 안내와 함께 같은 맥락에서 재시도한다", async () => {
  snapshot.workspace.chats = [{ id: "failed", projectId: "a", provider: "codex", context: "preserved", evidenceIds: [], status: "failed", error: { code: "AI_PROCESS_FAILED", message: "Provider failed" }, startedAt: snapshot.loadedAt, endedAt: snapshot.loadedAt, messages: [{ role: "user", text: "남겨 둔 질문", createdAt: snapshot.loadedAt }] }];
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "대화" }));
  fireEvent.click(screen.getByRole("button", { name: "열기" }));
  expect(await screen.findByText(/로그인·이용 한도를 확인/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("start_chat", expect.objectContaining({ request: expect.objectContaining({ question: "남겨 둔 질문", previousChatId: "failed" }) })));
});

it("작업이 100개를 넘는 기존 프로젝트도 계획의 50개 참고 범위를 유지한다", async () => {
  snapshot.workspace.tasks = Array.from({ length: 105 }, (_, index) => ({ id: `task-${index}`, projectId: "a", title: `작업 ${index}`, phase: "검토", completed: true, userTested: true, dueAt: null, createdAt: snapshot.loadedAt, spans: [] }));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "작업·일정" }));
  fireEvent.click(screen.getByRole("tab", { name: "다음 계획" }));
  fireEvent.click(screen.getByRole("button", { name: "계획 작성" }));
  fireEvent.click(screen.getByRole("button", { name: "질문하기" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("start_chat", expect.objectContaining({ request: expect.objectContaining({ taskIds: snapshot.workspace.tasks.slice(0, 50).map((task) => task.id) }) })));
});
