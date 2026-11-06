import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "../styles/tokens.css";
import "../styles/app.css";
import DesignSystem from "./DesignSystem";
import "./system.css";

createRoot(document.getElementById("root")!).render(<DesignSystem />);
