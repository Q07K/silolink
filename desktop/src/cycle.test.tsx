// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { emptySnapshot } from "./test-fixture";
import { loadWorkspace, mutate, native } from "./api";
import type { Discovery, Snapshot } from "./types";

vi.mock("./api", () => ({
  loadWorkspace: vi.fn(),
  native: vi.fn(),
  mutate: vi.fn(async () => ({ id: "new-id" })),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));

const discovery: Discovery = {
  id: "d1",
  fingerprint: "f1",
  kind: "ambiguous-term",
  title: "‘깔끔하게’를 여러 뜻으로 씀",
  summary: "레이아웃 정리와 코드 정리에 같은 말을 썼습니다.",
  basis: "inferred",
  projectIds: ["a"],
  evidence: [{ recordId: "rec-1", projectId: "a", quote: "화면 깔끔하게 해줘", occurredAt: "2026-11-02T01:00:00Z" }],
  suggestedAction: "learn",
  term: "깔끔하게",
  status: "new",
  source: "codex",
  createdAt: "2026-11-02T01:00:00Z",
  updatedAt: "2026-11-02T01:00:00Z",
  followUps: [],
};
function snapshot(): Snapshot {
  const value = structuredClone(emptySnapshot);
  value.workspace.projects = [
    { id: "a", name: "앱", root: "C:\\a" },
    { id: "b", name: "서버", root: "C:\\b" },
  ];
  value.workspace.discoveries = [structuredClone(discovery)];
  value.workspace.analysisRuns = [];
  value.workspace.tasks = [{ id: "t1", projectId: "a", title: "회원가입 화면 구현", phase: "구현", completed: false, userTested: false, dueAt: null, createdAt: "2026-11-02T00:00:00Z", spans: [] }];
  value.analysis.userRequests = 5;
  return value;
}
beforeEach(() => {
  vi.mocked(loadWorkspace).mockResolvedValue(snapshot());
  vi.mocked(mutate).mockClear();
  vi.mocked(native).mockReset();
});
afterEach(cleanup);

async function openAnalysis() {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "사용 분석" }));
  return screen.findByRole("article", { name: discovery.title });
}

it("발견은 근거 원문과 해석 여부를 보여주고 검토 결과와 후속 작업을 발견에 연결한다", async () => {
  const card = await openAnalysis();
  expect(within(card).getByText("해석·추정")).toBeTruthy();
  expect(within(card).getByText("화면 깔끔하게 해줘")).toBeTruthy();
  fireEvent.click(within(card).getByRole("button", { name: "타당함" }));
  await waitFor(() => expect(vi.mocked(mutate)).toHaveBeenCalledWith({ operation: "reviewDiscovery", id: "d1", status: "accepted", correction: null }));
  fireEvent.click(within(card).getByRole("button", { name: /작업으로/ }));
  await waitFor(() => expect(vi.mocked(mutate)).toHaveBeenCalledWith(expect.objectContaining({ operation: "addTask", originId: "d1", projectId: "a" })));
});

it("해석 수정은 내용이 있어야 저장하고 원래 발견과 함께 남긴다", async () => {
  const card = await openAnalysis();
  fireEvent.click(within(card).getByRole("button", { name: "해석 수정" }));
  const save = within(card).getByRole("button", { name: "해석 저장" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(within(card).getByRole("textbox", { name: "내 해석" }), { target: { value: "디자인 얘기만 한 것" } });
  fireEvent.click(save);
  await waitFor(() => expect(vi.mocked(mutate)).toHaveBeenCalledWith({ operation: "reviewDiscovery", id: "d1", status: "corrected", correction: "디자인 얘기만 한 것" }));
});

it("학습 카드는 근거 원문을 담아 학습 모드 대화로 이어지고 저장한 노트가 발견을 가리킨다", async () => {
  vi.mocked(native).mockImplementation(async (command) => {
    if (command === "start_chat") return { id: "chat-1" };
    throw new Error(`Unexpected ${command}`);
  });
  const card = await openAnalysis();
  fireEvent.click(within(card).getByRole("button", { name: /학습 카드/ }));
  const question = (await screen.findByRole("textbox", { name: "질문 입력" })) as HTMLTextAreaElement;
  expect(question.value).toContain("‘깔끔하게’을 학습 카드로 정리");
  expect((screen.getByRole("combobox", { name: "질문의 관점" }) as HTMLSelectElement).value).toBe("learning");
  fireEvent.click(screen.getByRole("button", { name: /질문하기/ }));
  await waitFor(() => expect(vi.mocked(native)).toHaveBeenCalledWith("start_chat", expect.objectContaining({
    request: expect.objectContaining({ mode: "learning", projectId: "a" }),
  })));
});

it("AI 분석은 선택한 도구와 범위로 실행하고 결과의 범위를 표시한다", async () => {
  const value = snapshot();
  value.workspace.analysisRuns = [{ id: "r0", provider: "claude", projectIds: ["a"], status: "completed", startedAt: "2026-11-02T00:00:00Z", endedAt: "2026-11-02T00:01:00Z", requestCount: 40, discoveryCount: 3, rejectedCount: 1 }];
  vi.mocked(loadWorkspace).mockResolvedValue(value);
  vi.mocked(native).mockResolvedValue({ id: "r1" });
  await openAnalysis();
  expect(screen.getByText(/요청 40개에서 발견 3개 · 근거가 맞지 않아 제외 1개/)).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "분석 범위" }), { target: { value: "all" } });
  fireEvent.click(screen.getByRole("button", { name: /AI 분석 실행/ }));
  await waitFor(() => expect(vi.mocked(native)).toHaveBeenCalledWith("run_analysis", { provider: "codex", projectIds: ["a", "b"] }));
});

