import { useState } from "react";
import {
  ArrowRight,
  FolderPlus,
  Lightbulb,
  Link2,
  Settings2,
} from "lucide-react";
import { mutate } from "../api";
import { useWorkspace } from "../context";
import {
  Badge,
  Button,
  Empty,
  Heading,
  MarkdownContent,
  NoProject,
  PromptButton,
  Tabs,
} from "../components";
import { recordsInPeriod, when } from "../metrics";

export function HomePage() {
  const {
    snapshot: s,
    navigate,
    ask,
    projectId,
    setProjectId,
    perform,
  } = useWorkspace();
  const repeated = s.analysis.repeatedRequests[0],
    expression = s.analysis.ambiguousExpressions[0];
  return (
    <>
      <Heading
        title="내 작업의 흐름"
        sub="여러 도구에서 이어진 기록을, 나의 다음 판단으로."
        action={<PromptButton text="새 대화" question="" />}
      />
      {!s.workspace.projects.length ? (
        <Empty
          title="첫 프로젝트부터 연결해 볼까요?"
          action={
            <div className="inline">
              <Button primary onClick={() => navigate("projects", "connect")}>
                <FolderPlus />
                프로젝트 연결
              </Button>
              <Button onClick={() => navigate("settings")}>AI 도구 연결</Button>
            </div>
          }
        >
          문서가 어디에 있는지, 이전에 AI와 어떤 이야기를 했는지 한곳에서 살펴보세요.
          먼저 AI와 작업하던 폴더를 선택하면 문서 현황을 확인할 수 있습니다.
          AI 대화 기록은 연결 후 원하는 때에 가져올 수 있습니다.
        </Empty>
      ) : (
        <>
          <div className="home-grid">
            <div>
              <section className="panel feature">
                <div className="inline">
                  <Badge accent>
                    {repeated
                      ? "반복된 요청"
                      : expression
                        ? "표현을 살펴볼 기회"
                        : "기록에서 시작하기"}
                  </Badge>
                  <span className="micro">근거를 먼저 확인합니다</span>
                </div>
                <h2>
                  {repeated
                    ? "같은 요청의 맥락을\n다시 살펴볼까요?"
                    : expression
                      ? "원하는 조건을,\n조금 더 분명하게."
                      : "기록이 모이면,\n발견도 선명해집니다."}
                </h2>
                <p>
                  {repeated
                    ? repeated.text.slice(0, 220)
                    : expression
                      ? expression.text.slice(0, 220)
                      : "프로젝트 문서를 읽고, 사용 중인 도구의 이력을 수집해 보세요. 빈 기록으로 개인화된 판단을 만들지 않습니다."}
                </p>
                <div className="inline">
                  {(repeated || expression) && (
                    <Button primary onClick={() => navigate("analysis")}>
                      내 요청과 근거 보기
                      <ArrowRight />
                    </Button>
                  )}
                  <Button onClick={() => navigate("projects", "connect")}>
                    기록·연결 상태 확인
                  </Button>
                </div>
              </section>
              <article className="discovery">
                <Lightbulb />
                <div>
                  <h3>나의 요청에서 학습 주제 찾기</h3>
                  <p>
                    표현 후보와 실제 문맥을 보고, 정확한 개념과 다음 요청으로
                    이어갑니다.
                  </p>
                  <Button quiet onClick={() => navigate("learn")}>
                    학습과 적용 항목 보기
                    <ArrowRight />
                  </Button>
                </div>
              </article>
              <article className="discovery">
                <Link2 />
                <div>
                  <h3>이미 조사한 근거를 다음 작업에서도</h3>
                  <p>
                    공식·논문·이용자 경험을 구별하고, 새 프로젝트의 조건과
                    비교합니다.
                  </p>
                  <Button quiet onClick={() => navigate("research")}>
                    조사와 의견 비교
                    <ArrowRight />
                  </Button>
                </div>
              </article>
            </div>
            <aside className="agenda">
              <section>
                <div className="section-heading">
                  <h3>오늘 이어갈 일</h3>
                  <Button
                    quiet
                    onClick={() => navigate("work")}
                    aria-label="작업 전체 보기"
                  >
                    <ArrowRight />
                  </Button>
                </div>
                {s.workspace.tasks
                  .filter((t) => !t.completed)
                  .slice(0, 4)
                  .map((t) => (
                    <label className="checkline" key={t.id}>
                      <input
                        type="checkbox"
                        onChange={() =>
                          void perform(() =>
                            mutate({
                              operation: "updateTask",
                              id: t.id,
                              completed: true,
                              userTested: t.userTested,
                            }),
                          )
                        }
                      />
                      <span>
                        {t.title}
                        <small>{t.phase}</small>
                      </span>
                    </label>
                  ))}
                {!s.workspace.tasks.some((t) => !t.completed) && (
                  <p className="muted small">
                    아직 후속 작업이 없습니다. 학습·조사·문서에서 이어갈 일을
                    추가해 보세요.
                  </p>
                )}
              </section>
              <section className="next-review">
                <span className="micro">나의 하루 마감</span>
                <strong>{s.workspace.settings.reviewTime}</strong>
                <span className="micro">{s.workspace.settings.timezone}</span>
                <div className="inline">
                  <Button onClick={() => navigate("reports")}>회고 보기</Button>
                  <Button
                    quiet
                    onClick={() => navigate("settings")}
                    aria-label="회고 설정"
                  >
                    <Settings2 />
                  </Button>
                </div>
              </section>
            </aside>
          </div>
          <div className="section-heading">
            <h3>확인한 사용 범위</h3>
            <Badge>
              {s.analysis.missingTimestamps
                ? `시각 근거 없는 요청 ${s.analysis.missingTimestamps}건`
                : "저장한 원문 기준"}
            </Badge>
          </div>
          <section className="panel">
            <div className="facts">
              <div>
                <span>나의 요청</span>
                <strong>
                  {s.analysis.userRequests}
                  <small>건</small>
                </strong>
              </div>
              <div>
                <span>연결한 프로젝트</span>
                <strong>
                  {s.workspace.projects.length}
                  <small>개</small>
                </strong>
              </div>
              <div>
                <span>표현 후보</span>
                <strong>
                  {s.analysis.ambiguousExpressions.length}
                  <small>건</small>
                </strong>
              </div>
            </div>
            <p className="micro">
              전체 기록 {s.records.length}건 중 사용자 요청만 집계 ·
              이해도·생산성 점수가 아닙니다.
            </p>
            <Button
              quiet
              onClick={() =>
                ask(
                  "선택한 요청에서 반복되는 목표·모호한 용어·연결할 지식을 근거와 함께 분석해줘. 이해 부족을 단정하지 말고 해석을 수정할 수 있게 설명해줘.",
                  "analysis",
                  s.records
                    .filter(
                      (r) => r.role === "user" && r.projectId === projectId,
                    )
                    .slice(-30)
                    .map((r) => r.id),
                )
              }
            >
              AI로 주제와 지식 연결 분석하기
              <ArrowRight />
            </Button>
          </section>
          <div className="section-heading">
            <h3>진행 중인 맥락</h3>
            <Button quiet onClick={() => navigate("projects")}>
              프로젝트 전체
            </Button>
          </div>
          <div className="project-pair">
            {s.workspace.projects.map((p) => (
              <section className="project-tile" key={p.id}>
                <span className="micro">연결한 프로젝트</span>
                <h3>{p.name}</h3>
                <p>{p.root}</p>
                <Button
                  quiet
                  onClick={() => {
                    setProjectId(p.id);
                    navigate("projects");
                  }}
                >
                  문서·기록·규칙 살펴보기
                  <ArrowRight />
                </Button>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
export function AnalysisPage() {
  const { snapshot: s, projectId, tab, perform, ask } = useWorkspace();
  const [selected, setSelected] = useState<string[]>([]);
  const [interpretation, setInterpretation] = useState("");
  const view = tab || "repeated";
  return (
    <>
      <Heading
        title="내 AI 사용을 이해하기"
        sub="실제 사용자 요청과 출처를 확인하고, 해석은 별도로 검토합니다."
        action={
          <PromptButton
            question="선택한 자료에서 자주 요청한 주제·모호한 용어·다른 프로젝트에도 고려할 내용을 근거와 함께 분석해줘."
            mode="analysis"
            ids={selected}
          />
        }
      />
      <Tabs
        items={[
          ["repeated", "반복 요청"],
          ["expressions", "표현 후보"],
          ["ai", "AI 분석·지식 연결"],
        ]}
      />
      {view === "repeated" ? (
        <>
          <div className="note">
            공백을 정규화한 문장이 같은 요청을 집계합니다. 의미가 유사한 요청의
            주제 분류는 AI 분석에서 확인하세요.
          </div>
          {s.analysis.repeatedRequests.length ? (
            s.analysis.repeatedRequests.map((g) => (
              <section className="panel spaced" key={g.recordIds.join(":")}>
                <div className="inline">
                  <Badge accent>{g.count}회</Badge>
                  <Badge>{g.projectIds.length}개 프로젝트</Badge>
                </div>
                <h3 className="spaced-text">{g.text}</h3>
                {g.recordIds.map((id) => {
                  const r = s.records.find((r) => r.id === id);
                  return r ? (
                    <label className="checkline" key={id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, id]
                              : selected.filter((x) => x !== id),
                          )
                        }
                      />
                      <span>
                        {
                          s.workspace.projects.find((p) => p.id === r.projectId)
                            ?.name
                        }{" "}
                        · {r.source.provider}
                        <small>
                          {when(r.occurredAt, s.workspace.settings.timezone)} ·
                          원문 {id.slice(0, 10)}
                        </small>
                      </span>
                    </label>
                  ) : null;
                })}
              </section>
            ))
          ) : (
            <Empty title="같은 문장의 반복 요청은 아직 없습니다">
              같은 뜻의 요청이 다른 표현으로 남았을 수 있습니다. AI 분석에서는
              선택한 원문을 근거로 주제와 연결을 더 살펴볼 수 있습니다.
            </Empty>
          )}
        </>
      ) : view === "expressions" ? (
        <>
          {s.analysis.ambiguousExpressions.length ? (
            s.analysis.ambiguousExpressions.map((e) => (
              <section className="panel spaced" key={e.recordId}>
                <div className="inline">
                  <Badge accent>검토할 표현</Badge>
                  {e.phrases.map((p) => (
                    <Badge key={p}>{p}</Badge>
                  ))}
                </div>
                <blockquote>{e.text}</blockquote>
                <p className="micro">
                  단어 일치 후보 ·{" "}
                  {s.workspace.projects.find((p) => p.id === e.projectId)?.name}{" "}
                  · 이해 공백 판정 아님
                </p>
                <div className="inline spaced-text">
                  <Button
                    onClick={() =>
                      ask(
                        "다음 요청에서 모호할 수 있는 개념·뜻의 후보와 더 구체적인 요청 예시를 원문 문맥에 맞게 설명해줘.",
                        "learning",
                        [e.recordId],
                      )
                    }
                  >
                    개념과 요청을 함께 다듬기
                  </Button>
                  <Button quiet onClick={() => setSelected([e.recordId])}>
                    해석 수정의 근거로 선택
                  </Button>
                </div>
              </section>
            ))
          ) : (
            <Empty title="표현 후보가 아직 없습니다">
              짧은 요청이나 수정 횟수만으로 이해 부족을 판단하지 않습니다.
            </Empty>
          )}
        </>
      ) : (
        <>
          <Button
            primary
            onClick={() =>
              ask(
                "선택한 프로젝트의 요청 패턴과 파편화된 지식을 분석해줘. 프로젝트를 합치거나 나눌 때의 의존 관계와 장단점도 근거가 있는 범위에서 설명하고, 추정과 미확인 조건을 구별해줘.",
                "analysis",
                s.records
                  .filter((r) => r.role === "user" && r.projectId === projectId)
                  .slice(-30)
                  .map((r) => r.id),
              )
            }
          >
            새 AI 분석
          </Button>
          {s.workspace.notes
            .filter((n) => n.kind === "analysis")
            .map((n) => (
              <article className="panel spaced" key={n.id}>
                <h2>{n.title}</h2>
                <MarkdownContent text={n.body} />
                <p className="micro">
                  연결한 원문 {n.evidenceIds.length}개 · {when(n.createdAt)}
                </p>
              </article>
            ))}
          {!s.workspace.notes.some((n) => n.kind === "analysis") && (
            <p className="muted spaced-text">
              대화에서 AI 분석을 실행하고 타당한 결과를 분석 노트로 남길 수
              있습니다.
            </p>
          )}
        </>
      )}
      <section className="panel spaced">
        <h3>내 의도와 다른 해석이 있었나요?</h3>
        <p className="small muted spaced-text">
          선택한 원문과 내 해석을 함께 남깁니다.
        </p>
        <textarea
          aria-label="분석 해석 수정"
          placeholder="실제 의도, 제외할 연결, 다르게 해석할 이유"
          value={interpretation}
          onChange={(e) => setInterpretation(e.target.value)}
        />
        <Button
          disabled={!projectId || !interpretation.trim()}
          onClick={() =>
            void perform(
              () =>
                mutate({
                  operation: "note",
                  projectId,
                  kind: "analysis",
                  title: "분석에 대한 나의 해석",
                  body: interpretation,
                  evidenceIds: selected,
                }),
              "원문과 수정한 해석을 함께 저장했습니다.",
            )
          }
        >
          해석 저장
        </Button>
      </section>
    </>
  );
}
export function LearningPage() {
  const { snapshot: s, projectId, busy, perform, ask } = useWorkspace();
  const [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  if (!projectId) return <NoProject />;
  const notes = s.workspace.notes.filter(
    (n) => n.projectId === projectId && n.kind === "learning",
  );
  return (
    <>
      <Heading
        title="내 요청에서 시작하는 학습"
        sub="용어의 뜻과 당시 문맥을 연결하고, 다음 작업에 적용합니다."
        action={
          <Button
            onClick={() =>
              ask(
                "현재 요청에서 모호했던 용어의 의미 후보·정확한 개념·근거·더 나은 요청 예시와 적용 과제를 설명해줘.",
                "learning",
                s.records
                  .filter((r) => r.role === "user" && r.projectId === projectId)
                  .slice(-20)
                  .map((r) => r.id),
              )
            }
          >
            AI와 학습 주제 찾기
          </Button>
        }
      />
      {notes.length ? (
        notes.map((n) => (
          <article className="panel spaced" key={n.id}>
            <div className="inline">
              <Badge>학습 주제</Badge>
              <span className="micro">읽음과 이해 완료는 구별합니다</span>
            </div>
            <h2 className="spaced-text">{n.title}</h2>
            <MarkdownContent text={n.body} />
            <div className="inline">
              <Button
                disabled={
                  busy ||
                  s.workspace.tasks.some(
                    (t) => t.title === n.title && t.projectId === projectId,
                  )
                }
                onClick={() =>
                  void perform(
                    () =>
                      mutate({
                        operation: "addTask",
                        projectId,
                        title: n.title,
                        phase: "학습 적용",
                      }),
                    "다음 작업에 학습 적용 항목을 추가했습니다.",
                  )
                }
              >
                다음 작업에 적용
              </Button>
              <Button
                quiet
                onClick={() =>
                  ask(
                    n.body +
                      "\n이 내용을 내 프로젝트에 적용할 때 무엇을 더 확인해야 할까?",
                    "learning",
                    n.evidenceIds,
                  )
                }
              >
                추가 질문
              </Button>
            </div>
          </article>
        ))
      ) : (
        <Empty title="내 맥락에서 필요한 개념을 모아보세요">
          사용 분석에서 표현 후보를 살펴보거나 대화로 개념을 구체화한 뒤, 실제
          요청에 적용할 학습 주제를 남길 수 있습니다.
        </Empty>
      )}
      <section className="panel spaced">
        <h3>학습 주제 직접 기록</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void perform(
              () =>
                mutate({
                  operation: "note",
                  projectId,
                  kind: "learning",
                  title,
                  body,
                  evidenceIds: [],
                }),
              "학습 주제를 저장했습니다.",
            ).then((ok) => {
              if (ok) {
                setTitle("");
                setBody("");
              }
            });
          }}
        >
          <label>
            개념·주제
            <input
              required
              maxLength={240}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            요청 문맥·의미·근거·다음 적용
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <Button primary type="submit" disabled={busy}>
            학습 주제 저장
          </Button>
        </form>
      </section>
    </>
  );
}
export function ReportsPage() {
  const { snapshot: s, tab, setTab, navigate, ask } = useWorkspace();
  const period = tab === "weekly" ? "weekly" : "daily";
  const records = recordsInPeriod(
    s.records,
    s.workspace.settings.timezone,
    period,
  );
  const requests = records.filter((r) => r.role === "user");
  const providers = Object.entries(
    requests.reduce<{ [name: string]: number }>(
      (counts, r) => ({
        ...counts,
        [r.source.provider]: (counts[r.source.provider] || 0) + 1,
      }),
      {},
    ),
  );
  return (
    <>
      <Heading
        title={period === "weekly" ? "이번 주를 돌아보기" : "오늘을 돌아보기"}
        sub={`${s.workspace.settings.timezone} · ${period === "weekly" ? "오늘을 포함한 최근 7일" : "오늘"} · 확인한 시각 근거 기준`}
        action={
          <Button quiet onClick={() => navigate("settings")}>
            마감·알림 설정
          </Button>
        }
      />
      <div className="tabs">
        <Button
          aria-pressed={period === "daily"}
          onClick={() => setTab("daily")}
        >
          일간
        </Button>
        <Button
          aria-pressed={period === "weekly"}
          onClick={() => setTab("weekly")}
        >
          주간
        </Button>
      </div>
      <section className="panel">
        <Badge accent>
          {period === "weekly"
            ? "프로젝트를 넘어 본 반복과 연결"
            : "오늘의 활동과 후속 항목"}
        </Badge>
        <h2 className="spaced-text">
          {requests.length
            ? `${requests.length}개의 요청이 남아 있습니다.`
            : "해당 기간의 요청 기록이 아직 없습니다."}
        </h2>
        <div className="facts">
          <div>
            <span>사용자 요청</span>
            <strong>
              {requests.length}
              <small>건</small>
            </strong>
          </div>
          <div>
            <span>관련 프로젝트</span>
            <strong>
              {new Set(requests.map((r) => r.projectId)).size}
              <small>개</small>
            </strong>
          </div>
          <div>
            <span>후속 작업</span>
            <strong>
              {s.workspace.tasks.filter((t) => !t.completed).length}
              <small>개</small>
            </strong>
          </div>
        </div>
        {providers.map(([name, n]) => (
          <div className="list-row" key={name}>
            <span>{name}</span>
            <strong>{n}건</strong>
          </div>
        ))}
        <p className="micro spaced-text">
          시각 근거가 없는 요청 {s.analysis.missingTimestamps}건은 기간 집계에서
          제외했습니다. 세션 길이를 실제 작업 시간으로 간주하지 않습니다.
        </p>
        <div className="note">
          {period === "weekly"
            ? "현재 기간의 공통 주제와 프로젝트 연결을 원문으로 살펴보세요. 개선·증가 여부는 비교 가능한 이전 기간과 조건을 확인한 뒤 판단합니다."
            : "오늘의 결정·남은 궁금증·다음 작업을 근거와 함께 정리해 보세요."}
        </div>
        <div className="inline">
          <Button
            primary
            disabled={!requests.length}
            onClick={() =>
              ask(
                period === "weekly"
                  ? "이번 기간의 반복 주제·여러 프로젝트의 공통점·재사용할 지식·남은 질문을 근거와 함께 회고해줘. 비교 근거 없이 개선을 단정하지 말아줘."
                  : "오늘의 활동·선택·발견과 다음 작업을 원문 근거로 돌아봐줘.",
                "analysis",
                requests.slice(-60).map((r) => r.id),
              )
            }
          >
            기록으로 회고 대화
          </Button>
          <Button onClick={() => navigate("work")}>다음 작업 확인</Button>
        </div>
      </section>
    </>
  );
}
