import { useEffect, useState } from "react";
import { FileInput, Plus, X } from "lucide-react";
import { native } from "../api";
import { useWorkspace } from "../context";
import { Actions, Badge, Button, Field, Heading, NoProject } from "../components";
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
  const { snapshot: s, projectId, busy, perform, pendingPlan, clearPendingPlan } = useWorkspace();
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
  useEffect(() => {
    // Plans generated elsewhere (rules) arrive here and are checked like an imported plan.
    if (!pendingPlan || pendingPlan.projectId !== projectId) return;
    clearPendingPlan?.();
    setRationale(pendingPlan.rationale);
    void inspect(pendingPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlan, projectId]);
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
            <FileInput aria-hidden="true" />
            변경안 가져오기
          </Button>
        }
      />
      <section className="panel change-editor">
        <div className="section-heading">
          <h2>{advanced ? "호스트 AI·CLI에서 만든 변경안" : "변경안 작성"}</h2>
          <Button quiet disabled={busy} aria-expanded={advanced} onClick={() => {
            setAdvanced((value) => !value);
            setCheck(null);
          }}>
            {advanced ? "본문으로 작성하기" : "고급 · JSON 직접 입력"}
          </Button>
        </div>
        <form className="form-stack" aria-label="변경안 작성" onSubmit={(event) => {
          event.preventDefault();
          if (!busy && (advanced ? jsonText.trim() : rationale.trim() && combinedOperations().length)) void inspect();
        }}>
          {advanced ? <>
            <p className="muted">가져온 변경안을 확인하거나 JSON을 붙여 넣으세요. 수정한 내용은 다시 검사합니다.</p>
            <Field label="문서 변경안 JSON">
              <textarea className="change-json" value={jsonText} onChange={(event) => {
                setJsonText(event.target.value);
                setCheck(null);
              }} placeholder='{"schemaVersion":1,"id":"...","projectId":"...","rationale":"...","operations":[],"guards":[]}' />
            </Field>
            <Actions><Button primary type="submit" disabled={busy || !jsonText.trim()}>원문·영향 검사</Button></Actions>
          </> : <>
            <p className="muted">수정할 문서를 불러오거나 새 문서를 추가하세요. 검토 후 실제 파일에 반영합니다.</p>
            <div className="change-source">
              <div className="change-document-controls">
                <Field label="수정할 문서">
                  <select value={path} disabled={busy} onChange={(event) => setPath(event.target.value)}>
                    <option value="">문서 선택</option>
                    {documents.map((document) => <option key={document.id} value={document.path}>
                      {document.title || document.path} · {document.path}
                    </option>)}
                  </select>
                </Field>
                <Button disabled={busy || !path} onClick={() => void read()}>내용 불러오기</Button>
              </div>
              <Button disabled={busy} onClick={() => {
                setDraft({ path: "", revision: null, text: "" });
                setContent("");
                setRemove(false);
                setCheck(null);
              }}><Plus />새 문서</Button>
            </div>
            {draft && <div className="form-stack change-draft">
              {draft.revision === null ? <Field label="새 문서 경로">
                <input placeholder="docs/architecture.md" value={draft.path} onChange={(event) => {
                  setDraft({ ...draft, path: event.target.value });
                  setCheck(null);
                }} />
              </Field> : <div className="change-draft-heading">
                <strong>{draft.path}</strong>
                <label className="change-delete"><input type="checkbox" checked={remove} onChange={(event) => {
                  setRemove(event.target.checked);
                  setCheck(null);
                }} />이 문서 삭제</label>
              </div>}
              {!remove && <Field label="변경 후 본문">
                <textarea className="change-body" value={content} onChange={(event) => {
                  setContent(event.target.value);
                  setCheck(null);
                }} />
              </Field>}
              <div className="editor-actions"><Button disabled={busy || !currentOperation()} onClick={() => {
                setOperations(combinedOperations());
                setDraft(null);
                setCheck(null);
              }}>변경 목록에 추가</Button></div>
            </div>}
            {operations.length > 0 && <section aria-label="검토할 변경">
              <h3>검토할 변경 · {operations.length}개</h3>
              {operations.map((operation) => <div className="list-row" key={operation.path}>
                <div><strong>{operation.path}</strong><p>{operation.content === null ? "문서 삭제" : operation.expectedRevision === null ? "새 문서" : "본문 수정"}</p></div>
                <Button quiet aria-label={`${operation.path} 변경 제외`} disabled={busy} onClick={() => {
                  setOperations(operations.filter((item) => item.path !== operation.path));
                  setCheck(null);
                }}><X /></Button>
              </div>)}
            </section>}
            <Field label="정리 이유">
              <input value={rationale} maxLength={1000} onChange={(event) => {
                setRationale(event.target.value);
                setCheck(null);
              }} />
            </Field>
            <Actions>
              <span className="action-help">{combinedOperations().length ? "현재 작성 중인 문서도 함께 검사합니다." : "문서를 불러오거나 새 문서를 추가하세요."}</span>
              <Button primary type="submit" disabled={busy || !rationale.trim() || !combinedOperations().length}>이전·이후와 영향 검토</Button>
            </Actions>
          </>}
        </form>
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
          <Actions>
          <Button
            primary
            disabled={
              busy ||
              check.changeState !== "ready" ||
              reviewedProject !== projectId
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
          </Actions>
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
          <h2>반영 이력과 복구</h2>
          <Button
            disabled={busy}
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
