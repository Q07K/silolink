import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookMarked,
  CalendarCheck2,
  ChevronRight,
  FileSearch,
  Files,
  Folders,
  GitCompareArrows,
  LayoutDashboard,
  Library,
  LoaderCircle,
  MessageCircle,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Scale,
  Settings2,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { errorMessage, loadWorkspace, mutate } from "./api";
import { Workspace } from "./context";
import type { ChangePlan, ChatSelection, NativeError, Page, Snapshot } from "./types";
import { Button } from "./components";
import { NavigationButton } from "./navigation-button";
import { Notifications } from "./notifications";
import { getSettingsSection, settingsSections } from "./settings-sections";
import {
  AnalysisPage,
  ReportsPage,
} from "./pages/insights";
import { HomePage } from "./pages/home";
import { LearningPage } from "./pages/learning";
import { ProjectsPage, DocumentsPage } from "./pages/projects";
import { ChangesPage } from "./pages/changes";
import { RulesPage } from "./pages/rules";
import {
  ResearchPage,
  WorkPage,
  SettingsPage,
  ChatPage,
} from "./pages/operations";

const navigation = [
  { label: "내 작업", items: [
    ["home", LayoutDashboard, "요약"],
    ["chat", MessageCircle, "대화"],
    ["work", CalendarCheck2, "작업·일정"],
    ["reports", NotebookPen, "일간·주간 회고"],
  ] },
  { label: "지식 탐색", items: [
    ["docs", Files, "기록·문서"],
    ["analysis", FileSearch, "사용 분석"],
    ["research", Library, "조사"],
    ["learn", BookMarked, "학습"],
  ] },
  { label: "프로젝트 실행", items: [
    ["projects", Folders, "프로젝트"],
    ["rules", Scale, "공통·로컬 규칙"],
    ["change", GitCompareArrows, "변경안 검토"],
  ] },
] as const;
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [tab, setTab] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [document, setDocument] = useState<{
    projectId: string;
    path: string;
    revision: string;
    fragment?: string;
  } | null>(null);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("chat");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [chatSelection, setChatSelection] = useState<ChatSelection>({});
  const [originId, setOriginId] = useState<string | undefined>();
  const [pendingPlan, setPendingPlan] = useState<ChangePlan | null>(null);
  const request = useRef(0);
  const operations = useRef(0);
  const workspaceElement = useRef<HTMLElement>(null);
  const sidebarElement = useRef<HTMLElement>(null);
  const settingsReturn = useRef<{ page: Page; tab: string }>({ page: "home", tab: "" });
  const settingsFocus = useRef<"current" | "return" | null>(null);
  const refresh = useCallback(async () => {
    const revision = ++request.current;
    const value = await loadWorkspace();
    if (revision !== request.current) return;
    setSnapshot(value);
    setProjectId((previous) =>
      value.workspace.projects.some((p) => p.id === previous)
        ? previous
        : (value.workspace.projects[0]?.id ?? ""),
    );
  }, []);
  const perform = useCallback(
    async (work: () => Promise<unknown>, success = "") => {
      operations.current++;
      setBusy(true);
      setError("");
      setMessage("");
      try {
        await work();
        await refresh();
        setMessage(success);
        return true;
      } catch (e) {
        const message = errorMessage(e);
        try {
          await refresh();
        } catch {
          setMessage("현재 상태를 새로 읽지 못했습니다. 다시 확인해 주세요.");
        }
        setError(message);
        return false;
      } finally {
        operations.current--;
        setBusy(operations.current > 0);
      }
    },
    [refresh],
  );
  useEffect(() => {
    void refresh().catch((e) => setError(errorMessage(e)));
    const subscriptions = [
      listen("workspace-changed", () => {
        void refresh().catch((e) => setError(errorMessage(e)));
      }),
      listen<{ error: NativeError | null }>("collection-finished", ({ payload }) => {
        if (payload.error) setError(errorMessage(payload.error));
        void refresh().catch((e) => setError(errorMessage(e)));
      }),
      listen<{ stage: string; path: string }>("document-progress", (e) =>
        setMessage(`${e.payload.stage} · ${e.payload.path}`),
      ),
    ];
    return () => {
      request.current++;
      subscriptions.forEach((subscription) => {
        void subscription.then((unlisten) => unlisten()).catch(() => undefined);
      });
    };
  }, [refresh]);
  useEffect(() => {
    window.document.documentElement.dataset.theme =
      snapshot?.workspace.settings.theme ?? "system";
  }, [snapshot?.workspace.settings.theme]);
  useEffect(() => {
    if (workspaceElement.current) workspaceElement.current.scrollTop = 0;
    setChatSelection({});
    setDocument((previous) =>
      previous?.projectId === projectId ? previous : null,
    );
  }, [projectId]);
  useEffect(() => {
    const destination = settingsFocus.current;
    if (!destination) return;
    settingsFocus.current = null;
    const selector = destination === "current" ? '.settings-navigation [aria-current="page"]' : ".sidebar-bottom button";
    sidebarElement.current?.querySelector<HTMLButtonElement>(selector)?.focus();
  }, [page]);

  function navigate(next: Page, sub = "") {
    if (next === "settings" && page !== "settings") {
      settingsReturn.current = { page, tab };
      settingsFocus.current = "current";
    }
    if (workspaceElement.current) workspaceElement.current.scrollTop = 0;
    setPage(next);
    setTab(sub);
    setError("");
    setMessage("");
  }
  function ask(text: string, nextMode = "chat", ids: string[] = [], selection: ChatSelection = {}, origin?: string) {
    setQuestion(text);
    setMode(nextMode);
    setEvidenceIds(ids);
    setChatSelection(selection);
    setOriginId(origin);
    navigate("chat");
  }
  const section = navigation.find((group) => group.items.some(([id]) => id === page));
  const pageName = section?.items.find(([id]) => id === page)?.[2] ?? "설정";
  const activeSettings = getSettingsSection(tab).id;
  const context = snapshot
    ? {
        snapshot,
        projectId,
        setProjectId,
        page,
        tab,
        setTab,
        busy,
        navigate,
        ask,
        chatSelection,
        refresh,
        perform,
        openDocument: (id: string, path: string, revision: string, fragment?: string) => {
          setDocument({ projectId: id, path, revision, fragment });
          navigate("docs", "reader");
        },
        pendingPlan,
        reviewPlan: (plan: ChangePlan) => {
          setPendingPlan(plan);
          setProjectId(plan.projectId);
          navigate("change");
        },
        clearPendingPlan: () => setPendingPlan(null),
      }
    : null;
  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#workspace-content">본문으로 이동</a>
      <header className="titlebar">
        <div className="app-brand">
          <img
            className="brand-icon"
            src="/branding/silolink-app-icon.png"
            alt=""
            width="40"
            height="40"
          />
          <span className="brand-name">SiloLink</span>
        </div>
        <div className="contextbar">
          <nav className="context-location" aria-label="현재 위치">
            {section && <><Button quiet onClick={() => navigate(section.items[0][0])}>{section.label}</Button><ChevronRight aria-hidden="true" /></>}
            {page === "docs" && tab === "reader" && document ? <>
              <Button quiet onClick={() => navigate("docs")}>기록·문서</Button><ChevronRight /><strong aria-current="page">{document.path}</strong>
            </> : <strong aria-current="page">{pageName}</strong>}
          </nav>
          <div className="context-actions">
            {snapshot && snapshot.workspace.projects.length > 0 ? (
              <select
                id="project-scope"
                aria-label="현재 프로젝트"
                disabled={busy}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {snapshot.workspace.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            ) : (
              <span className="project-placeholder">{snapshot ? "연결된 프로젝트 없음" : "불러오는 중…"}</span>
            )}
            {busy && <span role="status" aria-label="작업 중"><LoaderCircle className="spin" /></span>}
            <Notifications notices={snapshot?.workspace.notices ?? []} page={page} busy={busy}
              onRead={() => void perform(() => mutate({ operation: "readNotices" }))} navigate={navigate} />
            <Button quiet aria-label="새로고침" title="새로고침" disabled={busy} onClick={() => void perform(refresh)}><RefreshCw /></Button>
          </div>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar" id="app-navigation" ref={sidebarElement}>
          <div className="sidebar-controls">
            {!sidebarCollapsed && <span>{page === "settings" ? "설정" : "메뉴"}</span>}
            <Button className="button quiet sidebar-toggle" aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
              title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
              aria-expanded={!sidebarCollapsed} aria-controls="app-navigation"
              onClick={() => setSidebarCollapsed((value) => !value)}>
              {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </div>
          {page === "settings" && <div className="settings-back">
            <NavigationButton label="작업 공간으로" icon={<ArrowLeft />} compact={sidebarCollapsed}
              onClick={() => {
                settingsFocus.current = "return";
                navigate(settingsReturn.current.page, settingsReturn.current.tab);
              }} />
          </div>}
          {page === "settings" ? <nav className="settings-navigation" aria-label="설정 분류">
            <div className="nav-group">
              {settingsSections.map(({ id, label, icon: Icon }) => <NavigationButton key={id}
                label={label} icon={<Icon />} compact={sidebarCollapsed}
                aria-current={activeSettings === id ? "page" : undefined}
                onClick={() => navigate("settings", id)} />)}
            </div>
          </nav> : <nav aria-label="주요 탐색">
            {navigation.map((group) => (
              <div className="nav-group" key={group.label}>
                <p className="nav-group-label">{group.label}</p>
                {group.items.map(([id, Icon, label]) => (
                  <NavigationButton
                    key={id}
                    label={label}
                    icon={<Icon size={18} />}
                    compact={sidebarCollapsed}
                    aria-current={page === id ? "page" : undefined}
                    onClick={() => navigate(id)}
                  />
                ))}
              </div>
            ))}
          </nav>}
          {page !== "settings" && <div className="sidebar-bottom">
            <NavigationButton label="설정" icon={<Settings2 size={17} />} compact onClick={() => navigate("settings")} />
          </div>}
        </aside>
        <main className="workspace" ref={workspaceElement}>
          {!!snapshot?.projectConnectionErrors?.length && (
            <div role="alert" className="error-banner">
              <div>
                <strong>스킬로 연결한 프로젝트 중 확인이 필요한 항목이 있습니다.</strong>
                {snapshot.projectConnectionErrors.map((item) => (
                  <p key={item.registration}>{item.registration} · {errorMessage(item.error)}</p>
                ))}
                <p>프로젝트 폴더의 위치와 접근 권한을 확인한 뒤 연결을 다시 시도하세요.</p>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="error-banner">
              <span>{error}</span>
              <Button quiet aria-label="오류 닫기" onClick={() => setError("")}>
                <X />
              </Button>
            </div>
          )}
          {message && (
            <div role="status" className="status-banner">
              {message}
            </div>
          )}
          {!context ? (
            <div className="page">
              <div className="empty">
                {error ? (
                  <>
                    <h2>작업 공간을 열지 못했습니다</h2>
                    <Button onClick={() => void perform(refresh)}>
                      다시 시도
                    </Button>
                  </>
                ) : (
                  <>
                    <LoaderCircle className="spin" />
                    <p>프로젝트와 기록을 불러오는 중입니다.</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <Workspace value={context}>
              <div className="page" id="workspace-content" tabIndex={-1} key={page}>
                {page === "home" ? (
                  <HomePage />
                ) : page === "analysis" ? (
                  <AnalysisPage />
                ) : page === "learn" ? (
                  <LearningPage />
                ) : page === "research" ? (
                  <ResearchPage />
                ) : page === "projects" ? (
                  <ProjectsPage />
                ) : page === "docs" ? (
                  <DocumentsPage selected={document} />
                ) : page === "work" ? (
                  <WorkPage />
                ) : page === "reports" ? (
                  <ReportsPage />
                ) : page === "settings" ? (
                  <SettingsPage />
                ) : page === "change" ? (
                  <ChangesPage />
                ) : page === "rules" ? (
                  <RulesPage />
                ) : (
                  <ChatPage
                    question={question}
                    setQuestion={setQuestion}
                    mode={mode}
                    setMode={setMode}
                    evidenceIds={evidenceIds}
                    originId={originId}
                  />
                )}
              </div>
            </Workspace>
          )}
        </main>
      </div>
    </div>
  );
}
