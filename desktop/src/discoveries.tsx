import { useState } from "react";
import { BookMarked, ListPlus, LoaderCircle, MessageCircle, Scale, Search, Sparkles } from "lucide-react";
import { errorMessage, mutate, native } from "./api";
import { Actions, Badge, Button, Empty } from "./components";
import { useWorkspace } from "./context";
import { when } from "./metrics";
import type { Discovery, DiscoveryKind, DiscoveryStatus } from "./types";

export const kindLabels: { [kind in DiscoveryKind]: string } = {
  "repeated-request": "반복 요청",
  "repeated-topic": "반복 주제",
  "ambiguous-term": "모호한 용어",
  "repeated-research": "반복 조사",
  "cross-project": "프로젝트 간 연결",
  "criteria-exploration": "기준 탐색",
};
const statusLabels: { [status in DiscoveryStatus]: string } = {
  new: "새 발견",
  accepted: "확인함",
  dismissed: "제외함",
  corrected: "해석 수정",
};
function evidenceIds(discovery: Discovery) {
  return discovery.evidence.map((e) => e.recordId);
}
function quotes(discovery: Discovery) {
  return discovery.evidence.map((e) => `- “${e.quote}”`).join("\n");
}

/** Follow-up actions that carry the discovery's evidence and link the result back to it. */
export function useDiscoveryActions() {
  const { projectId, ask, perform } = useWorkspace();
  return {
    learn: (d: Discovery) =>
      ask(
        `다음 발견에서 ${d.term ? `‘${d.term}’` : "내가 쓴 표현"}을 학습 카드로 정리해줘. 내가 쓴 문맥, 가능한 뜻의 후보(내 뜻을 확정하지 말 것), 정확한 개념과 공식 자료 후보, 더 구체적인 요청 예시, 현재 프로젝트에 적용할 과제를 나눠서 써줘.\n\n발견: ${d.title}\n${d.summary}\n근거:\n${quotes(d)}`,
        "learning",
        evidenceIds(d),
        {},
        d.id,
      ),
    research: (d: Discovery) =>
      ask(
        `다음 발견의 주제를 다시 조사하지 않도록 정리하려고 해. 공식 자료로 확인할 질문, 의견이 갈릴 수 있는 쟁점, 현재 프로젝트에 적용할 조건, 아직 확인하지 못한 것을 구별해줘. 공식 원문을 확인하지 않았다면 그렇다고 밝혀줘.\n\n발견: ${d.title}\n${d.summary}\n근거:\n${quotes(d)}`,
        "research",
        evidenceIds(d),
        {},
        d.id,
      ),
    rule: (d: Discovery) =>
      ask(
        `다음 반복을 AI 도구가 먼저 알 수 있도록 프로젝트 규칙 문서(AGENTS.md 등)에 넣을 규칙을 제안해줘. 규칙은 ‘- ’로 시작하는 한 줄 문장 1~5개로 쓰고, 그 아래에 각 규칙이 필요한 이유와 적용하지 말아야 할 경우를 짧게 덧붙여줘.\n\n발견: ${d.title}\n${d.summary}\n근거:\n${quotes(d)}`,
        "rule",
        evidenceIds(d),
        {},
        d.id,
      ),
    chat: (d: Discovery) =>
      ask(`다음 발견을 근거와 함께 살펴보고 내가 다음에 할 일을 제안해줘.\n\n발견: ${d.title}\n${d.summary}`, "analysis", evidenceIds(d), {}, d.id),
    task: (d: Discovery) =>
      perform(
        () => mutate({ operation: "addTask", projectId: d.projectIds.includes(projectId) ? projectId : d.projectIds[0], title: d.title, phase: "검토", originId: d.id }),
        "발견을 다음 작업에 추가했습니다.",
      ),
    review: (d: Discovery, status: DiscoveryStatus, correction?: string) =>
      perform(
        () => mutate({ operation: "reviewDiscovery", id: d.id, status, correction: correction ?? null }),
        status === "dismissed" ? "발견을 제외했습니다. 같은 근거로 다시 알리지 않습니다." : "검토 결과를 저장했습니다.",
      ),
  };
}

