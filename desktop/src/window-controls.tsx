import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

/** Minimize, maximize and close for the frameless window; the app header doubles as its title bar. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri()) return;
    const current = getCurrentWindow();
    const sync = () => void current.isMaximized().then(setMaximized).catch(() => undefined);
    sync();
    const subscription = current.onResized(sync);
    return () => void subscription.then((unlisten) => unlisten()).catch(() => undefined);
  }, []);
  const run = (action: "minimize" | "toggleMaximize" | "close") => {
    if (isTauri()) void getCurrentWindow()[action]().catch(() => undefined);
  };
  const resize = maximized ? "이전 크기로" : "최대화";
  return (
    <div className="window-controls">
      <button type="button" aria-label="최소화" title="최소화" onClick={() => run("minimize")}><Minus aria-hidden="true" /></button>
      <button type="button" aria-label={resize} title={resize} onClick={() => run("toggleMaximize")}>
        {maximized ? <Copy aria-hidden="true" /> : <Square aria-hidden="true" />}
      </button>
      <button type="button" className="close" aria-label="닫기" title="닫기" onClick={() => run("close")}><X aria-hidden="true" /></button>
    </div>
  );
}
