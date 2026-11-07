import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeft, Files, MessageCircle, PanelLeftClose, PanelLeftOpen, Plus, Settings2 } from "lucide-react";
import { Actions, Badge, Button, DisclosureRow, Field, Heading, TabSet } from "../components";
import { NavigationButton } from "../navigation-button";
import { settingsSections } from "../settings-sections";
import IconInventory from "./IconInventory";
import IconAlternatives from "./IconAlternatives";
import { StateCatalog, TokenCatalog } from "./Catalog";

const systemTabs: [string, string][] = [
  ["foundations", "기본 기준"],
  ["controls", "공통 요소"],
  ["states", "상태"],
  ["tokens", "토큰"],
  ["patterns", "화면 패턴"],
  ["review", "UX 검토"],
  ["icons", "아이콘"],
  ["icon-alternatives", "아이콘 대안"],
];

const palette = [
  ["바탕", "--background"], ["패널", "--surface"], ["사이드바", "--sidebar"], ["구분선", "--border"], ["입력·버튼 경계", "--control-border"],
  ["본문", "--text"], ["보조 정보", "--muted"], ["주요 행동", "--accent"], ["선택 배경", "--accent-soft"],
  ["성공", "--success"], ["주의", "--warning"], ["오류", "--danger"],
];
const typeRoles = [
  ["화면 제목", "--font-page", "--line-heading", "--weight-semibold", "전체 프로젝트"],
  ["섹션 제목", "--font-section", "--line-heading", "--weight-semibold", "진행 중인 작업"],
  ["카드 안 소제목", "--font-title", "--line-body", "--weight-semibold", "프로젝트 문서"],
  ["문서 안 섹션 제목", "--font-subheading", "--line-heading", "--weight-semibold", "작업 기록 요약"],
  ["강조 지표", "--font-display", "--line-body", "--weight-semibold", "24"],
  ["본문·안내", "--font-body", "--line-body", "--weight-regular", "수정할 문서를 선택하세요."],
  ["버튼·입력값", "--font-body", "--line-control", "--weight-regular", "변경 내용 저장"],
  ["입력 레이블", "--font-body", "--line-body", "--weight-medium", "문서 이름"],
  ["보조 정보", "--font-caption", "--line-body", "--weight-regular", "SiloLink · 마지막 편집 14:20"],
];
const spacing = [1, 2, 3, 4, 5, 6, 8];

