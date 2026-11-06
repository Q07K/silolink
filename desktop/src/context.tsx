import { createContext, useContext } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ChangePlan, ChatSelection, Page, Snapshot } from "./types";

export interface WorkspaceContext {
  snapshot: Snapshot;
  projectId: string;
  setProjectId: Dispatch<SetStateAction<string>>;
  page: Page;
  tab: string;
  setTab: Dispatch<SetStateAction<string>>;
  busy: boolean;
  navigate: (page: Page, tab?: string) => void;
  ask: (question: string, mode?: string, evidenceIds?: string[], selection?: ChatSelection, originId?: string) => void;
  chatSelection?: ChatSelection;
  refresh: () => Promise<void>;
  perform: (work: () => Promise<unknown>, success?: string) => Promise<boolean>;
  openDocument: (projectId: string, path: string, revision: string, fragment?: string) => void;
  /** A generated plan waiting for review on the change page. */
  pendingPlan?: ChangePlan | null;
  reviewPlan?: (plan: ChangePlan) => void;
  clearPendingPlan?: () => void;
}
export const Workspace = createContext<WorkspaceContext | null>(null);
export function useWorkspace(): WorkspaceContext {
  const value = useContext(Workspace);
  if (!value) throw new Error("Workspace provider is required.");
  return value;
}
