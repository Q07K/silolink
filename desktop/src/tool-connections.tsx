import { useEffect, useState } from "react";
import { native, errorMessage } from "./api";
import { useWorkspace } from "./context";
import { Badge, Button } from "./components";
import type { ToolConnections as Connections, ToolHost, ToolInstallation } from "./types";

const labels: Record<ToolHost, string> = {
  codex: "Codex",
  claude: "Claude Code",
  antigravity: "Antigravity",
};

export function ToolConnections() {
  const { busy, perform } = useWorkspace();
  const [connections, setConnections] = useState<Connections | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    native<Connections>("tool_connections").then(
      (value) => { if (active) setConnections(value); },
      (reason) => { if (active) setError(errorMessage(reason)); },
    );
    return () => { active = false; };
  }, []);

  async function refresh() {
    setError("");
    try { setConnections(await native<Connections>("tool_connections")); }
    catch (reason) { setError(errorMessage(reason)); throw reason; }
  }

  async function connect(host: ToolHost) {
    await perform(async () => {
      const result = await native<ToolInstallation>("connect_tool", { host });
      await refresh();
      if (result.status !== "success") {
        throw result.installations.find((item) => item.error)?.error
          ?? new Error("스킬 등록을 마치지 못했습니다. 연결 상태를 다시 확인해 주세요.");
      }
    }, `${labels[host]} 스킬을 등록했습니다. 도구를 다시 열고 SiloLink를 선택해 주세요.`);
  }

  return (
    <section className="panel spaced" aria-label="AI 도구 연결">
      <h2>AI 도구 연결</h2>
      <p className="small muted spaced-text">
        사용 중인 도구에 SiloLink 스킬을 등록하세요. 연결한 도구의 새 프로젝트 채팅에서
        프로젝트 연결·문서 확인·기록 가져오기 등 기능별 SiloLink 스킬을 선택할 수 있습니다.
      </p>
      <p className="small muted spaced-text">
        이 PC의 사용자 스킬 폴더에 등록하며 모든 프로젝트에서 사용할 수 있습니다.
        해당 AI 도구는 먼저 설치하고 로그인해 주세요.
      </p>
      {error && <p role="alert">{error}</p>}
      {!connections && !error && <p role="status">스킬 등록 상태를 확인하고 있습니다.</p>}
      {connections?.tools.map((tool) => (
        <section className="panel spaced" key={tool.host} aria-label={labels[tool.host]}>
          <div className="section-heading" style={{ marginTop: 0 }}>
            <h3>{labels[tool.host]}</h3>
            <Badge accent={tool.status === "installed"}>
              {tool.status === "installed" ? "연결됨" : tool.status === "conflict" ? "기존 스킬 확인 필요" : tool.status === "update_available" ? "기능별 스킬 추가 가능" : "아직 연결하지 않음"}
            </Badge>
          </div>
          <p className="micro spaced-text">등록 위치 · {tool.path}</p>
          {tool.status === "installed" ? (
            <p className="small spaced-text">
              도구를 다시 열고 스킬 목록에서 기능별 항목을 선택하세요. 프로젝트 연결은 <code>{tool.invocation}</code>으로 시작합니다.
              {tool.skills?.length ? ` 등록한 스킬 ${tool.skills.length}개.` : ""}
            </p>
          ) : (
            <>
              {tool.status === "conflict" && (
                <p className="small spaced-text">
                  기존 스킬이 수정되었거나 다른 설치를 가리킵니다. 해당 폴더의 내용을 확인·백업한 뒤 다시 연결해 주세요. 기존 파일은 보존했습니다.
                </p>
              )}
              {tool.status === "update_available" && <p className="small spaced-text">기존 통합 스킬을 유지하면서 기능별 선택 항목을 추가합니다.</p>}
              <Button primary disabled={busy || tool.status === "conflict"} onClick={() => void connect(tool.host)}>
                {tool.status === "update_available" ? `${labels[tool.host]} 스킬 업데이트` : `${labels[tool.host]}에 연결`}
              </Button>
            </>
          )}
          {tool.host === "antigravity" && <p className="micro spaced-text">스킬 파일 등록을 지원합니다. Antigravity 앱에서의 발견·실행은 별도 확인이 필요합니다.</p>}
        </section>
      ))}
      <Button quiet disabled={busy} onClick={() => void perform(refresh)}>연결 상태 다시 확인</Button>
    </section>
  );
}
