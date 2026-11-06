import { useEffect, useState } from "react";
import { FileText, FolderPlus, GitCompareArrows, History, Import, ListChecks, MessageCircle, RefreshCw, Repeat2 } from "lucide-react";
import { errorMessage, mutate, native } from "../api";
import { useWorkspace } from "../context";
import {
  Badge,
  Actions,
  Button,
  Empty,
  Heading,
  MarkdownContent,
  NoProject,
  PromptButton,
  Tabs,
} from "../components";
import type { DocumentItem } from "../types";
import { when } from "../metrics";
import { NoteExport } from "../note-export";

function FirstProjectResult() {
  const { snapshot: s, projectId, navigate, busy, perform, refresh } = useWorkspace();
  const project = s.workspace.projects.find((p) => p.id === projectId);
  const inventory = s.inventories.find((i) => i.projectId === projectId);
  const report = inventory?.report;
  return (
    <section className="panel feature" aria-label="프로젝트 연결 결과">
      <Badge accent>{project?.name} · 폴더 연결됨</Badge>
      <h2>{inventory?.error || !report ? "문서 확인을 마치지 못했습니다" : "첫 문서 확인"}</h2>
      {inventory?.error || !report ? (
        <>
          <p>{inventory?.error ? errorMessage(inventory.error) : "폴더는 연결했지만 문서 결과를 아직 불러오지 못했습니다."}</p>
        </>
      ) : (
        <>
          <p>{report.documents.length
            ? `문서 ${report.documents.length}개를 찾았습니다. 원문을 읽고 정리할 부분을 살펴보세요.`
            : "아직 읽을 수 있는 Markdown 문서(.md)가 없습니다. 문서를 추가한 뒤 다시 확인하거나 AI 대화 기록부터 가져올 수 있습니다."}</p>
          <p className="small muted">
            {report.documents.length > 0 && report.proposals.length > 0
              ? `함께 검토할 정리 후보 ${report.proposals.length}개가 있습니다. ` : ""}
            {report.status !== "success" || report.warnings.length > 0
              ? `일부 문서를 확인하지 못했을 수 있습니다. 문서 목록에서 알림 ${report.warnings.length}개와 확인 범위를 살펴보세요.`
              : "선택한 폴더에서 읽을 수 있는 Markdown 문서를 확인했습니다."}
          </p>
        </>
      )}
      <p className="small spaced-text">다음에는 AI 대화 기록을 가져와 이전에 요청한 내용도 함께 살펴볼 수 있습니다.</p>
      <Actions>
        <Button quiet onClick={() => navigate("projects", "connect")}><FolderPlus aria-hidden="true" />다른 폴더 연결</Button>
        <Button onClick={() => navigate("projects", "records")}><History aria-hidden="true" />AI 기록 가져오기 설정</Button>
        {!inventory?.error && report?.documents.length ? (
          <Button primary onClick={() => navigate("docs")}><FileText aria-hidden="true" />문서 {report.documents.length}개 살펴보기</Button>
        ) : (
          <Button disabled={busy} onClick={() => void perform(refresh)}><RefreshCw aria-hidden="true" />문서 다시 확인</Button>
        )}
      </Actions>
    </section>
  );
}

