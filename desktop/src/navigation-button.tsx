import { useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";

const tooltipOpened = "silolink:navigation-tooltip-opened";

export function NavigationButton({ label, icon, compact, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  compact: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function show() {
    if (!compact || !button.current) return;
    const rect = button.current.getBoundingClientRect();
    window.dispatchEvent(new Event(tooltipOpened));
    setPosition({ left: rect.right + 12, top: Math.max(24, Math.min(window.innerHeight - 24, rect.top + rect.height / 2)) });
  }
  useEffect(() => {
    setPosition(null);
  }, [compact]);
  useEffect(() => {
    if (!position) return;
    const hide = () => setPosition(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener(tooltipOpened, hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener(tooltipOpened, hide);
    };
  }, [position]);
  return <>
    <button {...props} type="button" ref={button} aria-label={label}
      aria-describedby={position ? tooltipId : undefined}
      onMouseEnter={show} onFocus={show}
      onMouseLeave={() => setPosition(null)}
      onBlur={() => setPosition(null)}
      onClick={(event) => { setPosition(null); props.onClick?.(event); }}
      onKeyDown={(event) => { if (event.key === "Escape") setPosition(null); }}>
      {icon}
      {!compact && <span className="nav-label">{label}</span>}
      {children}
    </button>
    {position && createPortal(<span id={tooltipId} role="tooltip" className="navigation-tooltip" style={position}>{label}</span>, document.body)}
  </>;
}