it("규칙 비교에서 고른 규칙은 변경안 검토로 넘어가 기존 검사 절차를 거친다", async () => {
  const plan = { schemaVersion: 1, id: "11111111-1111-4111-8111-111111111111", projectId: "b", rationale: "규칙 추가", operations: [{ path: "AGENTS.md", expectedRevision: null, content: "# 작업 규칙\n" }], guards: [] };
  vi.mocked(native).mockImplementation(async (command, args) => {
    if (command === "compare_rules") return {
      summary: { shared: 0, variant: 0, local: 1, rules: 1 },
      groups: [{ status: "local", text: "커밋 메시지는 한국어로 쓴다", projectIds: ["a"], missingProjectIds: ["b"], items: [{ projectId: "a", projectName: "앱", path: "AGENTS.md", revision: "r", section: "규칙", text: "커밋 메시지는 한국어로 쓴다", line: 3 }] }],
      documents: [{ projectId: "a", path: "AGENTS.md", revision: "r", rules: 1 }],
      projects: [{ id: "a", name: "앱" }, { id: "b", name: "서버" }],
      method: "m",
    };
    if (command === "rule_plan") {
      expect(args).toEqual({ projectId: "b", path: "AGENTS.md", heading: "공통 규칙", rules: ["커밋 메시지는 한국어로 쓴다"] });
      return plan;
    }
    if (command === "check_plan") return { changeId: plan.id, changeState: "ready", rationale: plan.rationale, operations: [{ path: "AGENTS.md", before: null, after: "# 작업 규칙\n" }], conflicts: [], incomingLinks: [] };
    throw new Error(`Unexpected ${command}`);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "공통·로컬 규칙" }));
  fireEvent.click(screen.getByRole("button", { name: /규칙 비교/ }));
  fireEvent.click(await screen.findByRole("button", { name: /한 프로젝트에만 1/ }));
  expect(screen.getByText("없음: 서버")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /커밋 메시지는 한국어로 쓴다/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "반영할 프로젝트" }), { target: { value: "b" } });
  fireEvent.click(screen.getByRole("button", { name: "변경안 만들어 검토" }));
  await waitFor(() => expect(vi.mocked(native)).toHaveBeenCalledWith("check_plan", { projectId: "b", plan }));
});

it("작업 예상은 비슷한 완료 작업의 실제 시간과 근거 수를 함께 보여준다", async () => {
  vi.mocked(native).mockImplementation(async (command) => {
    if (command === "estimate_task") return {
      estimate: { lowMinutes: 60, medianMinutes: 90, highMinutes: 180, basisTaskIds: ["x", "y"], method: "similar-completed-tasks", createdAt: "now" },
      references: [{ taskId: "x", title: "로그인 화면 구현", projectId: "b", phase: "구현", minutes: 90, userTested: true, similarity: 0.5 }],
      changed: true,
    };
    throw new Error(`Unexpected ${command}`);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "작업·일정" }));
  fireEvent.click(screen.getByRole("button", { name: "실적으로 예상" }));
  expect(await screen.findByText(/로그인 화면 구현 · 서버 · 구현 · 실제 1시간 30분 · 사용자 확인/)).toBeTruthy();
  expect(screen.getByText(/비슷한 완료 작업 2개 기준/)).toBeTruthy();
});

it("회고에서 프로젝트 정리서를 미리 보고 저장한다", async () => {
  vi.mocked(native).mockImplementation(async (command) => {
    if (command === "preview_project_report") return { markdown: "# 앱 정리서\n\n## 범위와 한계\n" };
    if (command === "export_project_report") return { path: "C:\\out.md" };
    throw new Error(`Unexpected ${command}`);
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "일간·주간 회고" }));
  fireEvent.click(screen.getByRole("button", { name: "미리 보기" }));
  expect(await screen.findByRole("heading", { name: "앱 정리서" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Markdown으로 저장/ }));
  await waitFor(() => expect(vi.mocked(native)).toHaveBeenCalledWith("export_project_report", { projectId: "a" }));
});
