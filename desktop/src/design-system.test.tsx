// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { loadWorkspace, native } from "./api";
import { createPreviewSnapshot } from "./design-preview/data";

vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), loadWorkspace: vi.fn(), native: vi.fn(), mutate: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));
beforeEach(() => {
  vi.mocked(loadWorkspace).mockResolvedValue(createPreviewSnapshot("populated", "light"));
  vi.mocked(native).mockReset().mockResolvedValue({ tools: [] });
});
afterEach(cleanup);

it("변경안 작성은 문서 선택과 입력을 구분하고 검토·반영을 공통 하단 실행 영역에 둔다", async () => {
  const snapshot = createPreviewSnapshot("populated", "light");
  const doc = snapshot.inventories[0].report!.documents[0];
  vi.mocked(native).mockImplementation(async (command, args) => {
    if (command === "read_document") return doc;
    if (command === "check_plan") return {
      changeId: "review", changeState: "ready", rationale: "본문 수정", conflicts: [], incomingLinks: [],
      operations: [{ path: doc.path, before: doc.text, after: "수정한 본문" }],
    };
    if (command === "apply_plan") return { changeState: "applied" };
    throw new Error(`Unexpected command ${command}: ${JSON.stringify(args)}`);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "변경안 검토" }));
  const editor = screen.getByRole("form", { name: "변경안 작성" });
  expect(within(editor).getByLabelText("수정할 문서")).toBeTruthy();
  expect(within(editor).getByLabelText("정리 이유")).toBeTruthy();
  expect(within(editor).getByRole("button", { name: "이전·이후와 영향 검토" }).closest(".form-actions")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("수정할 문서"), { target: { value: doc.path } });
  fireEvent.click(screen.getByRole("button", { name: "내용 불러오기" }));
  const body = await screen.findByRole("textbox", { name: "변경 후 본문" });
  fireEvent.change(body, { target: { value: "수정한 본문" } });
  fireEvent.click(screen.getByRole("button", { name: "이전·이후와 영향 검토" }));
  const apply = await screen.findByRole("button", { name: "이 프로젝트에 실제 반영" });
  expect(apply.closest(".form-actions")).toBeTruthy();
  expect(native).toHaveBeenCalledWith("check_plan", expect.objectContaining({
    projectId: snapshot.workspace.projects[0].id,
    plan: expect.objectContaining({ operations: [{ path: doc.path, expectedRevision: doc.revision, content: "수정한 본문" }] }),
  }));
  fireEvent.change(body, { target: { value: "추가 수정" } });
  expect(screen.queryByRole("button", { name: "이 프로젝트에 실제 반영" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "이전·이후와 영향 검토" }));
  fireEvent.click(await screen.findByRole("button", { name: "이 프로젝트에 실제 반영" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("apply_plan", { projectId: snapshot.workspace.projects[0].id, planId: "review" }));
});

it("새 문서와 JSON 작성에서도 입력 레이블과 공통 하단 검토 동작을 유지한다", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "변경안 검토" }));
  fireEvent.click(screen.getByRole("button", { name: "새 문서" }));
  expect(screen.getByLabelText("새 문서 경로").closest(".form-field")).toBeTruthy();
  expect(screen.getByLabelText("변경 후 본문").closest(".form-field")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "고급 · JSON 직접 입력" }));
  const editor = screen.getByRole("form", { name: "변경안 작성" });
  expect(within(editor).getByLabelText("문서 변경안 JSON").closest(".form-field")).toBeTruthy();
  expect(within(editor).getByRole("button", { name: "원문·영향 검사" }).closest(".form-actions")).toBeTruthy();
});

it("현재 위치는 실제 메뉴 그룹을 표시하며 그룹을 누르면 해당 그룹의 시작 화면을 연다", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  const nav = within(screen.getByRole("navigation", { name: "주요 탐색" }));
  for (const [menu, group, landing] of [
    ["대화", "내 작업", "요약"],
    ["조사", "지식 탐색", "기록·문서"],
    ["학습", "지식 탐색", "기록·문서"],
    ["변경안 검토", "프로젝트 실행", "프로젝트"],
  ]) {
    fireEvent.click(nav.getByRole("button", { name: menu }));
    const location = screen.getByRole("navigation", { name: "현재 위치" });
    expect(location.querySelector('[aria-current="page"]')?.textContent).toBe(menu);
    expect(within(location).queryByRole("button", { name: "요약" })).toBeNull();
    fireEvent.click(within(location).getByRole("button", { name: group }));
    expect(nav.getByRole("button", { name: landing }).getAttribute("aria-current")).toBe("page");
  }
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  const location = screen.getByRole("navigation", { name: "현재 위치" });
  expect(location.textContent).toBe("설정");
  expect(within(location).queryByRole("button")).toBeNull();
});