function Foundations() {
  const tokens = getComputedStyle(document.documentElement);

  return <div className="system-stack">
    <div className="system-columns">
      <section className="panel system-section" aria-label="글자 체계">
        <h2>글자 체계</h2>
        <p className="muted">기본 글꼴은 Pretendard입니다. 정보의 역할에 맞춰 크기, 굵기, 행간을 함께 선택합니다. 필수 안내와 입력 오류에는 본문 크기를 씁니다.</p>
        <div className="system-type-list">
          {typeRoles.map(([label, size, leading, weight, example]) => (
            <div className="system-type-row" key={label}>
              <span className="micro">
                {label} · {tokens.getPropertyValue(size).trim()} · 굵기 {tokens.getPropertyValue(weight).trim()} · 행간 {tokens.getPropertyValue(leading).trim()}
              </span>
              <div style={{ fontSize: `var(${size})`, lineHeight: `var(${leading})`, fontWeight: `var(${weight})` }}>
                {example}
              </div>
            </div>
          ))}
          <div className="system-type-row">
            <span className="micro">코드 블록 · 고정폭 글꼴</span>
            <code>git status --short</code>
          </div>
        </div>
      </section>
      <section className="panel system-section" aria-label="간격과 크기">
        <h2>간격과 크기</h2>
        <p className="muted">8px 단위로 가까운 요소를 묶고, 다른 항목 사이를 띄웁니다.</p>
        <div className="system-spacing-list">
          {spacing.map((step) => <div key={step}><span className="system-spacing-bar" style={{ width: `var(--space-${step})` }} /><code>{step * 8}px</code></div>)}
        </div>
        <dl className="system-dimensions">
          <div><dt>레이블 ↔ 입력</dt><dd>8px</dd></div>
          <div><dt>필드 사이 · 패널 안쪽</dt><dd>24px</dd></div>
          <div><dt>페이지 좌우</dt><dd>32 / 24 / 16px</dd></div>
          <div><dt>버튼 · 입력 / 탭</dt><dd>40 / 44px</dd></div>
          <div><dt>모서리: 배지 / 컨트롤 / 패널</dt><dd>4 / 8 / 12px</dd></div>
        </dl>
      </section>
    </div>
    <section className="panel system-section" aria-label="색과 상태">
      <h2>색과 상태</h2>
      <p className="muted">일반 구분선과 조작 요소의 경계를 구분합니다. 테마를 바꿔서 글자와 배경이 함께 어떻게 달라지는지 확인하세요.</p>
      <div className="system-palette">{palette.map(([label, token]) => <div className="system-swatch" key={token}>
        <div className="system-swatch-color" style={{ "--sample-color": `var(${token})` } as CSSProperties} />
        <strong>{label}</strong><code>{token}</code>
      </div>)}</div>
      <h3>화면에서 상태를 구분하는 방법</h3>
      <div className="system-columns">
        <div className="system-section">
          <div className="inline"><Badge tone="success">연결됨</Badge><Badge>연결 대기</Badge></div>
          <p>연결 여부는 배지 문구로 구분합니다. 선택된 메뉴는 강조 배경과 굵은 글자로, 선택된 탭은 밑줄로 나타납니다.</p>
          <div><Button disabled aria-describedby="system-disabled-reason">저장</Button></div>
          <p className="muted" id="system-disabled-reason">저장하려면 문서 이름을 입력하세요.</p>
        </div>
        <div className="system-section">
          <div className="note error system-state-note"><strong>저장 실패</strong><p>저장 위치의 쓰기 권한을 확인한 뒤 다시 시도하세요.</p></div>
          <Field label="포커스 예시"><input placeholder="Tab 키로 이 입력칸에 이동해 보세요" /></Field>
        </div>
      </div>
      <p className="micro">검토 기준은 일반 글자 4.5:1, 조작 요소를 식별하는 경계와 상태 표시 3:1입니다. <a href="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html">글자 대비</a> · <a href="https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html">조작 요소 대비</a></p>
    </section>
  </div>;
}

function Controls() {
  const [feedback, setFeedback] = useState("");
  return <div className="system-stack">
    <section className="panel system-section" aria-label="버튼과 상태 예시">
      <h2>버튼과 상태</h2>
      <p className="muted">한 작업 영역에서 주요 버튼 하나를 먼저 읽을 수 있게 합니다. 마우스나 Tab 키로 상태를 확인할 수 있습니다.</p>
      <div className="system-button-examples">
        <div><span className="micro">주요</span><Button primary onClick={() => setFeedback("주요 버튼을 눌렀습니다.")}>저장</Button></div>
        <div><span className="micro">보조</span><Button onClick={() => setFeedback("보조 버튼을 눌렀습니다.")}>취소</Button></div>
        <div><span className="micro">가벼운 탐색</span><Button quiet onClick={() => setFeedback("탐색 버튼을 눌렀습니다.")}>전체 보기</Button></div>
        <div><span className="micro">위험</span><Button danger onClick={() => setFeedback("위험 버튼을 눌렀습니다.")}>삭제</Button></div>
        <div><span className="micro">처리 중</span><Button primary loading>저장</Button></div>
        <div><span className="micro">사용할 수 없음</span><Button primary disabled>저장</Button></div>
      </div>
      <div className="inline"><Badge tone="success">연결됨</Badge><Badge tone="warning">원문 확인 필요</Badge><Badge>예시 데이터</Badge></div>
      <p className="muted">배지는 대상의 상태를 설명합니다. 목록을 여는 동작은 행의 펼침 표시로, 설정처럼 화면을 바꾸는 동작은 이름이 있는 버튼으로 표현합니다.</p>
      {feedback && <p className="micro" role="status">{feedback}</p>}
    </section>
    <FormSample />
  </div>;
}

