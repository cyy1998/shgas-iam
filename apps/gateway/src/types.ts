export type ResourceKind =
  | "routes"
  | "upstreams"
  | "plugin_metadata"
  | "services"
  | "plugin_configs"
  | "consumers"
  | "ssls";

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
  manifest: string;
  source: ManifestObject;
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

export type FetchLike = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;
