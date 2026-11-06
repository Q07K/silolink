// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import DesignPreview from "./Preview";
import { configurePreview } from "./api";

vi.mock("../api", () => import("./api"));
vi.mock("@tauri-apps/api/event", () => import("./events"));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => false, invoke: vi.fn() }));
beforeEach(() => { configurePreview({ scenario: "populated", theme: "light" }); vi.mocked(invoke).mockClear(); });
afterEach(cleanup);

it("실제 앱 화면으로 예시 문서를 읽고 주석을 달 위치까지 이동할 수 있다", async () => {
  render(<DesignPreview />);
  expect(await screen.findByRole("heading", { name: "전체 프로젝트" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "디자인 미리보기" }).textContent).toContain("예시 데이터");
  fireEvent.click(screen.getByRole("button", { name: "기록·문서" }));
  fireEvent.click(screen.getAllByRole("button", { name: "읽기" })[0]);
  expect(await screen.findByRole("heading", { name: "SiloLink 프로젝트 소개" })).toBeTruthy();
  expect(screen.getByText(/실제 프로젝트 파일이 아닙니다/)).toBeTruthy();
  expect(invoke).not.toHaveBeenCalled();
});

it("테마 전환은 현재 메뉴를 유지하고 첫 사용 상태도 볼 수 있다", async () => {
  render(<DesignPreview />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  fireEvent.click(screen.getByRole("button", { name: "작업·일정" }));
  fireEvent.change(screen.getByRole("combobox", { name: "미리보기 테마" }), { target: { value: "dark" } });
  expect(screen.getByRole("heading", { name: "작업과 다음 계획" })).toBeTruthy();
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.change(screen.getByRole("combobox", { name: "미리보기 화면 상태" }), { target: { value: "empty" } });
  expect(await screen.findByRole("heading", { name: "프로젝트가 없습니다" })).toBeTruthy();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(invoke).not.toHaveBeenCalled();
});

it("미리보기의 저장 버튼은 실제 변경 없이 안내를 표시한다", async () => {
  render(<DesignPreview />);
  await screen.findByRole("heading", { name: "전체 프로젝트" });
  const task = screen.getByText("메뉴 구조와 화면 이름 검토").closest("label")!;
  fireEvent.click(within(task).getByRole("checkbox"));
  const toolbar = screen.getByRole("region", { name: "디자인 미리보기" });
  expect((await within(toolbar).findByText("저장·수집·AI 실행은 데스크톱 앱에서 사용할 수 있습니다.")).closest('[role="status"]')).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(within(task).getByRole("checkbox")).toHaveProperty("checked", false);
  fireEvent.click(within(toolbar).getByRole("button", { name: "미리보기 안내 닫기" }));
  expect(within(toolbar).queryByText("저장·수집·AI 실행은 데스크톱 앱에서 사용할 수 있습니다.")).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});
