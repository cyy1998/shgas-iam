import type { AgentProvider } from "@ai-hero/sandcastle";
import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";

export type SandboxMount = NonNullable<DockerOptions["mounts"]>[number];

export type Role = {
  provider: AgentProvider;
  description?: string;
  instructions?: string;
};

export const executionPhases = [
  "plan",
  "explore",
  "implement",
  "resolve-conflict",
  "review",
  "repair-and-verify",
] as const;
export type ExecutionPhase = (typeof executionPhases)[number];
export type PromptPhase = Exclude<ExecutionPhase, "review"> | "review-standards" | "review-spec";

export type ExecutorContext = {
  readonly id: string;
  readonly cwd: string;
  readonly worktreePath: string;
  readonly phase: ExecutionPhase;
  readonly role: Role;
  readonly specNumber?: number;
  readonly ticketNumber?: number;
};

export type SandboxInputs = {
  env?: Readonly<Record<string, string>>;
  mounts?: readonly SandboxMount[];
};

export type LifecycleConfig = {
  prepareCommand?: string;
  prepareTimeoutMs?: number;
  hooksCommand?: string;
  /** Prepare resources for a writable executor. */
  beforeExecutor?: (context: ExecutorContext) => Promise<SandboxInputs | undefined>;
  /** Clean up after a writable executor completes and its sandboxes close. */
  afterExecutor?: (context: ExecutorContext, inputs: SandboxInputs | undefined) => Promise<void>;
};

export type AuthContext = {
  readonly cwd: string;
  readonly provider: AgentProvider;
};

// Mounts here must be private to this execution so providers can refresh credentials and manage sessions.
export type PreparedAuth = SandboxInputs & { close: () => Promise<void> };

export type AuthAdapter = {
  appliesTo: (provider: AgentProvider) => boolean;
  check: (context: AuthContext) => Promise<void>;
  prepare: (context: AuthContext) => Promise<PreparedAuth>;
};

export type DockerAuthConfig = {
  source: string;
  registries: readonly string[];
  sandboxPath?: string;
};

export const projectStages = ["Implementing", "Integrated", "Reviewing", "PR Open", "Needs Attention", "Done"] as const;
export type ProjectStage = (typeof projectStages)[number];
export type ProjectConfig = {
  url: string;
  token?: string;
  fieldName?: string;
  stageMap?: Partial<Record<ProjectStage, string>>;
};

export type WorkflowConfig = {
  branchPrefix?: string;
  explore?: boolean;
  review?: boolean;
  projects?: boolean;
  maxIterations?: Partial<Record<ExecutionPhase, number>>;
  project?: ProjectConfig;
  draft?: boolean;
};

export type SandcastleConfig = {
  repo?: string;
  sandbox: SandboxInputs & {
    image: string;
    dockerfile: string;
    dockerAccess?: boolean;
    dockerAuth?: DockerAuthConfig;
  };
  lifecycle?: LifecycleConfig;
  workflow?: WorkflowConfig;
  roles: {
    planner: Role;
    researcher: Role;
    implementers: Readonly<Record<string, Role>>;
    reviewers: { standards: Role; spec: Role };
    repairer: Role;
    repairerDeep: Role;
  };
  authAdapters?: readonly AuthAdapter[];
  promptExtras?: Partial<Record<PromptPhase, string | { replace: string }>>;
};

export type ResolvedSandcastleConfig = SandcastleConfig & {
  sandbox: { dockerAccess: boolean };
  workflow: Required<Omit<WorkflowConfig, "project" | "maxIterations">> & {
    maxIterations: Record<ExecutionPhase, number>;
  };
};

export function validateRepository(repo: string): string {
  if (!/^[\w-]+\/[\w.-]+$/.test(repo) || /\/\.{1,2}$/.test(repo)) {
    throw new Error("The GitHub repository must have the form owner/repo.");
  }
  return repo;
}

export function defineSandcastleConfig(config: SandcastleConfig): ResolvedSandcastleConfig {
  if (config.repo !== undefined) validateRepository(config.repo);
  const workflow = config.workflow;
  const maxIterations = {
    plan: 1,
    explore: 1,
    implement: 1,
    "resolve-conflict": 1,
    review: 1,
    "repair-and-verify": 1,
    ...workflow?.maxIterations,
  };
  for (const phase of executionPhases) {
    const count = maxIterations[phase];
    if (!Number.isSafeInteger(count) || count < 1) throw new Error(`Expected a positive maxIterations for ${phase}.`);
  }
  return {
    ...config,
    sandbox: { ...config.sandbox, dockerAccess: config.sandbox.dockerAccess ?? false },
    workflow: {
      ...workflow,
      branchPrefix: workflow?.branchPrefix ?? "sandcastle",
      explore: workflow?.explore ?? true,
      review: workflow?.review ?? true,
      projects: workflow?.projects ?? true,
      draft: workflow?.draft ?? false,
      maxIterations,
    },
  };
}
