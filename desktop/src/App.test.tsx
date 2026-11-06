// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { emptySnapshot } from "./test-fixture";
import { loadWorkspace, mutate, native } from "./api";
import type { Snapshot } from "./types";

vi.mock("./api", () => ({
  loadWorkspace: vi.fn(async () => emptySnapshot),
  native: vi.fn(),
  mutate: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}));
beforeEach(() => {
  vi.mocked(loadWorkspace).mockResolvedValue(structuredClone(emptySnapshot));
  vi.mocked(mutate).mockReset();
  vi.mocked(native).mockReset();
});
afterEach(cleanup);

it("스킬 프로젝트 등록 오류를 숨기지 않고 앱에서 복구 안내를 표시한다", async () => {
  vi.mocked(loadWorkspace).mockResolvedValue({
    ...structuredClone(emptySnapshot),
    projectConnectionErrors: [{ registration: "C:\\registry\\project.json", error: { code: "PROJECT_LOCATION_CONFLICT", message: "Location changed" } }],
  });
  render(<App />);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("스킬로 연결한 프로젝트 중 확인이 필요한 항목");
  expect(alert.textContent).toContain("C:\\registry\\project.json");
  expect(alert.textContent).toContain("프로젝트 폴더의 위치와 접근 권한");
});

it("기존 통합 스킬만 설치되어 있으면 기능별 스킬을 추가하는 업데이트를 제공한다", async () => {
  let updated = false;
  vi.mocked(native).mockImplementation(async (command) => {
    if (command === "tool_connections") return { tools: [{ host: "codex", path: "C:\\skills\\silolink", status: updated ? "installed" : "update_available", invocation: "$silolink-init", skills: ["silolink", "silolink-init", "silolink-docs"] }] };
    if (command === "connect_tool") { updated = true; return { status: "success", installations: [{ status: "installed" }] }; }
    throw new Error("Unexpected command");
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "AI 도구 연결" }));
  const codex = await screen.findByRole("region", { name: "Codex" });
  const update = within(codex).getByRole("button", { name: "스킬 업데이트" });
  expect(update.querySelector("svg.lucide-package-plus")?.getAttribute("aria-hidden")).toBe("true");
  fireEvent.click(update);
  expect(await screen.findByText("연결됨")).toBeTruthy();
  expect(vi.mocked(native)).toHaveBeenCalledWith("connect_tool", { host: "codex" });
});

it.each([["codex", "Codex"], ["claude", "Claude Code"], ["antigravity", "Antigravity"]])(
  "%s 스킬은 홈에서 설정으로 이동해 해당 도구만 연결하고 등록 상태를 다시 읽는다",
  async (host, label) => {
    let installed = false;
    vi.mocked(native).mockImplementation(async (command) => {
      if (command === "tool_connections") return { tools: [{ host, path: "C:\\user\\skills\\silolink", status: installed ? "installed" : "not_installed", invocation: host === "codex" ? "$silolink init" : "/silolink init" }] };
      if (command === "connect_tool") { installed = true; return { status: "success", installations: [{ status: "installed" }] }; }
      throw new Error("Unexpected command");
    });
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "AI 도구 연결" }));
    const card = await screen.findByRole("region", { name: label });
    const connect = within(card).getByRole("button", { name: "연결" });
    fireEvent.click(connect);
    await waitFor(() => expect(within(screen.getByRole("region", { name: label })).getByText("연결됨")).toBeTruthy());
    expect(vi.mocked(native)).toHaveBeenCalledWith("connect_tool", { host });
    expect(vi.mocked(mutate)).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region", { name: label })).getByText(/도구를 다시 열고/)).toBeTruthy();
  },
);