function FormSample() {
  const [saved, setSaved] = useState(false);
  const [editor, setEditor] = useState<"initial" | "closed" | "reopened">("initial");
  const [alignment, setAlignment] = useState<"start" | "end">("end");
  return <section className="panel system-section" aria-label="입력과 실행 예시">
    <h2>입력과 실행</h2>
    <p className="muted">입력 이름은 위에 둡니다. 앱의 폼 실행 버튼은 하단 오른쪽에 모읍니다. 아래에서 비교용 왼쪽 정렬도 확인할 수 있습니다.</p>
    <label className="inline">
      하단 버튼 정렬
      <select value={alignment} onChange={(event) => setAlignment(event.target.value === "end" ? "end" : "start")}>
        <option value="start">왼쪽</option>
        <option value="end">오른쪽</option>
      </select>
    </label>
    {editor !== "closed" ? (
      <form className="form-stack" data-preview-alignment={alignment}
        onSubmit={(event) => { event.preventDefault(); setSaved(true); }}
        onChange={() => setSaved(false)}>
        <div className="columns">
          <Field label="문서 이름"><input required defaultValue="검토 메모" autoFocus={editor === "reopened"} /></Field>
          <Field label="문서 종류"><select defaultValue="note"><option value="note">노트</option><option value="rule">규칙</option></select></Field>
        </div>
        <Field label="본문"><textarea placeholder="검토한 내용을 입력하세요." /></Field>
        <Actions>
          <Button onClick={() => { setEditor("closed"); setSaved(false); }}>취소</Button>
          <Button primary type="submit">예시 저장</Button>
        </Actions>
        {saved && <p role="status" className="micro">예시에서 저장 상태를 표시했습니다. 실제 파일은 바뀌지 않습니다.</p>}
      </form>
    ) : (
      <div><Button autoFocus onClick={() => setEditor("reopened")}>문서 작성 다시 열기</Button></div>
    )}
  </section>;
}

