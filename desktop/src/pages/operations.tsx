import { useEffect, useState } from "react";
import {
  Check,
  ClipboardCheck,
  ClipboardX,
  ExternalLink,
  Play,
  Plus,
  Square,
  ArrowUp,
  LoaderCircle,
  RotateCcw,
  Save,
} from "lucide-react";
import { errorMessage, mutate, native } from "../api";
import { titleFromQuestion } from "../titles";
import { NoteExport } from "../note-export";
import { useWorkspace } from "../context";
import { ToolConnections } from "../tool-connections";
import { getSettingsSection } from "../settings-sections";
import {
  Badge,
  Actions,
  Button,
  DisclosureRow,
  Empty,
  Field,
  Heading,
  MarkdownContent,
  NoProject,
  Tabs,
} from "../components";
import { duration, durationUnion, taskMilliseconds, when } from "../metrics";
import type { EstimateResult, Settings, Source, Task } from "../types";
import { useEditorFocus } from "../use-editor-focus";

const sourceKinds: { [kind: string]: string } = {
  official: "공식",
  paper: "논문·연구",
  community: "커뮤니티",
  interpretation: "AI 해석",
};
export function ResearchPage() {
  const { snapshot: s, projectId, perform, busy, ask, tab, setTab } = useWorkspace();
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedNote, setSelectedNote] = useState("");
  const view = tab === "notes" ? "notes" : "sources";
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [kind, setKind] = useState("official"),
    [claim, setClaim] = useState(""),
    [conditions, setConditions] = useState(""),
    [version, setVersion] = useState(""),
    [verified, setVerified] = useState(false);
  const [fetched, setFetched] = useState<Source["fetched"]>(null);
  const { addButton, savedRow, focusAfterClose } = useEditorFocus(editing);
  useEffect(() => {
    setEditing(false);
    setSelectedSource(""); setSelectedNote("");
    setFetched(null);
    setTitle(""); setUrl(""); setClaim(""); setConditions(""); setVersion(""); setVerified(false);
  }, [projectId]);
  if (!projectId) return <NoProject />;
  const sources = s.workspace.sources.filter((r) => r.projectId === projectId);
  async function save() {
    let savedId = "";
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
      fetched,
    };
    const ok = await perform(
      async () => { savedId = (await mutate({ operation: "source", source })).id ?? ""; },
      "출처와 확인 상태를 저장했습니다.",
    );
    if (ok) {
      focusAfterClose.current = "saved";
      setSelectedSource(savedId);
      setEditing(false);
      setTitle("");
      setUrl("");
      setClaim("");
      setConditions("");
      setVersion("");
      setVerified(false);
      setFetched(null);
    }
  }
  const addAction = (
    <Button primary ref={addButton} disabled={busy} onClick={() => { setTab("sources"); setEditing(true); }}>
      <Plus />자료 추가
    </Button>
  );
  return (
    <>
      <Heading
        title="조사"
        sub="비교할 자료를 저장하고 조사 내용을 노트로 정리하세요."
        action={view === "notes" || (!editing && sources.length > 0) ? addAction : undefined}
      />
      <Tabs label="조사 보기" items={[["sources", "자료"], ["notes", "조사 노트"]]}>
      {view === "sources" ? <>
      {editing && (
        <section className="panel spaced">
          <h2>자료 추가</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void save();
            }}
          >
            <fieldset className="form-stack spaced" disabled={busy} style={{ border: 0, padding: 0, marginInline: 0 }}>
            <div className="columns">
              <Field label="자료 이름">
                <input
                  autoFocus
                  required
                  maxLength={240}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="자료 종류">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {["official", "paper", "community"].map((k) => (
                    <option key={k} value={k}>
                      {sourceKinds[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="HTTPS 원문 링크">
              <input
                required
                type="url"
                pattern="https://.*"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setFetched(null); setVerified(false); }}
              />
            </Field>
            <div><Button disabled={busy || !url.trim()} onClick={() => void perform(async () => {
              const result = await native<NonNullable<Source["fetched"]>>("fetch_reference", { url });
              setFetched(result);
              setUrl(result.url);
              setTitle(titleFromQuestion(result.title, "가져온 원문"));
              setVerified(false);
            })}>URL에서 원문 가져오기</Button></div>
            {fetched && <section className="note">
              <p className="micro">원문 수집 {when(fetched.fetchedAt)} · {fetched.url}</p>
              <p className="small">원문에서 확인할 구절을 읽고 아래 주장·조건을 작성하세요.</p>
              <pre style={{ maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap" }}>{fetched.text}</pre>
            </section>}
            <Field label="자료에서 확인할 내용">
              <textarea
                required
                maxLength={20000}
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
              />
            </Field>
            <div className="columns">
              <Field label="적용 조건·다른 의견">
                <textarea
                  maxLength={20000}
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                />
              </Field>
              <Field label="관련 버전·환경">
                <input
                  maxLength={200}
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </Field>
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
            <Actions>
              <Button disabled={busy} onClick={() => {
                focusAfterClose.current = "add";
                setEditing(false);
              }}>취소</Button>
              <Button primary type="submit" disabled={busy}><Save aria-hidden="true" />자료 저장</Button>
            </Actions>
            </fieldset>
          </form>
        </section>
      )}
      {sources.length ? (
        <section className="panel spaced">
          <div className="section-heading" style={{ marginTop: 0 }}><h2>조사 자료</h2><span className="small muted">{sources.length}개</span></div>
          <div className="source-list">
            {sources.map((source) => <DisclosureRow key={source.id}
              title={source.title} meta={`${sourceKinds[source.kind]} · ${when(source.recordedAt)}`}
              status={<Badge tone={source.verified ? "success" : undefined}>{source.verified ? "사용자 원문 확인" : "원문 확인 필요"}</Badge>}
              expanded={selectedSource === source.id} onToggle={() => setSelectedSource(selectedSource === source.id ? "" : source.id)}
              buttonRef={selectedSource === source.id ? savedRow : undefined}>
                <h3>자료에서 확인할 내용</h3><p className="small">{source.claim}</p>
                {source.conditions && <><h3>적용 조건과 다른 의견</h3><p className="small muted">{source.conditions}</p></>}
                {source.version && <p className="micro">버전·환경: {source.version}</p>}
                {source.fetched && <details><summary>가져온 원문 · {when(source.fetched.fetchedAt)}</summary><pre className="reference-text">{source.fetched.text}</pre></details>}
                <Actions><Button onClick={() => void perform(() => native("open_reference", { url: source.url }))}><ExternalLink />원문</Button></Actions>
            </DisclosureRow>)}
          </div>
          <Actions>
          <Button
            primary
            onClick={() =>
              ask(
                "등록한 출처의 주장·찬반 이유·버전·환경 차이를 비교해줘. 공식 확인이 빠졌거나 상반되는 부분을 숨기지 말고, 현재 프로젝트에 적용할 판단과 미확인 조건을 구별해줘. 원문을 직접 확인하지 않았다면 확인한 것처럼 말하지 말아줘.",
                "research",
              )
            }
          >
            자료 비교하기
          </Button>
          </Actions>
        </section>
      ) : !editing && (
        <div className="empty-list">
          <p className="muted">등록한 자료가 없습니다. 비교할 자료의 링크와 확인할 내용을 추가하세요.</p>
          <Actions>{addAction}</Actions>
        </div>
      )}
      </> : <>
      <section className="note-list" aria-label="조사 노트 목록">
      {s.workspace.notes
        .filter((n) => n.projectId === projectId && n.kind === "research")
        .map((n) => (
          <DisclosureRow key={n.id} title={n.title} meta={when(n.createdAt)}
            expanded={selectedNote === n.id} onToggle={() => setSelectedNote(selectedNote === n.id ? "" : n.id)}>
            <MarkdownContent text={n.body} />
          </DisclosureRow>
        ))}
      {!s.workspace.notes.some((note) => note.projectId === projectId && note.kind === "research") && <p className="small muted">조사 노트가 없습니다. 자료를 비교한 대화의 답변을 조사 노트로 저장할 수 있습니다.</p>}
      </section><NoteExport kind="research" />
      </>}
      </Tabs>
    </>
  );
}
function minutesLabel(value: number | null | undefined) {
  if (value == null) return "-";
  return value >= 60 ? `${Math.floor(value / 60)}시간 ${value % 60}분` : `${value}분`;
}
/** Estimates from similar finished, timed tasks; without them it says so instead of guessing. */
function TaskEstimate({ task }: { task: Task }) {
  const { snapshot: s, busy, perform } = useWorkspace();
  const [result, setResult] = useState<EstimateResult | null>(null);
  const last = result?.estimate ?? task.estimates?.at(-1);
  const previous = (task.estimates?.length ?? 0) > 1 ? task.estimates?.at(-2) : undefined;
  return (
    <div className="task-estimate">
      {last ? (
        <p className="small">
          {last.method === "no-comparable-task"
            ? "비교할 완료 작업이 없어 예상하지 않았습니다. 타이머로 측정하고 끝낸 비슷한 작업이 생기면 다시 계산하세요."
            : <>잠정 예상 <strong>{minutesLabel(last.medianMinutes)}</strong> (범위 {minutesLabel(last.lowMinutes)}~{minutesLabel(last.highMinutes)}) · 비슷한 완료 작업 {last.basisTaskIds.length}개 기준{last.method === "single-reference" ? " · 근거 1개라 참고용" : ""}</>}
          {previous && previous.medianMinutes !== last.medianMinutes && <small className="micro"> · 이전 예상 {minutesLabel(previous.medianMinutes)}에서 근거가 바뀌어 갱신</small>}
        </p>
      ) : null}
      {result && result.references.length > 0 && (
        <ul className="micro">
          {result.references.map((r) => (
            <li key={r.taskId}>{r.title} · {s.workspace.projects.find((p) => p.id === r.projectId)?.name} · {r.phase} · 실제 {minutesLabel(r.minutes)}{r.userTested ? " · 사용자 확인" : ""}</li>
          ))}
        </ul>
      )}
      {!task.completed && (
        <Button quiet disabled={busy} onClick={() => void perform(async () => {
          setResult(await native<EstimateResult>("estimate_task", { id: task.id }));
        })}>실적으로 예상</Button>
      )}
    </div>
  );
}
export function WorkPage() {
  const { snapshot: s, projectId, tab, busy, perform, ask } = useWorkspace();
  const [title, setTitle] = useState(""),
    [phase, setPhase] = useState("설계"),
    [due, setDue] = useState(""),
    [clock, setClock] = useState(Date.now());
  const [referenceTaskIds, setReferenceTaskIds] = useState<string[]>([]);
  useEffect(() => setReferenceTaskIds([]), [projectId]);
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
      <Tabs label="작업 보기"
        items={[
          ["tasks", "작업·일정"],
          ["time", "시간·실적"],
          ["planning", "다음 계획"],
        ]}
      >
      {view === "tasks" ? (
        <>
          <section className="panel">
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void add();
              }}
            >
              <div className="columns">
                <Field label="이어갈 작업">
                  <input
                    required
                    maxLength={240}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field label="작업 관점">
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
                </Field>
              </div>
              <Field label="일정 · 선택 사항">
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
              <Actions><Button primary type="submit" disabled={busy}>
                <Plus aria-hidden="true" />
                작업 추가
              </Button></Actions>
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
                  {task.originId && (s.workspace.discoveries ?? []).some((d) => d.id === task.originId) &&
                    ` · 발견에서 시작: ${s.workspace.discoveries?.find((d) => d.id === task.originId)?.title}`}
                </p>
                <TaskEstimate task={task} />
                <Actions>
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
                    {running ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
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
                    {task.completed ? <RotateCcw aria-hidden="true" /> : <Check aria-hidden="true" />}
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
                    {task.userTested ? <ClipboardX aria-hidden="true" /> : <ClipboardCheck aria-hidden="true" />}
                    {task.userTested ? "사용자 확인 취소" : "사용자 확인 기록"}
                  </Button>
                </Actions>
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
          <h3>계획에 참고할 다른 프로젝트 실적</h3>
          <p className="small muted">현재 프로젝트의 작업 50개와 다른 프로젝트에서 선택한 작업 최대 50개를 참고합니다.</p>
          {s.workspace.tasks.filter((task) => task.projectId !== projectId).map((task) => (
            <label className="checkline" key={task.id}>
              <input type="checkbox" disabled={!referenceTaskIds.includes(task.id) && referenceTaskIds.length >= 50} checked={referenceTaskIds.includes(task.id)} onChange={(event) =>
                setReferenceTaskIds(event.target.checked ? [...referenceTaskIds, task.id] : referenceTaskIds.filter((id) => id !== task.id))
              } />
              <span>{s.workspace.projects.find((project) => project.id === task.projectId)?.name} · {task.title}
                <small>{task.phase} · {duration(taskMilliseconds(task, clock))} · {task.userTested ? "사용자 확인됨" : task.completed ? "작업 완료" : "진행 중"}</small>
              </span>
            </label>
          ))}
          <Actions><Button
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
                [],
                {
                  taskIds: [...tasks.slice(0, 50).map((task) => task.id), ...referenceTaskIds],
                  projectIds: [...new Set([projectId, ...s.workspace.tasks.filter((task) => referenceTaskIds.includes(task.id)).map((task) => task.projectId)])],
                },
              )
            }
          >
            계획 작성
          </Button></Actions>
        </section>
      )}
      </Tabs>
    </>
  );
}
export function SettingsPage() {
  const { snapshot: s, busy, perform, navigate, tab } = useWorkspace();
  const [draft, setDraft] = useState<Settings>({ ...s.workspace.settings });
  const category = getSettingsSection(tab);
  const view = category.id;
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
        title={category.label}
        sub={category.description}
      />
          {view === "tools" ? <ToolConnections /> : <section className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(
              () => mutate({ operation: "settings", settings: draft }),
              "설정을 저장했습니다.",
            );
          }}
        >
          {view === "collection" && <><div className="form-row">
            <div>
              <strong>기록·문서 백업 저장 위치</strong>
              <p>{draft.stateDirectory ?? s.defaultStateDirectory}</p>
              <p className="small muted">저장 위치를 바꾸면 해당 폴더의 기록과 백업을 사용합니다.</p>
            </div>
            <div className="inline">
              <Button onClick={() => void storage()}>저장 위치 변경</Button>
              {draft.stateDirectory !== null && (
                <Button onClick={() => update("stateDirectory", null)}>기본 위치 사용</Button>
              )}
            </div>
          </div>
          <div className="form-row">
            <div>
              <strong>백그라운드 수집과 안내</strong>
              <p>
                켠 뒤 설정을 저장하면 연결된 프로젝트의 AI 기록을 바로
                가져옵니다. 창을 닫아도 트레이에서 수집을 이어갑니다.
              </p>
            </div>
            <input
              aria-label="백그라운드 수집과 안내"
              type="checkbox"
              checked={draft.backgroundEnabled}
              onChange={(e) => update("backgroundEnabled", e.target.checked)}
            />
          </div>
          </>}
          {view === "review" && <><div className="form-row">
            <div>
              <strong>발견 즉시 알림</strong>
              <p>새 발견과 일간·주간 회고를 Windows 알림으로도 알려줍니다. 앱 안의 알림은 항상 남습니다.</p>
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
              <strong>수집 후 자동 AI 분석</strong>
              <p>백그라운드 수집에서 새 요청이 5개 이상 쌓이면 최대 6시간에 한 번 분석합니다. 선택한 AI 도구의 이용 한도를 사용합니다.</p>
            </div>
            <input
              aria-label="수집 후 자동 AI 분석"
              type="checkbox"
              checked={draft.autoAnalysis ?? false}
              onChange={(e) => update("autoAnalysis", e.target.checked)}
            />
          </div>
          <div className="form-row">
            <strong>분석에 쓸 AI 도구</strong>
            <select
              aria-label="분석에 쓸 AI 도구 기본값"
              value={draft.analysisProvider ?? "codex"}
              onChange={(e) => update("analysisProvider", e.target.value === "claude" ? "claude" : "codex")}
            >
              <option value="codex">Codex</option>
              <option value="claude">Claude Code</option>
            </select>
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
          </>}
          {view === "collection" && <div className="form-row">
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
          </div>}
          {view === "appearance" && <div className="form-row">
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
          </div>}
          {(view === "collection" || view === "app") && <div className="note">
            앱이 완전히 종료된 동안에는 수집·알림을 실행하지 않습니다. 다시
            실행한 뒤 수집 범위와 마지막 반영 시점을 확인할 수 있습니다.
          </div>}
          <Actions>
            {view === "review" && <Button onClick={() => navigate("reports")}>일간·주간 회고</Button>}
            {view === "app" && <Button
              onClick={() => void perform(() => native("quit_application"))}
            >
              앱 완전히 종료
            </Button>}
            {view !== "app" && <Button primary type="submit" disabled={busy}>설정 저장</Button>}
          </Actions>
        </form>
          </section>}
    </>
  );
}
interface ChatProps {
  question: string;
  setQuestion: (value: string) => void;
  mode: string;
  setMode: (value: string) => void;
  evidenceIds: string[];
  originId?: string;
}
const noteKindForMode: { [mode: string]: string } = {
  learning: "learning",
  research: "research",
  rule: "rule",
  planning: "decision",
};
export function ChatPage({
  question,
  setQuestion,
  mode,
  setMode,
  evidenceIds,
  originId,
}: ChatProps) {
  const { snapshot: s, projectId, busy, perform, chatSelection } = useWorkspace();
  const [provider, setProvider] = useState("codex"),
    [materialsOpen, setMaterialsOpen] = useState(false),
    [projects, setProjects] = useState<string[]>([projectId]),
    [recordIds, setRecordIds] = useState<string[]>(evidenceIds),
    [documentKeys, setDocumentKeys] = useState<string[]>([]),
    [includeSources, setIncludeSources] = useState(true),
    [activeId, setActiveId] = useState<string | null>(null),
    [noteKind, setNoteKind] = useState("analysis"),
    [origins, setOrigins] = useState<{ [chatId: string]: string }>({});
  useEffect(() => {
    setNoteKind(noteKindForMode[mode] ?? "analysis");
  }, [mode]);
  useEffect(() => {
    setProjects(chatSelection?.projectIds ?? [projectId]);
    setDocumentKeys(chatSelection?.documents?.map((document) => `${document.projectId}:${document.path}`) ?? []);
    setActiveId(null);
  }, [projectId, chatSelection]);
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
      revision: chatSelection?.documents?.find((document) => document.projectId === d.projectId && document.path === d.path)?.revision ?? d.revision,
    }));
  const chats = s.workspace.chats.filter((c) => c.projectId === projectId);
  const active = chats.find((c) => c.id === activeId);
  const running = active?.status === "running";
  const originDiscovery = active ? s.workspace.discoveries?.find((d) => d.id === origins[active.id]) : undefined;
  const noteSuffix: { [kind: string]: string } = { learning: "학습 카드", research: "조사 정리", rule: "규칙 초안", decision: "결정", analysis: "분석" };
  const response = active?.messages
    .filter((m) => m.role === "assistant")
    .at(-1)?.text;
  async function send(text = question) {
    await perform(async () => {
      const result = await native<{ id: string }>("start_chat", {
        request: {
          projectId,
          provider,
          question: text,
          projectIds: projects,
          recordIds: selectedRecords.map((r) => r.id),
          documents: selectedDocuments,
          taskIds: chatSelection?.taskIds?.filter((id) => s.workspace.tasks.some((task) => task.id === id && projects.includes(task.projectId))) ?? [],
          sourceIds: includeSources
            ? s.workspace.sources
                .filter((source) => projects.includes(source.projectId))
                .map((source) => source.id)
            : [],
          previousChatId: activeId,
          mode,
        },
      });
      // A follow-up keeps the discovery that started the conversation.
      const origin = activeId ? origins[activeId] : originId;
      if (origin) setOrigins((value) => ({ ...value, [result.id]: origin }));
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
        title="대화"
        sub="질문을 입력하세요. 문서나 이전 기록이 필요하면 자료를 추가할 수 있습니다."
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
      <div className="chat-workspace">
        <div className="chat-material-bar">
          <Button aria-expanded={materialsOpen} aria-controls="chat-materials" onClick={() => setMaterialsOpen((value) => !value)}>자료 선택</Button>
          <span className="micro">문서 {selectedDocuments.length}개 · 기록 {selectedRecords.length}개 · 참고 자료 {includeSources ? s.workspace.sources.filter((source) => projects.includes(source.projectId)).length : 0}개</span>
        </div>
        {materialsOpen && <section className="chat-materials" id="chat-materials" aria-label="질문에 포함할 자료">
          <p className="small muted">체크한 자료를 질문에 함께 전달합니다.</p>
          <div className="chat-material-columns">
          <div>
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
          </div>
          <div>
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
          </div>
          <div>
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
          </div>
          </div>
        </section>}
        <section>
          {active && (
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
                  <p>{errorMessage(active.error)}</p>
                  <Button disabled={busy} onClick={() => void send(active.messages.filter((message) => message.role === "user").at(-1)?.text ?? "")}>다시 시도</Button>
                </div>
              )}
              {response && (
                <section className="panel spaced">
                  <h3>이 판단을 다음 작업으로</h3>
                  <Actions>
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
                              title: originDiscovery
                                ? `${originDiscovery.title} · ${noteSuffix[noteKind] ?? "노트"}`
                                : titleFromQuestion(active.messages[0]?.text ?? "", "대화에서 남긴 판단"),
                              body: response,
                              evidenceIds: active.evidenceIds,
                              originId: origins[active.id],
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
                              title: originDiscovery?.title ?? titleFromQuestion(active.messages[0]?.text ?? "", "대화 후속 작업"),
                              phase: "검토",
                              originId: origins[active.id],
                            }),
                          "후속 작업을 추가했습니다.",
                        )
                      }
                    >
                      후속 작업 추가
                    </Button>
                  </Actions>
                </section>
              )}
            </>
          )}
          <form
            className="compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="chat-question-label" htmlFor="chat-question">질문</label>
            <textarea
              id="chat-question"
              required
              maxLength={16000}
              aria-label="질문 입력"
              placeholder="예: 이 프로젝트에서 아직 결정하지 않은 사항을 정리해 줘."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div className="chat-compose-controls">
              <label>AI 도구<select aria-label="사용할 AI 도구" value={provider} onChange={(event) => setProvider(event.target.value)}>
                <option value="codex">Codex</option><option value="claude">Claude Code</option>
              </select></label>
              <label>질문 유형<select aria-label="질문의 관점" value={mode} onChange={(event) => setMode(event.target.value)}>
                {[["chat", "자유 질문"], ["analysis", "사용·지식 분석"], ["research", "조사·의견 비교"], ["learning", "학습·요청 개선"], ["rule", "규칙 초안"], ["planning", "작업·계획"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select></label>
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
          {!active && <div className="chat-examples">
            <span>질문 예시</span>
            <Button quiet aria-label="문서 요약 질문 작성" disabled={!allDocuments.length} onClick={() => {
              setDocumentKeys(allDocuments.slice(0, 20).map((document) => `${document.projectId}:${document.path}`));
              setQuestion("선택한 프로젝트 문서의 핵심 내용과 아직 결정하지 않은 사항을 요약해 줘.");
            }}>문서 요약</Button>
            <Button quiet onClick={() => setQuestion("이 프로젝트에서 다음에 확인할 조건과 해야 할 일을 정리해 줘.")}>다음 작업 정리</Button>
          </div>}
          <div className="section-heading">
            <h3>이전 대화</h3>
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
                    setProvider(chat.provider);
                    setQuestion("");
                  }}
                >
                  열기
                </Button>
              </div>
            ))}
          {!chats.length && <p className="small muted">아직 대화가 없습니다. 위에서 첫 질문을 작성하세요.</p>}
        </section>
      </div>
    </>
  );
}
