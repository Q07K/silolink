import { useEffect, useState } from "react";
import { Plus, Upload, X } from "lucide-react";
import { native } from "../api";
import { useWorkspace } from "../context";
import { Badge, Button, Heading, NoProject } from "../components";
import { when } from "../metrics";
import type {
  ChangePlan,
  ChangeSummary,
  DocumentItem,
  Operation,
  PlanCheck,
} from "../types";

interface Outcome {
  changeState: string;
  conflicts?: { path?: string; code?: string }[];
  validation?: {
    scanStatus: string;
    newBrokenLinks: { source: string; destination: string }[];
  };
}
interface Draft {
  path: string;
  revision: string | null;
  text: string;
}
export function ChangesPage() {
  const { snapshot: s, projectId, busy, perform } = useWorkspace();
  const [advanced, setAdvanced] = useState(false),
    [jsonText, setJsonText] = useState("");
  const [path, setPath] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState(""),
    [rationale, setRationale] = useState("문서 정리");
  const [remove, setRemove] = useState(false),
    [operations, setOperations] = useState<Operation[]>([]);
  const [check, setCheck] = useState<PlanCheck | null>(null),
    [reviewedProject, setReviewedProject] = useState("");
  const [history, setHistory] = useState<ChangeSummary[]>([]),
    [outcome, setOutcome] = useState<Outcome | null>(null);
  useEffect(() => {
    setCheck(null);
    setOutcome(null);
    setHistory([]);
    setDraft(null);
    setOperations([]);
    setPath("");
    setJsonText("");
  }, [projectId]);
  if (!projectId) return <NoProject />;
  const documents =
    s.inventories.find((i) => i.projectId === projectId)?.report?.documents ??
    [];
  function currentOperation(): Operation | null {
    return draft && draft.path.trim()
      ? {
          path: draft.path.trim(),
          expectedRevision: draft.revision,
          content: remove ? null : content,
        }
      : null;
  }
  function combinedOperations() {
    const current = currentOperation();
    return current
      ? [...operations.filter((op) => op.path !== current.path), current]
      : operations;
  }
  async function read() {
    const selected = documents.find((d) => d.path === path);
    if (!selected) return;
    await perform(async () => {
      const doc = await native<DocumentItem>("read_document", {
        projectId,
        path,
        revision: selected.revision,
      });
      setDraft({
        path: doc.path,
        revision: doc.revision,
        text: doc.text || "",
      });
      setContent(doc.text || "");
      setRemove(false);
      setCheck(null);
    });
  }
  async function inspect(imported?: ChangePlan) {
    await perform(async () => {
      const plan: ChangePlan =
        imported ??
        (advanced
          ? JSON.parse(jsonText)
          : {
              schemaVersion: 1,
              id: crypto.randomUUID(),
              projectId,
              rationale,
              operations: combinedOperations(),
              guards: [],
            });
      const report = await native<PlanCheck>("check_plan", { projectId, plan });
      setCheck(report);
      setReviewedProject(projectId);
    });
  }
  async function loadHistory() {
    await perform(async () => {
      const value = await native<{ changes: ChangeSummary[] }>(
        "change_history",
        { projectId },
      );
      setHistory(value.changes);
    });
  }
  return (
    <>
      <Heading
        title="변경 내용을 검토하고 반영하기"
        sub="문서의 이전·이후와 영향을 확인하고 선택한 프로젝트에 반영합니다."
        action={
          <Button
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                const plan = await native<ChangePlan | null>("import_plan");
                if (plan) {
                  setJsonText(JSON.stringify(plan, null, 2));
                  setAdvanced(true);
                  setCheck(null);
                }
              })
            }
          >
            <Upload />
            변경안 가져오기
          </Button>
        }
      />
      <section className="panel">
        <div className="section-heading" style={{ marginTop: 0 }}>
          <h3>
            {advanced ? "호스트 AI·CLI에서 만든 변경안" : "문서 정리 제안 작성"}
          </h3>
          <Button
            quiet
            onClick={() => {
              setAdvanced((v) => !v);
              setCheck(null);
            }}
          >
            {advanced ? "본문으로 작성하기" : "고급 · JSON 직접 입력"}
          </Button>
        </div>
        {advanced ? (
          <>
            <p className="small muted spaced-text">
              기존 CLI와 같은 변경안 형식을 사용합니다. 내용을 편집하면 다시
              검사해야 합니다.
            </p>
            <textarea
              aria-label="문서 변경안 JSON"
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setCheck(null);
              }}
              placeholder='{"schemaVersion":1,"id":"...","projectId":"...","rationale":"...","operations":[],"guards":[]}'
              style={{ minHeight: 180, fontFamily: "Consolas,monospace" }}
            />
            <Button
              primary
              disabled={busy || !jsonText.trim()}
              onClick={() => void inspect()}
            >
              원문·영향 검사
            </Button>
          </>
        ) : (
          <>
            <p className="small muted">
              문서 내용을 다듬거나, 새 문서로 합친 뒤 기존 문서를 삭제하는
              변경을 함께 검토할 수 있습니다.
            </p>
            <label className="spaced-text">
              정리 이유
              <input
                aria-label="정리 이유"
                value={rationale}
                maxLength={1000}
                onChange={(e) => {
                  setRationale(e.target.value);
                  setCheck(null);
                }}
                style={{ display: "block", width: "100%", marginTop: 8 }}
              />
            </label>
            <div className="inline">
              <select
                aria-label="수정할 문서"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">문서 선택</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.path}>
                    {d.title || d.path} · {d.path}
                  </option>
                ))}
              </select>
              <Button disabled={busy || !path} onClick={() => void read()}>
                내용 불러오기
              </Button>
              <Button
                onClick={() => {
                  setDraft({ path: "", revision: null, text: "" });
                  setContent("");
                  setRemove(false);
                  setCheck(null);
                }}
              >
                <Plus />새 문서
              </Button>
            </div>
            {draft && (
              <div className="spaced">
                {draft.revision === null ? (
                  <label>
                    새 문서 경로
                    <input
                      aria-label="새 문서 경로"
                      placeholder="docs/architecture.md"
                      value={draft.path}
                      onChange={(e) => {
                        setDraft({ ...draft, path: e.target.value });
                        setCheck(null);
                      }}
                      style={{ display: "block", width: "100%", marginTop: 8 }}
                    />
                  </label>
                ) : (
                  <div className="inline">
                    <Badge>{draft.path}</Badge>
                    <label className="inline">
                      <input
                        type="checkbox"
                        checked={remove}
                        onChange={(e) => {
                          setRemove(e.target.checked);
                          setCheck(null);
                        }}
                      />
                      이 문서 삭제
                    </label>
                  </div>
                )}
                {!remove && (
                  <label className="spaced-text" style={{ display: "block" }}>
                    변경 후 본문
                    <textarea
                      aria-label="변경 후 본문"
                      value={content}
                      onChange={(e) => {
                        setContent(e.target.value);
                        setCheck(null);
                      }}
                      style={{ minHeight: 200, marginTop: 8 }}
                    />
                  </label>
                )}
                <Button
                  disabled={!currentOperation()}
                  onClick={() => {
                    setOperations(combinedOperations());
                    setDraft(null);
                    setCheck(null);
                  }}
                >
                  변경 목록에 추가
                </Button>
              </div>
            )}
            {operations.map((op) => (
              <div className="list-row" key={op.path}>
                <div>
                  <strong>{op.path}</strong>
                  <p>
                    {op.content === null
                      ? "문서 삭제"
                      : op.expectedRevision === null
                        ? "새 문서"
                        : "본문 수정"}
                  </p>
                </div>
                <Button
                  quiet
                  aria-label={`${op.path} 변경 제외`}
                  onClick={() => {
                    setOperations(operations.filter((x) => x.path !== op.path));
                    setCheck(null);
                  }}
                >
                  <X />
                </Button>
              </div>
            ))}
            <div className="inline spaced-text">
              <Button
                primary
                disabled={
                  busy || !rationale.trim() || !combinedOperations().length
                }
                onClick={() => void inspect()}
              >
                이전·이후와 영향 검토
              </Button>
              <span className="micro">
                현재 작성 중인 문서도 함께 검사합니다.
              </span>
            </div>
          </>
        )}
      </section>
      {check && (
        <section className="panel spaced">
          <div className="inline">
            <Badge accent>
              {check.changeState === "ready" ? "검토 가능" : check.changeState}
            </Badge>
            <Badge>
              {s.workspace.projects.find((p) => p.id === reviewedProject)?.name}
            </Badge>
          </div>
          <h2 className="spaced-text">{check.rationale}</h2>
          {check.operations.map((op) => (
            <div key={op.path}>
              <h3>{op.path}</h3>
              <div className="diff">
                <section>
                  <span className="micro">이전</span>
                  <pre>{op.before ?? "새 문서"}</pre>
                </section>
                <section>
                  <span className="micro">이후</span>
                  <pre>{op.after ?? "문서 삭제"}</pre>
                </section>
              </div>
            </div>
          ))}
          {check.conflicts.length > 0 && (
            <div role="alert" className="note">
              원문 충돌 또는 검토할 문제가 있습니다.
              <ul>
                {check.conflicts.map((c, i) => (
                  <li key={i}>
                    {c.code} · {c.path}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {check.incomingLinks.length > 0 && (
            <div className="note">
              관련 참조
              <ul>
                {check.incomingLinks.map((l, i) => (
                  <li key={i}>
                    {l.source} ·{" "}
                    {l.sourceCoveredByPlan ? "변경안에 포함" : "별도 확인 필요"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            primary
            disabled={
              busy ||
              check.changeState !== "ready" ||
              reviewedProject !== projectId ||
              !s.workspace.settings.stateDirectory
            }
            onClick={() =>
              void perform(async () => {
                setOutcome(
                  await native<Outcome>("apply_plan", {
                    projectId,
                    planId: check.changeId,
                  }),
                );
                setCheck(null);
              }, "파일 반영 상태와 링크 검사 결과를 확인해 주세요.")
            }
          >
            이 프로젝트에 실제 반영
          </Button>
          {!s.workspace.settings.stateDirectory && (
            <p className="micro spaced-text">
              먼저 기록·문서 백업 저장 위치를 선택해 주세요.
            </p>
          )}
        </section>
      )}
      {outcome && (
        <div role="status" className="note">
          변경 상태: {outcome.changeState}
          {outcome.conflicts?.map((c, i) => (
            <p key={i}>
              {c.code} · {c.path}
            </p>
          ))}
          {outcome.validation && (
            <p>
              새로 발견한 깨진 링크{" "}
              {outcome.validation.newBrokenLinks?.length ?? 0}개 · 검사 범위{" "}
              {outcome.validation.scanStatus}
            </p>
          )}
        </div>
      )}
      <section className="panel spaced">
        <div className="section-heading" style={{ marginTop: 0 }}>
          <h3>반영 이력과 복구</h3>
          <Button
            disabled={busy || !s.workspace.settings.stateDirectory}
            onClick={() => void loadHistory()}
          >
            이력 불러오기
          </Button>
        </div>
        {history.map((c) => (
          <div className="list-row" key={c.changeId || c.id}>
            <div>
              <strong>{c.rationale || c.changeId}</strong>
              <p>
                {c.changeState} · {when(c.createdAt || null)}
              </p>
            </div>
            <Button
              disabled={busy || c.changeState === "rolled-back"}
              onClick={() =>
                void perform(async () => {
                  setOutcome(
                    await native<Outcome>("undo_change", {
                      projectId,
                      changeId: c.changeId || c.id,
                    }),
                  );
                }, "복구 결과를 확인했습니다. 이후 편집과의 충돌은 보존됩니다.")
              }
            >
              이 변경 복구
            </Button>
          </div>
        ))}
        {!history.length && (
          <p className="small muted">
            선택한 프로젝트의 실제 이력을 조회할 수 있습니다.
          </p>
        )}
      </section>
    </>
  );
}
