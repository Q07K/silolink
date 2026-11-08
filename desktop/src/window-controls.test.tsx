// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { isTauri } from "@tauri-apps/api/core";
import { WindowControls } from "./window-controls";

const window = vi.hoisted(() => {
  let resized: (() => void) | undefined;
  return {
    minimize: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    isMaximized: vi.fn(async () => false),
    onResized: vi.fn(async (handler: () => void) => { resized = handler; return () => undefined; }),
    resize: () => resized?.(),
  };
});
vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => true) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => window }));

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(true);
  window.isMaximized.mockResolvedValue(false);
  for (const fn of [window.minimize, window.toggleMaximize, window.close]) fn.mockClear();
});
afterEach(cleanup);

it("창 버튼 세 개가 창을 최소화·최대화·닫는다", async () => {
  render(<WindowControls />);
  fireEvent.click(screen.getByRole("button", { name: "최소화" }));
  fireEvent.click(await screen.findByRole("button", { name: "최대화" }));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(window.minimize).toHaveBeenCalledOnce();
  expect(window.toggleMaximize).toHaveBeenCalledOnce();
  expect(window.close).toHaveBeenCalledOnce();
});

it("창이 최대화되면 최대화 버튼이 이전 크기로 버튼이 된다", async () => {
  render(<WindowControls />);
  await screen.findByRole("button", { name: "최대화" });
  window.isMaximized.mockResolvedValue(true);
  await act(async () => window.resize());
  expect(await screen.findByRole("button", { name: "이전 크기로" })).toBeTruthy();
});

it("데스크톱 앱 밖에서는 창 기능을 부르지 않는다", () => {
  vi.mocked(isTauri).mockReturnValue(false);
  render(<WindowControls />);
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(window.close).not.toHaveBeenCalled();
});
