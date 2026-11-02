import { useEffect, useState } from "react";
import {
  ExternalLink,
  Play,
  Plus,
  Square,
  ArrowUp,
  LoaderCircle,
} from "lucide-react";
import { mutate, native } from "../api";
import { useWorkspace } from "../context";
import { ToolConnections } from "../tool-connections";
import {
  Badge,
  Button,
  Empty,
  Heading,
  MarkdownContent,
  NoProject,
  Tabs,
} from "../components";
import { duration, durationUnion, taskMilliseconds, when } from "../metrics";
import type { Settings, Source } from "../types";

const sourceKinds: { [kind: string]: string } = {
  official: "공식",
  paper: "논문·연구",
  community: "커뮤니티",
  interpretation: "AI 해석",
};
export function ResearchPage() {
  const { snapshot: s, projectId, perform, busy, ask } = useWorkspace();
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [kind, setKind] = useState("official"),
    [claim, setClaim] = useState(""),
    [conditions, setConditions] = useState(""),
    [version, setVersion] = useState(""),
    [verified, setVerified] = useState(false);
  if (!projectId) return <NoProject />;
  const sources = s.workspace.sources.filter((r) => r.projectId === projectId);
  function save() {
    const source: Source = {
      id: "",
      projectId,
      title,
      url,
      kind,
      claim,
      conditions,
      version,
      verified,
      recordedAt: "",
    };
    void perform(
      () => mutate({ operation: "source", source }),
      "출처와 확인 상태를 저장했습니다.",
    ).then((ok) => {
      if (ok) {
        setEditing(false);
        setTitle("");
        setUrl("");
        setClaim("");
        setConditions("");
        setVersion("");
        setVerified(false);
      }
    });
  }
  return (
    <>
      <Heading
        title="판단에 필요한 조사"
        sub="공식·논문·이용자 경험과 AI 해석을 구별해 비교합니다."
        action={
          <Button primary onClick={() => setEditing((v) => !v)}>
            <Plus />
            근거 추가
          </Button>
        }
      />
      {editing && (
        <section className="panel spaced">
          <h3>출처와 주장을 함께 기록</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="columns">
              <label>
                자료 이름
                <input
                  required
                  maxLength={240}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                근거 종류
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {["official", "paper", "community"].map((k) => (
                    <option key={k} value={k}>
                      {sourceKinds[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              HTTPS 원문 링크
              <input
                required
                type="url"
                pattern="https://.*"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label>
              확인할 주장·찬반 이유
              <textarea
                required
                maxLength={20000}
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
              />
            </label>
            <div className="columns">
              <label>
                적용 조건·다른 의견
                <textarea
                  maxLength={20000}
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                />
              </label>
              <label>
                관련 버전·환경
                <input
                  maxLength={200}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </label>
            </div>
            <label className="checkline">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
              />
              <span>
                내가 원문 내용을 확인했습니다
                <small>
                  링크만 등록한 자료를 확인 완료로 표시하지 않습니다.
                </small>
              </span>
            </label>
            <Button primary type="submit" disabled={busy}>
              근거 저장
            </Button>
          </form>
        </section>
      )}
      {sources.length ? (
        <section className="panel spaced">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "24%" }}>출처와 확인 상태</th>
                <th>주장·상반된 조건</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <Badge accent={source.kind === "official"}>
                      {sourceKinds[source.kind]}
                    </Badge>
                    <h3 className="spaced-text">{source.title}</h3>
                    <p className="micro">
                      {source.verified ? "사용자 원문 확인" : "원문 확인 필요"}
                    </p>
                    <Button
                      quiet
                      onClick={() =>
                        void perform(() =>
                          native("open_reference", { url: source.url }),
                        )
                      }
                    >
                      <ExternalLink />
                      원문
                    </Button>
                  </td>
                  <td>
                    <p>{source.claim}</p>
                    {source.conditions && (
                      <p className="muted">조건·반론: {source.conditions}</p>
                    )}
                    <p className="micro">
                      {source.version || "버전·환경 미기록"} · 등록{" "}
                      {when(source.recordedAt)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!sources.some((r) => r.kind === "official" && r.verified) && (
            <div className="note">
              확인한 공식 자료가 없습니다. 조사 근거가 불완전한 상태로
              유지합니다.
            </div>
          )}
          <Button
            primary
            onClick={() =>
              ask(
                "등록한 출처의 주장·찬반 이유·버전·환경 차이를 비교해줘. 공식 확인이 빠졌거나 상반되는 부분을 숨기지 말고, 현재 프로젝트에 적용할 판단과 미확인 조건을 구별해줘. 원문을 직접 확인하지 않았다면 확인한 것처럼 말하지 말아줘.",
                "research",
              )
            }
          >
            선택한 근거로 비교 대화
          </Button>
        </section>
      ) : (
        <Empty
          title="다시 쓸 수 있는 조사 근거를 모아보세요"
          action={
            <Button primary onClick={() => setEditing(true)}>
              첫 근거 추가
            </Button>
          }
        >
          공식 자료는 필수 근거로, 주제에 맞는 논문과 실제 이용자 의견은 별도로
          기록합니다. 서로 다른 이유와 적용 조건을 함께 비교할 수 있습니다.
        </Empty>
      )}
      {s.workspace.notes
        .filter((n) => n.projectId === projectId && n.kind === "research")
        .map((n) => (
          <article className="panel spaced" key={n.id}>
            <Badge>조사 정리·해석</Badge>
            <h2 className="spaced-text">{n.title}</h2>
            <MarkdownContent text={n.body} />
          </article>
        ))}
      <div className="note">
        현재는 등록한 원문·문서·기록을 대화의 근거로 전달합니다. 링크를 등록하는
        동작이 웹 원문의 자동 수집·검증을 뜻하지 않습니다.
      </div>
    </>
  );
}
export function WorkPage() {
  const { snapshot: s, projectId, tab, busy, perform, ask } = useWorkspace();
  const [title, setTitle] = useState(""),
    [phase, setPhase] = useState("설계"),
    [due, setDue] = useState(""),
    [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!projectId) return <NoProject />;
  const tasks = s.workspace.tasks.filter((t) => t.projectId === projectId);
  const chats = s.workspace.chats.filter((c) => c.projectId === projectId);
  const view = tab || "tasks";
  const human = durationUnion(
    tasks.flatMap((t) =>
      t.spans.map(
        (span) =>
          [
            Date.parse(span.startedAt),
            span.endedAt ? Date.parse(span.endedAt) : clock,
          ] as [number, number],
      ),
    ),
  );
  const ai = durationUnion(
    chats.map((c) => [
      Date.parse(c.startedAt),
      c.endedAt ? Date.parse(c.endedAt) : clock,
    ]),
  );
  async function add() {
    await perform(async () => {
      const result = await mutate({
        operation: "addTask",
        projectId,
        title,
        phase,
      });
      if (due && result.id)
        await mutate({
          operation: "scheduleTask",
          id: result.id,
          dueAt: new Date(due).toISOString(),
        });
    }, "작업을 추가했습니다.").then((ok) => {
      if (ok) {
        setTitle("");
        setDue("");
      }
    });
  }
  return (
    <>
      <Heading
        title="작업과 다음 계획"
        sub="작업 관점·실제 소요·사용자 확인과 남은 조건을 연결합니다."
      />
      <Tabs
        items={[
          ["tasks", "작업·일정"],
          ["time", "시간·실적"],
          ["planning", "다음 계획"],
        ]}
      />
      {view === "tasks" ? (
        <>
          <section className="panel">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <div className="columns">
                <label>
                  이어갈 작업
                  <input
                    required
                    maxLength={240}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  작업 관점
                  <input
                    list="task-phases"
                    maxLength={80}
                    required
                    value={phase}
                    onChange={(e) => setPhase(e.target.value)}
                  />
                  <datalist id="task-phases">
                    {[
                      "설계",
                      "구현",
                      "검토",
                      "테스트",
                      "사용자 확인",
                      "학습 적용",
                    ].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </datalist>
                </label>
              </div>
              <label>
                일정 · 선택 사항
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </label>
              <Button primary type="submit" disabled={busy}>
                <Plus />
                작업 추가
              </Button>
            </form>
          </section>
          {tasks.map((task) => {
            const running = task.spans.some((span) => !span.endedAt);
            return (
              <section className="panel spaced" key={task.id}>
                <div className="inline">
                  <Badge>{task.phase}</Badge>
                  <Badge accent>
                    {task.userTested
                      ? "사용자 확인됨"
                      : task.completed
                        ? "작업 완료"
                        : "진행 중"}
                  </Badge>
                </div>
                <h3 className="spaced-text">{task.title}</h3>
                <p className="micro">
                  {task.dueAt
                    ? "일정 " + when(task.dueAt, s.workspace.settings.timezone)
                    : "일정 미정"}{" "}
                  · 본인 투입 {duration(taskMilliseconds(task, clock))}
                </p>
                <div className="inline spaced-text">
                  <Button
                    disabled={busy || task.completed}
                    onClick={() =>
                      void perform(() =>
                        mutate({
                          operation: "timer",
                          id: task.id,
                          running: !running,
                        }),
                      )
                    }
                  >
                    {running ? <Square /> : <Play />}
                    {running ? "시간 기록 중지" : "본인 작업 기록"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        mutate({
                          operation: "updateTask",
                          id: task.id,
                          completed: !task.completed,
                          userTested: task.userTested,
                        }),
                      )
                    }
                  >
                    {task.completed ? "작업 다시 열기" : "작업 완료"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        mutate({
                          operation: "updateTask",
                          id: task.id,
                          completed: task.completed,
                          userTested: !task.userTested,
                        }),
                      )
                    }
                  >
                    {task.userTested ? "사용자 확인 취소" : "사용자 확인 기록"}
                  </Button>
                </div>
              </section>
            );
          })}
          {!tasks.length && (
            <p className="muted small spaced-text">
              문서·대화·학습에서 이어갈 작업을 추가할 수 있습니다. 정해진 단계
              순서를 강제하지 않습니다.
            </p>
          )}
        </>
      ) : view === "time" ? (
        <>
          <section className="panel">
            <div className="facts">
              <div>
                <span>본인 투입 · 기록한 구간</span>
                <strong>{duration(human)}</strong>
              </div>
              <div>
                <span>AI 요청 경과</span>
                <strong>{duration(ai)}</strong>
              </div>
              <div>
                <span>사용자 확인한 작업</span>
                <strong>
                  {tasks.filter((t) => t.userTested).length}
                  <small>건</small>
                </strong>
              </div>
            </div>
            <p className="small muted">
              본인 시간과 AI 요청 경과는 겹칠 수 있어 더하지 않습니다. AI 내부
              실행·대기 시간은 별도 계측되지 않았으며, 요청 경과를 실행 시간으로
              표시하지 않습니다.
            </p>
          </section>
          {tasks.length ? (
            <section className="panel spaced">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>작업과 관점</th>
                    <th>예상</th>
                    <th>기록한 본인 소요</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.title}
                        <p className="micro">{t.phase}</p>
                      </td>
                      <td>미설정</td>
                      <td>{duration(taskMilliseconds(t, clock))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <Empty title="아직 비교할 개인 실적이 부족합니다">
              본인 작업 구간을 기록하고 AI 실행과 사용자 확인을 연결하면, 같은
              조건의 작업을 다음 계획의 근거로 활용할 수 있습니다.
            </Empty>
          )}
        </>
      ) : (
        <section className="panel">
          <Badge accent>
            {human ? "기록한 실적을 바탕으로 검토" : "예상 근거 부족"}
          </Badge>
          <h2 className="spaced-text">누구의 ‘3일’인지 설명할 수 있는 계획</h2>
          <p className="small muted">
            목표·기능·작업 관점과 유사 실적의 조건을 함께 봅니다. 구현 종료와
            사용자 확인, 재작업을 구별합니다.
          </p>
          <div className="note">
            현재 기록만으로 개인별 예상 정확도가 검증된 것은 아닙니다. 임의의
            기간으로 채우지 않고 가정·누락·범위를 함께 설명합니다.
          </div>
          <Button
            primary
            onClick={() =>
              ask(
                "다음 프로젝트나 기능의 계획을 함께 잡자. 아래 기록한 본인 작업 실적을 참고하되, 조건이 다르면 그대로 쓰지 말고 차이·누락·완료 기준을 설명해줘. 근거 없이 3일, 5일처럼 단정하지 말아줘.\n" +
                  JSON.stringify(
                    tasks
                      .slice(0, 50)
                      .map((t) => ({
                        id: t.id,
                        title: t.title,
                        phase: t.phase,
                        recordedMilliseconds: taskMilliseconds(t, clock),
                        completed: t.completed,
                        userTested: t.userTested,
                      })),
                  ),
                "planning",
              )
            }
          >
            범위와 근거로 계획 대화
          </Button>
        </section>
      )}
    </>
  );
}
export function SettingsPage() {
  const { snapshot: s, busy, perform, navigate } = useWorkspace();
  const [draft, setDraft] = useState<Settings>({ ...s.workspace.settings });
  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  async function storage() {
    await perform(async () => {
      const path = await native<string | null>("choose_directory");
      if (path) update("stateDirectory", path);
    });
  }
  return (
    <>
      <Heading
        title="도구 연결과 설정"
        sub="AI 도구 연결·기록 저장·알림과 돌아보기를 설정합니다."
      />
      <ToolConnections />
      <section className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(
              () => mutate({ operation: "settings", settings: draft }),
              "설정을 저장했습니다.",
            );
          }}
        >
          <div className="form-row">
            <div>
              <strong>기록·문서 백업 저장 위치</strong>
              <p>{draft.stateDirectory || "아직 선택하지 않음"}</p>
            </div>
            <Button onClick={() => void storage()}>폴더 선택</Button>
          </div>
          <div className="form-row">
            <div>
              <strong>백그라운드 수집과 안내</strong>
              <p>
                켜면 창을 닫아도 트레이에서 실행합니다. 트레이의 종료를 누르면
                완전히 종료합니다.
              </p>
            </div>
            <input
              aria-label="백그라운드 수집과 안내"
              type="checkbox"
              checked={draft.backgroundEnabled}
              onChange={(e) => update("backgroundEnabled", e.target.checked)}
            />
          </div>
          <div className="form-row">
            <div>
              <strong>발견 즉시 알림</strong>
              <p>확인한 반복 요청과 일간·주간 회고를 알려줍니다.</p>
            </div>
            <input
              aria-label="발견 즉시 알림"
              type="checkbox"
              checked={draft.immediateNotifications}
              onChange={(e) =>
                update("immediateNotifications", e.target.checked)
              }
            />
          </div>
          <div className="form-row">
            <div>
              <strong>하루 마감 시각</strong>
              <p>설정한 시간대를 기준으로 회고를 안내합니다.</p>
            </div>
            <input
              required
              aria-label="하루 마감 시각"
              type="time"
              value={draft.reviewTime}
              onChange={(e) => update("reviewTime", e.target.value)}
            />
          </div>
          <div className="form-row">
            <strong>주간 회고 요일</strong>
            <select
              aria-label="주간 회고 요일"
              value={draft.reviewWeekday}
              onChange={(e) => update("reviewWeekday", Number(e.target.value))}
            >
              {[
                "월요일",
                "화요일",
                "수요일",
                "목요일",
                "금요일",
                "토요일",
                "일요일",
              ].map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <strong>기준 시간대</strong>
            <select
              aria-label="기준 시간대"
              value={draft.timezone}
              onChange={(e) =>
                update(
                  "timezone",
                  e.target.value === "UTC" ? "UTC" : "Asia/Seoul",
                )
              }
            >
              <option>Asia/Seoul</option>
              <option>UTC</option>
            </select>
          </div>
          <div className="form-row">
            <div>
              <strong>수집 간격 · 초</strong>
              <p>설정한 저장 위치에 연결된 프로젝트를 순차 수집합니다.</p>
            </div>
            <input
              required
              aria-label="수집 간격"
              type="number"
              min={30}
              max={86400}
              value={draft.collectionIntervalSecs}
              onChange={(e) =>
                update("collectionIntervalSecs", Number(e.target.value))
              }
            />
          </div>
          <div className="form-row">
            <strong>화면 테마</strong>
            <select
              aria-label="화면 테마"
              value={draft.theme}
              onChange={(e) =>
                update(
                  "theme",
                  e.target.value === "dark"
                    ? "dark"
                    : e.target.value === "light"
                      ? "light"
                      : "system",
                )
              }
            >
              <option value="system">시스템 따르기</option>
              <option value="light">밝게</option>
              <option value="dark">어둡게</option>
            </select>
          </div>
          <div className="note">
            앱이 완전히 종료된 동안에는 수집·알림을 실행하지 않습니다. 다시
            실행한 뒤 수집 범위와 마지막 반영 시점을 확인할 수 있습니다.
          </div>
          <div className="inline">
            <Button primary type="submit" disabled={busy}>
              설정 저장
            </Button>
            <Button onClick={() => navigate("reports")}>일간·주간 회고</Button>
            <Button
              onClick={() => void perform(() => native("quit_application"))}
            >
              앱 완전히 종료
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
interface ChatProps {
  question: string;
  setQuestion: (value: string) => void;
  mode: string;
  setMode: (value: string) => void;
  evidenceIds: string[];
}
export function ChatPage({
  question,
  setQuestion,
  mode,
  setMode,
  evidenceIds,
}: ChatProps) {
  const { snapshot: s, projectId, busy, perform } = useWorkspace();
  const [provider, setProvider] = useState("codex"),
    [projects, setProjects] = useState<string[]>([projectId]),
    [recordIds, setRecordIds] = useState<string[]>(evidenceIds),
    [documentKeys, setDocumentKeys] = useState<string[]>([]),
    [includeSources, setIncludeSources] = useState(true),
    [activeId, setActiveId] = useState<string | null>(null),
    [noteKind, setNoteKind] = useState("analysis");
  useEffect(() => {
    setProjects([projectId]);
    setDocumentKeys([]);
    setActiveId(null);
  }, [projectId]);
  useEffect(() => {
    setRecordIds(evidenceIds);
  }, [evidenceIds]);
  if (!projectId) return <NoProject />;
  const records = s.records.filter((r) => projects.includes(r.projectId));
  const selectedRecords = records.filter((r) => recordIds.includes(r.id));
  const allDocuments = s.inventories
    .filter((i) => projects.includes(i.projectId))
    .flatMap((i) =>
      (i.report?.documents ?? []).map((d) => ({
        ...d,
        projectId: i.projectId,
      })),
    );
  const selectedDocuments = allDocuments
    .filter((d) => documentKeys.includes(`${d.projectId}:${d.path}`))
    .map((d) => ({
      projectId: d.projectId,
      path: d.path,
      revision: d.revision,
    }));
  const chats = s.workspace.chats.filter((c) => c.projectId === projectId);
  const active = chats.find((c) => c.id === activeId);
  const running = active?.status === "running";
  const response = active?.messages
    .filter((m) => m.role === "assistant")
    .at(-1)?.text;
  async function send() {
    await perform(async () => {
      const result = await native<{ id: string }>("start_chat", {
        request: {
          projectId,
          provider,
          question,
          projectIds: projects,
          recordIds: selectedRecords.map((r) => r.id),
          documents: selectedDocuments,
          sourceIds: includeSources
            ? s.workspace.sources
                .filter((source) => projects.includes(source.projectId))
                .map((source) => source.id)
            : [],
          previousChatId: activeId,
          mode,
        },
      });
      setActiveId(result.id);
      setQuestion("");
    });
  }
  function toggle(
    value: string,
    values: string[],
    setter: (v: string[]) => void,
  ) {
    setter(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  }
  return (
    <>
      <Heading
        title="맥락을 이어가는 대화"
        sub="사용 중인 공식 CLI의 로그인으로 실행하고, 질문에 포함할 자료를 선택합니다."
        action={
          <Button
            onClick={() => {
              setActiveId(null);
              setQuestion("");
            }}
          >
            새 대화
          </Button>
        }
      />
      <div className="chat-layout">
        <aside className="chat-context">
          <h3 style={{ marginTop: 0 }}>함께 볼 프로젝트</h3>
          {s.workspace.projects.map((p) => (
            <label className="checkline" key={p.id}>
              <input
                type="checkbox"
                checked={projects.includes(p.id)}
                onChange={() => toggle(p.id, projects, setProjects)}
              />
              <span>{p.name}</span>
            </label>
          ))}
          <h3>사용할 AI 도구</h3>
          <select
            aria-label="사용할 AI 도구"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="codex">Codex</option>
            <option value="claude">Claude Code</option>
            <option disabled>Antigravity · 실행 미검증</option>
          </select>
          <h3>질문의 관점</h3>
          <select
            aria-label="질문의 관점"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            {[
              ["chat", "자유 질문"],
              ["analysis", "사용·지식 분석"],
              ["research", "조사·의견 비교"],
              ["learning", "학습·요청 개선"],
              ["planning", "작업·계획"],
            ].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <h3>원문 기록</h3>
          <Button
            quiet
            onClick={() =>
              setRecordIds(
                records
                  .filter((r) => r.role === "user")
                  .slice(-30)
                  .map((r) => r.id),
              )
            }
          >
            최근 요청 30개 선택
          </Button>
          {records.slice(0, 50).map((r) => (
            <label className="document-selector" key={r.id}>
              <input
                type="checkbox"
                checked={recordIds.includes(r.id)}
                onChange={() => toggle(r.id, recordIds, setRecordIds)}
              />
              <span>
                {r.text.slice(0, 95)}
                <small className="micro"> · {r.source.provider}</small>
              </span>
            </label>
          ))}
          <h3>프로젝트 문서</h3>
          {allDocuments.slice(0, 60).map((d) => (
            <label
              className="document-selector"
              key={`${d.projectId}:${d.path}`}
            >
              <input
                type="checkbox"
                checked={documentKeys.includes(`${d.projectId}:${d.path}`)}
                onChange={() =>
                  toggle(
                    `${d.projectId}:${d.path}`,
                    documentKeys,
                    setDocumentKeys,
                  )
                }
              />
              <span>
                {d.title || d.path}
                <small className="micro">
                  {" "}
                  · {Math.ceil(d.bytes / 1024)} KB
                </small>
              </span>
            </label>
          ))}
          <label className="checkline">
            <input
              type="checkbox"
              checked={includeSources}
              onChange={(e) => setIncludeSources(e.target.checked)}
            />
            <span>등록한 조사 근거 포함</span>
          </label>
          <p className="micro spaced-text">
            선택한 자료를 전달합니다. Codex는 읽기 전용 프로젝트 모드, Claude는
            파일 도구 없이 실행합니다. 파일 변경은 별도 검토·적용 경로를
            사용합니다.
          </p>
        </aside>
        <section>
          <div className="inline">
            <Badge accent>
              {provider === "codex" ? "Codex" : "Claude Code"}
            </Badge>
            <Badge>
              원문 {selectedRecords.length}개 · 문서 {selectedDocuments.length}
              개
            </Badge>
            {active && <Badge>{active.status}</Badge>}
          </div>
          {active ? (
            <>
              {active.messages.map((m, i) => (
                <article className="chat-message" key={i}>
                  <span className="role">
                    {m.role === "user"
                      ? "나의 질문"
                      : active.provider === "codex"
                        ? "Codex"
                        : "Claude Code"}{" "}
                    · {when(m.createdAt)}
                  </span>
                  <MarkdownContent text={m.text} />
                </article>
              ))}
              {running && (
                <div role="status" className="note inline">
                  <LoaderCircle className="spin" />
                  응답을 기다리고 있습니다.
                  <Button
                    onClick={() =>
                      void perform(() =>
                        native("cancel_chat", { id: active.id }),
                      )
                    }
                  >
                    중지
                  </Button>
                </div>
              )}
              {active.error && (
                <div role="alert" className="note">
                  {active.error.message}
                </div>
              )}
              {response && (
                <section className="panel spaced">
                  <h3>이 판단을 다음 작업으로</h3>
                  <div className="inline spaced-text">
                    <select
                      aria-label="응답 저장 종류"
                      value={noteKind}
                      onChange={(e) => setNoteKind(e.target.value)}
                    >
                      {[
                        ["analysis", "분석 노트"],
                        ["learning", "학습 주제"],
                        ["research", "조사 정리"],
                        ["rule", "규칙"],
                        ["decision", "결정"],
                      ].map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          () =>
                            mutate({
                              operation: "note",
                              projectId,
                              kind: noteKind,
                              title:
                                active.messages[0]?.text.slice(0, 100) ||
                                "대화에서 남긴 판단",
                              body: response,
                              evidenceIds: active.evidenceIds,
                            }),
                          "근거와 함께 노트를 저장했습니다.",
                        )
                      }
                    >
                      노트로 남기기
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          () =>
                            mutate({
                              operation: "addTask",
                              projectId,
                              title:
                                active.messages[0]?.text.slice(0, 100) ||
                                "대화 후속 작업",
                              phase: "검토",
                            }),
                          "후속 작업을 추가했습니다.",
                        )
                      }
                    >
                      후속 작업 추가
                    </Button>
                  </div>
                </section>
              )}
            </>
          ) : (
            <section className="panel spaced">
              <h2>궁금한 지점에서 바로 이어가세요.</h2>
              <p className="small muted spaced-text">
                분석을 되묻고, 모호했던 개념을 확인하거나 새로운 접근을 조사할
                수 있습니다. 기록·문서·프로젝트의 범위를 확인한 뒤 질문하세요.
              </p>
            </section>
          )}
          <form
            className="compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              required
              maxLength={16000}
              aria-label="질문 입력"
              placeholder="궁금한 점을 자유롭게 적어주세요"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div className="inline">
              <span className="micro">기존 CLI 구독·인증 환경 사용</span>
              <Button
                primary
                type="submit"
                disabled={
                  busy || running || !question.trim() || !projects.length
                }
              >
                <ArrowUp />
                질문하기
              </Button>
            </div>
          </form>
          <div className="section-heading">
            <h3>이 프로젝트의 대화</h3>
          </div>
          {chats
            .slice()
            .reverse()
            .slice(0, 20)
            .map((chat) => (
              <div className="list-row" key={chat.id}>
                <div>
                  <strong>{chat.messages[0]?.text.slice(0, 100)}</strong>
                  <p>
                    {chat.provider} · {chat.status} · {when(chat.startedAt)}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setActiveId(chat.id);
                    setQuestion("");
                  }}
                >
                  열기
                </Button>
              </div>
            ))}
        </section>
      </div>
    </>
  );
}
