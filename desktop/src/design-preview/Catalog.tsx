import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Bell, ChevronRight, Files, FlaskConical, Inbox, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, Empty, Field, TabSet, Toast, ToastRegion } from "../components";
import type { Tone } from "../components";

/** Renders the same sample under a light and a dark color-scheme, side by side. */
export function ThemePair({ children }: { children: () => ReactNode }) {
  return <div className="system-theme-pair">
    {(["light", "dark"] as const).map((scheme) => (
      <div className="system-theme" data-scheme={scheme} key={scheme}>
        <span className="system-theme-label">{scheme === "light" ? "밝게" : "어둡게"}</span>
        {children()}
      </div>
    ))}
  </div>;
}

const states = [
  ["기본", {}],
  ["호버", { "data-state": "hover" }],
  ["포커스", { "data-state": "focus" }],
  ["누름", { "data-state": "active" }],
  ["비활성", { disabled: true }],
  ["처리 중", { loading: true }],
] as const;
const buttonVariants = [
  ["보조", {}],
  ["주요", { primary: true }],
  ["조용한", { quiet: true }],
  ["위험", { danger: true }],
  ["위험 · 주요", { primary: true, danger: true }],
] as const;
const inputStates = [
  ["기본", {}],
  ["호버", { "data-state": "hover" }],
  ["포커스", { "data-state": "focus" }],
  ["오류", { "aria-invalid": true }],
  ["비활성", { disabled: true }],
] as const;
const tones: [string, Tone | undefined][] = [["중립", undefined], ["강조", "accent"], ["성공", "success"], ["주의", "warning"], ["오류", "danger"]];

