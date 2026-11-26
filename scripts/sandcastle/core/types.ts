import type { AgentProvider, BindMountSandboxProvider, SandboxHooks } from "@ai-hero/sandcastle";

export const phases = [
  "implement",
  "resolve-conflict",
  "review-standards",
  "review-spec",
  "repair-and-verify",
] as const;

export type Phase = (typeof phases)[number];

export type ImplementerTier = "light" | "standard" | "deep";

export type AgentSlot = AgentProvider | { provider: AgentProvider; instructions?: string };

export type PhaseSession = {
  sandbox: BindMountSandboxProvider;
  hooks?: SandboxHooks;
  cleanup?: () => Promise<void>;
};

export type SandboxFactory = (ctx: {
  phase: Phase;
  readonly: boolean;
  runId: string;
}) => Promise<PhaseSession> | PhaseSession;

export type AfkOptions = {
  repo: string;
  cwd?: string;
  remote?: string;
  baseBranch?: string;
  maxParallel?: number;
  maxSpecs?: number;
  draft?: boolean;
  agents: {
    implementLight: AgentSlot;
    implementStandard: AgentSlot;
    implementDeep: AgentSlot;
    reviewStandards: AgentSlot;
    reviewSpec: AgentSlot;
    repair: AgentSlot;
  };
  sandbox: BindMountSandboxProvider | SandboxFactory;
  promptsDir?: string;
};

export type IssueState = "OPEN" | "CLOSED";

export type IssueRef = {
  repo: string;
  number: number;
  state: IssueState;
};

export type IssueComment = {
  author: string;
  body: string;
  createdAt: string;
};

export type IssueDetails = IssueRef & {
  title: string;
  body: string;
  labels: string[];
  comments: IssueComment[];
  blockers: IssueRef[];
};

export type SpecIssue = IssueDetails;

export type TicketIssue = IssueDetails & {
  parent: IssueRef | null;
};

export type SpecGraph = {
  spec: SpecIssue;
  tickets: TicketIssue[];
};

export type BlockedTicket = {
  number: number;
  reasons: string[];
};

export type FrontierResult = {
  ready: TicketIssue[];
  blocked: BlockedTicket[];
  complete: boolean;
};

export type BranchConflict = {
  branch: string;
  specNumbers: number[];
};

export type IntegratedTicket = {
  number: number;
  mergeSha: string;
  candidateSha: string;
  handoff: string;
};

export type MergeTicketResult =
  | { merged: true; mergeSha: string; candidateSha: string }
  | { merged: false; conflict: true; specTip: string }
  | { merged: false; conflict: false; specTip: string };

export type BoundaryAssertionInput = {
  ticketBranch?: string;
  baselineSha?: string;
  specBranch: string;
  expectedSpecTip: string;
  remoteRef: string;
  expectedRemoteSha: string;
};

export type SpecWorktree = {
  worktreePath: string;
  branch: string;
  head: string;
};

export type ReviewReport = {
  candidateSha: string;
  standards: string;
  spec: string;
  createdAt?: string;
};

export type PullRequestInfo = {
  number: number;
  url: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  isCrossRepository?: boolean;
};

export type RunGh = (args: string[]) => Promise<string>;
