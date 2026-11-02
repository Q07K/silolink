import { ArrowRight, FolderPlus, MessageCircle, Sparkles } from "lucide-react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import Markdown from "react-markdown";
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
}: {
  text: string;
  documentPath?: string;
}) {
  const { perform, snapshot, projectId, openDocument } = useWorkspace();
  function localDocument(href: string) {
    try {
      const url = new URL(href, `https://project.local/${documentPath}`);
      if (url.origin !== "https://project.local") return undefined;
      const path = decodeURIComponent(url.pathname.slice(1));
      return snapshot.inventories
        .find((i) => i.projectId === projectId)
        ?.report?.documents.find((d) => d.path === path);
    } catch {
      return undefined;
    }
  }
  return (
    <div className="markdown">
      <Markdown
        components={{
          a: ({ href, children }) => {
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
            const target = href ? localDocument(href) : undefined;
            return target ? (
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  openDocument(projectId, target.path, target.revision)
                }
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
