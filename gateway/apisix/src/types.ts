export type ResourceKind = "routes" | "upstreams" | "services" | "plugin_configs" | "consumers" | "ssls";

export type ManifestObject = Record<string, unknown>;
export type EnvMap = Record<string, string | undefined>;

export interface ResourceReference {
  field: string;
  targetKind: ResourceKind;
  targetName: string;
}

export interface ResourceCompareRules {
  ignoreFields: string[];
  defaultValues: Record<string, unknown>;
}

export interface ResourceDefinition {
  kind: ResourceKind;
  fileName: string;
  topKey: string;
  endpoint: string;
  idFields: string[];
  syncOrder: number;
  references: ResourceReference[];
  compare: ResourceCompareRules;
}

export interface ManifestScope {
  env: string;
  app: string;
}

export interface LoadedManifest {
  env: string;
  scope: ManifestScope;
  manifestDir: string;
  resources: Record<ResourceKind, ManifestObject[]>;
}

export interface ValidationIssue {
  file: string;
  path: string;
  message: string;
}

export interface PlannedChange {
  kind: ResourceKind;
  id: string;
  desired?: ManifestObject;
  remote?: ManifestObject;
}

export type IgnoredReason = "dynamic" | "out_of_scope" | "unmanaged";

export interface IgnoredChange extends PlannedChange {
  reason: IgnoredReason;
}

export interface ChangePlan {
  creates: PlannedChange[];
  updates: PlannedChange[];
  deletes: PlannedChange[];
  ignored: IgnoredChange[];
}

export type AppliedAction = "create" | "update" | "delete";

export interface AppliedChange extends PlannedChange {
  action: AppliedAction;
}

export interface ApplyResult {
  plan: ChangePlan;
  dryRun: boolean;
  prune: boolean;
  applied: AppliedChange[];
}

export interface CommandOptions {
  env?: string;
  manifestDir?: string;
  envFile?: string;
  renderEnv?: boolean;
  json?: boolean;
}

export interface RemoteCommandOptions extends CommandOptions {
  adminUrl?: string;
  adminKey?: string;
}

export interface ApplyCommandOptions extends RemoteCommandOptions {
  dryRun?: boolean;
  prune?: boolean;
}

export interface Reporter {
  log: (message: string) => void;
  error: (message: string) => void;
}

export type FetchLike = typeof fetch;
