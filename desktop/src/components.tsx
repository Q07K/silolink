import {
  ChevronDown, ChevronRight, CircleAlert, CircleCheck, FolderPlus, Inbox, Info, LoaderCircle, MessageCircle, TriangleAlert, X,
} from "lucide-react";
import type { ReactNode, ComponentPropsWithRef, Ref } from "react";
import type { Basis } from "./types";
import { cloneElement, isValidElement, useEffect, useId, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { native } from "./api";
import { useWorkspace } from "./context";

export type Tone = "accent" | "success" | "warning" | "danger";

export function Button({
  children,
  primary,
  quiet,
  danger,
  loading,
  disabled,
  ...props
}: ComponentPropsWithRef<"button"> & {
  primary?: boolean;
  quiet?: boolean;
  /** Destructive action. Combine with `primary` for a filled danger button. */
  danger?: boolean;
  /** Shows a spinner, sets aria-busy and blocks repeated clicks. */
  loading?: boolean;
}) {
  const variant = primary ? "button primary" : quiet ? "button quiet" : "button";
  return (
    <button
      type="button"
      className={danger ? `${variant} danger` : variant}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Badge({
  children,
  accent,
  tone,
}: {
  children: ReactNode;
  accent?: boolean;
  tone?: Tone;
}) {
  const variant = tone ?? (accent ? "accent" : "");
  return <span className={variant ? `badge ${variant}` : "badge"}>{children}</span>;
}
const basisLabels: Record<Basis, [string, Tone | undefined]> = {
  observed: ["기록에서 확인", "success"],
  inferred: ["추정", undefined],
  ambiguous: ["모호", "warning"],
  unverified: ["미확인", undefined],
};
/** The evidence state every claim carries (PRD 5절): seen in records, inferred, ambiguous, or unverified. */
export function BasisBadge({ basis }: { basis: Basis }) {
  const [label, tone] = basisLabels[basis] ?? basisLabels.unverified;
  return <Badge tone={tone}>{label}</Badge>;
}
export function Heading({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <header className="heading">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {action}
    </header>
  );
}
export function Actions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}
export function Field({ label, children, hint, error }: {
  label: string;
  children: ReactNode;
  /** Helper text under the control. Linked with aria-describedby, not part of the label. */
  hint?: ReactNode;
  /** Validation message. Marks the control aria-invalid. */
  error?: ReactNode;
}) {
  const id = useId();
  if ((!hint && !error) || !isValidElement<Record<string, unknown>>(children))
    return <label className="form-field"><span>{label}</span>{children}</label>;
  const controlId = (children.props.id as string | undefined) ?? `${id}-control`;
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="form-field">
      <label htmlFor={controlId}>{label}</label>
      {cloneElement(children, {
        id: controlId,
        "aria-describedby": described,
        "aria-invalid": error ? true : undefined,
      })}
      {hint && <p className="form-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="form-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

export function DisclosureRow({ title, meta, status, expanded, onToggle, buttonRef, children }: {
  title: string;
  meta: string;
  status?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  const detailId = useId();

  return (
    <article className="note-list-item">
      <button className="note-row" type="button" ref={buttonRef}
        aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
        <span><strong>{title}</strong><small>{meta}</small></span>
        <span className="note-row-indicators">
          {status}
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </span>
      </button>
      <div className="note-detail" id={detailId} hidden={!expanded}>{expanded && children}</div>
    </article>
  );
}
type TabsProps = {
  items: [string, string][];
  children: ReactNode;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
};
export function Tabs({ value, onChange, ...props }: TabsProps) {
  const { tab, setTab } = useWorkspace();
  return <TabSet {...props} value={value ?? tab} onChange={onChange ?? setTab} />;
}
export function TabSet({ items, children, label = "화면 보기", value, onChange: change }: TabsProps & {
  value: string;
  onChange: (value: string) => void;
}) {
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = items.some(([id]) => id === value) ? value : items[0][0];
  return (
    <>
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map(([id, label], i) => (
        <button type="button" role="tab" key={id} id={`${prefix}-tab-${id}`}
          ref={(element) => { buttons.current[i] = element; }}
          aria-selected={selected === id} aria-controls={`${prefix}-panel`}
          tabIndex={selected === id ? 0 : -1}
          onClick={() => change(id)}
          onFocus={() => change(id)}
          onKeyDown={(event) => {
            const next = event.key === "ArrowRight" ? (i + 1) % items.length
              : event.key === "ArrowLeft" ? (i - 1 + items.length) % items.length
              : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            change(items[next][0]);
            buttons.current[next]?.focus();
            buttons.current[next]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
          }}
        >
          {label}
        </button>
      ))}
    </div>
    <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-tab-${selected}`} tabIndex={0}>{children}</div>
    </>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="empty">
      <div className="empty-symbol">
        <Inbox size={24} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action && <Actions>{action}</Actions>}
    </section>
  );
}
const toastIcons = { accent: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

/** Stack for toasts, fixed to the lower right of the window. */
export function ToastRegion({ children }: { children: ReactNode }) {
  return <div className="toast-region">{children}</div>;
}
export function Toast({ title, children, tone = "accent", action, onClose, duration }: {
  title: string;
  children?: ReactNode;
  tone?: Tone;
  action?: ReactNode;
  onClose?: () => void;
  /** Milliseconds before onClose runs. Leave out for messages the user must read. */
  duration?: number;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!duration) return;
    const timer = window.setTimeout(() => close.current?.(), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);
  const Icon = toastIcons[tone];
  return (
    <div className={`toast ${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="toast-icon" aria-hidden="true" />
      <div className="toast-body">
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {action}
      {onClose && <Button quiet aria-label="알림 닫기" onClick={onClose}><X aria-hidden="true" /></Button>}
    </div>
  );
}
/** Modal dialog on the native top layer: focus stays inside, Escape and the backdrop close it. */
export function Dialog({ open, title, description, onClose, children, actions }: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    return () => {
      if (typeof element.close === "function") element.close();
      opener?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={dialog} className="dialog" aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-panel">
        <header className="dialog-header">
          <h2 id={`${id}-title`}>{title}</h2>
          <Button quiet aria-label="대화상자 닫기" onClick={onClose}><X aria-hidden="true" /></Button>
        </header>
        {description && <p className="dialog-description" id={`${id}-description`}>{description}</p>}
        {children && <div className="dialog-content">{children}</div>}
        {actions && <Actions>{actions}</Actions>}
      </div>
    </dialog>
  );
}
export function NoProject() {
  const { navigate } = useWorkspace();
  return (
    <Empty
      title="먼저 프로젝트를 연결해 주세요"
      action={
        <Button primary onClick={() => navigate("projects", "connect")}>
          <FolderPlus />
          프로젝트 연결
        </Button>
      }
    >
      기존 프로젝트와 신규 프로젝트 모두 같은 초기화와 연결 흐름을 사용합니다.
    </Empty>
  );
}
export function PromptButton({
  text = "이 맥락으로 질문",
  question,
  mode = "chat",
  ids,
  documents,
}: {
  text?: string;
  question: string;
  mode?: string;
  ids?: string[];
  documents?: import("./types").DocumentReference[];
}) {
  const { ask } = useWorkspace();
  return (
    <Button quiet onClick={() => ask(question, mode, ids, { documents })}>
      <MessageCircle aria-hidden="true" />
      {text}
    </Button>
  );
}
export function MarkdownContent({
  text,
  documentPath = "",
  fragment,
}: {
  text: string;
  documentPath?: string;
  fragment?: string;
}) {
  const { perform, snapshot, projectId, openDocument } = useWorkspace();
  const root = useRef<HTMLDivElement>(null);
  const prefix = `markdown-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  function localReference(href: string) {
    try {
      const base = encodeURI(documentPath).replace(/#/g, "%23").replace(/\?/g, "%3F");
      const url = new URL(href, `https://project.local/${base}`);
      if (url.origin !== "https://project.local") return undefined;
      const path = decodeURIComponent(url.pathname.slice(1));
      return { path, fragment: url.hash };
    } catch {
      return undefined;
    }
  }
  function scrollToFragment(fragment: string) {
    let id: string;
    try { id = decodeURIComponent(fragment.replace(/^#/, "")); }
    catch { return; }
    const targetId = id.startsWith(prefix) ? id : prefix + id;
    const target = Array.from(root.current?.querySelectorAll<HTMLElement>("[id]") ?? [])
      .find((element) => element.id === targetId);
    if (target) {
      target.scrollIntoView({ block: "start" });
      if (!target.matches("a, button, input")) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }
  useEffect(() => {
    if (fragment) scrollToFragment(fragment);
  }, [text, documentPath, fragment, prefix]);
  return (
    <div className="markdown" ref={root}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSlug, { prefix }]]}
        remarkRehypeOptions={{
          clobberPrefix: prefix,
          footnoteLabel: "각주",
          footnoteBackLabel: "본문으로 돌아가기",
        }}
        components={{
          table: ({ children }) => (
            <div className="markdown-table-scroll" role="region" aria-label="문서 표" tabIndex={0}>
              <table>{children}</table>
            </div>
          ),
          h2: ({ id, children, ...props }) => {
            const { node: _node, ...headingProps } = props;
            return <h2 {...headingProps} id={id === "footnote-label" ? prefix + id : id}>{children}</h2>;
          },
          a: ({ href, children, id, "aria-label": label, "aria-describedby": describedBy }) => {
            if (href && /^https?:\/\//i.test(href))
              return (
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    void perform(() => native("open_reference", { url: href }))
                  }
                >
                  {children}
                </button>
              );
            const reference = href ? localReference(href) : undefined;
            if (reference?.fragment && (href?.startsWith("#") || reference.path === documentPath)) {
              return (
                <a href={reference.fragment} id={id} className="text-link"
                  aria-label={label} aria-describedby={describedBy === "footnote-label" ? prefix + describedBy : describedBy}
                  onClick={(event) => { event.preventDefault(); scrollToFragment(reference.fragment); }}>
                  {children}
                </a>
              );
            }
            const target = snapshot.inventories
              .find((i) => i.projectId === projectId)
              ?.report?.documents.find((d) => d.path === reference?.path);
            return target ? (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  if (reference?.fragment) openDocument(projectId, target.path, target.revision, reference.fragment);
                  else openDocument(projectId, target.path, target.revision);
                }}
              >
                {children}
              </button>
            ) : (
              <span>
                {children}
                {href && <small className="micro"> ({href})</small>}
              </span>
            );
          },
          img: ({ alt }) => (
            <span className="muted">[이미지: {alt || "본문 이미지"}]</span>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
