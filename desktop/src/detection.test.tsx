// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { loadWorkspace, mutate } from "./api";
import { emptySnapshot } from "./test-fixture";
import type { RequestCandidate, Snapshot } from "./types";

vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), loadWorkspace: vi.fn(), native: vi.fn(), mutate: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => undefined) }));
afterEach(cleanup);

const candidate = (recordId: string, text: string, signals: RequestCandidate["signals"]): RequestCandidate => ({
  recordId, projectId: "a", provider: "claude", occurredAt: "2026-11-05T07:41:00Z", text, stage: "execute",
  basis: signals.some((x) => x.kind === "outcome") ? "observed" : "inferred", signals,
});
function snapshot(candidates: RequestCandidate[]): Snapshot {
  const s = structuredClone(emptySnapshot);
  s.workspace.projects = [{ id: "a", name: "프로젝트 A", root: "C:\\a" }];
  s.analysis.requestSignals = candidates;
  s.analysis.stages = { execute: 3, explore: 1 };
  s.analysis.intentionalRequests = 1;
  return s;
}
const asked = candidate("asked", "버튼 좀 자연스럽게 해줘", [
  { kind: "outcome", type: "clarification", reason: "요청 뒤에 AI가 무엇을 원하는지 되물었어요", recordId: "reply", quote: "마우스를 올렸을 때 모습을 말씀하시는 건가요?" },
  { kind: "expression", type: "phrase", reason: "기준을 ‘자연스럽게’에 맡긴 표현이 있어요", recordId: "asked", quote: "자연스럽게" },
]);
const worded = candidate("worded", "UI/UX 잘 적용해서 작업해줘", [
  { kind: "expression", type: "phrase", reason: "기준을 ‘잘 적용’에 맡긴 표현이 있어요", recordId: "worded", quote: "잘 적용" },
  { kind: "expression", type: "area-only", reason: "영역(UI/UX)만 정하고 대상·범위·완료 조건이 없어요", recordId: "worded", quote: "UI/UX" },
]);
async function openBroadRequests() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "사용 분석" }));
}

beforeEach(() => { vi.mocked(mutate).mockReset().mockResolvedValue({ id: null }); });

it("넓게 맡긴 요청 후보를 판단 이유·근거와 함께 보여 주고 대화 결과 신호를 먼저 둔다", async () => {
  vi.mocked(loadWorkspace).mockResolvedValue(snapshot([asked, worded]));
  await openBroadRequests();
  fireEvent.click(await screen.findByRole("tab", { name: "넓게 맡긴 요청 2" }));
  expect(screen.getByText(/요청 4건 · 탐색 1 · 진단 0 · 실행 3 · 검증 0 · 일부러 넓게 맡김 1건 제외/)).toBeTruthy();
  const card = screen.getByRole("region", { name: "버튼 좀 자연스럽게 해줘" });
  const text = card.textContent ?? "";
  expect(text.indexOf("대화 결과 · AI가 되물음")).toBeLessThan(text.indexOf("표현 · 자연스럽게"));
  expect(within(card).getByText("기록에서 확인")).toBeTruthy();
  expect(within(card).getByText("마우스를 올렸을 때 모습을 말씀하시는 건가요?")).toBeTruthy();
  const other = screen.getByRole("region", { name: "UI/UX 잘 적용해서 작업해줘" });
  expect(within(other).getByText("추정")).toBeTruthy();
  expect(within(other).getByText("표현 · 영역만 지정")).toBeTruthy();
  fireEvent.click(within(card).getByRole("button", { name: "일부러 넓게 맡김" }));
  expect(mutate).toHaveBeenCalledWith({ operation: "markRequest", recordId: "asked", intentional: true });
});

it("후보가 없으면 판단하지 않았다는 안내를 보여 준다", async () => {
  vi.mocked(loadWorkspace).mockResolvedValue(snapshot([]));
  await openBroadRequests();
  fireEvent.click(await screen.findByRole("tab", { name: "넓게 맡긴 요청 0" }));
  expect(screen.getByText("넓게 맡긴 요청 후보가 없습니다")).toBeTruthy();
});