it("스킬 상태 조회 실패는 재시도할 수 있고 기존 스킬 충돌을 성공으로 표시하지 않는다", async () => {
  let readable = false;
  vi.mocked(native).mockImplementation(async (command) => {
    if (command === "tool_connections") {
      if (!readable) throw new Error("등록 상태를 읽을 수 없습니다");
      return { tools: [{ host: "codex", status: "conflict", path: "C:\\user\\skills", invocation: "$silolink init" }] };
    }
    throw new Error("Unexpected write");
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "AI 도구 연결" }));
  expect(await screen.findByText(/등록 상태를 읽을 수 없습니다/)).toBeTruthy();
  readable = true;
  fireEvent.click(screen.getByRole("button", { name: "연결 상태 다시 확인" }));
  expect(await screen.findByText("기존 스킬 확인 필요")).toBeTruthy();
  const codex = screen.getByRole("region", { name: "Codex" });
  expect((within(codex).getByRole("button", { name: "연결" }) as HTMLButtonElement).disabled).toBe(true);
  expect(vi.mocked(native).mock.calls.some(([command]) => command === "connect_tool")).toBe(false);
});
it("빈 설치는 예시 통계를 만들어내지 않고 연결 행동과 핵심 화면을 제공한다", async () => {
  render(<App />);
  expect(
    await screen.findByRole("heading", {
      name: "프로젝트가 없습니다",
    }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "프로젝트 연결" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "사용 분석" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "작업·일정" })).toBeTruthy();
  expect(screen.queryByText("SideNotes")).toBeNull();
});

it("처음 사용자는 명령어나 저장 위치 설정 없이 폴더를 선택해 첫 문서 결과를 확인한다", async () => {
  const connected: Snapshot = structuredClone(emptySnapshot);
  connected.workspace.projects = [{ id: "new", name: "내 프로젝트", root: "C:\\내 프로젝트" }];
  connected.inventories = [{ projectId: "new", report: {
    status: "success", documents: [{ id: "doc", path: "README.md", revision: "rev", bytes: 20, title: "내 문서", links: [] }], proposals: [{ kind: "repair-local-links", documents: [{ path: "README.md", revision: "rev" }], incomingLinks: [] }], warnings: [],
  } }];
  vi.mocked(native).mockResolvedValue("C:\\내 프로젝트");
  vi.mocked(mutate).mockImplementation(async () => {
    vi.mocked(loadWorkspace).mockResolvedValue(connected);
    return { id: "new" };
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "프로젝트 연결" }));
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByText(/CLI: silolink init/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "폴더 선택" }));
  await waitFor(() => expect((screen.getByRole("textbox", { name: "프로젝트 폴더" }) as HTMLInputElement).value).toBe("C:\\내 프로젝트"));
  fireEvent.click(screen.getByRole("button", { name: "선택한 프로젝트 연결" }));
  expect(await screen.findByRole("heading", { name: "첫 문서 확인" })).toBeTruthy();
  expect(vi.mocked(mutate)).toHaveBeenCalledWith({ operation: "connect", path: "C:\\내 프로젝트", initialize: true });
  expect(vi.mocked(native)).not.toHaveBeenCalledWith("collect_records", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "문서 1개 살펴보기" }));
  expect(await screen.findByRole("heading", { name: "기록과 문서" })).toBeTruthy();
  expect(screen.getByText("내 문서")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "연결이 끊긴 문서 링크" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "후보 원문 읽기" })).toBeTruthy();
});

it("새로 연결한 프로젝트를 선택하고 문서 읽기 실패를 성공과 구별한다", async () => {
  const value: Snapshot = structuredClone(emptySnapshot);
  value.workspace.projects = [{ id: "old", name: "기존 프로젝트", root: "C:\\old" }];
  vi.mocked(loadWorkspace).mockResolvedValue(value);
  vi.mocked(mutate).mockImplementation(async () => {
    const next = structuredClone(value);
    next.workspace.projects.push({ id: "new", name: "새 프로젝트", root: "C:\\new" });
    next.inventories = [{ projectId: "new", error: { code: "READ_FAILED", message: "문서를 읽지 못했습니다" } }];
    vi.mocked(loadWorkspace).mockResolvedValue(next);
    return { id: "new" };
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "프로젝트" }));
  fireEvent.click(screen.getByRole("button", { name: "연결 추가" }));
  fireEvent.change(screen.getByRole("textbox", { name: "프로젝트 폴더" }), { target: { value: "C:\\new" } });
  fireEvent.click(screen.getByRole("button", { name: "선택한 프로젝트 연결" }));
  expect(await screen.findByRole("heading", { name: "문서 확인을 마치지 못했습니다" })).toBeTruthy();
  expect((screen.getByRole("combobox", { name: "현재 프로젝트" }) as HTMLSelectElement).value).toBe("new");
  expect(screen.queryByRole("button", { name: /문서 \d+개 살펴보기/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "연결 추가" }));
  expect(screen.getByRole("textbox", { name: "프로젝트 폴더" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "문서 확인을 마치지 못했습니다" })).toBeNull();
});

