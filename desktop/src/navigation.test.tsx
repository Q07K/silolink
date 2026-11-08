// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { loadWorkspace, mutate, native } from "./api";
import { emptySnapshot } from "./test-fixture";

vi.mock("./api", async (original) => ({
  ...await original<typeof import("./api")>(),
  loadWorkspace: vi.fn(), native: vi.fn(), mutate: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));

beforeEach(() => {
  vi.mocked(native).mockReset();
  vi.mocked(mutate).mockReset();
  const snapshot = structuredClone(emptySnapshot);
  snapshot.workspace.projects = [
    { id: "a", name: "프로젝트 A", root: "C:\\a" },
    { id: "b", name: "프로젝트 B", root: "C:\\b" },
  ];
  vi.mocked(loadWorkspace).mockResolvedValue(snapshot);
});
afterEach(cleanup);

it("메뉴에서 대화·변경 검토·회고로 바로 이동하고 현재 위치를 표시한다", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  const navigation = screen.getByRole("navigation", { name: "주요 탐색" });
  for (const [label, heading] of [
    ["대화", "대화"],
    ["변경안 검토", "변경 내용을 검토하고 반영하기"],
    ["일간·주간 회고", "오늘을 돌아보기"],
  ]) {
    const button = within(navigation).getByRole("button", { name: label });
    fireEvent.click(button);
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(button.getAttribute("aria-current")).toBe("page");
    expect(within(navigation).getAllByRole("button").filter((item) => item.hasAttribute("aria-current"))).toHaveLength(1);
  }
  expect(mutate).not.toHaveBeenCalled();
  expect(native).not.toHaveBeenCalled();
});

it("프로젝트 전환 후 메뉴에서 여는 대화와 문서는 선택한 프로젝트를 사용한다", async () => {
  render(<App />);
  const project = await screen.findByRole("combobox", { name: "현재 프로젝트" });
  fireEvent.change(project, { target: { value: "b" } });
  fireEvent.click(screen.getByRole("button", { name: "대화" }));
  expect(await screen.findByRole("heading", { name: "대화" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "자료 선택" }));
  const checkbox = screen.getByRole("checkbox", { name: "프로젝트 B" }) as HTMLInputElement;
  expect(checkbox.checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: "프로젝트 A" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "기록·문서" }));
  expect(await screen.findByRole("heading", { name: "기록과 문서" })).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "현재 프로젝트" }) as HTMLSelectElement).value).toBe("b");
});

it("빈 작업 공간에서도 모든 메뉴와 프로젝트 연결 경로를 제공한다", async () => {
  vi.mocked(loadWorkspace).mockResolvedValue(structuredClone(emptySnapshot));
  render(<App />);
  await screen.findByRole("heading", { name: "프로젝트가 없습니다" });
  expect(screen.queryByRole("combobox", { name: "현재 프로젝트" })).toBeNull();
  fireEvent.click(within(screen.getByRole("navigation", { name: "주요 탐색" })).getByRole("button", { name: "변경안 검토" }));
  expect(await screen.findByRole("heading", { name: "먼저 프로젝트를 연결해 주세요" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "프로젝트 연결" }));
  expect(await screen.findByRole("textbox", { name: "프로젝트 폴더" })).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
});

it("홈은 전체 프로젝트의 미완료 작업 수를 보여 주고 작업 화면으로 연결한다", async () => {
  const snapshot = structuredClone(emptySnapshot);
  snapshot.workspace.projects = [{ id: "a", name: "프로젝트 A", root: "C:\\a" }];
  snapshot.workspace.tasks = [false, false, true].map((completed, index) => ({
    id: `task-${index}`, projectId: "a", title: `작업 ${index}`, phase: "진행", completed,
    userTested: false, dueAt: null, createdAt: snapshot.loadedAt, spans: [],
  }));
  vi.mocked(loadWorkspace).mockResolvedValue(snapshot);
  render(<App />);
  expect(await screen.findByRole("heading", { name: "아직 볼 요청 기록이 없어요" })).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: /진행 중인 작업\s*2\s*개/ }));
  expect(await screen.findByRole("heading", { name: "작업과 다음 계획" })).toBeTruthy();
  expect(mutate).not.toHaveBeenCalled();
});

it("다른 메뉴를 열면 이전 화면의 스크롤 위치 대신 본문 처음을 보여 준다", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  const workspace = screen.getByRole("main");
  workspace.scrollTop = 500;
  fireEvent.click(within(screen.getByRole("navigation", { name: "주요 탐색" })).getByRole("button", { name: "작업·일정" }));
  await screen.findByRole("heading", { name: "작업과 다음 계획" });
  expect(workspace.scrollTop).toBe(0);
});

it("현재 위치와 프로젝트를 최상단 헤더에 두고 장식 상태줄은 제거한다", async () => {
  const { container } = render(<App />);
  const project = await screen.findByRole("combobox", { name: "현재 프로젝트" });
  const header = container.querySelector(".titlebar")!;
  expect(header.contains(project)).toBe(true);
  expect(header.contains(container.querySelector(".contextbar"))).toBe(true);
  expect(container.querySelector(".titlebar-meta")).toBeNull();
  expect(container.querySelector(".app-footer")).toBeNull();
});

it("사이드바를 접어도 탐색·프로젝트 전환이 유지되고 포커스와 호버로 메뉴명을 보여 준다", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
  expect(screen.getByRole("button", { name: "사이드바 펼치기" }).getAttribute("aria-expanded")).toBe("false");
  const analysis = within(screen.getByRole("navigation", { name: "주요 탐색" })).getByRole("button", { name: "사용 분석" });
  fireEvent.focus(analysis);
  expect(screen.getByRole("tooltip").textContent).toBe("사용 분석");
  fireEvent.keyDown(analysis, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.blur(analysis);
  fireEvent.mouseEnter(analysis);
  expect(screen.getByRole("tooltip").textContent).toBe("사용 분석");
  fireEvent.mouseLeave(analysis);
  fireEvent.click(analysis);
  expect(analysis.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("combobox", { name: "현재 프로젝트" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
  expect(analysis.getAttribute("aria-current")).toBe("page");
});

it("설정 아이콘 하나에서 항목을 분류하고 분류 사이의 입력을 함께 저장한다", async () => {
  vi.mocked(native).mockResolvedValue({ tools: [] });
  vi.mocked(mutate).mockResolvedValue({ id: null });
  render(<App />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  const settings = screen.getByRole("button", { name: "설정" });
  expect(settings.textContent).toBe("");
  fireEvent.click(settings);
  const categories = screen.getByRole("navigation", { name: "설정 분류" });
  expect(within(categories).getAllByRole("button")).toHaveLength(5);
  fireEvent.click(within(categories).getByRole("button", { name: "화면" }));
  fireEvent.change(screen.getByRole("combobox", { name: "화면 테마" }), { target: { value: "dark" } });
  fireEvent.click(within(categories).getByRole("button", { name: "알림·회고" }));
  expect(screen.queryByRole("combobox", { name: "화면 테마" })).toBeNull();
  fireEvent.change(screen.getByLabelText("하루 마감 시각"), { target: { value: "22:00" } });
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  expect(mutate).toHaveBeenCalledWith({ operation: "settings", settings: { ...emptySnapshot.workspace.settings, theme: "dark", reviewTime: "22:00" } });
});