function Patterns() {
  const [collapsed, setCollapsed] = useState(false);
  const [settings, setSettings] = useState(false);
  const [page, setPage] = useState("docs");
  const [section, setSection] = useState("tools");
  const [opened, setOpened] = useState(false);
  const [materialView, setMaterialView] = useState<"empty" | "editing" | "returned" | "saved">("empty");
  const [materialName, setMaterialName] = useState("");
  const sidebar = useRef<HTMLElement>(null);
  const movingFocus = useRef(false);

  function switchSettings(next: boolean) {
    movingFocus.current = true;
    setSettings(next);
  }

  useEffect(() => {
    if (!movingFocus.current) return;
    movingFocus.current = false;
    const selector = settings ? 'nav [aria-current="page"]' : ".sidebar-bottom button";
    sidebar.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [settings]);

  return <div className="system-stack">
    <section className="panel system-section" aria-label="사이드바 예시">
      <h2>사이드바</h2>
      <p className="muted">설정을 열면 현재 설정 메뉴로 포커스가 이동합니다. 작업 공간으로 돌아오면 이전 메뉴 선택을 복원하고 설정을 열었던 버튼에 포커스를 돌려줍니다.</p>
      <div className={`system-nav-sample${collapsed ? " sidebar-collapsed" : ""}`}>
        <aside className="sidebar" ref={sidebar}>
          <div className="sidebar-controls">
            {!collapsed && <span>{settings ? "설정" : "메뉴"}</span>}
            <Button quiet className="button quiet sidebar-toggle" aria-label={collapsed ? "예시 사이드바 펼치기" : "예시 사이드바 접기"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
          </div>
          {settings && <div className="settings-back"><NavigationButton label="작업 공간으로" icon={<ArrowLeft />} compact={collapsed} onClick={() => switchSettings(false)} /></div>}
          <nav aria-label={settings ? "예시 설정 메뉴" : "예시 작업 메뉴"}><div className="nav-group">
            {settings ? settingsSections.map(({ id, label, icon: Icon }) => <NavigationButton key={id} label={label} icon={<Icon />} compact={collapsed} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)} />) : <>
              <NavigationButton label="대화" icon={<MessageCircle />} compact={collapsed} aria-current={page === "chat" ? "page" : undefined} onClick={() => setPage("chat")} />
              <NavigationButton label="기록·문서" icon={<Files />} compact={collapsed} aria-current={page === "docs" ? "page" : undefined} onClick={() => setPage("docs")} />
            </>}
          </div></nav>
          {!settings && <div className="sidebar-bottom"><NavigationButton label="설정" icon={<Settings2 />} compact onClick={() => switchSettings(true)} /></div>}
        </aside>
        <div className="system-nav-body"><p className="micro">선택한 메뉴</p><h3>{settings ? settingsSections.find((item) => item.id === section)?.label : page === "docs" ? "기록·문서" : "대화"}</h3></div>
      </div>
    </section>
    <div className="system-columns">
      <section className="panel system-section" aria-label="목록과 상세 예시">
        <h2>목록과 상세</h2>
        <p className="muted">배지는 원문 확인 상태를 설명하고, 화살표는 상세가 펼쳐졌는지 보여줍니다. 행 전체를 눌러 상세를 열고 닫을 수 있습니다.</p>
        <DisclosureRow title="화면 검토 기준" meta="조사 노트 · 오늘" status={<Badge>원문 확인 필요</Badge>}
          expanded={opened} onToggle={() => setOpened((value) => !value)}>
          <p>먼저 상태를 읽고 필요한 상세를 엽니다.</p>
        </DisclosureRow>
      </section>
      <section className="panel system-section" aria-label="빈 상태 제안">
        <h2>빈 상태</h2>
        <p className="muted">첫 항목을 만드는 버튼은 빈 영역의 오른쪽 하단에 둡니다. 제목 옆에 이미 추가 버튼이 있다면 빈 영역에는 안내만 둡니다.</p>
        <div className="system-empty-sample">
          {materialView === "editing" ? (
            <form className="form-stack" onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("materialName") ?? "").trim();
              if (name) {
                setMaterialName(name);
                setMaterialView("saved");
              }
            }}>
              <h3>자료 추가</h3>
              <Field label="자료 이름"><input name="materialName" required pattern=".*\S.*" autoFocus /></Field>
              <Actions>
                <Button onClick={() => setMaterialView("returned")}>취소</Button>
                <Button primary type="submit">자료 저장</Button>
              </Actions>
            </form>
          ) : materialView === "saved" ? (
            <>
              <h3 role="status">예시 자료를 추가했습니다</h3>
              <div className="inline"><strong>{materialName}</strong><Badge>원문 확인 필요</Badge></div>
              <Actions><Button autoFocus onClick={() => setMaterialView("returned")}>빈 상태 다시 보기</Button></Actions>
            </>
          ) : (
            <>
              <h3>등록한 자료가 없습니다</h3>
              <p className="muted">비교할 자료의 링크와 확인할 내용을 추가하세요.</p>
              <Actions><Button primary autoFocus={materialView === "returned"} onClick={() => setMaterialView("editing")}><Plus aria-hidden="true" />자료 추가</Button></Actions>
            </>
          )}
        </div>
      </section>
    </div>
  </div>;
}

const reviewChecks = [
  {
    title: "첫 행동을 찾을 수 있나요?",
    principle: "시각적 위계 · 시그니파이어",
    check: "프로젝트가 비어 있을 때 어떤 버튼부터 누를지 확인하세요. 버튼 이름만 읽어도 무엇이 추가되는지 설명할 수 있나요?",
  },
  {
    title: "관련 항목이 한눈에 묶이나요?",
    principle: "근접성 · 유사성 · 점진적 공개",
    check: "문서 작성 폼에서 레이블과 입력, 입력 묶음과 저장 버튼이 구분되는지 보세요. 상세 옵션은 필요한 시점에 열 수 있나요?",
  },
  {
    title: "설정에서 작업으로 돌아갈 수 있나요?",
    principle: "일관성 · 사용자 통제 · 보고 알아보기",
    check: "설정을 열고 분류를 바꾼 뒤 ‘작업 공간으로’를 누르세요. 방금 보던 화면과 선택한 프로젝트로 돌아오나요? 사이드바를 접어도 메뉴 이름을 확인할 수 있나요?",
  },
  {
    title: "작업 결과와 다음 단계가 보이나요?",
    principle: "피드백 · 시스템 상태 · 오류 복구",
    check: "저장이나 변경 적용을 시도하세요. 처리 중, 완료, 실패를 각각 구분할 수 있나요? 실패하면 무엇을 고쳐 다시 시도할지 알 수 있나요?",
  },
  {
    title: "마우스 없이 조작할 수 있나요?",
    principle: "키보드 접근성 · 포커스",
    check: "Tab으로 버튼에 이동하고 방향키로 탭을 바꿔 보세요. 포커스가 선명하고 다른 요소에 가려지지 않나요?",
  },
  {
    title: "밝은 화면과 어두운 화면에서 모두 읽히나요?",
    principle: "명도 대비 · 색에 의존하지 않는 상태 표시",
    check: "테마를 바꾸고 보조 글자, 입력 테두리, 선택된 메뉴를 확인하세요. 선택과 오류를 글자나 표시로도 구분할 수 있나요?",
  },
];

