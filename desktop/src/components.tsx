import { ArrowRight, FolderPlus, MessageCircle, Sparkles } from "lucide-react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { useEffect, useId, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { native } from "./api";
import { useWorkspace } from "./context";

export function Button({
  children,
  primary,
  quiet,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? "button primary" : quiet ? "button quiet" : "button"}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  accent,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return <span className={accent ? "badge accent" : "badge"}>{children}</span>;
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
export function Tabs({ items }: { items: [string, string][] }) {
  const { tab, setTab } = useWorkspace();
  return (
    <nav className="tabs" aria-label="화면 보기">
      {items.map(([id, label], i) => (
        <Button
          key={id}
          aria-pressed={tab === id || (!tab && i === 0)}
          onClick={() => setTab(id)}
        >
          {label}
        </Button>
      ))}
    </nav>
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
        <Sparkles size={24} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
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
}: {
  text?: string;
  question: string;
  mode?: string;
  ids?: string[];
}) {
  const { ask } = useWorkspace();
  return (
    <Button quiet onClick={() => ask(question, mode, ids)}>
      <MessageCircle />
      {text}
      <ArrowRight />
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
