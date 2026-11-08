export interface NativeError {
  code: string;
  message: string;
}
export interface DocumentReference {
  projectId: string;
  path: string;
  revision: string;
}
export interface ChatSelection {
  documents?: DocumentReference[];
  projectIds?: string[];
  taskIds?: string[];
}
export type ToolHost = "codex" | "claude" | "antigravity";
export interface ToolConnections {
  tools: {
    host: ToolHost;
    path: string;
    status: "installed" | "not_installed" | "update_available" | "conflict";
    invocation: string;
    skills: string[];
  }[];
}
export interface ToolInstallation {
  status: "success" | "partial" | "failed";
  installations: { status: string; error?: NativeError }[];
}
export interface Settings {
  stateDirectory: string | null;
  reviewTime: string;
  reviewWeekday: number;
  timezone: "Asia/Seoul" | "UTC";
  immediateNotifications: boolean;
  backgroundEnabled: boolean;
  collectionIntervalSecs: number;
  theme: "system" | "light" | "dark";
  autoAnalysis?: boolean;
  analysisProvider?: "codex" | "claude";
}
export interface Project {
  id: string;
  name: string;
  root: string;
}
export interface RecordItem {
  id: string;
  revision: string;
  projectId: string;
  role: string;
  text: string;
  occurredAt: string | null;
  observedAt: string;
  source: { provider: string; sessionId: string; itemId: string; sourceKind?: string | null };
}
export interface DocumentItem {
  id: string;
  path: string;
  revision: string;
  bytes: number;
  title: string | null;
  text?: string;
  projectId?: string;
  links: { destination: string; status: string }[];
}
export interface Inventory {
  projectId: string;
  error?: NativeError;
  report?: {
    status: string;
    documents: DocumentItem[];
    warnings: { code: string; path: string }[];
    proposals: {
      kind: string;
      documents: { path: string; revision: string }[];
      incomingLinks: unknown[];
    }[];
  };
}
export interface Note {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  body: string;
  evidenceIds: string[];
  createdAt: string;
  status?: "open" | "applying" | "done" | "held";
  originId?: string;
}
export interface Source {
  id: string;
  projectId: string;
  title: string;
  url: string;
  kind: string;
  claim: string;
  conditions: string;
  version: string;
  verified: boolean;
  recordedAt: string;
  fetched?: { url: string; title: string; text: string; fetchedAt: string } | null;
}
export interface Task {
  id: string;
  projectId: string;
  title: string;
  phase: string;
  completed: boolean;
  userTested: boolean;
  dueAt: string | null;
  createdAt: string;
  spans: { startedAt: string; endedAt: string | null }[];
  originId?: string;
  estimates?: Estimate[];
}
export interface Estimate {
  lowMinutes: number | null;
  medianMinutes: number | null;
  highMinutes: number | null;
  basisTaskIds: string[];
  method: "no-comparable-task" | "single-reference" | "similar-completed-tasks";
  createdAt: string;
}
export interface EstimateResult {
  estimate: Estimate;
  references: { taskId: string; title: string; projectId: string; phase: string; minutes: number; userTested: boolean; similarity: number }[];
  changed: boolean;
}
export interface Evidence {
  recordId: string;
  projectId: string;
  quote: string;
  occurredAt?: string | null;
}
export type DiscoveryKind =
  | "repeated-request"
  | "repeated-topic"
  | "ambiguous-term"
  | "repeated-research"
  | "cross-project"
  | "criteria-exploration";
