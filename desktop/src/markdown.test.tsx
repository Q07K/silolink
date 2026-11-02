// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MarkdownContent } from "./components";
import { Workspace, type WorkspaceContext } from "./context";
import { emptySnapshot } from "./test-fixture";
import { native } from "./api";

vi.mock("./api", () => ({ native: vi.fn() }));
let context: WorkspaceContext;
const scroll = vi.fn();
beforeEach(() => {
  vi.mocked(native).mockReset();
  scroll.mockReset();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
  const snapshot = structuredClone(emptySnapshot);
  snapshot.inventories = [{ projectId: "p", report: { status: "success", documents: [
    { id: "1", path: "docs/start.md", title: "시작", revision: "r1", bytes: 1, links: [] },
    { id: "2", path: "docs/한글 안내.md", title: "안내", revision: "r2", bytes: 1, links: [] },
  ], proposals: [], warnings: [] } }];
  context = {
    snapshot, projectId: "p", setProjectId: vi.fn(), page: "docs", tab: "reader", setTab: vi.fn(),
    busy: false, navigate: vi.fn(), ask: vi.fn(), refresh: vi.fn(),
    perform: vi.fn(async (work) => { await work(); return true; }), openDocument: vi.fn(),
  };
});
afterEach(cleanup);
function show(text: string) {
  return render(<Workspace value={context}><MarkdownContent text={text} documentPath="docs/start.md" /></Workspace>);
}

it("시작 조건 표를 실제 표로 렌더링하고 정렬·강조·이스케이프 파이프를 보존한다", () => {
  show("## 2-3. 언제 시작하나\n\n| 단계 | 시작 | 비용 |\n| :--- | :---: | ---: |\n| 화풍 | **기획 승인 직후** | `4` |\n| 디자인 | 각본 승인 \\| 동시 | 10 |");
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["단계", "시작", "비용"]);
  expect(within(table).getByText("각본 승인 | 동시")).toBeTruthy();
  expect(within(table).getByText("기획 승인 직후").tagName).toBe("STRONG");
  expect(within(table).getByRole("columnheader", { name: "비용" }).style.textAlign).toBe("right");
  expect(table.closest(".markdown-table-scroll")).toHaveProperty("tabIndex", 0);
});

it("체크 목록은 읽기 전용 상태로 표시하고 취소선·중첩 목록을 렌더링한다", () => {
  const { container } = show("- [x] 승인 완료\n- [ ] 시트 그리기\n  - ~~이전 방향~~\n  - 다음 방향");
  const checks = screen.getAllByRole("checkbox") as HTMLInputElement[];
  expect(checks.map((check) => [check.checked, check.disabled])).toEqual([[true, true], [false, true]]);
  expect(container.querySelector("del")?.textContent).toBe("이전 방향");
  expect(container.querySelector("ul ul")).toBeTruthy();
  expect(context.perform).not.toHaveBeenCalled();
});

it("일반 URL도 외부 참조 버튼으로 연결하며 읽는 것만으로 열지 않는다", () => {
  show("근거: https://example.org/guide.");
  const link = screen.getByRole("button", { name: "https://example.org/guide" });
  expect(native).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(native).toHaveBeenCalledWith("open_reference", { url: "https://example.org/guide" });
});

it("같은 문서의 한글 제목·중복 제목 앵커는 다시 읽지 않고 해당 위치로 이동한다", () => {
  show("[첫 장](#한글-제목) · [다음 장](start.md#한글-제목-1)\n\n## 한글 제목\n\n내용\n\n## 한글 제목");
  const headings = screen.getAllByRole("heading", { name: "한글 제목" });
  expect(headings[0].id).not.toBe(headings[1].id);
  fireEvent.click(screen.getByRole("link", { name: "첫 장" }));
  expect(scroll.mock.instances.at(-1)).toBe(headings[0]);
  fireEvent.click(screen.getByRole("link", { name: "다음 장" }));
  expect(scroll.mock.instances.at(-1)).toBe(headings[1]);
  expect(context.openDocument).not.toHaveBeenCalled();
  expect(context.perform).not.toHaveBeenCalled();
});

it("각주와 돌아가기는 여러 본문이 있어도 자기 본문 안에서 이동한다", () => {
  const text = "판단 근거[^a]\n\n[^a]: 확인한 문서";
  const { container } = render(<Workspace value={context}><MarkdownContent text={text} /><MarkdownContent text={text} /></Workspace>);
  const bodies = container.querySelectorAll<HTMLElement>(".markdown");
  const refs = within(bodies[1]).getAllByRole("link");
  fireEvent.click(refs[0]);
  expect(scroll.mock.instances.at(-1)).toBe(bodies[1].querySelector("li[id]"));
  fireEvent.click(refs[1]);
  expect(scroll.mock.instances.at(-1)).toBe(refs[0]);
  const ids = Array.from(container.querySelectorAll("[id]"), (element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(bodies[1].querySelector(`[id="${refs[0].getAttribute("aria-describedby")}"]`)).toBeTruthy();
  expect(context.openDocument).not.toHaveBeenCalled();
});

it("한글·공백 상대 문서는 현재 문서 폴더를 기준으로 확인하며 범위 밖 링크는 열지 않는다", () => {
  show("[안내](./%ED%95%9C%EA%B8%80%20%EC%95%88%EB%82%B4.md) [범위 밖](../../secret.md)");
  fireEvent.click(screen.getByRole("button", { name: "안내" }));
  expect(context.openDocument).toHaveBeenCalledWith("p", "docs/한글 안내.md", "r2");
  expect(screen.queryByRole("button", { name: "범위 밖" })).toBeNull();
});

it("다른 문서의 제목 링크는 문서와 함께 이동할 앵커도 전달한다", () => {
  show("[안내의 시작](./%ED%95%9C%EA%B8%80%20%EC%95%88%EB%82%B4.md#시작)");
  fireEvent.click(screen.getByRole("button", { name: "안내의 시작" }));
  expect(context.openDocument).toHaveBeenCalledWith("p", "docs/한글 안내.md", "r2", "#%EC%8B%9C%EC%9E%91");
});

it("문서를 읽은 뒤 전달받은 앵커 위치로 이동하고 코드 속 표시는 대상으로 삼지 않는다", () => {
  render(<Workspace value={context}><MarkdownContent text={"`#시작`\n\n## 시작"} fragment="#%EC%8B%9C%EC%9E%91" /></Workspace>);
  const heading = screen.getByRole("heading", { name: "시작" });
  expect(scroll.mock.instances.at(-1)).toBe(heading);
  expect(document.activeElement).toBe(heading);
});

it("코드 안의 표·HTML·체크 문법은 파싱하지 않고 그대로 보존한다", () => {
  const source = "| A | B |\n|---|---|\n| 1 | 2 |\n<script>alert(1)</script>\n- [x] code";
  const { container } = show("```txt\n" + source + "\n```\n\n인라인 `a_b` 코드");
  expect(container.querySelector("pre code")?.textContent).toBe(source + "\n");
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("p code")?.textContent).toBe("a_b");
});

it("HTML·스크립트 URL·추적 이미지를 실행하거나 자동으로 요청하지 않는다", () => {
  const { container } = show('<script>alert(1)</script>\n\n<iframe src="https://example.org"></iframe>\n\n[실행](javascript:alert%281%29) ![추적](https://example.org/track.png)');
  expect(container.querySelector("script, iframe, img")).toBeNull();
  expect(screen.queryByRole("button", { name: "실행" })).toBeNull();
  expect(native).not.toHaveBeenCalled();
});
