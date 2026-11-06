import { useEffect, useId, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { Actions, Button } from "./components";
import type { Notice, Page } from "./types";

export function Notifications({ notices, page, busy, onRead, navigate }: {
  notices: Notice[];
  page: Page;
  busy: boolean;
  onRead: () => void;
  navigate: (page: Page, tab?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const id = useId();
  const unread = notices.filter((notice) => !notice.read).length;
  useEffect(() => { setOpen(false); }, [page]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      bell.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="notification-anchor" ref={anchor}>
    <button type="button" className="button quiet" ref={bell} aria-label="알림" title="알림"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}>
      <Bell />{unread > 0 && <span className="notification-count">{unread}</span>}
    </button>
    {open && <section id={id} className="notifications" role="dialog" aria-label="알림" ref={panel} tabIndex={-1}>
      <div className="notification-heading"><h2>알림</h2><Button quiet aria-label="알림 닫기" onClick={() => { setOpen(false); bell.current?.focus(); }}><X /></Button></div>
      {notices.length ? notices.slice().reverse().slice(0, 20).map((notice) => (
        <button type="button" className="notification-item" key={notice.id} onClick={() => {
          setOpen(false);
          navigate(notice.kind === "pattern" || notice.kind === "discovery" ? "analysis" : "reports", notice.kind === "pattern" ? "repeated" : notice.kind === "discovery" ? "discoveries" : notice.kind);
        }}><span>{notice.title}</span><small>{notice.read ? "읽음" : "새 알림"}</small></button>
      )) : <p className="small muted">새 알림이 없습니다.</p>}
      {unread > 0 && <Actions><Button quiet disabled={busy} onClick={onRead}>모두 읽음</Button></Actions>}
    </section>}
  </div>;
}
