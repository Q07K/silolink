import { FolderPlus } from "lucide-react";
import { mutate } from "../api";
import { Actions, Button } from "../components";
import { useWorkspace } from "../context";

export function HomePage() {
  const { snapshot: s, navigate, setProjectId, perform } = useWorkspace();
  const openTasks = s.workspace.tasks.filter((task) => !task.completed);
  return (
    <div className="home-overview">
      {!s.workspace.projects.length ? (
        <section className="project-start">
          <h2>프로젝트가 없습니다</h2>
          <p>작업하던 폴더를 연결하면 문서와 AI 기록을 여기서 확인할 수 있습니다.</p>
          <Actions>
            <Button quiet onClick={() => navigate("settings")}>AI 도구 연결</Button>
            <Button primary onClick={() => navigate("projects", "connect")}><FolderPlus aria-hidden="true" />프로젝트 연결</Button>
          </Actions>
        </section>
      ) : (
        <>
          <header className="heading"><h1>전체 프로젝트</h1><Button primary onClick={() => navigate("projects", "connect")}><FolderPlus />프로젝트 추가</Button></header>
          <div className="overview-stats" aria-label="전체 프로젝트 현황">
            {([
              ["projects", "연결한 프로젝트", s.workspace.projects.length, "개"],
              ["analysis", "나의 요청", s.analysis.userRequests, "건"],
              ["analysis", "검토할 발견", (s.workspace.discoveries ?? []).filter((d) => d.status === "new").length, "개"],
              ["work", "진행 중인 작업", openTasks.length, "개"],
              ["docs", "저장한 기록", s.records.length, "건"],
            ] as const).map(([target, label, count, unit]) => (
              <button type="button" className="overview-stat" key={label} onClick={() => navigate(target, label === "검토할 발견" ? "discoveries" : "")}>
                <span className="stat-label">{label}</span><strong>{count.toLocaleString()}<small>{unit}</small></strong>
              </button>
            ))}
          </div>
          <div className="home-workbench">
            <section className="home-projects">
              <div className="section-heading"><h2>프로젝트</h2><Button quiet onClick={() => navigate("projects")}>전체 보기</Button></div>
              <table className="data-table" aria-label="연결한 프로젝트">
                <thead><tr><th>이름</th><th>문서</th><th>진행 중 작업</th></tr></thead>
                <tbody>{s.workspace.projects.map((project) => {
                  const inventory = s.inventories.find((item) => item.projectId === project.id);
                  return <tr key={project.id}>
                    <td><button type="button" className="project-name" onClick={() => { setProjectId(project.id); navigate("projects"); }}>{project.name}</button><small>{project.root}</small></td>
                    <td>{inventory?.error || !inventory?.report ? "확인 필요" : `${inventory.report.documents.length}개`}</td>
                    <td>{openTasks.filter((task) => task.projectId === project.id).length}개</td>
                  </tr>;
                })}</tbody>
              </table>
            </section>
            <aside className="agenda">
              <section>
                <div className="section-heading"><h2>진행 중인 작업</h2><Button quiet onClick={() => navigate("work")} aria-label="작업 전체 보기">전체 보기</Button></div>
                {openTasks.slice(0, 5).map((task) => (
                  <label className="checkline" key={task.id}>
                    <input type="checkbox" checked={task.completed} onChange={() => void perform(() => mutate({ operation: "updateTask", id: task.id, completed: true, userTested: task.userTested }))} />
                    <span>{task.title}<small>{s.workspace.projects.find((project) => project.id === task.projectId)?.name} · {task.phase}</small></span>
                  </label>
                ))}
                {!openTasks.length && <p className="small muted">진행 중인 작업이 없습니다.</p>}
              </section>
              <div className="home-review"><span>회고 {s.workspace.settings.reviewTime}</span><Button quiet onClick={() => navigate("reports")}>회고 보기</Button><Button quiet onClick={() => navigate("settings", "review")} aria-label="회고 설정">설정</Button></div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
