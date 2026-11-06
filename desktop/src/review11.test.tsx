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
  vi.mocked(native).mockReset().mockResolvedValue({ id: "chat" });
});
afterEach(cleanup);

it("홈에서 소개 문구 대신 프로젝트를 열고 요약 메뉴로 돌아온다", async () => {
  const { container } = render(<App />);
  expect(await screen.findByRole("table", { name: "연결한 프로젝트" })).toBeTruthy();
  expect(screen.queryByText("내 작업의 흐름")).toBeNull();
  expect(container.querySelector(".home-overview .feature")).toBeNull();
  fireEvent.click(within(screen.getByRole("table", { name: "연결한 프로젝트" })).getByRole("button", { name: "개인 포트폴리오" }));
  expect((screen.getByRole("combobox", { name: "현재 프로젝트" }) as HTMLSelectElement).value).toBe("design-portfolio");
  fireEvent.click(within(screen.getByRole("navigation", { name: "주요 탐색" })).getByRole("button", { name: "요약" }));
  expect(await screen.findByRole("table", { name: "연결한 프로젝트" })).toBeTruthy();
});

it("접기 버튼은 사이드바 안에 있고 대화 진입을 중복하지 않는다", async () => {
  const { container } = render(<App />);
  await screen.findByRole("button", { name: "프로젝트 추가" });
  expect(screen.getByRole("button", { name: "사이드바 접기" }).closest(".sidebar-controls")).toBeTruthy();
  expect(container.querySelector(".sidebar-compose")).toBeNull();
  expect(within(container.querySelector(".titlebar") as HTMLElement).queryByRole("button", { name: "새 대화" })).toBeNull();
  expect(screen.queryByRole("button", { name: "새 AI 대화" })).toBeNull();
});

it("첫 사용 화면에서 작은 연결 안내로 실제 연결을 시작한다", async () => {
  vi.mocked(loadWorkspace).mockResolvedValue(createPreviewSnapshot("empty", "light"));
  const { container } = render(<App />);
  await screen.findByRole("heading", { name: "프로젝트가 없습니다" });
  expect(container.querySelector(".onboarding")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "프로젝트 연결" }));
  expect(await screen.findByRole("textbox", { name: "프로젝트 폴더" })).toBeTruthy();
});

it("대화는 질문을 먼저 작성하고 필요할 때 자료를 펼쳐 예시 문서 요약을 전송한다", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "대화" }));
  const question = screen.getByRole("textbox", { name: "질문 입력" }) as HTMLTextAreaElement;
  expect(question.value).toBe("");
  expect(screen.queryByRole("region", { name: "질문에 포함할 자료" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "문서 요약 질문 작성" }));
  expect(question.value).toContain("요약");
  expect(native).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "자료 선택" }));
  expect(within(screen.getByRole("region", { name: "질문에 포함할 자료" })).getAllByRole("checkbox", { checked: true }).length).toBeGreaterThanOrEqual(3);
  fireEvent.click(screen.getByRole("button", { name: "자료 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "질문하기" }));
  await waitFor(() => expect(native).toHaveBeenCalledWith("start_chat", expect.objectContaining({ request: expect.objectContaining({
    projectId: "design-silolink", documents: expect.arrayContaining([{ projectId: "design-silolink", path: "README.md", revision: "design-doc-v1" }]),
  }) })));
});