function ReviewChecklist() {
  return (
    <div className="system-stack">
      <div className="system-columns">
        {reviewChecks.map(({ title, principle, check }) => (
          <section className="panel system-section" key={title}>
            <p className="micro">{principle}</p>
            <h2>{title}</h2>
            <p>{check}</p>
          </section>
        ))}
      </div>
      <section className="panel system-section" aria-labelledby="review-measurement">
        <h2 id="review-measurement">수치로 확인할 때</h2>
        <p>8px 간격, 40px 버튼, 44px 탭은 SiloLink 검토판의 설계 기준입니다. 포인터 대상 크기의 WCAG 2.2 AA 기준은 예외 조건이 있는 최소 24×24 CSS px입니다.</p>
        <p>WCAG 2.2 AA의 최소 텍스트 대비는 일반 텍스트 4.5:1, 큰 텍스트 3:1입니다. 컨트롤이나 상태를 식별하는 데 필요한 시각 정보에는 인접 색과 3:1 대비 기준이 적용됩니다.</p>
        <p>메뉴 개수와 응답 시간은 실제 과업에서 확인하세요. 프로젝트를 다시 찾거나 노트를 저장하는 과업을 정하고 성공 여부, 소요 시간, 막힌 지점을 기록합니다.</p>
        <div className="inline">
          <a href="https://www.nngroup.com/articles/ten-usability-heuristics/">NN/g 사용성 휴리스틱</a>
          <a href="https://www.w3.org/TR/WCAG22/">W3C WCAG 2.2 원문</a>
        </div>
      </section>
    </div>
  );
}

export default function DesignSystem() {
  const [theme, setTheme] = useState("light");
  const [tab, setTab] = useState<string>(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    return systemTabs.find(([id]) => id === requested)?.[0] ?? "foundations";
  });
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return <>
    <header className="system-toolbar">
      <span className="system-brand"><img src="/branding/silolink-app-icon.png" alt="" /> <strong>SiloLink</strong></span>
      <span className="micro system-review-hint">검토용 · 브라우저의 Annotate로 코멘트를 남겨 주세요.</span>
      <div className="inline"><a href="/design.html">앱 미리보기</a><label className="inline">테마 <select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="light">밝게</option><option value="dark">어둡게</option></select></label></div>
    </header>
    <main className="page system-page">
      <Heading title="디자인 시스템" sub="SiloLink 데스크톱의 기준을 검토합니다. 실제 앱과 같은 토큰과 공통 컴포넌트를 쓰며, 상태·토큰 탭은 밝게/어둡게를 나란히 보여 줍니다." />
      <TabSet items={systemTabs} label="디자인 시스템 분류" value={tab} onChange={setTab}>
        {tab === "foundations" && <Foundations />}
        {tab === "controls" && <Controls />}
        {tab === "states" && <StateCatalog />}
        {tab === "tokens" && <TokenCatalog />}
        {tab === "patterns" && <Patterns />}
        {tab === "review" && <ReviewChecklist />}
        {tab === "icons" && <IconInventory />}
        {tab === "icon-alternatives" && <IconAlternatives />}
      </TabSet>
    </main>
  </>;
}
