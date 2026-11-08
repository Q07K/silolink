import { MessageCircle } from "lucide-react";
import { mutate } from "./api";
import { Actions, Badge, BasisBadge, Button, Empty } from "./components";
import { useWorkspace } from "./context";
import { when } from "./metrics";
import type { RequestSignal, RequestStage } from "./types";

const STAGES: [RequestStage, string][] = [["explore", "탐색"], ["diagnose", "진단"], ["execute", "실행"], ["verify", "검증"]];
const TOOLS: Record<string, string> = { codex: "Codex", claude: "Claude Code", "claude-code": "Claude Code", antigravity: "Antigravity" };
const signalLabel = (signal: RequestSignal) =>
  signal.type === "clarification" ? "대화 결과 · AI가 되물음"
    : signal.type === "correction" ? "대화 결과 · 정정"
    : signal.type === "retry" ? "대화 결과 · 다시 요청"
    : signal.type === "phrase" ? `표현 · ${signal.quote}`
    : "표현 · 영역만 지정";

/** Requests that look broadly delegated, each with why and the quoted records; never a verdict on the user. */
export function BroadRequests() {
  const { snapshot: s, perform, ask } = useWorkspace();
  const candidates = s.analysis.requestSignals ?? [];
  const stages = s.analysis.stages ?? {};
  const total = Object.values(stages).reduce((sum, n) => sum + (n ?? 0), 0);
  const marked = (s.workspace.requestMarks ?? []).filter((m) => m.kind === "intentional");
  const projectName = (id: string) => s.workspace.projects.find((p) => p.id === id)?.name ?? "알 수 없는 프로젝트";
  const mark = (recordId: string, intentional: boolean) =>
    void perform(() => mutate({ operation: "markRequest", recordId, intentional }));
  return (
    <>
      <div className="note">
        요청 {total}건 · {STAGES.map(([id, label]) => `${label} ${stages[id] ?? 0}`).join(" · ")} · 일부러 넓게 맡김 {s.analysis.intentionalRequests ?? 0}건 제외
        <br />기준을 맡긴 표현이나 AI의 되물음·정정으로 넓게 맡긴 것으로 보이는 요청입니다. 탐색 단계의 요청은 실행 기준으로 보지 않고, 요청에 #넓게 또는 #탐색을 적으면 뺍니다.
      </div>
      {candidates.length ? candidates.map((c) => (
        <section className="panel spaced" key={c.recordId} aria-label={c.text}>
          <div className="inline">
            <Badge accent>{STAGES.find(([id]) => id === c.stage)?.[1] ?? "기타"}</Badge>
            <BasisBadge basis={c.basis} />
            {c.signals.map((signal) => <Badge key={`${signal.type}:${signal.quote}`}>{signalLabel(signal)}</Badge>)}
          </div>
          <blockquote>{c.text}</blockquote>
          <p className="micro">{projectName(c.projectId)} · {TOOLS[c.provider] ?? c.provider} · {when(c.occurredAt, s.workspace.settings.timezone)}</p>
          {c.signals.map((signal) => (
            <div key={`${signal.type}:${signal.recordId}`}>
              <p className="small">{signal.reason}</p>
              {signal.kind === "outcome" && <blockquote>{signal.quote}</blockquote>}
            </div>
          ))}
          <Actions>
            <Button quiet onClick={() => mark(c.recordId, true)}>일부러 넓게 맡김</Button>
            <Button onClick={() => ask("다음 요청에서 모호할 수 있는 개념·뜻의 후보와 더 구체적인 요청 예시를 원문 문맥에 맞게 설명해줘.", "learning", [c.recordId])}>
              <MessageCircle aria-hidden="true" />개념과 요청을 함께 다듬기
            </Button>
          </Actions>
        </section>
      )) : (
        <Empty title="넓게 맡긴 요청 후보가 없습니다">짧은 요청이나 수정 횟수만으로 판단하지 않습니다. 기록이 쌓이면 판단 이유와 원문을 함께 보여 줍니다.</Empty>
      )}
      {marked.length > 0 && (
        <details className="spaced">
          <summary>일부러 넓게 맡긴 요청 {marked.length}</summary>
          {marked.map((m) => (
            <div className="checkline" key={m.recordId}>
              <span>{s.records.find((r) => r.id === m.recordId)?.text ?? "기록을 찾을 수 없는 요청"}<small>{when(m.createdAt, s.workspace.settings.timezone)}에 표시</small></span>
              <Button quiet onClick={() => mark(m.recordId, false)}>표시 해제</Button>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