export function DiscoveryCard({ discovery: d }: { discovery: Discovery }) {
  const { snapshot: s, busy } = useWorkspace();
  const actions = useDiscoveryActions();
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState(d.correction ?? "");
  const project = (id: string) => s.workspace.projects.find((p) => p.id === id)?.name ?? "연결 해제된 프로젝트";
  const followUps = d.followUps
    .map((id) => s.workspace.notes.find((n) => n.id === id)?.title ?? s.workspace.tasks.find((t) => t.id === id)?.title)
    .filter(Boolean);
  const primary = d.suggestedAction;
  return (
    <article className="panel spaced discovery" aria-label={d.title}>
      <div className="inline">
        <Badge accent>{kindLabels[d.kind] ?? d.kind}</Badge>
        <Badge tone={d.basis === "observed" ? "success" : undefined}>{d.basis === "observed" ? "기록에서 확인" : "해석·추정"}</Badge>
        <Badge>{statusLabels[d.status]}</Badge>
        {d.term && <Badge>{d.term}</Badge>}
      </div>
      <h3 className="spaced-text">{d.title}</h3>
      <p>{d.summary}</p>
      {d.correction && <p className="note">내 해석: {d.correction}</p>}
      <details>
        <summary>근거 원문 {d.evidence.length}개 · {d.projectIds.map(project).join(", ")}</summary>
        <ul className="evidence-list">
          {d.evidence.map((e) => (
            <li key={e.recordId}>
              <blockquote>{e.quote}</blockquote>
              <small className="micro">{project(e.projectId)} · {when(e.occurredAt ?? null, s.workspace.settings.timezone)} · 원문 {e.recordId.slice(0, 10)}</small>
            </li>
          ))}
        </ul>
      </details>
      <p className="micro">{d.source === "local" ? "앱에서 계산" : `${d.source} 분석`} · {when(d.updatedAt, s.workspace.settings.timezone)}{followUps.length ? ` · 후속: ${followUps.join(", ")}` : ""}</p>
      <Actions>
        <Button primary={primary === "learn"} disabled={busy} onClick={() => actions.learn(d)}><BookMarked aria-hidden="true" />학습 카드</Button>
        <Button primary={primary === "research"} disabled={busy} onClick={() => actions.research(d)}><Search aria-hidden="true" />조사</Button>
        <Button primary={primary === "rule"} disabled={busy} onClick={() => actions.rule(d)}><Scale aria-hidden="true" />규칙 초안</Button>
        <Button primary={primary === "task"} disabled={busy} onClick={() => void actions.task(d)}><ListPlus aria-hidden="true" />작업으로</Button>
        <Button quiet disabled={busy} onClick={() => actions.chat(d)}><MessageCircle aria-hidden="true" />대화</Button>
      </Actions>
      <Actions>
        {d.status !== "accepted" && <Button quiet disabled={busy} onClick={() => void actions.review(d, "accepted")}>타당함</Button>}
        {d.status !== "dismissed" && <Button quiet disabled={busy} onClick={() => void actions.review(d, "dismissed")}>제외</Button>}
        <Button quiet disabled={busy} aria-expanded={correcting} onClick={() => setCorrecting((v) => !v)}>해석 수정</Button>
      </Actions>
      {correcting && (
        <form className="form-stack" onSubmit={(e) => {
          e.preventDefault();
          void actions.review(d, "corrected", correction).then((ok) => ok && setCorrecting(false));
        }}>
          <textarea aria-label="내 해석" required maxLength={4000} value={correction} onChange={(e) => setCorrection(e.target.value)}
            placeholder="실제 의도, 잘못 연결된 근거, 다르게 봐야 하는 이유" />
          <Actions><Button primary type="submit" disabled={busy || !correction.trim()}>해석 저장</Button></Actions>
        </form>
      )}
    </article>
  );
}

