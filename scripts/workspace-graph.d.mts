export type WorkspaceKind = "backend" | "frontend" | "cli" | "test-support" | "e2e";
export type WorkspaceTier = "public-api" | "layered-backend";

export type WorkspaceMetadata = {
  readonly kind: WorkspaceKind;
  readonly architecture?: { readonly tier: WorkspaceTier };
};

export type WorkspaceManifest = {
  readonly name?: string;
  readonly iamWorkspace?: WorkspaceMetadata;
  readonly [field: string]: unknown;
};

export type WorkspaceDependency = {
  readonly section: "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";
  readonly name: string;
  readonly specifier: string;
};

export type WorkspaceNode = {
  readonly name: string | undefined;
  readonly directory: string;
  readonly manifestPath: string;
  readonly manifest: WorkspaceManifest;
  readonly manifestText: string;
  readonly iamWorkspace: WorkspaceMetadata | undefined;
  readonly buildDependencies: readonly WorkspaceDependency[];
  readonly productionDependencies: readonly WorkspaceDependency[];
};

export type WorkspaceGraph = {
  readonly byName: ReadonlyMap<string, WorkspaceNode>;
  readonly byManifestPath: ReadonlyMap<string, WorkspaceNode>;
  readonly invalidManifests: ReadonlySet<string>;
};

type WorkspaceSnapshot = {
  readonly paths: ReadonlySet<string>;
  readonly readFile: (path: string) => string | undefined;
};

export function collectWorkspaceGraph(repoRoot: string, snapshot?: WorkspaceSnapshot): WorkspaceGraph;

export function parseWorkspaceManifest(content: string | undefined): WorkspaceManifest | undefined;

export function resolveWorkspaceDependency(
  graph: WorkspaceGraph,
  from: WorkspaceNode,
  dependency: WorkspaceDependency,
): { name: string | undefined; workspace: WorkspaceNode | undefined };

export function selectWorkspaces(
  graph: WorkspaceGraph,
  criteria: { readonly kind?: WorkspaceKind; readonly tier?: WorkspaceTier },
): WorkspaceNode[];

export function expandWorkspaceClosure(
  graph: WorkspaceGraph,
  manifestPaths: Iterable<string>,
  dependencyKind?: "build" | "production",
): Set<string>;
