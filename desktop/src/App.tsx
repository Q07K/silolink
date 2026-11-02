import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CalendarCheck2,
  Files,
  Layers2,
  LoaderCircle,
  MessageCircle,
  Orbit,
  RefreshCw,
  ScanLine,
  Settings2,
  Sunset,
  Telescope,
  Lightbulb,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { errorMessage, loadWorkspace, mutate } from "./api";
import { Workspace } from "./context";
import type { Page, Snapshot } from "./types";
import { Button } from "./components";
import {
  HomePage,
  AnalysisPage,
  LearningPage,
  ReportsPage,
} from "./pages/insights";
import { ProjectsPage, DocumentsPage } from "./pages/projects";
import { ChangesPage } from "./pages/changes";
import {
  ResearchPage,
  WorkPage,
  SettingsPage,
  ChatPage,
} from "./pages/operations";

const navigation = [
  ["home", Orbit, "요약"],
  ["analysis", ScanLine, "사용 분석"],
  ["research", Telescope, "조사"],
  ["learn", Lightbulb, "학습"],
  ["projects", Layers2, "프로젝트"],
  ["work", CalendarCheck2, "작업·일정"],
  ["docs", Files, "기록·문서"],
] as const;
const secondaryLabels: Partial<Record<Page, string>> = {
  reports: "일간·주간 회고",
  settings: "알림·설정",
  chat: "대화",
  change: "변경안 검토",
};
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>("home");
  const [tab, setTab] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [document, setDocument] = useState<{
    projectId: string;
    path: string;
    revision: string;
    fragment?: string;
  } | null>(null);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("chat");
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const request = useRef(0);
  const operations = useRef(0);
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
      listen("collection-finished", () => {
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
    setDocument((previous) =>
      previous?.projectId === projectId ? previous : null,
    );
  }, [projectId]);
  function navigate(next: Page, sub = "") {
    setPage(next);
    setTab(sub);
    setError("");
    setMessage("");
    setNotifications(false);
  }
  function ask(text: string, nextMode = "chat", ids: string[] = []) {
    setQuestion(text);
    setMode(nextMode);
    setEvidenceIds(ids);
    navigate("chat");
  }
  const pageName =
    navigation.find((n) => n[0] === page)?.[2] ??
    secondaryLabels[page] ??
    "요약";
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
        refresh,
        perform,
        openDocument: (id: string, path: string, revision: string, fragment?: string) => {
          setDocument({ projectId: id, path, revision, fragment });
          navigate("docs", "reader");
        },
      }
    : null;
  return (
    <div className="app-shell">
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
        <div className="titlebar-meta">
          <span className="titlebar-caption">개인 작업 공간</span>
          <span className="native-label">
            {busy ? (
              <>
                <LoaderCircle className="spin" />
                작업 중
              </>
            ) : (
              "내 프로젝트, 이어지는 지식"
            )}
          </span>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <div className="personal">
            <span className="avatar">나</span>
            <span>나의 작업 공간</span>
          </div>
          <nav aria-label="주요 탐색">
            {navigation.map(([id, Icon, label]) => (
              <button
                type="button"
                key={id}
                aria-current={page === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <button type="button" onClick={() => navigate("reports")}>
              <Sunset size={17} />
              일간·주간 회고
            </button>
            <button type="button" onClick={() => navigate("settings")}>
              <Settings2 size={17} />
              알림·설정
            </button>
            <p>
              {snapshot?.workspace.settings.backgroundEnabled
                ? "백그라운드 안내 사용 중"
                : "백그라운드 안내 꺼짐"}
            </p>
          </div>
        </aside>
        <main className="workspace">
          <div className="contextbar">
            <div className="inline">
              <span>내 공간</span>
              <span>/</span>
              <strong>{pageName}</strong>
            </div>
            <div className="inline">
              {snapshot && snapshot.workspace.projects.length > 0 && (
                <select
                  aria-label="현재 프로젝트"
                  disabled={busy}
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  {snapshot.workspace.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <Button quiet aria-label="새 대화" onClick={() => ask("")}>
                <MessageCircle />
              </Button>
              <Button
                quiet
                aria-label="알림"
                aria-expanded={notifications}
                onClick={() => setNotifications((v) => !v)}
              >
                <Bell />
                {snapshot &&
                  snapshot.workspace.notices.filter((n) => !n.read).length >
                    0 && (
                    <span className="notification-count">
                      {snapshot.workspace.notices.filter((n) => !n.read).length}
                    </span>
                  )}
              </Button>
              <Button
                quiet
                aria-label="새로고침"
                disabled={busy}
                onClick={() => void perform(refresh)}
              >
                <RefreshCw />
              </Button>
            </div>
          </div>
          {notifications && (
            <aside className="notifications">
              <div className="section-heading">
                <h3>발견과 돌아보기</h3>
                <Button
                  quiet
                  aria-label="알림 닫기"
                  onClick={() => setNotifications(false)}
                >
                  <X />
                </Button>
              </div>
              {snapshot?.workspace.notices.length ? (
                snapshot.workspace.notices
                  .slice()
                  .reverse()
                  .slice(0, 20)
                  .map((n) => (
                    <button
                      type="button"
                      className="notification-item"
                      key={n.id}
                      onClick={() =>
                        navigate(
                          n.kind === "pattern" ? "analysis" : "reports",
                          n.kind,
                        )
                      }
                    >
                      <span>{n.title}</span>
                      <small>{n.read ? "읽음" : "새 알림"}</small>
                    </button>
                  ))
              ) : (
                <p className="muted">
                  아직 알림이 없습니다. 설정에서 백그라운드 안내와 마감 시각을
                  확인하세요.
                </p>
              )}
              <Button
                quiet
                onClick={() =>
                  void perform(() => mutate({ operation: "readNotices" }))
                }
              >
                모두 읽음
              </Button>
            </aside>
          )}
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
              <div className="page">
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
                ) : (
                  <ChatPage
                    question={question}
                    setQuestion={setQuestion}
                    mode={mode}
                    setMode={setMode}
                    evidenceIds={evidenceIds}
                  />
                )}
              </div>
            </Workspace>
          )}
        </main>
      </div>
      <footer className="app-footer">
        <span>원문 · 근거 · 나의 다음 행동</span>
        <span>
          {snapshot?.workspace.projects.length ?? 0}개 프로젝트 ·{" "}
          {snapshot?.records.length ?? 0}개 기록
        </span>
      </footer>
    </div>
  );
}
