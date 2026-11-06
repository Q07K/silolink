import { useState } from "react";
import { FileDown, MessageCircle } from "lucide-react";
import { native } from "../api";
import { useWorkspace } from "../context";
import {
  Badge,
  Actions,
  Button,
  Empty,
  Heading,
  MarkdownContent,
  Tabs,
} from "../components";
import { DiscoveryCard, DiscoveryFeed } from "../discoveries";
import { inPeriod, recordsInPeriod, taskMilliseconds, when } from "../metrics";

export function AnalysisPage() {
  const { snapshot: s, projectId, tab, ask } = useWorkspace();
  const [selected, setSelected] = useState<string[]>([]);
  const view = tab || "discoveries";
  const projectName = (id: string) => s.workspace.projects.find((p) => p.id === id)?.name ?? "";
  const excluded = s.analysis.excludedRequests ?? {};
  const toggle = (id: string, on: boolean) =>
    setSelected(on ? [...selected, id] : selected.filter((x) => x !== id));
  return (
    <>
      <Heading
        title="내 AI 사용을 이해하기"
        sub="실제 사용자 요청과 출처를 확인하고, 해석은 별도로 검토합니다."
      />
      <Tabs label="사용 분석 보기"
        items={[
          ["discoveries", "발견"],
          ["repeated", "반복 요청"],
          ["terms", "용어 분포"],
          ["expressions", "표현 후보"],
        ]}
      >
      {view === "discoveries" ? (
        <DiscoveryFeed />
      ) : view === "repeated" ? (
        <>
          <div className="note">
            도구가 넣은 메시지 {excluded.agent ?? 0}건과 첨부·페이지 래퍼 {excluded.context ?? 0}건을 빼고, 사용자 요청 {s.analysis.userRequests}건에서 문장이 같거나 글자 구성이 비슷한 요청을 묶었습니다. 같은 뜻을 다른 말로 한 요청은 AI 분석에서 찾습니다.
          </div>
          {s.analysis.repeatedRequests.length ? (
            s.analysis.repeatedRequests.map((g) => (
              <section className="panel spaced" key={g.recordIds.join(":")}>
                <div className="inline">
                  <Badge accent>{g.count}회</Badge>
                  <Badge>{g.match === "similar" ? "비슷한 문장" : "같은 문장"}</Badge>
                  <Badge>{g.projectIds.length}개 프로젝트</Badge>
                </div>
                <h3 className="spaced-text">{g.text}</h3>
                {g.recordIds.map((id) => {
                  const r = s.records.find((r) => r.id === id);
                  return r ? (
                    <label className="checkline" key={id}>
                      <input type="checkbox" checked={selected.includes(id)} onChange={(e) => toggle(id, e.target.checked)} />
                      <span>
                        {projectName(r.projectId)} · {r.source.provider}
                        <small>{when(r.occurredAt, s.workspace.settings.timezone)} · 원문 {id.slice(0, 10)}</small>
                      </span>
                    </label>
                  ) : null;
                })}
              </section>
            ))
          ) : (
            <Empty title="반복 요청은 아직 없습니다">
              같은 뜻의 요청이 다른 표현으로 남았을 수 있습니다. 발견 탭의 AI 분석에서 주제로 묶어 볼 수 있습니다.
            </Empty>
          )}
        </>
      ) : view === "terms" ? (
        <>
          <div className="note">사용자 요청에 세 번 이상 나온 영문 기술 용어입니다. 확인한 기록의 빈도이며 전체 사용 빈도가 아닙니다.</div>
          {(s.analysis.terms ?? []).length ? (
            <table className="data-table" aria-label="자주 쓴 용어">
              <thead><tr><th>용어</th><th>요청</th><th>프로젝트별</th><th></th></tr></thead>
              <tbody>{(s.analysis.terms ?? []).map((t) => (
                <tr key={t.term}>
                  <td><strong>{t.term}</strong></td>
                  <td>{t.count}건</td>
                  <td>{Object.entries(t.projects).map(([id, n]) => `${projectName(id) || "기타"} ${n}`).join(" · ")}</td>
                  <td><Button quiet onClick={() => ask(`내가 요청에서 ‘${t.term}’을 어떤 뜻으로 써 왔는지 원문 문맥으로 살펴보고, 뜻이 섞인 곳이 있으면 구별해줘. 정확한 개념과 더 구체적인 요청 예시도 알려줘.`, "learning", t.recordIds)}><MessageCircle aria-hidden="true" />문맥 보기</Button></td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <Empty title="자주 쓴 용어가 아직 없습니다">기록이 쌓이면 요청에 반복해 나온 용어와 프로젝트별 분포를 보여 줍니다.</Empty>
          )}
        </>
      ) : (
        <>
          {s.analysis.ambiguousExpressions.length ? (
            s.analysis.ambiguousExpressions.map((e) => (
              <section className="panel spaced" key={e.recordId}>
                <div className="inline">
                  <Badge accent>검토할 표현</Badge>
                  {e.phrases.map((p) => <Badge key={p}>{p}</Badge>)}
                </div>
                <blockquote>{e.text}</blockquote>
                <p className="micro">단어 일치 후보 · {projectName(e.projectId)} · 이해 공백 판정 아님</p>
                <Actions>
                  <Button onClick={() => ask("다음 요청에서 모호할 수 있는 개념·뜻의 후보와 더 구체적인 요청 예시를 원문 문맥에 맞게 설명해줘.", "learning", [e.recordId])}>
                    <MessageCircle aria-hidden="true" />개념과 요청을 함께 다듬기
                  </Button>
                </Actions>
              </section>
            ))
          ) : (
            <Empty title="표현 후보가 아직 없습니다">짧은 요청이나 수정 횟수만으로 이해 부족을 판단하지 않습니다.</Empty>
          )}
        </>
      )}
      {view === "repeated" && s.analysis.repeatedRequests.length > 0 && (
        <Actions>
          {!selected.length && <span className="action-help">목록에서 분석할 기록을 선택하세요.</span>}
          <Button primary disabled={!selected.length} onClick={() => ask(
            "선택한 자료에서 자주 요청한 주제·모호한 용어·다른 프로젝트에도 고려할 내용을 근거와 함께 분석해줘.",
            "analysis",
            selected,
          )}><MessageCircle aria-hidden="true" />선택한 기록 {selected.length}개 분석</Button>
        </Actions>
      )}
      {view === "discoveries" && s.workspace.notes.some((n) => n.kind === "analysis" && n.projectId === projectId) && (
        <section className="spaced">
          <h2>분석 노트</h2>
          {s.workspace.notes.filter((n) => n.kind === "analysis" && n.projectId === projectId).map((n) => (
            <article className="panel spaced" key={n.id}>
              <h3>{n.title}</h3>
              <MarkdownContent text={n.body} />
              <p className="micro">연결한 원문 {n.evidenceIds.length}개 · {when(n.createdAt)}</p>
            </article>
          ))}
        </section>
      )}
      </Tabs>
    </>
  );
}
export function ReportsPage() {
  const { snapshot: s, projectId, tab, setTab, navigate, ask, perform } = useWorkspace();
  const [preview, setPreview] = useState("");
  const period = tab === "weekly" ? "weekly" : "daily";
  const timezone = s.workspace.settings.timezone;
  const records = recordsInPeriod(s.records, timezone, period);
  const requests = records.filter((r) => r.role === "user");
  const discoveries = (s.workspace.discoveries ?? []).filter((d) => inPeriod(d.updatedAt, timezone, period) && d.status !== "dismissed");
  const finished = s.workspace.tasks.filter((t) => t.completed && t.spans.some((span) => inPeriod(span.endedAt, timezone, period)));
  const providers = Object.entries(
    requests.reduce<{ [name: string]: number }>(
      (counts, r) => ({ ...counts, [r.source.provider]: (counts[r.source.provider] || 0) + 1 }),
      {},
    ),
  );
  const minutes = (ms: number) => Math.round(ms / 60000);
  return (
    <>
      <Heading
        title={period === "weekly" ? "이번 주를 돌아보기" : "오늘을 돌아보기"}
        sub={`${timezone} · ${period === "weekly" ? "오늘을 포함한 최근 7일" : "오늘"} · 확인한 시각 근거 기준`}
        action={<Button quiet onClick={() => navigate("settings", "review")}>마감·알림 설정</Button>}
      />
      <Tabs label="회고 기간" items={[["daily", "일간"], ["weekly", "주간"]]} value={period} onChange={setTab}>
      <section className="panel">
        <Badge accent>{period === "weekly" ? "프로젝트를 넘어 본 반복과 연결" : "오늘의 활동과 후속 항목"}</Badge>
        <h2 className="spaced-text">
          {requests.length ? `${requests.length}개의 요청이 남아 있습니다.` : "해당 기간의 요청 기록이 아직 없습니다."}
        </h2>
        <div className="facts">
          <div><span>사용자 요청</span><strong>{requests.length}<small>건</small></strong></div>
          <div><span>관련 프로젝트</span><strong>{new Set(requests.map((r) => r.projectId)).size}<small>개</small></strong></div>
          <div><span>발견</span><strong>{discoveries.length}<small>개</small></strong></div>
          <div><span>끝낸 작업</span><strong>{finished.length}<small>개</small></strong></div>
        </div>
        {providers.map(([name, n]) => (
          <div className="list-row" key={name}><span>{name}</span><strong>{n}건</strong></div>
        ))}
        <p className="micro spaced-text">
          시각 근거가 없는 요청 {s.analysis.missingTimestamps}건은 기간 집계에서 제외했습니다. 세션 길이를 실제 작업 시간으로 간주하지 않습니다.
        </p>
        <Actions>
          <Button onClick={() => navigate("work")}>다음 작업 확인</Button>
          {!requests.length && <Button onClick={() => navigate("projects", "records")}>AI 기록 수집 상태</Button>}
          <Button primary disabled={!requests.length} onClick={() => ask(
            period === "weekly"
              ? "이번 기간의 반복 주제·여러 프로젝트의 공통점·재사용할 지식·남은 질문을 근거와 함께 회고해줘. 비교 근거 없이 개선을 단정하지 말아줘."
              : "오늘의 활동·선택·발견과 다음 작업을 원문 근거로 돌아봐줘.",
            "analysis",
            requests.slice(-60).map((r) => r.id),
          )}>기록으로 회고 대화</Button>
        </Actions>
      </section>
      <section className="spaced">
        <h2>이 기간의 발견</h2>
        {discoveries.length ? discoveries.map((d) => <DiscoveryCard key={d.id} discovery={d} />) : (
          <p className="small muted">이 기간에 새로 나오거나 갱신된 발견이 없습니다.</p>
        )}
      </section>
      <section className="panel spaced">
        <h2>끝낸 작업과 측정 시간</h2>
        {finished.length ? finished.map((t) => {
          const worked = taskMilliseconds(t);
          const estimate = t.estimates?.at(-1)?.medianMinutes;
          return (
            <div className="list-row" key={t.id}>
              <span>{t.title}<small> · {s.workspace.projects.find((p) => p.id === t.projectId)?.name} · {t.userTested ? "사용자 확인" : "확인 전"}</small></span>
              <strong>{minutes(worked)}분{estimate != null ? ` (예상 ${estimate}분)` : ""}</strong>
            </div>
          );
        }) : <p className="small muted">이 기간에 타이머로 측정하고 끝낸 작업이 없습니다.</p>}
      </section>
      <section className="panel spaced" aria-label="프로젝트 정리서">
        <h2>프로젝트 정리서</h2>
        <p className="small muted">현재 프로젝트의 문서 현황·확인한 발견·결정과 규칙·학습·조사 근거·작업 실적을 공유용 Markdown으로 만듭니다. 검토하지 않은 발견은 넣지 않습니다.</p>
        <Actions>
          <Button disabled={!projectId} onClick={() => void perform(async () => {
            const value = await native<{ markdown: string }>("preview_project_report", { projectId });
            setPreview(value.markdown);
          })}>미리 보기</Button>
          <Button primary disabled={!projectId} onClick={() => void perform(async () => {
            await native("export_project_report", { projectId });
          }, "정리서를 저장했습니다.")}><FileDown aria-hidden="true" />Markdown으로 저장</Button>
        </Actions>
        {preview && <div className="report-preview"><MarkdownContent text={preview} /></div>}
      </section>
      </Tabs>
    </>
  );
}