it("폴더 선택 취소나 연결 실패에는 완료 화면으로 진행하지 않는다", async () => {
  vi.mocked(native).mockResolvedValue(null);
  vi.mocked(mutate).mockRejectedValue(new Error("폴더를 열 수 없습니다"));
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "프로젝트 연결" }));
  fireEvent.click(screen.getByRole("button", { name: "폴더 선택" }));
  await waitFor(() => expect(vi.mocked(native)).toHaveBeenCalled());
  expect(vi.mocked(mutate)).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "프로젝트 폴더" }), { target: { value: "C:\\missing" } });
  fireEvent.click(screen.getByRole("button", { name: "선택한 프로젝트 연결" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("폴더를 열 수 없습니다"));
  expect(screen.queryByRole("heading", { name: "첫 문서 확인" })).toBeNull();
  expect(screen.getByRole("button", { name: "선택한 프로젝트 연결" })).toBeTruthy();
});

it.each(["success", "partial"])("문서가 없는 %s 결과도 실제 범위와 다음 행동을 안내한다", async (status) => {
  const value: Snapshot = structuredClone(emptySnapshot);
  vi.mocked(mutate).mockImplementation(async () => {
    value.workspace.projects = [{ id: "empty", name: "빈 폴더", root: "C:\\empty" }];
    value.inventories = [{ projectId: "empty", report: { status, documents: [], proposals: [], warnings: status === "partial" ? [{ code: "UNREADABLE", path: "note.md" }] : [] } }];
    vi.mocked(loadWorkspace).mockResolvedValue(value);
    return { id: "empty" };
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "프로젝트 연결" }));
  fireEvent.change(screen.getByRole("textbox", { name: "프로젝트 폴더" }), { target: { value: "C:\\empty" } });
  fireEvent.click(screen.getByRole("button", { name: "선택한 프로젝트 연결" }));
  expect(await screen.findByText(/아직 읽을 수 있는 Markdown 문서/)).toBeTruthy();
  expect(Boolean(screen.queryByText(/일부 문서를 확인하지 못했을 수 있습니다/))).toBe(status === "partial");
  expect(screen.queryByRole("button", { name: /문서 \d+개 살펴보기/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "AI 기록 가져오기 설정" }));
  expect(screen.getByText(emptySnapshot.defaultStateDirectory)).toBeTruthy();
  expect(vi.mocked(native)).not.toHaveBeenCalledWith("collect_records", expect.anything());
});

it("연결한 프로젝트의 기록 수집을 저장 폴더 선택 없이 켤 수 있다", async () => {
  const connected = structuredClone(emptySnapshot);
  connected.workspace.projects = [{ id: "linked", name: "스킬 연결 프로젝트", root: "C:\\linked" }];
  vi.mocked(loadWorkspace).mockResolvedValue(connected);
  vi.mocked(mutate).mockImplementation(async () => {
    const enabled = structuredClone(connected);
    enabled.workspace.settings.backgroundEnabled = true;
    vi.mocked(loadWorkspace).mockResolvedValue(enabled);
    return { id: null };
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "프로젝트" }));
  fireEvent.click(screen.getByRole("tab", { name: "AI 기록 가져오기" }));
  expect(screen.getByText(emptySnapshot.defaultStateDirectory)).toBeTruthy();
  expect(vi.mocked(mutate)).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "AI 기록 수집 켜기" }));
  await waitFor(() => expect(vi.mocked(mutate)).toHaveBeenCalledWith({
    operation: "settings",
    settings: { ...connected.workspace.settings, backgroundEnabled: true },
  }));
  expect(await screen.findByText("AI 기록 자동 수집 켜짐")).toBeTruthy();
  expect(vi.mocked(native)).not.toHaveBeenCalledWith("choose_directory");
});