function ConnectionPanel() {
  const { snapshot: s, projectId, setProjectId, busy, perform, navigate, tab } = useWorkspace();
  const [path, setPath] = useState("");
  async function choose() {
    await perform(async () => {
      const selected = await native<string | null>("choose_directory");
      if (selected) setPath(selected);
    });
  }
  const settings = s.workspace.settings;
  const collection = s.collections.find((c) => c.projectId === projectId);
  return (
    <>
      {tab !== "records" && <section className="panel">
        <h2>프로젝트 연결</h2>
        <p className="small muted spaced-text">
          AI와 작업하던 폴더나 정리하고 싶은 문서가 있는 폴더를 선택하세요.
          연결하면 문서 현황을 바로 확인할 수 있습니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              let id: string | null = null;
              const success = await perform(async () => {
                const result = await mutate({ operation: "connect", path, initialize: true });
                id = result.id;
                if (id) setProjectId(id);
              }, "프로젝트를 연결했습니다.");
              if (success && id) navigate("projects", "connected");
            })();
          }}
        >
          <label>
            프로젝트 폴더
            <div className="inline">
              <input
                aria-label="프로젝트 폴더"
                required
                value={path}
                disabled={busy}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Projects\my-project"
                style={{ flex: 1 }}
              />
              <Button disabled={busy} onClick={() => void choose()}>폴더 선택</Button>
            </div>
          </label>
          <p className="small muted spaced-text">
            연결을 누르면 폴더 안에 SiloLink 관리 정보를 만듭니다.
            기존 문서 내용은 유지하며, 이미 연결한 폴더는 같은 프로젝트로 엽니다.
          </p>
          <Actions><Button primary type="submit" disabled={busy || !path.trim()}>
            <FolderPlus />
            선택한 프로젝트 연결
          </Button></Actions>
        </form>
      </section>}
      {tab === "records" && <><section className="panel spaced">
        <div className="section-heading" style={{ marginTop: 0 }}>
          <h2>AI 기록 가져오기 · 선택 사항</h2>
          <Button onClick={() => navigate("settings", "collection")}>
            저장 위치·수집 설정
          </Button>
        </div>
        <p className="small muted">
          수집을 켜면 연결된 프로젝트의 Codex·Claude Code 대화를 이 PC에
          저장합니다. 앱을 닫아도 트레이에서 주기적으로 수집합니다.
        </p>
        <div className="code">
          {settings.stateDirectory ?? s.defaultStateDirectory}
        </div>
        {settings.backgroundEnabled && <Badge tone="success">AI 기록 자동 수집 켜짐</Badge>}
        <Actions>
          <Button
            primary={settings.backgroundEnabled}
            disabled={busy || !projectId}
            onClick={() =>
              void perform(
                () => native("collect_records", { projectId }),
                "수집을 마쳤습니다. 도구별 범위와 누락도 확인해 주세요.",
              )
            }
          >
            <Import aria-hidden="true" />
            AI 대화 기록 가져오기
          </Button>
          {!settings.backgroundEnabled && (
            <Button
              primary
              disabled={busy || !projectId}
              onClick={() =>
                void perform(
                  () => mutate({ operation: "settings", settings: { ...settings, backgroundEnabled: true } }),
                  "AI 기록 자동 수집을 켰습니다. 첫 결과는 아래에서 확인할 수 있습니다.",
                )
              }
            >
              <Repeat2 aria-hidden="true" />AI 기록 수집 켜기
            </Button>
          )}
        </Actions>
      </section>
      <section className="panel spaced">
        <h3>현재 수집 범위</h3>
        {collection?.error ? (
          <div className="note">{errorMessage(collection.error)}</div>
        ) : collection?.lastRun ? (
          <>
            <p className="micro spaced-text">
              마지막 반영 {when(collection.lastRun.observedAt)} ·{" "}
              {collection.lastRun.status}
            </p>
            {collection.lastRun.sources?.map((source) => (
              <div className="list-row" key={source.provider}>
                <strong>{source.provider}</strong>
                <Badge>{source.status}</Badge>
              </div>
            ))}
          </>
        ) : (
          <p className="muted small spaced-text">
            아직 저장한 수집 결과가 없습니다.
          </p>
        )}
        <div className="list-row">
          <span>Antigravity</span>
          <Badge>앱 내 기록 연동 미검증</Badge>
        </div>
        <p className="micro spaced-text">
          과거 기록과 진행 기록의 전체 수집을 보장하지 않습니다.
          실패·경고·상한을 원문과 함께 유지합니다.
        </p>
      </section></>}
    </>
  );
}
export function ProjectsPage() {
  const {
    snapshot: s,
    projectId,
    tab,
    navigate,
    ask,
    openDocument,
  } = useWorkspace();
  const project = s.workspace.projects.find((p) => p.id === projectId);
  const inventory = s.inventories.find((i) => i.projectId === projectId);
  const view = tab || "overview";
  return (
    <>
      <Heading
        title={project ? "프로젝트의 현재 맥락" : "내 작업 폴더 연결하기"}
        sub={project ? "목표·문서·규칙과 도구의 연결 상태를 함께 봅니다." : "AI와 작업하던 폴더를 골라 문서부터 살펴보세요."}
        action={
          <Button onClick={() => navigate("projects", "connect")}>
            <FolderPlus />
            연결 추가
          </Button>
        }
      />
      <Tabs label="프로젝트 보기"
        items={[
          ["overview", "현황"],
          ["rules", "공통·로컬 규칙"],
          ["structure", "합치기·분리하기"],
          ["connect", "폴더 연결"],
          ["records", "AI 기록 가져오기"],
        ]}
      >
      {view === "connected" && project ? (
        <FirstProjectResult />
      ) : view === "connect" || view === "records" || !project ? (
        <ConnectionPanel />
      ) : view === "overview" ? (
        <>
          <section className="panel feature">
            <Badge accent>연결한 프로젝트</Badge>
            <h2>{project.name}</h2>
            <p>{project.root}</p>
            <Actions>
              <Button quiet onClick={() => navigate("projects", "records")}>
                <History aria-hidden="true" />기록 수집 상태
              </Button>
              <PromptButton question="이 프로젝트의 요구사항과 문서를 근거로 현재 목표와 먼저 확인할 조건을 정리해줘." />
              <Button primary onClick={() => navigate("work")}>
                <ListChecks aria-hidden="true" />작업·완료 기준 확인
              </Button>
            </Actions>
          </section>
          <div className="section-heading">
            <h3>관련 문서와 결정</h3>
            <Button quiet onClick={() => navigate("docs")}>
              전체 문서
            </Button>
          </div>
          {inventory?.error ? (
            <div className="note">{errorMessage(inventory.error)}</div>
          ) : inventory?.report?.documents.length ? (
            inventory.report.documents.slice(0, 8).map((d) => (
              <div className="list-row" key={d.id}>
                <div>
                  <strong>{d.title || d.path}</strong>
                  <p>{d.path}</p>
                </div>
                <Button
                  onClick={() => openDocument(projectId, d.path, d.revision)}
                >
                  읽기
                </Button>
              </div>
            ))
          ) : (
            <Empty title="연결한 문서가 아직 없습니다">
              채팅 기록만 있는 프로젝트도 시작할 수 있습니다. 원문을 수집하고
              필요한 문서부터 정리해 보세요.
            </Empty>
          )}
          <div className="section-heading">
            <h3>이 프로젝트에서 남긴 결정</h3>
          </div>
          {s.workspace.notes
            .filter((n) => n.projectId === projectId && n.kind === "decision")
            .map((n) => (
              <section className="panel spaced" key={n.id}>
                <h3>{n.title}</h3>
                <MarkdownContent text={n.body} />
              </section>
            ))}
        </>
      ) : view === "rules" ? (
        <>
          <NoteExport kind="rule" />
          <section className="panel">
            <h2>공통 기준과 로컬 예외</h2>
            <p className="small muted spaced-text">
              규칙 후보를 AI와 비교하고 실제 변경 전후·적용 대상·이력을
              확인합니다. 같은 표현만으로 자동 통합하지 않습니다.
            </p>
            <Actions>
              <Button onClick={() => navigate("change")}>
                <GitCompareArrows aria-hidden="true" />변경안 검토·적용
              </Button>
              <Button
                primary
                onClick={() =>
                  ask(
                    "선택한 프로젝트 문서와 기록을 비교해 공통 규칙으로 묶을 부분, 로컬에 유지할 조건·예외, 충돌·영향 범위를 근거와 함께 제안해줘.",
                    "analysis",
                  )
                }
              >
                <MessageCircle aria-hidden="true" />AI와 규칙 비교
              </Button>
            </Actions>
          </section>
          {s.workspace.notes
            .filter((n) => n.kind === "rule")
            .map((n) => (
              <article className="panel spaced" key={n.id}>
                <Badge>
                  {s.workspace.projects.find((p) => p.id === n.projectId)?.name}
                </Badge>
                <h2 className="spaced-text">{n.title}</h2>
                <MarkdownContent text={n.body} />
              </article>
            ))}
          {!s.workspace.notes.some((n) => n.kind === "rule") && (
            <p className="muted small spaced-text">
              아직 확정해 기록한 규칙이 없습니다. 대화에서 타당한 제안을 규칙
              노트로 남길 수 있습니다.
            </p>
          )}
        </>
      ) : (
        <section className="panel">
          <Badge accent>구조 검토</Badge>
          <h2 className="spaced-text">어디를 합치고, 무엇을 나눌까?</h2>
          <p className="small muted">
            프로젝트별 요구사항·의존 관계·문서·정책을 선택해 비교합니다.
            저장소를 실제로 합치거나 나누는 작업과 구별합니다.
          </p>
          <div className="columns spaced">
            <section>
              <h3>합쳐서 운영할 때</h3>
              <p className="small muted spaced-text">
                공통 변경 지점·릴리스 결합·권한·책임의 경계를 확인합니다.
              </p>
            </section>
            <section>
              <h3>분리하고 연결할 때</h3>
              <p className="small muted spaced-text">
                공통 요소의 버전 차이·동기화·로컬 예외의 관리 비용을 확인합니다.
              </p>
            </section>
          </div>
          <Actions><PromptButton
            text="관련 프로젝트를 선택해 비교"
            question="선택한 여러 프로젝트의 문서와 근거를 바탕으로 합치기·일부 분리·공통 코어 유지의 장단점과 의존 관계를 비교해줘. 모르는 조건은 추측하지 말고 확인할 질문으로 남겨줘."
            mode="analysis"
          /></Actions>
        </section>
      )}
      </Tabs>
    </>
  );
}
export function DocumentsPage({
  selected,
}: {
  selected: { projectId: string; path: string; revision: string; fragment?: string } | null;
}) {
  const {
    snapshot: s,
    projectId,
    tab,
    openDocument,
    navigate,
    busy,
    perform,
  } = useWorkspace();
  const [query, setQuery] = useState(""),
    [para, setPara] = useState(false),
    [document, setDocument] = useState<DocumentItem | null>(null),
    [readError, setReadError] = useState("");
  const [searchResult, setSearchResult] = useState<{ status: string; matches: (DocumentItem & { snippet: string; line: number })[]; warnings: unknown[]; truncated: boolean } | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  useEffect(() => { setSearchResult(null); setQuery(""); setSearchedQuery(""); }, [projectId]);
  const view = tab || "documents";
  useEffect(() => {
    let active = true;
    setDocument(null);
    setReadError("");
    if (selected && selected.projectId === projectId && view === "reader") {
      void native<DocumentItem>("read_document", { projectId: selected.projectId, path: selected.path, revision: selected.revision })
        .then((value) => {
          if (active) setDocument(value);
        })
        .catch((e) => {
          if (active) setReadError(errorMessage(e));
        });
    }
    return () => {
      active = false;
    };
  }, [selected, projectId, view]);
  if (!projectId) return <NoProject />;
  const inventory = s.inventories.find((i) => i.projectId === projectId);
  const documents: (DocumentItem & { snippet?: string; line?: number })[] = searchResult?.matches ??
    inventory?.report?.documents.filter((d) =>
      (d.title + " " + d.path).toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <>
      <Heading
        title="기록과 문서"
        sub="원본의 위치와 현재 내용을 확인하고 필요한 맥락에 연결합니다."
        action={<Button onClick={() => navigate("change")}>정리 변경안</Button>}
      />
      <Tabs label="문서 보기"
        items={[
          ["documents", "프로젝트 문서"],
          ["records", "도구별 기록"],
          ["reader", "선택한 문서"],
        ]}
      >
      {view === "reader" ? (
        readError ? (
          <div role="alert" className="note">
            {readError}
            <Button onClick={() => navigate("docs")}>목록 새로 확인</Button>
          </div>
        ) : document ? (
          <article className="panel">
            <div className="inline">
              <FileText />
              <span className="micro">{document.path}</span>
              <Badge>{document.revision.slice(0, 10)}</Badge>
            </div>
            <MarkdownContent
              text={document.text || ""}
              documentPath={document.path}
              fragment={selected?.fragment}
            />
            <Actions>
              <PromptButton
                question={`이 문서(${document.path})의 판단 근거와 다른 프로젝트에 적용할 조건을 함께 살펴보자.`}
                documents={[{ projectId, path: document.path, revision: document.revision }]}
              />
              <Button onClick={() => navigate("change")}><GitCompareArrows aria-hidden="true" />내용 변경 검토</Button>
            </Actions>
          </article>
        ) : (
          <Empty
            title={
              selected ? "원문을 읽고 있습니다" : "읽을 문서를 선택해 주세요"
            }
          >
            문서 목록에서 원문과 리비전을 선택해 살펴봅니다.
          </Empty>
        )
      ) : view === "records" ? (
        <>
          {s.records
            .filter((r) => r.projectId === projectId)
            .slice(0, 200)
            .map((r) => (
              <article className="panel spaced" key={r.id}>
                <div className="inline">
                  <Badge>{r.source.provider}</Badge>
                  <Badge>{r.role === "user" ? "내 요청" : "AI 응답"}</Badge>
                  <span className="micro">
                    {when(r.occurredAt, s.workspace.settings.timezone)}
                  </span>
                </div>
                <blockquote>{r.text}</blockquote>
                <p className="micro">
                  세션 {r.source.sessionId} · 원문 {r.id.slice(0, 12)}
                </p>
                <Actions><PromptButton
                  question="이 기록의 의도와 다음에 더 확인할 조건을 함께 설명해줘."
                  ids={[r.id]}
                /></Actions>
              </article>
            ))}
          {!s.records.some((r) => r.projectId === projectId) && (
            <Empty
              title="아직 저장한 기록이 없습니다"
              action={
                <Button onClick={() => navigate("projects", "connect")}>
                  수집 상태 확인
                </Button>
              }
            >
              저장 위치와 도구별 연결을 확인한 뒤 기록을 가져올 수 있습니다.
            </Empty>
          )}
          <p className="micro spaced-text">
            화면에는 프로젝트 기록을 최대 200건 표시합니다. 보존한 원문은
            삭제하지 않습니다.
          </p>
        </>
      ) : (
        <>
          <div className="inline spaced-text">
            <input
              type="search"
              disabled={busy}
              aria-label="문서 찾기"
              placeholder="제목·경로로 찾기 또는 본문까지 검색"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchResult(null); }}
              style={{ flex: 1 }}
            />
            <Button disabled={busy || !query.trim()} onClick={() => void perform(async () => {
              const result = await native<NonNullable<typeof searchResult>>("search_documents", { projectId, query });
              setSearchResult(result);
              setSearchedQuery(query);
            })}>본문까지 검색</Button>
            <Button aria-pressed={para} onClick={() => setPara((v) => !v)}>
              PARA 맥락 보기
            </Button>
          </div>
          {searchResult && <p className="small" role="status">‘{searchedQuery}’ 검색 결과 {searchResult.matches.length}개{searchResult.truncated ? " · 처음 200개 표시" : ""}{searchResult.status !== "success" || searchResult.warnings.length ? " · 일부 문서를 읽지 못했습니다. 확인 가능한 문서의 결과입니다." : ""}</p>}
          {para && (
            <div className="note">
              원본 파일은 제자리에 둡니다. 문서는 프로젝트 근거로, 저장한
              학습·규칙·조사 노트는 지속 관리와 재사용 맥락으로 연결합니다.
              분류가 실제 통합·재작성·삭제를 대신하지 않습니다.
            </div>
          )}
          {inventory?.error ? (
            <div className="note">{errorMessage(inventory.error)}</div>
          ) : documents.length ? (
            <section className="panel">
              {documents.map((d) => (
                <div className="list-row" key={d.id}>
                  <div>
                    <span className="micro">
                      {para ? "프로젝트의 근거" : "Markdown 원문"}
                    </span>
                    <h3>{d.title || d.path}</h3>
                    <p>{d.path}</p>
                    {d.snippet && <p className="small">{d.line}행 · {d.snippet}</p>}
                  </div>
                  <Button
                    disabled={busy}
                    onClick={() => openDocument(projectId, d.path, d.revision)}
                  >
                    읽기
                  </Button>
                </div>
              ))}
            </section>
          ) : (
            <Empty title={searchResult ? "일치하는 문서가 없습니다" : "이 범위에는 읽을 문서가 없습니다"}>
              {searchResult ? "검색어를 바꾸거나 프로젝트와 검색 범위를 확인해 주세요." : "초기화 여부·제외 규칙·문서 위치를 확인해 주세요."}
            </Empty>
          )}
          {inventory?.report?.proposals.length ? (
            <section className="panel spaced" aria-label="문서 정리 후보">
              <h2>정리 후보</h2>
              <p className="small muted spaced-text">원문과 참조 관계를 살펴본 뒤 정리할 내용을 선택하세요.</p>
              {inventory.report.proposals.map((proposal, index) => (
                <div key={index} className="spaced-text">
                  <h3>{({
                    "review-documentation-gap": "문서로 남길 내용 살펴보기",
                    "add-document-title": "제목이 없는 문서",
                    "repair-local-links": "연결이 끊긴 문서 링크",
                    "review-identical-content": "내용이 같은 문서 비교",
                    "compare-same-title": "제목이 같은 문서 비교",
                  } as Record<string, string>)[proposal.kind] ?? "원문 검토가 필요한 항목"}</h3>
                  <p className="micro">참조 링크 {proposal.incomingLinks.length}개 · 검토 전</p>
                  {proposal.documents.map((source) => (
                    <div key={source.path} className="list-row">
                      <span>{source.path}</span>
                      <Button disabled={busy} onClick={() => openDocument(projectId, source.path, source.revision)}>후보 원문 읽기</Button>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ) : null}
          {inventory?.report?.warnings?.length ? (
            <div className="note">
              일부 문서를 읽지 못했습니다.
              <ul>
                {inventory.report.warnings.slice(0, 12).map((w, i) => (
                  <li key={i}>
                    {w.code} · {w.path}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      </Tabs>
    </>
  );
}