/** Runs model analysis on the user's own CLI and shows what the last run covered. */
export function AnalysisRunner({ compact }: { compact?: boolean }) {
  const { snapshot: s, projectId, busy, perform } = useWorkspace();
  const [provider, setProvider] = useState<string>(s.workspace.settings.analysisProvider ?? "codex");
  const [scope, setScope] = useState<"project" | "all">("project");
  const runs = s.workspace.analysisRuns ?? [];
  const last = runs.at(-1);
  const running = last?.status === "running";
  const projectIds = scope === "all" ? s.workspace.projects.slice(0, 10).map((p) => p.id) : [projectId];
  return (
    <section className={compact ? "analysis-runner compact" : "panel analysis-runner"} aria-label="AI 분석 실행">
      {!compact && <p className="small muted">최근 사용자 요청을 선택한 AI 도구에 보내 반복 주제·모호한 용어·반복 조사·프로젝트 간 연결을 찾습니다. 근거로 든 원문이 실제 요청에 없으면 결과에서 뺍니다.</p>}
      <div className="inline">
        <label>AI 도구 <select aria-label="분석에 쓸 AI 도구" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={running}>
          <option value="codex">Codex</option><option value="claude">Claude Code</option>
        </select></label>
        <label>범위 <select aria-label="분석 범위" value={scope} onChange={(e) => setScope(e.target.value as "project" | "all")} disabled={running}>
          <option value="project">현재 프로젝트</option><option value="all">모든 프로젝트(최대 10개)</option>
        </select></label>
        {running ? (
          <>
            <span role="status" className="inline"><LoaderCircle className="spin" aria-hidden="true" />분석 중 · 요청 {last.requestCount}개</span>
            <Button disabled={busy} onClick={() => void perform(() => native("cancel_chat", { id: last.id }))}>중지</Button>
          </>
        ) : (
          <Button primary disabled={busy || !projectId} onClick={() => void perform(() => native("run_analysis", { provider, projectIds }), "분석을 시작했습니다. 끝나면 발견 목록과 알림에 반영합니다.")}>
            <Sparkles aria-hidden="true" />AI 분석 실행
          </Button>
        )}
      </div>
      {last && !running && (
        <p className="micro spaced-text">
          마지막 분석 {when(last.startedAt, s.workspace.settings.timezone)} · {last.provider} · {
            last.status === "completed"
              ? `요청 ${last.requestCount}개에서 발견 ${last.discoveryCount}개${last.rejectedCount ? ` · 근거가 맞지 않아 제외 ${last.rejectedCount}개` : ""}`
              : last.status === "cancelled" ? "중지함" : last.status === "interrupted" ? "앱 종료로 중단됨" : `실패: ${errorMessage(last.error)}`
          }
        </p>
      )}
    </section>
  );
}

export function DiscoveryFeed() {
  const { snapshot: s, projectId } = useWorkspace();
  const [filter, setFilter] = useState<"open" | "reviewed" | "dismissed">("open");
  const [allProjects, setAllProjects] = useState(false);
  const all = (s.workspace.discoveries ?? []).filter((d) => allProjects || d.projectIds.includes(projectId));
  const shown = all
    .filter((d) => filter === "open" ? d.status === "new" : filter === "reviewed" ? d.status === "accepted" || d.status === "corrected" : d.status === "dismissed")
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const count = (f: typeof filter) => all.filter((d) => f === "open" ? d.status === "new" : f === "reviewed" ? d.status === "accepted" || d.status === "corrected" : d.status === "dismissed").length;
  return (
    <>
      <AnalysisRunner />
      <div className="inline spaced-text">
        {(["open", "reviewed", "dismissed"] as const).map((f) => (
          <Button key={f} quiet={filter !== f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "open" ? "검토할 발견" : f === "reviewed" ? "확인한 발견" : "제외한 발견"} {count(f)}
          </Button>
        ))}
        <label className="checkline"><input type="checkbox" checked={allProjects} onChange={(e) => setAllProjects(e.target.checked)} /><span>모든 프로젝트</span></label>
      </div>
      {shown.length ? shown.map((d) => <DiscoveryCard key={d.id} discovery={d} />) : (
        <Empty title={filter === "open" ? "검토할 발견이 없습니다" : "해당하는 발견이 없습니다"}>
          {s.analysis.userRequests < 3
            ? "분석할 사용자 요청이 아직 부족합니다. 프로젝트에서 AI 기록을 수집하면 반복 요청은 자동으로, 나머지는 AI 분석으로 찾습니다."
            : "비슷한 요청이 세 번 이상 쌓이면 자동으로 알려 드립니다. 주제·용어·프로젝트 간 연결은 AI 분석을 실행해 찾을 수 있습니다."}
        </Empty>
      )}
    </>
  );
}
