export type WorkspaceKind = "backend" | "frontend" | "cli" | "test-support" | "e2e";
export type WorkspaceGate = "container-smoke" | "e2e-runtime";
export type WorkspaceTier = "public-api" | "layered-backend";

export type WorkspaceMetadata = {
  readonly kind: WorkspaceKind;
  readonly gates?: readonly WorkspaceGate[];
  readonly architecture?: { readonly tier: WorkspaceTier };
};

export type WorkspaceManifest = {
  readonly name?: string;
  readonly iamWorkspace?: WorkspaceMetadata;
  readonly [field: string]: unknown;
};

export type WorkspaceNode = {
  readonly name: string | undefined;
  readonly directory: string;
  readonly manifestPath: string;
  readonly manifest: WorkspaceManifest;
  readonly iamWorkspace: WorkspaceMetadata | undefined;
  readonly buildDependencies: readonly (readonly [name: string, specifier: string])[];
  readonly productionDependencies: readonly (readonly [name: string, specifier: string])[];
};

export type WorkspaceGraph = {
  readonly byName: ReadonlyMap<string, WorkspaceNode>;
  readonly byManifestPath: ReadonlyMap<string, WorkspaceNode>;
  readonly invalidManifests: ReadonlySet<string>;
};

export function collectWorkspaceGraph(repoRoot: string): WorkspaceGraph;

export function selectWorkspaces(
  graph: WorkspaceGraph,
  criteria: { readonly kind?: WorkspaceKind; readonly gate?: WorkspaceGate; readonly tier?: WorkspaceTier },
): WorkspaceNode[];

export function expandWorkspaceClosure(
  graph: WorkspaceGraph,
  manifestPaths: Iterable<string>,
  dependencyKind?: "build" | "production",
): Set<string>;
