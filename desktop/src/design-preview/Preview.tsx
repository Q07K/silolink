import { useEffect, useState } from "react";
import { X } from "lucide-react";
import App from "../App";
import { Button } from "../components";
import { configurePreview, previewActions } from "./api";
import type { PreviewScenario, PreviewTheme } from "./data";
import "./preview.css";

export default function DesignPreview() {
  const [scenario, setScenario] = useState<PreviewScenario>("populated");
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [showPreviewNotice, setShowPreviewNotice] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const showNotice = () => setShowPreviewNotice(true);
    previewActions.addEventListener("unavailable", showNotice);
    return () => previewActions.removeEventListener("unavailable", showNotice);
  }, []);

  return (
    <div className="design-preview">
      <div className="design-toolbar" role="region" aria-label="디자인 미리보기">
        <div className="design-preview-label"><strong>디자인 미리보기</strong><span>예시 데이터 · 화면 탐색용</span></div>
        <div className="design-toolbar-feedback">
          {!showPreviewNotice && <span className="design-annotation-hint">브라우저의 Annotate로 코멘트를 남겨 주세요.</span>}
          <span role="status">{showPreviewNotice && "저장·수집·AI 실행은 데스크톱 앱에서 사용할 수 있습니다."}</span>
          {showPreviewNotice && <Button quiet aria-label="미리보기 안내 닫기" onClick={() => setShowPreviewNotice(false)}><X aria-hidden="true" /></Button>}
        </div>
        <a className="design-system-link" href="/design-system.html">디자인 시스템</a>
        <label>화면 상태
          <select aria-label="미리보기 화면 상태" value={scenario} onChange={(event) => {
            const next = event.target.value === "empty" ? "empty" : "populated";
            configurePreview({ scenario: next });
            setShowPreviewNotice(false);
            setScenario(next);
          }}>
            <option value="populated">데이터 있는 화면</option><option value="empty">첫 사용 화면</option>
          </select>
        </label>
        <label>테마
          <select aria-label="미리보기 테마" value={theme} onChange={(event) => {
            const next = event.target.value === "dark" ? "dark" : "light";
            configurePreview({ theme: next });
            setTheme(next);
          }}>
            <option value="light">밝게</option><option value="dark">어둡게</option>
          </select>
        </label>
      </div>
      <App key={scenario} />
    </div>
  );
}
