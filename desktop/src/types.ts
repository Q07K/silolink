export interface NativeError {
  code: string;
  message: string;
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
  source: { provider: string; sessionId: string; itemId: string };
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
}
export interface Analysis {
  userRequests: number;
  projectCount: number;
  recordCount: number;
  missingTimestamps: number;
  method: string;
  providers: { [provider: string]: number };
  repeatedRequests: {
    text: string;
    count: number;
    recordIds: string[];
    projectIds: string[];
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
  | "change";
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
    }
  | { operation: "source"; source: Source }
  | { operation: "addTask"; projectId: string; title: string; phase: string }
  | {
      operation: "updateTask";
      id: string;
      completed: boolean;
      userTested: boolean;
    }
  | { operation: "timer"; id: string; running: boolean }
  | { operation: "scheduleTask"; id: string; dueAt: string | null }
  | { operation: "readNotices" };
