// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import DesignSystem from "./DesignSystem";
import { tokenGroups } from "./Catalog";

afterEach(cleanup);

// Vitest strips CSS imports (even ?raw), so read the source file directly (vitest runs from desktop/).
const fsModule = "node:fs";

it("토큰 탭은 tokens.css에 선언한 모든 토큰을 한 번씩 보여 준다", async () => {
  const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync(path: string, encoding: "utf8"): string };
  const tokensCss = readFileSync("src/styles/tokens.css", "utf8");
  const declared = [...new Set([...tokensCss.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(([, name]) => name))];
  const listed = tokenGroups.flatMap(({ tokens }) => tokens);
  expect(new Set(listed).size).toBe(listed.length);
  expect([...listed].sort()).toEqual([...declared].sort());
});

it("상태 탭은 버튼과 입력의 상태를 밝게·어둡게로 나란히 보여 준다", () => {
  render(<DesignSystem />);
  const catalog = screen.getByRole("tablist", { name: "디자인 시스템 분류" });
  fireEvent.click(within(catalog).getByRole("tab", { name: "상태" }));
  const buttons = screen.getByRole("region", { name: "버튼 상태" });
  expect(buttons.querySelectorAll('[data-scheme="light"], [data-scheme="dark"]')).toHaveLength(2);
  expect(buttons.querySelectorAll('[aria-busy="true"]')).toHaveLength(10);
  expect(screen.getByRole("region", { name: "입력 상태" }).querySelectorAll('[aria-invalid="true"]').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "작성 내용 버리기" }));
  expect(screen.getByRole("dialog", { name: "작성 내용을 버릴까요?" })).toBeTruthy();
});