function ButtonMatrix() {
  return <div className="system-scroll">
    <table className="system-matrix">
      <thead><tr><th scope="col">종류</th>{states.map(([label]) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{buttonVariants.map(([variant, props]) => (
        <tr key={variant}>
          <th scope="row">{variant}</th>
          {states.map(([state, extra]) => <td key={state}>
            <Button {...props} {...extra} tabIndex={-1}>{"danger" in props ? "삭제" : "저장"}</Button>
          </td>)}
        </tr>
      ))}</tbody>
    </table>
  </div>;
}

function InputMatrix() {
  return <div className="system-scroll">
    <table className="system-matrix">
      <thead><tr><th scope="col">요소</th>{inputStates.map(([label]) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>
        <tr><th scope="row">입력</th>{inputStates.map(([state, extra]) => <td key={state}><input aria-label={`입력 ${state}`} defaultValue={state === "기본" ? "" : "검토 메모"} placeholder="문서 이름" tabIndex={-1} {...extra} /></td>)}</tr>
        <tr><th scope="row">선택</th>{inputStates.map(([state, extra]) => <td key={state}><select aria-label={`선택 ${state}`} tabIndex={-1} {...extra}><option>노트</option></select></td>)}</tr>
      </tbody>
    </table>
  </div>;
}

function NavigationStates() {
  const items = [
    ["기본", Files, {}],
    ["호버", MessageCircle, { "data-state": "hover" }],
    ["포커스", FlaskConical, { "data-state": "focus" }],
    ["선택", Inbox, { "aria-current": "page" }],
  ] as const;
  return <div className="sidebar system-sidebar-states">
    <nav aria-label="사이드바 항목 상태"><div className="nav-group">
      <p className="nav-group-label">지식 탐색</p>
      {items.map(([label, Icon, extra]) => <button type="button" key={label} tabIndex={-1} {...extra}><Icon aria-hidden="true" /><span>{label}</span></button>)}
    </div></nav>
  </div>;
}

function RowStates() {
  return <div>
    {(["기본", "호버", "포커스", "펼침"] as const).map((state) => (
      <div className="note-list-item" key={state}>
        <button type="button" className="note-row" tabIndex={-1}
          data-state={state === "호버" ? "hover" : state === "포커스" ? "focus" : undefined}
          aria-expanded={state === "펼침"}>
          <span><strong>화면 검토 기준</strong><small>조사 노트 · {state}</small></span>
          <span className="note-row-indicators"><Badge tone="warning">원문 확인 필요</Badge><ChevronRight aria-hidden="true" /></span>
        </button>
      </div>
    ))}
  </div>;
}

function Feedback() {
  return <>
    <div className="inline">{tones.map(([label, tone]) => <Badge key={label} tone={tone}>{label}</Badge>)}</div>
    <div className="system-note-stack">
      <p className="note">안내 · 선택한 문서 20개를 질문에 함께 보냅니다.</p>
      <p className="note success">성공 · 변경을 적용했습니다.</p>
      <p className="note warning">주의 · 원문을 아직 확인하지 않았습니다.</p>
      <p className="note error">오류 · 저장 위치의 쓰기 권한을 확인하세요.</p>
    </div>
  </>;
}

function Overlays() {
  return <div className="system-overlay-samples">
    <div className="system-note-stack">
      <Toast tone="success" title="변경을 적용했습니다" onClose={() => undefined}>되돌리기는 변경 이력에서 할 수 있습니다.</Toast>
      <Toast tone="danger" title="저장하지 못했습니다" onClose={() => undefined}>쓰기 권한을 확인하세요.</Toast>
    </div>
    <div className="dialog system-static-dialog" aria-hidden="true">
      <div className="dialog-panel">
        <header className="dialog-header"><h2>작성 내용을 버릴까요?</h2></header>
        <p className="dialog-description">저장하지 않은 변경 내용이 사라집니다.</p>
        <div className="form-actions"><Button tabIndex={-1}>계속 작성</Button><Button primary danger tabIndex={-1}>버리기</Button></div>
      </div>
    </div>
    <div className="inline">
      <section className="notifications system-static-popover" aria-label="알림 팝오버 예시">
        <div className="notification-heading"><h2>알림</h2></div>
        <button type="button" className="notification-item" tabIndex={-1}><span>새 반복 발견 3건</span><small>새 알림</small></button>
        <button type="button" className="notification-item" tabIndex={-1} data-state="hover"><span>주간 회고 준비</span><small>읽음</small></button>
      </section>
      <span className="navigation-tooltip system-static-tooltip">기록·문서</span>
    </div>
  </div>;
}

function LiveOverlays() {
  const [toasts, setToasts] = useState<{ id: number; tone: Tone }[]>([]);
  const [dialog, setDialog] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const add = (tone: Tone) => setToasts((list) => [...list, { id: Date.now(), tone }]);
  const remove = (id: number) => setToasts((list) => list.filter((toast) => toast.id !== id));
  return <section className="panel system-section" aria-label="오버레이 동작 예시">
    <h2>직접 띄워 보기</h2>
    <p className="muted">토스트는 성공·안내가 4초 뒤 사라지고, 오류는 사용자가 닫을 때까지 남습니다. 대화상자는 Tab이 안에서만 돌고 Escape·바깥 클릭·닫기로 닫힙니다.</p>
    <div className="inline">
      <Button onClick={() => add("success")}>성공 토스트</Button>
      <Button onClick={() => add("danger")}>오류 토스트</Button>
      <Button primary danger onClick={() => { setDiscarded(false); setDialog(true); }}><Trash2 aria-hidden="true" />작성 내용 버리기</Button>
    </div>
    {discarded && <p className="micro" role="status">예시 작성 내용을 버렸습니다. 실제 파일은 바뀌지 않습니다.</p>}
    <ToastRegion>{toasts.map(({ id, tone }) => (
      <Toast key={id} tone={tone} title={tone === "danger" ? "저장하지 못했습니다" : "저장했습니다"}
        duration={tone === "danger" ? undefined : 4000} onClose={() => remove(id)}>
        {tone === "danger" ? "쓰기 권한을 확인하세요." : "예시 데이터라 실제 파일은 바뀌지 않습니다."}
      </Toast>
    ))}</ToastRegion>
    <Dialog open={dialog} title="작성 내용을 버릴까요?" description="저장하지 않은 변경 내용이 사라집니다." onClose={() => setDialog(false)}
      actions={<><Button onClick={() => setDialog(false)}>계속 작성</Button><Button primary danger onClick={() => { setDialog(false); setDiscarded(true); }}>버리기</Button></>} />
  </section>;
}

export function StateCatalog() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("one");
  return <div className="system-stack">
    <section className="panel system-section" aria-label="버튼 상태">
      <h2>버튼</h2>
      <p className="muted">한 작업 영역의 주요 버튼은 하나입니다. 위험 동작은 빨간 테두리로, 되돌릴 수 없는 확인에만 빨간 채움을 씁니다. 처리 중에는 같은 색을 유지하고 다시 누를 수 없습니다.</p>
      <ThemePair>{() => <ButtonMatrix />}</ThemePair>
      <div className="inline"><Button primary loading={loading} onClick={() => { setLoading(true); window.setTimeout(() => setLoading(false), 1500); }}>처리 중 예시 실행</Button></div>
    </section>
    <section className="panel system-section" aria-label="입력 상태">
      <h2>입력</h2>
      <p className="muted">입력은 옅은 면과 3:1 경계로 구분합니다. 포커스하면 표면색으로 돌아오고 강조 테두리와 빛번짐이 나타납니다. 오류는 색과 문구를 함께 씁니다.</p>
      <ThemePair>{() => <>
        <InputMatrix />
        <div className="columns">
          <Field label="문서 경로" hint="프로젝트 폴더 안의 상대 경로를 입력하세요."><input defaultValue="docs/notes.md" /></Field>
          <Field label="새 문서 경로" error="프로젝트 밖의 경로는 쓸 수 없습니다."><input defaultValue="../outside.md" /></Field>
        </div>
      </>}</ThemePair>
    </section>
    <section className="panel system-section" aria-label="사이드바와 목록 상태">
      <h2>사이드바 항목과 목록 행</h2>
      <p className="muted">호버는 옅은 면과 진한 글자, 선택은 강조 면·강조 글자·굵기로 표시합니다. 목록 행은 행 전체가 버튼이며 펼친 행은 면을 유지합니다.</p>
      <ThemePair>{() => <div className="system-columns"><NavigationStates /><RowStates /></div>}</ThemePair>
    </section>
    <section className="panel system-section" aria-label="배지와 안내">
      <h2>배지와 안내</h2>
      <p className="muted">상태 색은 옅은 배경과 같은 계열의 진한 글자로 씁니다. 색만으로 의미를 전하지 않도록 상태 문구를 함께 둡니다.</p>
      <ThemePair>{() => <Feedback />}</ThemePair>
    </section>
    <section className="panel system-section" aria-label="탭과 빈 상태">
      <h2>탭과 빈 상태</h2>
      <ThemePair>{() => <>
        <TabSet items={[["one", "자료"], ["two", "조사 노트"]]} label="탭 예시" value={tab} onChange={setTab}><p className="muted">{tab === "one" ? "자료 목록" : "조사 노트 목록"}</p></TabSet>
        <Empty title="등록한 자료가 없습니다" action={<Button primary><Plus aria-hidden="true" />자료 추가</Button>}>비교할 자료의 링크와 확인할 내용을 추가하세요.</Empty>
      </>}</ThemePair>
    </section>
    <section className="panel system-section" aria-label="떠 있는 요소">
      <h2>토스트 · 대화상자 · 팝오버 · 툴팁</h2>
      <p className="muted">떠 있는 요소는 같은 오버레이 그림자를 씁니다. 쌓임 순서는 헤더 → 팝오버 → 토스트 → 툴팁이며 대화상자는 브라우저 최상위 층에 뜹니다. <Bell aria-hidden="true" className="system-inline-icon" /> 알림은 팝오버입니다.</p>
      <ThemePair>{() => <Overlays />}</ThemePair>
    </section>
    <LiveOverlays />
  </div>;
}

type TokenGroup = { title: string; kind: "color" | "shadow" | "space" | "radius" | "type" | "motion" | "value"; tokens: string[] };
export const tokenGroups: TokenGroup[] = [
  { title: "표면과 글자", kind: "color", tokens: ["--background", "--surface", "--soft", "--pressed", "--field", "--field-hover", "--field-border", "--text", "--muted", "--border", "--control-border"] },
  { title: "강조", kind: "color", tokens: ["--brand-700", "--brand-600", "--brand-400", "--brand-200", "--brand-50", "--accent", "--accent-hover", "--accent-pressed", "--accent-soft", "--on-accent", "--focus-glow"] },
  { title: "상태", kind: "color", tokens: ["--success", "--success-soft", "--warning", "--warning-soft", "--danger", "--danger-hover", "--danger-soft", "--on-danger"] },
  { title: "앱 셸과 강조 영역", kind: "color", tokens: ["--sidebar", "--sidebar-text", "--sidebar-muted", "--sidebar-hover", "--sidebar-selected", "--hero", "--hero-text", "--hero-muted", "--hero-badge", "--hero-badge-text", "--hero-control", "--hero-control-hover", "--hero-line", "--hero-action", "--on-hero-action", "--overlay-backdrop"] },
  { title: "그림자와 포커스", kind: "shadow", tokens: ["--shadow", "--shadow-panel", "--shadow-raised", "--shadow-overlay", "--focus-ring", "--focus-ring-gap"] },
  { title: "글자", kind: "type", tokens: ["--font-sans", "--font-mono", "--font-caption", "--font-body", "--font-title", "--font-section", "--font-subheading", "--font-page", "--font-display", "--line-body", "--line-heading", "--line-control", "--weight-regular", "--weight-medium", "--weight-semibold", "--weight-bold", "--tracking-page", "--tracking-display", "--tracking-brand", "--tracking-section", "--tracking-label"] },
  { title: "간격", kind: "space", tokens: ["--space-half", "--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--space-8", "--page-gutter", "--section-gap", "--panel-padding"] },
  { title: "모서리", kind: "radius", tokens: ["--radius-small", "--radius-control", "--radius-panel", "--radius-pill"] },
  { title: "크기", kind: "value", tokens: ["--control-height", "--tab-height", "--badge-height", "--row-min-height", "--textarea-min-height", "--icon-small", "--icon-default", "--icon-large", "--sidebar-expanded", "--sidebar-narrow", "--sidebar-compact", "--header-height", "--content-max", "--measure", "--popover-width", "--popover-max-height", "--dialog-width", "--toast-width"] },
  { title: "모션", kind: "motion", tokens: ["--duration-fast", "--duration-base", "--duration-slow", "--ease-standard", "--ease-exit", "--transition-control"] },
  { title: "쌓임 순서", kind: "value", tokens: ["--z-header", "--z-popover", "--z-toast", "--z-tooltip"] },
];

function tokenValue(token: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim().replace(/\s+/g, " ");
}
/** Splits every light-dark(a, b) in a computed value into its light and dark text. */
function schemes(value: string) {
  const pair = /light-dark\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g;
  return [value.replace(pair, "$1"), value.replace(pair, "$2")];
}

function TokenSample({ kind, token }: { kind: TokenGroup["kind"]; token: string }) {
  const style = { "--sample": `var(${token})` } as CSSProperties;
  if (kind === "color") return <span className="system-chip" style={style} />;
  if (kind === "shadow") return <span className="system-shadow-sample" style={style} />;
  if (kind === "space") return <span className="system-spacing-bar" style={{ width: `var(${token})` }} />;
  if (kind === "radius") return <span className="system-radius-sample" style={style} />;
  if (kind === "motion") return token.startsWith("--transition") ? null : <span className="system-motion-sample" style={style} />;
  if (kind === "type" && token.startsWith("--font-") && !token.includes("sans") && !token.includes("mono")) return <span style={{ fontSize: `var(${token})`, lineHeight: 1.2 }}>가 Aa</span>;
  return null;
}

export function TokenCatalog() {
  return <div className="system-stack">
    <p className="muted">원본은 <code>desktop/src/styles/tokens.css</code>입니다. 색은 같은 토큰을 밝게/어둡게 영역에 나란히 칠해 보여 줍니다. 모션 견본은 마우스를 올리면 해당 시간과 곡선으로 움직입니다.</p>
    {tokenGroups.map(({ title, kind, tokens }) => (
      <section className="panel system-section" aria-label={`${title} 토큰`} key={title}>
        <h2>{title}</h2>
        <div className="system-scroll">
          <table className="system-token-table">
            <thead><tr><th scope="col">토큰</th>{kind === "color" || kind === "shadow"
              ? <><th scope="col">밝게</th><th scope="col">어둡게</th></>
              : <><th scope="col">값</th><th scope="col">견본</th></>}</tr></thead>
            <tbody>{tokens.map((token) => {
              const value = tokenValue(token);
              const [light, dark] = schemes(value);
              return <tr key={token} data-token={token}>
                <th scope="row"><code>{token}</code></th>
                {kind === "color" || kind === "shadow" ? <>
                  <td className="system-scheme" data-scheme="light"><TokenSample kind={kind} token={token} /><code>{light}</code></td>
                  <td className="system-scheme" data-scheme="dark"><TokenSample kind={kind} token={token} /><code>{dark}</code></td>
                </> : <>
                  <td><code>{value}</code></td>
                  <td><TokenSample kind={kind} token={token} /></td>
                </>}
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>
    ))}
  </div>;
}
