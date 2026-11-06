import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, Scale } from "lucide-react";
import { native } from "../api";
import { useWorkspace } from "../context";
import { Actions, Badge, Button, Empty, Field, Heading, NoProject } from "../components";
import type { ChangePlan, RuleComparison } from "../types";

const statusLabels = {
  shared: "공통",
  variant: "표현이 다름",
  local: "한 프로젝트에만",
} as const;

/** Rule lines a user saved as rule notes, usually drafted from a discovery. */
function noteRules(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line))
    .map((line) => line.replace(/^[-*+]\s+/, "").replace(/\*\*/g, "").trim())
    .filter((line) => line.length >= 4 && line.length <= 400);
}

export function RulesPage() {
  const { snapshot: s, projectId, busy, perform, reviewPlan } = useWorkspace();
  const [scope, setScope] = useState<string[]>(() => s.workspace.projects.slice(0, 10).map((p) => p.id));
  const [result, setResult] = useState<RuleComparison | null>(null);
  const [filter, setFilter] = useState<"variant" | "shared" | "local">("variant");
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState(projectId);
  const [path, setPath] = useState("");
  const [heading, setHeading] = useState("공통 규칙");
  useEffect(() => setTarget(projectId), [projectId]);
  const ruleNotes = s.workspace.notes.filter((n) => n.kind === "rule" && noteRules(n.body).length > 0);
  const targetDocuments = useMemo(() => {
    const documents = s.inventories.find((i) => i.projectId === target)?.report?.documents ?? [];
    const known = (result?.documents ?? []).filter((d) => d.projectId === target && !d.error).map((d) => d.path);
    const paths = new Set([...known, ...documents.map((d) => d.path).filter((p) => /(^|\/)(agents|claude|gemini|contributing)\.md$/i.test(p))]);
    return [...paths];
  }, [s.inventories, result, target]);
  useEffect(() => {
    setPath((current) => (current && targetDocuments.includes(current) ? current : targetDocuments[0] ?? "AGENTS.md"));
  }, [targetDocuments]);
  if (!projectId) return <NoProject />;
  const project = (id: string) => s.workspace.projects.find((p) => p.id === id)?.name ?? id;
  const toggle = (text: string, on: boolean) =>
    setSelected((value) => (on ? [...new Set([...value, text])] : value.filter((v) => v !== text)));
  const groups = (result?.groups ?? []).filter((g) => g.status === filter);
  async function compare() {
    await perform(async () => {
      setResult(await native<RuleComparison>("compare_rules", { projectIds: scope }));
    });
  }
  async function makePlan() {
    await perform(async () => {
      const plan = await native<ChangePlan>("rule_plan", { projectId: target, path, heading, rules: selected });
      reviewPlan?.(plan);
    });
  }
  return (
    <>
      <Heading
        title="공통·로컬 규칙"
        sub="여러 프로젝트의 규칙 문서를 비교하고, 고른 규칙을 검토한 변경안으로 반영합니다."
      />
      <section className="panel" aria-label="비교할 프로젝트">
        <h2>비교할 프로젝트</h2>
        <div className="inline">
          {s.workspace.projects.map((p) => (
            <label className="checkline" key={p.id}>
              <input type="checkbox" checked={scope.includes(p.id)} disabled={!scope.includes(p.id) && scope.length >= 10}
                onChange={(e) => setScope(e.target.checked ? [...scope, p.id] : scope.filter((id) => id !== p.id))} />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
        <p className="micro">AGENTS.md·CLAUDE.md·GEMINI.md·CONTRIBUTING.md와 이름에 규칙·컨벤션·가이드·정책이 들어간 Markdown의 목록 항목을 규칙으로 읽습니다.</p>
        <Actions><Button primary disabled={busy || !scope.length} onClick={() => void compare()}><GitCompareArrows aria-hidden="true" />규칙 비교</Button></Actions>
      </section>
      {result && (
        <>
          <div className="facts spaced">
            <div><span>공통 규칙</span><strong>{result.summary.shared}<small>개</small></strong></div>
            <div><span>표현이 다른 규칙</span><strong>{result.summary.variant}<small>개</small></strong></div>
            <div><span>한 프로젝트에만</span><strong>{result.summary.local}<small>개</small></strong></div>
          </div>
          <details className="spaced-text">
            <summary>읽은 규칙 문서 {result.documents.length}개</summary>
            <ul>
              {result.documents.map((d) => (
                <li key={`${d.projectId}:${d.path}`}>{project(d.projectId)} · {d.path} · {d.error ? `읽지 못함(${d.error.message})` : `규칙 ${d.rules}개`}</li>
              ))}
              {result.projects.filter((p) => !result.documents.some((d) => d.projectId === p.id)).map((p) => (
                <li key={p.id}>{p.name} · 규칙 문서 없음</li>
              ))}
            </ul>
          </details>
          {result.summary.rules === 0 ? (
            <Empty title="비교할 규칙이 없습니다">선택한 프로젝트에 규칙 문서가 없거나 목록 항목이 없습니다. 아래에서 규칙 노트를 골라 새 AGENTS.md로 시작할 수 있습니다.</Empty>
          ) : (
            <>
              <div className="inline spaced-text">
                {(["variant", "shared", "local"] as const).map((f) => (
                  <Button key={f} quiet={filter !== f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{statusLabels[f]} {result.summary[f]}</Button>
                ))}
              </div>
              <p className="micro">비슷함은 글자 구성으로 계산한 후보입니다. 같은 규칙으로 합칠지는 적용 조건을 보고 판단하세요.</p>
              {groups.map((g, index) => (
                <section className="panel spaced" key={`${g.status}:${index}`}>
                  <div className="inline">
                    <Badge accent>{statusLabels[g.status]}</Badge>
                    <Badge>{g.projectIds.map(project).join(", ")}</Badge>
                    {g.missingProjectIds.length > 0 && <Badge>없음: {g.missingProjectIds.map(project).join(", ")}</Badge>}
                  </div>
                  {g.items.map((item) => (
                    <label className="checkline" key={`${item.projectId}:${item.path}:${item.line}`}>
                      <input type="checkbox" checked={selected.includes(item.text)} onChange={(e) => toggle(item.text, e.target.checked)} />
                      <span>{item.text}<small>{item.projectName} · {item.path}:{item.line}{item.section ? ` · ${item.section}` : ""}</small></span>
                    </label>
                  ))}
                </section>
              ))}
            </>
          )}
        </>
      )}
      {ruleNotes.length > 0 && (
        <section className="panel spaced" aria-label="규칙 노트">
          <h2>규칙 노트에서 고르기</h2>
          <p className="small muted">발견에서 만든 규칙 초안이나 대화에서 남긴 규칙 노트의 목록 항목입니다.</p>
          {ruleNotes.map((n) => (
            <div key={n.id} className="spaced-text">
              <strong>{n.title}</strong><small className="micro"> · {project(n.projectId)}</small>
              {noteRules(n.body).map((rule) => (
                <label className="checkline" key={rule}>
                  <input type="checkbox" checked={selected.includes(rule)} onChange={(e) => toggle(rule, e.target.checked)} />
                  <span>{rule}</span>
                </label>
              ))}
            </div>
          ))}
        </section>
      )}
      <section className="panel spaced" aria-label="규칙 반영">
        <h2><Scale aria-hidden="true" /> 고른 규칙 반영</h2>
        {selected.length ? (
          <>
            <Field label={`반영할 규칙 ${selected.length}개 (한 줄에 하나, 수정 가능)`}>
              <textarea value={selected.join("\n")} onChange={(e) => setSelected(e.target.value.split("\n").filter((line, i, all) => line.trim() || i < all.length - 1))} />
            </Field>
            <div className="inline">
              <Field label="반영할 프로젝트">
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {s.workspace.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="규칙 문서">
                <input list="rule-documents" value={path} onChange={(e) => setPath(e.target.value)} />
                <datalist id="rule-documents">{[...targetDocuments, "AGENTS.md"].map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="추가할 섹션 제목"><input value={heading} maxLength={200} onChange={(e) => setHeading(e.target.value)} /></Field>
            </div>
            <p className="micro">기존 내용은 그대로 두고 문서 끝에 섹션을 추가하는 변경안을 만듭니다. 변경안 검토 화면에서 전후 내용을 확인한 뒤 반영하고, 반영 후에도 되돌릴 수 있습니다.</p>
            <Actions>
              <Button quiet onClick={() => setSelected([])}>선택 비우기</Button>
              <Button primary disabled={busy || !path.trim() || !heading.trim() || !selected.some((r) => r.trim())} onClick={() => void makePlan()}>변경안 만들어 검토</Button>
            </Actions>
          </>
        ) : (
          <p className="small muted">비교 결과나 규칙 노트에서 반영할 규칙을 고르세요.</p>
        )}
      </section>
    </>
  );
}
