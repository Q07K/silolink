// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { loadWorkspace, native } from "./api";
import { createPreviewSnapshot } from "./design-preview/data";
import { NavigationButton } from "./navigation-button";

vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), loadWorkspace: vi.fn(), native: vi.fn(), mutate: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));
beforeEach(() => { vi.mocked(loadWorkspace).mockResolvedValue(createPreviewSnapshot("populated", "light")); vi.mocked(native).mockReset().mockResolvedValue({ id: "chat" }); });
afterEach(cleanup);

it("메뉴의 툴팁은 클릭과 마우스 이탈 후 남지 않는다", () => {
  const click = vi.fn();
  render(<NavigationButton label="대화" icon={<span />} compact onClick={click} />);
  const button = screen.getByRole("button", { name: "대화" });
  button.focus();
  fireEvent.mouseEnter(button);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.click(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(click).toHaveBeenCalledOnce();
  fireEvent.mouseEnter(button);
  fireEvent.mouseLeave(button);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("접기 버튼은 사이드바 안에 있고 알림은 헤더 팝오버에서 닫고 돌아온다", async () => {
  const { container } = render(<App />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  expect(screen.getByRole("button", { name: "사이드바 접기" }).closest(".sidebar-controls")).toBeTruthy();
  const bell = screen.getByRole("button", { name: "알림" });
  fireEvent.click(bell);
  const dialog = screen.getByRole("dialog", { name: "알림" });
  expect(container.querySelector(".titlebar")!.contains(dialog)).toBe(true);
  expect(screen.getByRole("main").contains(dialog)).toBe(false);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(bell);
  fireEvent.click(bell);
  fireEvent.pointerDown(screen.getByRole("main"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("탭은 방향키·Home·End로 이동하고 선택된 패널과 연결한다", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "작업·일정" }));
  const list = screen.getByRole("tablist", { name: "작업 보기" });
  const tasks = within(list).getByRole("tab", { name: "작업·일정" });
  tasks.focus();
  fireEvent.keyDown(tasks, { key: "End" });
  const planning = within(list).getByRole("tab", { name: "다음 계획" });
  expect(document.activeElement).toBe(planning);
  expect(planning.getAttribute("aria-selected")).toBe("true");
  const panel = screen.getByRole("tabpanel", { name: "다음 계획" });
  expect(planning.getAttribute("aria-controls")).toBe(panel.id);
  expect(screen.getByRole("button", { name: "계획 작성" }).closest(".form-actions")).toBeTruthy();
  fireEvent.keyDown(planning, { key: "Home" });
  expect(document.activeElement).toBe(tasks);
  fireEvent.keyDown(tasks, { key: "ArrowRight" });
  expect(screen.getByRole("tabpanel", { name: "시간·실적" })).toBeTruthy();
});

it("홈은 제목 계층을 통일하고 중복 분석은 사용 분석으로 모은다", async () => {
  const { container } = render(<App />);
  expect(await screen.findByRole("heading", { level: 1, name: "전체 프로젝트" })).toBeTruthy();
  expect(container.querySelector(".request-review, .home-analysis")).toBeNull();
  expect(screen.getByRole("button", { name: "사용 분석" })).toBeTruthy();
});

it("학습은 목록에서 시작하며 추가와 내보내기를 요청했을 때만 연다", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "학습" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "학습 주제 추가" }));
  expect(screen.getByRole("button", { name: "학습 주제 저장" }).closest(".form-actions")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  fireEvent.click(screen.getByRole("button", { name: "노트 내보내기" }));
  const exportRegion = screen.getByRole("region", { name: "노트 내보내기" });
  expect(within(exportRegion).getAllByRole("checkbox")).toHaveLength(1);
  expect(within(exportRegion).queryByText("화면의 정보 우선순위")).toBeNull();
});
