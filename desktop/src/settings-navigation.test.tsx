// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { loadWorkspace, mutate, native } from "./api";
import { createPreviewSnapshot } from "./design-preview/data";

vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), loadWorkspace: vi.fn(), native: vi.fn(), mutate: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));
beforeEach(() => {
  vi.mocked(loadWorkspace).mockResolvedValue(createPreviewSnapshot("populated", "light"));
  vi.mocked(native).mockReset().mockResolvedValue({ tools: [] });
});
afterEach(cleanup);

it.each([false, true])("설정은 사이드바를 교체하고 이전 화면·탭·프로젝트·접힘 상태로 돌아온다 (접힘 %s)", async (collapsed) => {
  const { container } = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "작업·일정" }));
  fireEvent.click(screen.getByRole("tab", { name: "다음 계획" }));
  fireEvent.change(screen.getByRole("combobox", { name: "현재 프로젝트" }), { target: { value: "design-portfolio" } });
  if (collapsed) fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  expect(screen.queryByRole("navigation", { name: "주요 탐색" })).toBeNull();
  const categories = screen.getByRole("navigation", { name: "설정 분류" });
  expect(document.activeElement).toBe(within(categories).getByRole("button", { name: "AI 도구" }));
  expect(categories.closest("#app-navigation")).toBeTruthy();
  expect(screen.getByRole("main").contains(categories)).toBe(false);
  expect(within(categories).getAllByRole("button")).toHaveLength(6);
  const appearance = within(categories).getByRole("button", { name: "화면" });
  fireEvent.click(appearance);
  expect(appearance.getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("combobox", { name: "화면 테마" })).toBeTruthy();
  if (collapsed) {
    fireEvent.mouseEnter(appearance);
    expect(screen.getByRole("tooltip").textContent).toBe("화면");
    fireEvent.mouseLeave(appearance);
  }
  expect(container.querySelector(".brand-caption")).toBeNull();
  expect(screen.queryByText("개인 지식 작업 공간")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "작업 공간으로" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "설정" }));
  expect(screen.getByRole("navigation", { name: "주요 탐색" })).toBeTruthy();
  expect(screen.queryByRole("navigation", { name: "설정 분류" })).toBeNull();
  expect(screen.getByRole("tabpanel", { name: "다음 계획" })).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "현재 프로젝트" }) as HTMLSelectElement).value).toBe("design-portfolio");
  expect(screen.getByRole("button", { name: collapsed ? "사이드바 펼치기" : "사이드바 접기" })).toBeTruthy();
});

it("요청 감지 설정에서 기본 위임 표현을 빼고 내 표현을 더해 저장한다", async () => {
  vi.mocked(mutate).mockReset().mockResolvedValue({ id: null });
  render(<App />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  fireEvent.click(screen.getByRole("button", { name: "설정" }));
  fireEvent.click(within(screen.getByRole("navigation", { name: "설정 분류" })).getByRole("button", { name: "요청 감지" }));
  expect(screen.getByRole("heading", { name: "요청 감지" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "깔끔하게 빼기" }));
  expect(screen.getByRole("button", { name: "깔끔하게 다시 쓰기" })).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "표현 추가" }), { target: { value: " 대강 " } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  expect(screen.getByRole("button", { name: "대강 삭제" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
  expect(mutate).toHaveBeenCalledWith({
    operation: "settings",
    settings: expect.objectContaining({ delegationPhrasesRemoved: ["깔끔하게"], delegationPhrasesAdded: ["대강"] }),
  });
});
