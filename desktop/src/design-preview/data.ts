import type { Snapshot } from "../types";

export type PreviewScenario = "populated" | "empty";
export type PreviewTheme = "light" | "dark";

export function createPreviewSnapshot(scenario: PreviewScenario, theme: PreviewTheme): Snapshot {
  const now = new Date();
  const earlier = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
  const snapshot: Snapshot = {
    defaultStateDirectory: "디자인 리뷰용 예시 저장 위치",
    defaultDelegationPhrases: ["잘해줘", "잘 해줘", "잘 적용", "잘 처리", "잘 정리", "알아서", "적당히", "깔끔하게", "예쁘게", "보기 좋게", "자연스럽게", "느낌", "대충", "best practice"],
    loadedAt: now.toISOString(),
    workspace: {
      schemaVersion: 1,
      settings: {
        stateDirectory: null, reviewTime: "21:30", reviewWeekday: 5, timezone: "Asia/Seoul",
        immediateNotifications: false, backgroundEnabled: false, collectionIntervalSecs: 300, theme,
      },
      projects: [], notes: [], sources: [], tasks: [], chats: [], notices: [],
    },
    inventories: [], collections: [], records: [],
    analysis: {
      userRequests: 0, recordCount: 0, projectCount: 0, missingTimestamps: 0,
      providers: {}, repeatedRequests: [], ambiguousExpressions: [], method: "exact-text-and-expression-candidates",
    },
  };
  if (scenario === "empty") return snapshot;

  snapshot.workspace.projects = [
    { id: "design-silolink", name: "SiloLink", root: "C:\\DesignPreview\\silolink" },
    { id: "design-portfolio", name: "개인 포트폴리오", root: "C:\\DesignPreview\\portfolio" },
  ];
  const requests = [
    "메뉴를 목적별로 정리하고 다음 행동이 잘 보이게 해줘.",
    "문서와 AI 기록을 같은 맥락에서 찾아볼 수 있게 해줘.",
    "메뉴를 목적별로 정리하고 다음 행동이 잘 보이게 해줘.",
    "처음 방문한 사람이 프로젝트를 연결하는 흐름을 깔끔하게 해줘.",
    "메뉴를 목적별로 정리하고 다음 행동이 잘 보이게 해줘.",
    "포트폴리오의 프로젝트 소개와 작업 과정을 연결해줘.",
  ];
  snapshot.records = requests.map((text, index) => ({
    id: `design-record-${index}`, revision: `design-revision-${index}`,
    projectId: index === 5 ? "design-portfolio" : "design-silolink", role: "user", text,
    occurredAt: earlier(index + 1), observedAt: earlier(index + 1),
    source: { provider: index % 2 ? "claude-code" : "codex", sessionId: `design-session-${index}`, itemId: String(index) },
  }));
  // Eight weeks of earlier requests so the home overview shows a trend; broad requests thin out over time.
  let seed = 7;
  const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const hours = [10, 11, 14, 15, 16, 19, 20, 21, 21, 22, 22, 22, 23, 23, 0, 1];
  const plain = ["설정 화면의 버튼 높이를 40px로 맞추고 항목 간격을 24px로 통일해줘.", "기록 목록에 날짜별 구분선을 넣고 오늘 항목을 먼저 보여줘.",
    "수집 실패 알림에 원인과 다시 시도 버튼을 추가해줘.", "README의 설치 절차를 Windows 기준으로 다시 정리해줘.", "포트폴리오 카드에 사용한 기술을 배지로 보여줘."];
  const broad = [["UI/UX 잘 적용해서 작업해줘.", "잘 적용"], ["알아서 최적화 해줘.", "알아서"], ["화면을 깔끔하게 정리해줘.", "깔끔하게"]] as const;
  const vague: Snapshot["analysis"]["ambiguousExpressions"] = [{ recordId: "design-record-3", projectId: "design-silolink", text: requests[3], phrases: ["깔끔하게"], status: "candidate" }];
  ([[18, 0.36], [16, 0.34], [22, 0.3], [20, 0.25], [24, 0.2], [21, 0.15], [25, 0.1]] as const).forEach(([count, broadShare], age) => {
    for (let n = 0; n < count; n += 1) {
      const id = `design-history-${age}-${n}`;
      const at = new Date(now.getTime() - (7 - age) * 7 * 86_400_000 + Math.floor(random() * 7) * 86_400_000);
      at.setHours(pick(hours), Math.floor(random() * 60));
      const isBroad = random() < broadShare;
      const [text, phrase] = isBroad ? pick(broad) : [pick(plain), ""];
      const projectId = random() < 0.75 ? "design-silolink" : "design-portfolio";
      const roll = random();
      snapshot.records.push({
        id, revision: `${id}-r`, projectId, role: "user", text, occurredAt: at.toISOString(), observedAt: at.toISOString(),
        source: { provider: roll < 0.57 ? "codex" : roll < 0.96 ? "claude-code" : "antigravity", sessionId: `${id}-s`, itemId: id },
      });
      if (isBroad) vague.push({ recordId: id, projectId, text, phrases: [phrase], status: "candidate" });
    }
  });
  snapshot.records.sort((a, b) => (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""));
  const providers: Record<string, number> = {};
  snapshot.records.forEach((r) => { providers[r.source.provider] = (providers[r.source.provider] ?? 0) + 1; });
  snapshot.analysis = {
    userRequests: snapshot.records.length, requestIds: snapshot.records.map((r) => r.id), recordCount: snapshot.records.length,
    projectCount: 2, missingTimestamps: 0, providers, method: "exact-text-and-expression-candidates",
    repeatedRequests: [{ text: requests[0], count: 3, recordIds: [0, 2, 4].map((id) => `design-record-${id}`), projectIds: ["design-silolink"] }],
    ambiguousExpressions: vague,
    stages: { explore: 9, diagnose: 4, verify: 3, execute: snapshot.records.length - 16 },
    intentionalRequests: 0,
    // The newest broad requests as the detector would report them; the first one also drew a question back.
    requestSignals: [vague[0], ...vague.slice(-7).reverse()].map((e) => {
      const record = snapshot.records.find((r) => r.id === e.recordId);
      const asked = e.recordId === "design-record-3";
      return {
        recordId: e.recordId, projectId: e.projectId, provider: record?.source.provider ?? "codex", occurredAt: record?.occurredAt ?? null,
        text: e.text, stage: "execute" as const, basis: asked ? "observed" as const : "inferred" as const,
        signals: [
          ...(asked ? [{ kind: "outcome" as const, type: "clarification" as const, reason: "요청 뒤에 AI가 무엇을 원하는지 되물었어요", recordId: "design-reply-3", quote: "첫 화면, 폴더 선택, 연결 버튼 중 어디부터 볼까요?" }] : []),
          { kind: "expression" as const, type: "phrase" as const, reason: `기준을 ‘${e.phrases[0]}’에 맡긴 표현이 있어요`, recordId: e.recordId, quote: e.phrases[0] },
        ],
      };
    }),
  };
  snapshot.workspace.tasks = ([
    ["메뉴 구조와 화면 이름 검토", "디자인", "design-silolink", false],
    ["첫 프로젝트 연결 흐름 살펴보기", "사용성 확인", "design-silolink", false],
    ["대표 프로젝트 소개 문구 다듬기", "작성", "design-portfolio", false],
    ["문서와 기록 목록 비교", "검토", "design-silolink", true],
  ] as const).map(([title, phase, projectId, completed], index) => ({
    id: `design-task-${index}`, title, phase, projectId,
    completed, userTested: false, createdAt: earlier(24),
    dueAt: null, spans: [],
  }));
  snapshot.workspace.notes = [
    { id: "design-note-learning", kind: "learning", title: "메뉴를 사용자의 목적에 맞춰 묶기", body: "## 학습 메모\n기능 이름보다 사용자가 하려는 일에서 탐색을 시작합니다.\n\n- 내 작업: 현재 할 일과 회고\n- 지식 탐색: 기록·문서·조사·학습\n- 프로젝트 실행: 연결 상태와 변경 검토" },
    { id: "design-note-research", kind: "research", title: "화면의 정보 우선순위", body: "## 디자인 리뷰용 예시\n현황을 먼저 확인하고, 근거를 읽은 뒤 다음 행동을 선택할 수 있도록 배치합니다.\n\n수치 자체보다 원문과 맥락으로 이어지는 이동 경로를 검토합니다." },
    { id: "design-note-rule", kind: "rule", title: "변경 전 원문과 영향을 확인하기", body: "## 검토 기준\n1. 변경 이유를 설명합니다.\n2. 원문과 변경 후 내용을 함께 확인합니다.\n3. 적용한 뒤 실제 결과를 다시 살펴봅니다." },
  ].map((note, index) => ({ ...note, projectId: "design-silolink", evidenceIds: ["design-record-0"], createdAt: earlier([24 * 30, 3, 24 * 12][index]) }));
  snapshot.workspace.sources = [{
    id: "design-source", projectId: "design-silolink", title: "디자인 리뷰를 위한 참고 자료 예시",
    url: "https://example.com", kind: "community", claim: "화면에서 자주 쓰는 경로를 눈에 잘 띄게 배치한다.",
    conditions: "예시 데이터 · 실제 조사 결과 아님", version: "디자인 검토", verified: false, recordedAt: earlier(5),
  }];
  snapshot.inventories = snapshot.workspace.projects.map((project) => ({
    projectId: project.id,
    report: {
      status: "success", proposals: [], warnings: [],
      documents: [
        { id: `${project.id}-readme`, path: "README.md", revision: "design-doc-v1", bytes: 640, title: `${project.name} 프로젝트 소개`, links: [],
          text: `# ${project.name} 프로젝트 소개\n\n디자인 리뷰용 예시 문서입니다. 실제 프로젝트 파일이 아닙니다.\n\n## 작업의 목적\n흩어진 기록을 연결하고 다음 행동을 쉽게 선택할 수 있도록 합니다.\n\n## 확인할 화면\n| 화면 | 검토할 내용 |\n| --- | --- |\n| 요약 | 정보의 우선순위 |\n| 기록·문서 | 탐색과 읽기 흐름 |\n| 작업·일정 | 다음 행동의 명확성 |\n\n[화면 검토 기준](docs/review.md)` },
        { id: `${project.id}-review`, path: "docs/review.md", revision: "design-review-v1", bytes: 280, title: "화면 검토 기준", links: [],
          text: "# 화면 검토 기준\n\n디자인 리뷰용 예시입니다.\n\n- 메뉴 이름만으로 이동할 곳을 알 수 있는가?\n- 현재 선택한 프로젝트가 분명한가?\n- 다음 행동으로 쉽게 이어지는가?\n\n[프로젝트 소개로 돌아가기](../README.md)" },
      ],
    },
  }));
  snapshot.collections = snapshot.workspace.projects.map((project) => ({
    projectId: project.id,
    lastRun: { status: "success", observedAt: earlier(1), sources: [{ provider: "codex", status: "success" }, { provider: "claude-code", status: "success" }] },
  }));
  snapshot.workspace.chats = [{
    id: "design-chat", projectId: "design-silolink", provider: "codex", context: "디자인 리뷰용 예시 대화",
    evidenceIds: ["design-record-0"], startedAt: earlier(2), endedAt: earlier(1), status: "completed", error: null,
    messages: [
      { role: "user", text: "메뉴와 홈 화면에서 어떤 부분을 먼저 살펴보면 좋을까?", createdAt: earlier(2) },
      { role: "assistant", text: "## 디자인 리뷰용 예시 답변\n먼저 **자주 쓰는 메뉴를 찾는 흐름**을 살펴보세요.\n\n1. 프로젝트를 선택합니다.\n2. 필요한 기록이나 문서를 엽니다.\n3. 다음 대화나 작업으로 이어갑니다.\n\n이 문구는 화면 구성을 검토하기 위한 예시이며 실제 AI 실행 결과가 아닙니다.", createdAt: earlier(1) },
    ],
  }];
  snapshot.workspace.notices = [{ id: "design-notice", kind: "pattern", title: "메뉴 구성에 관한 요청이 반복되었습니다", createdAt: earlier(1), read: false }];
  return snapshot;
}