export type DiscoveryStatus = "new" | "accepted" | "dismissed" | "corrected";
export interface Discovery {
  id: string;
  fingerprint: string;
  kind: DiscoveryKind;
  title: string;
  summary: string;
  basis: "observed" | "inferred";
  projectIds: string[];
  evidence: Evidence[];
  suggestedAction: "learn" | "research" | "rule" | "task" | "none";
  term?: string | null;
  status: DiscoveryStatus;
  correction?: string | null;
  source: string;
  runId?: string | null;
  createdAt: string;
  updatedAt: string;
  followUps: string[];
}
export interface AnalysisRun {
  id: string;
  provider: string;
  projectIds: string[];
  status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  startedAt: string;
  endedAt: string | null;
  requestCount: number;
  discoveryCount: number;
  rejectedCount: number;
  error?: NativeError | null;
}
export interface RuleItem {
  projectId: string;
  projectName: string;
  path: string;
  revision: string;
  section: string;
  text: string;
  line: number;
}
export interface RuleComparison {
  summary: { shared: number; variant: number; local: number; rules: number };
  groups: {
    status: "shared" | "variant" | "local";
    text: string;
    projectIds: string[];
    missingProjectIds: string[];
    items: RuleItem[];
  }[];
  documents: { projectId: string; path: string; revision?: string; rules?: number; error?: NativeError }[];
  projects: { id: string; name: string }[];
  method: string;
}
export interface Chat {
  id: string;
  projectId: string;
  provider: string;
  context: string;
  evidenceIds: string[];
  messages: { role: string; text: string; createdAt: string }[];
  startedAt: string;
  endedAt: string | null;
  status: string;
  error: NativeError | null;
}
export interface Notice {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  read: boolean;
}
export interface Workspace {
  schemaVersion: number;
  settings: Settings;
  projects: Project[];
  notes: Note[];
  sources: Source[];
  tasks: Task[];
  chats: Chat[];
  notices: Notice[];
  discoveries?: Discovery[];
  analysisRuns?: AnalysisRun[];
}
export interface Analysis {
  userRequests: number;
  requestIds?: string[];
  projectCount: number;
  recordCount: number;
  missingTimestamps: number;
  method: string;
  excludedRequests?: { [origin: string]: number };
  terms?: { term: string; count: number; projects: { [projectId: string]: number }; recordIds: string[] }[];
  providers: { [provider: string]: number };
  repeatedRequests: {
    text: string;
    count: number;
    match?: "exact" | "similar";
    recordIds: string[];
    projectIds: string[];
    firstAt?: string | null;
    lastAt?: string | null;
  }[];
  ambiguousExpressions: {
    recordId: string;
    projectId: string;
    text: string;
    phrases: string[];
    status: string;
  }[];
}
export interface Snapshot {
  defaultStateDirectory: string;
  projectConnectionErrors?: { registration: string; error: NativeError }[];
  workspace: Workspace;
  inventories: Inventory[];
  collections: {
    projectId: string;
    lastRun?: {
      status: string;
      observedAt: string;
      sources: { provider: string; status: string }[];
    };
    error?: NativeError;
  }[];
  records: RecordItem[];
  analysis: Analysis;
  loadedAt: string;
}
export interface Operation {
  path: string;
  expectedRevision: string | null;
  content: string | null;
}
export interface ChangePlan {
  schemaVersion: 1;
  id: string;
  projectId: string;
  rationale: string;
  operations: Operation[];
  guards: { path: string; expectedRevision: string }[];
}
export interface PlanCheck {
  changeId: string;
  changeState: string;
  rationale: string;
  operations: { path: string; before: string | null; after: string | null }[];
  conflicts: { code?: string; path?: string }[];
  incomingLinks: { source: string; sourceCoveredByPlan: boolean }[];
}
export interface ChangeSummary {
  id: string;
  changeId?: string;
  state?: string;
  changeState?: string;
  rationale?: string;
  createdAt?: string;
}
export type Page =
  | "home"
  | "analysis"
  | "research"
  | "learn"
  | "projects"
  | "work"
  | "docs"
  | "reports"
  | "settings"
  | "chat"
  | "change"
  | "rules";
export type Mutation =
  | { operation: "connect"; path: string; initialize: boolean }
  | { operation: "settings"; settings: Settings }
  | {
      operation: "note";
      projectId: string;
      kind: string;
      title: string;
      body: string;
      evidenceIds: string[];
      originId?: string;
    }
  | { operation: "noteStatus"; id: string; status: "open" | "applying" | "done" | "held" }
  | { operation: "reviewDiscovery"; id: string; status: DiscoveryStatus; correction?: string | null }
  | { operation: "source"; source: Source }
  | { operation: "addTask"; projectId: string; title: string; phase: string; originId?: string }
  | {
      operation: "updateTask";
      id: string;
      completed: boolean;
      userTested: boolean;
    }
  | { operation: "timer"; id: string; running: boolean }
  | { operation: "scheduleTask"; id: string; dueAt: string | null }
  | { operation: "readNotices" };
