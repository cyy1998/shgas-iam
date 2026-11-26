import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import ts from "typescript";
import {
  collectWorkspaceGraph,
  expandWorkspaceClosure,
  selectWorkspaces,
  type WorkspaceGraph,
  type WorkspaceNode,
} from "./workspace-graph.mjs";

export type ArchitectureViolation = Readonly<{
  ruleId: string;
  file: string;
  line: number;
  message: string;
}>;

type IndexedSourceFile = Readonly<{
  file: string;
  sourceFile: ts.SourceFile;
  dependencies: readonly StaticDependency[];
  typeReferences: readonly ts.TypeReferenceNode[];
}>;

type StaticDependencyDeclaration = ts.ImportDeclaration | ts.ExportDeclaration;

type StaticDependency = Readonly<{
  declaration: StaticDependencyDeclaration;
  moduleSpecifier: string;
}>;

type StaticModulePattern = Readonly<{
  kind: "exact" | "package" | "prefix" | "specifier";
  module: string;
}>;

type StaticModuleOwnershipRule = Readonly<{
  ruleId:
    | "client-snapshot-owner"
    | "client-subject-projection-owner"
    | "http-owner"
    | "login-restriction-ownership"
    | "runtime-owner"
    | "role-resolution-owner"
    | "test-support-ownership"
    | "session-runtime-owner"
    | "subject-access-owner"
    | "user-document-owner"
    | "worker-ownership"
    | "ops-ownership"
    | "public-api-dependency-boundary"
    | "organization-responsibility-parent-lifecycle-owner";
  sourceScopes: readonly string[];
  dependencyKind?: "any" | "value";
  targets: readonly StaticModulePattern[];
  allowedTargets?: readonly StaticModulePattern[];
  allowedSources?: readonly string[];
  message: (moduleSpecifier: string, declaration: StaticDependencyDeclaration) => string;
}>;

const excludedSourceDirectories = new Set([
  "__generated__",
  "__tests__",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "test",
  "testing",
  "tests",
]);

const loginIntegrationPackages = ["bcrypt", "bcrypt-ts", "@cap.js/server", "pngjs"];
const publicApiForbiddenPackages = new Map<string, readonly string[]>([
  ["@iam/auth-api", ["@iam/delegation", "@iam/sso-api", "@iam/integration-api"]],
  [
    "@iam/sso-api",
    [
      "@iam/sms",
      "@iam/delegation",
      "@iam/auth-api",
      "@iam/integration-api",
      "@iam/jobs",
      "bullmq",
      ...loginIntegrationPackages,
    ],
  ],
  [
    "@iam/integration-api",
    ["@iam/oidc", "@iam/custom-sso", "@iam/auth-api", "@iam/sso-api", ...loginIntegrationPackages],
  ],
]);
const publicApiDependencyRuleId = "public-api-dependency-boundary";
const oidcSourceRoot = "packages/oidc/src";
const oidcContinuationEntry = `${oidcSourceRoot}/wechat-qr`;
const oidcContinuationModules = [
  oidcContinuationEntry,
  ...["continuation", "errors", "state", "wire"].map((module) => `${oidcSourceRoot}/${module}`),
];

const clientSubjectProjectionExternalOwnerTargets: readonly StaticModulePattern[] = [
  { kind: "prefix", module: "packages/runtime/src" },
  { kind: "prefix", module: "packages/client-snapshot/src" },
  { kind: "prefix", module: "packages/session-kernel/src" },
  { kind: "prefix", module: "packages/subject-access/src" },
  { kind: "prefix", module: "packages/db/src" },
  { kind: "prefix", module: "packages/domain/src" },
  { kind: "prefix", module: "packages/documents/src/user" },
  { kind: "prefix", module: "apps" },
  { kind: "prefix", module: "@hono" },
  { kind: "package", module: "hono" },
  { kind: "package", module: "ioredis" },
  { kind: "package", module: "redis" },
  { kind: "package", module: "oidc-provider" },
];

const staticModuleOwnershipRules: readonly StaticModuleOwnershipRule[] = [
  {
    ruleId: publicApiDependencyRuleId,
    sourceScopes: ["apps/sso-api/src"],
    targets: [
      { kind: "exact", module: "packages/documents/src/user/producer" },
      { kind: "exact", module: "packages/documents/src/organization/producer" },
      { kind: "prefix", module: "packages/documents/src/user/invalidation" },
      { kind: "prefix", module: "packages/documents/src/organization/invalidation" },
    ],
    message: (moduleSpecifier) => `SSO API must not depend on queue producers "${moduleSpecifier}".`,
  },
  {
    ruleId: publicApiDependencyRuleId,
    sourceScopes: ["apps/auth-api/src"],
    targets: [{ kind: "prefix", module: oidcSourceRoot }],
    allowedTargets: [{ kind: "exact", module: oidcContinuationEntry }],
    message: (moduleSpecifier) =>
      `Auth API may consume OIDC only through @iam/oidc/wechat-qr, received "${moduleSpecifier}".`,
  },
  {
    ruleId: publicApiDependencyRuleId,
    sourceScopes: oidcContinuationModules.map((module) => `${module}.ts`),
    targets: [{ kind: "prefix", module: oidcSourceRoot }],
    allowedTargets: oidcContinuationModules.map((module) => ({ kind: "exact", module })),
    message: (moduleSpecifier) =>
      `The OIDC continuation surface must remain independent of the full OIDC runtime, received "${moduleSpecifier}".`,
  },
  {
    ruleId: "http-owner",
    sourceScopes: ["packages", "apps/worker/src", "apps/ops/src"],
    allowedSources: ["packages/api-core/src"],
    targets: [{ kind: "prefix", module: "packages/api-core/src" }],
    message: (moduleSpecifier, declaration) =>
      `Non-HTTP owners must not ${dependencyOperation(declaration)} API Core module "${moduleSpecifier}"; ` +
      "depend on the capability owner directly.",
  },
  {
    ruleId: "runtime-owner",
    sourceScopes: ["packages/runtime/src"],
    targets: [
      { kind: "prefix", module: "@iam" },
      { kind: "prefix", module: "apps" },
      { kind: "prefix", module: "packages" },
      { kind: "prefix", module: "@hono" },
      { kind: "prefix", module: "@trpc" },
      { kind: "package", module: "hono" },
      { kind: "package", module: "hono-pino" },
      { kind: "package", module: "@scalar/hono-api-reference" },
    ],
    allowedTargets: [
      { kind: "prefix", module: "packages/contracts/src" },
      { kind: "prefix", module: "packages/runtime/src" },
    ],
    message: (moduleSpecifier) =>
      `Runtime must not depend on application, business or HTTP module "${moduleSpecifier}"; ` +
      "use only platform libraries and shared contracts.",
  },
  {
    ruleId: "test-support-ownership",
    sourceScopes: ["apps", "packages"],
    targets: [{ kind: "prefix", module: "packages/test-support/src" }],
    message: (moduleSpecifier) =>
      `Production modules must not use test resources "${moduleSpecifier}"; keep the dependency in tests.`,
  },
  {
    ruleId: "client-snapshot-owner",
    sourceScopes: ["packages/client-snapshot/src"],
    targets: [
      { kind: "prefix", module: "packages/db/src" },
      { kind: "prefix", module: "apps" },
      { kind: "prefix", module: "@hono" },
      { kind: "package", module: "hono" },
    ],
    message: (moduleSpecifier) =>
      `Client Snapshot must not import an app, Hono or database implementation "${moduleSpecifier}"; inject its source and Redis ports.`,
  },
  {
    ruleId: "login-restriction-ownership",
    sourceScopes: ["packages/login-restriction/src"],
    targets: [{ kind: "prefix", module: "apps" }],
    message: (moduleSpecifier) =>
      `Login Restriction production sources must not depend on "${moduleSpecifier}"; inject the storage boundary.`,
  },
  {
    ruleId: "organization-responsibility-parent-lifecycle-owner",
    sourceScopes: ["apps", "packages"],
    targets: [
      { kind: "prefix", module: "packages/assignment-resolution/src/organization-responsibility/parent-lifecycle" },
    ],
    allowedSources: [
      "apps/integration-api/src/composition",
      "apps/admin-api/src/composition",
      "apps/admin-api/src/services/organization-responsibility/organization-responsibility.repository.ts",
      "apps/admin-api/src/services/organization-responsibility/organization-responsibility-parent-lifecycle.participant.ts",
    ],
    message: (moduleSpecifier, declaration) =>
      `Only Integration API/Admin API composition and Admin Responsibility lifecycle owners may ${dependencyOperation(declaration)} ` +
      `the parent lifecycle capability "${moduleSpecifier}"; consume an injected business port.`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["packages/oidc/src"],
    targets: [
      { kind: "prefix", module: "packages/custom-sso/src" },
      { kind: "prefix", module: "apps" },
      { kind: "package", module: "oidc-provider" },
      { kind: "package", module: "hono" },
      { kind: "package", module: "@iam/db" },
    ],
    message: (moduleSpecifier) =>
      `OIDC must not import another protocol, app or HTTP owner "${moduleSpecifier}"; inject its external capabilities.`,
  },
  {
    ruleId: "subject-access-owner",
    sourceScopes: ["packages/subject-access/src"],
    targets: [
      { kind: "prefix", module: "packages/db/src" },
      { kind: "prefix", module: "packages/documents/src/user" },
      { kind: "prefix", module: "apps" },
      { kind: "prefix", module: "@hono" },
      { kind: "package", module: "hono" },
    ],
    message: (moduleSpecifier) =>
      "Subject Access must not depend on an app, Hono or persistence authority: " + moduleSpecifier,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["packages/session-kernel/src"],
    targets: [
      { kind: "prefix", module: "packages/subject-access/src" },
      { kind: "prefix", module: "packages/client-snapshot/src" },
      { kind: "package", module: "@iam/custom-sso" },
      { kind: "prefix", module: "packages/custom-sso/src" },
      { kind: "prefix", module: "packages/oidc/src" },
      { kind: "prefix", module: "apps" },
    ],
    message: (moduleSpecifier) =>
      `Session Kernel must not import account access, runtime, or protocol owner "${moduleSpecifier}"; inject its external capabilities.`,
  },
  {
    ruleId: "client-subject-projection-owner",
    sourceScopes: ["packages/client-subject-projection/src"],
    targets: [...clientSubjectProjectionExternalOwnerTargets, { kind: "prefix", module: "packages/custom-sso/src" }],
    message: (moduleSpecifier) =>
      `Client Subject Projection implementation must not import runtime or protocol module "${moduleSpecifier}"; ` +
      "depend on its injected facts and safety ports.",
  },
  {
    ruleId: "client-subject-projection-owner",
    sourceScopes: ["packages/custom-sso/src/wire.ts"],
    targets: [...clientSubjectProjectionExternalOwnerTargets, { kind: "prefix", module: "packages/custom-sso/src" }],
    allowedTargets: [{ kind: "exact", module: "packages/custom-sso/src/wire" }],
    message: (moduleSpecifier) =>
      `Custom SSO wire adapter must not import facts persistence, configuration, runtime, ` +
      `or transport module "${moduleSpecifier}"; ` +
      "depend only on the root public Client Subject Projection interface.",
  },
  {
    ruleId: "client-subject-projection-owner",
    sourceScopes: ["packages/custom-sso/src/wire.ts"],
    targets: [{ kind: "prefix", module: "packages/client-subject-projection/src" }],
    allowedTargets: [{ kind: "exact", module: "packages/client-subject-projection/src" }],
    message: (moduleSpecifier) =>
      `Custom SSO wire adapter must not import non-root Projection module "${moduleSpecifier}"; ` +
      "depend only on the root public Client Subject Projection interface.",
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/sso-api/src/routes/sso", "apps/sso-api/src/use-cases/sso"],
    targets: [
      { kind: "prefix", module: "@iam/session-kernel" },
      { kind: "prefix", module: "packages/custom-sso/src/internal" },
      { kind: "exact", module: "apps/sso-api/src/lib/infra/redis" },
      { kind: "prefix", module: "apps/sso-api/src/lib/integrations" },
    ],
    message: (moduleSpecifier) =>
      `Custom SSO routes and use cases must not import session runtime module "${moduleSpecifier}"; ` +
      "depend on their injected application interface.",
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["packages/custom-sso/src"],
    targets: [
      { kind: "prefix", module: "apps" },
      { kind: "package", module: "@iam/db" },
      { kind: "package", module: "hono" },
    ],
    allowedSources: ["packages/custom-sso/src/wire.ts"],
    message: (moduleSpecifier) =>
      `Custom SSO application must not import app provider or HTTP module "${moduleSpecifier}"; ` +
      "declare its outbound capability locally and inject it from composition.",
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/admin-api/src/services/user", "apps/admin-api/src/services/client"],
    targets: [
      { kind: "prefix", module: "@iam/session-kernel" },
      { kind: "exact", module: "apps/admin-api/src/lib/infra/redis" },
    ],
    message: (moduleSpecifier) =>
      `Admin user and client services must not import session runtime module "${moduleSpecifier}"; ` +
      "depend on the consumer-owned Session Revocation port.",
  },
  {
    ruleId: "role-resolution-owner",
    sourceScopes: ["apps", "packages"],
    targets: [{ kind: "specifier", module: "@iam/db/schema/role-assignments" }],
    allowedSources: [
      "packages/assignment-resolution/src/role-assignment/internal/resolver.ts",
      "apps/admin-api/src/services/role/role.repository.ts",
      "apps/ops/src/commands/initialization/initialization-source.ts",
    ],
    message: (moduleSpecifier, declaration) =>
      "Only Role Assignment Resolver, Admin Role Management and formal initialization source owners " +
      `may ${dependencyOperation(declaration)} dedicated Role Assignment schema entry "${moduleSpecifier}".`,
  },
  {
    ruleId: "role-resolution-owner",
    sourceScopes: ["apps", "packages"],
    dependencyKind: "value",
    targets: [{ kind: "specifier", module: "@iam/assignment-resolution/role-assignment" }],
    allowedSources: [
      "apps/integration-api/src/composition",
      "apps/admin-api/src/composition",
      "apps/worker/src/composition",
      "packages/documents/src/user/invalidation/user-document-source.ts",
      "packages/documents/src/user/worker/user-document-projection.ts",
    ],
    message: (moduleSpecifier, declaration) =>
      "Only declared composition and User Document module owners may " +
      `${valueDependencyOperation(declaration)} Role Assignment Resolver module "${moduleSpecifier}".`,
  },
  {
    ruleId: "user-document-owner",
    sourceScopes: ["apps", "packages"],
    targets: [{ kind: "specifier", module: "@iam/documents/user/producer" }],
    allowedSources: [
      "packages/documents/src/user",
      "apps/auth-api/src/composition",
      "apps/integration-api/src/composition",
      "apps/admin-api/src/composition",
    ],
    message: (moduleSpecifier, declaration) =>
      `Only Auth API, Integration API and Admin API composition owners may ${dependencyOperation(declaration)} ` +
      `User Document producer entry "${moduleSpecifier}".`,
  },
  {
    ruleId: "user-document-owner",
    sourceScopes: ["apps", "packages"],
    targets: [{ kind: "specifier", module: "@iam/documents/user/worker" }],
    allowedSources: [
      "packages/documents/src/user",
      "packages/jobs/src/documents/user/worker-module.ts",
      "apps/worker/src/composition",
    ],
    message: (moduleSpecifier, declaration) =>
      `Only Worker composition may ${dependencyOperation(declaration)} User Document worker entry "${moduleSpecifier}".`,
  },
  {
    ruleId: "user-document-owner",
    sourceScopes: ["apps", "packages"],
    targets: [{ kind: "specifier", module: "@iam/documents/user/query/repository" }],
    allowedSources: ["apps/auth-api/src/composition"],
    message: (moduleSpecifier, declaration) =>
      `Only Auth API composition may ${dependencyOperation(declaration)} ` +
      `User Document query repository entry "${moduleSpecifier}".`,
  },
  {
    ruleId: "ops-ownership",
    sourceScopes: ["apps/ops/src"],
    targets: [{ kind: "prefix", module: "apps" }],
    allowedTargets: [{ kind: "prefix", module: "apps/ops/src" }],
    message: (moduleSpecifier, declaration) =>
      `Ops production sources must not ${dependencyOperation(declaration)} another app's private module "${moduleSpecifier}"; depend on a public workspace package.`,
  },
];

function createStaticModuleOwnershipRules(
  publicApiApps: readonly WorkspaceNode[],
  canonicalStaticSourceRoots: ReadonlyMap<string, string>,
): readonly StaticModuleOwnershipRule[] {
  const publicApiRules = publicApiApps.flatMap(({ directory, name }): StaticModuleOwnershipRule[] => {
    const forbidden = name && publicApiForbiddenPackages.get(name);
    if (!forbidden) return [];
    const app = posix.basename(directory);
    return [
      {
        ruleId: publicApiDependencyRuleId,
        sourceScopes: [`${directory}/src`],
        targets: forbidden.flatMap((module): StaticModulePattern[] => {
          const sourceRoot = canonicalStaticSourceRoots.get(module);
          return sourceRoot
            ? [
                { kind: "package", module },
                { kind: "prefix", module: sourceRoot },
              ]
            : [{ kind: "package", module }];
        }),
        message: (moduleSpecifier, declaration) =>
          `${app} must not ${dependencyOperation(declaration)} "${moduleSpecifier}"; this dependency belongs to another runtime.`,
      },
    ];
  });
  return [
    ...publicApiRules,
    ...staticModuleOwnershipRules,
    {
      ruleId: "worker-ownership",
      sourceScopes: ["apps/worker/src"],
      targets: [
        ...publicApiApps.map(({ directory }): StaticModulePattern => ({ kind: "prefix", module: `${directory}/src` })),
        { kind: "prefix", module: "apps/ops/src" },
      ],
      message: (moduleSpecifier, declaration) =>
        `Worker production sources must not ${dependencyOperation(declaration)} ` +
        `API/Ops-private module "${moduleSpecifier}"; depend on a public workspace package.`,
    },
  ];
}

export function analyzeRepositoryArchitecture(repoRoot: string): readonly ArchitectureViolation[] {
  const graph = collectWorkspaceGraph(repoRoot);
  if (graph.invalidManifests.size > 0) {
    throw new Error(`Invalid workspace manifests: ${[...graph.invalidManifests].join(", ")}`);
  }
  const workspaces = [...graph.byManifestPath.values()];
  const publicApiApps = selectWorkspaces(graph, { tier: "public-api" }).filter(isApplicationWorkspace);
  const layeredBackendSourceRoots = selectWorkspaces(graph, { tier: "layered-backend" })
    .filter(isApplicationWorkspace)
    .map(({ directory }) => `${directory}/src`);
  const canonicalStaticSourceRoots = new Map<string, string>();
  for (const { directory, name, iamWorkspace } of workspaces) {
    if (name && iamWorkspace?.kind !== "e2e") canonicalStaticSourceRoots.set(name, `${directory}/src`);
  }
  const protectedSourceRoots = workspaces
    .filter((workspace) => {
      const kind = workspace.iamWorkspace?.kind;
      if (kind === "e2e") return false;
      return isProtectedSharedPackage(workspace) || (isApplicationWorkspace(workspace) && kind !== "frontend");
    })
    .map(({ directory }) => `${directory}/src`);
  const sources = loadSourceSnapshot(repoRoot, protectedSourceRoots);
  return [
    ...collectConsumerOwnedPortViolations(sources),
    ...collectDependencyDirectionViolations(sources, layeredBackendSourceRoots),
    ...collectStaticModuleOwnershipViolations(
      sources,
      createStaticModuleOwnershipRules(publicApiApps, canonicalStaticSourceRoots),
      canonicalStaticSourceRoots,
      layeredBackendSourceRoots,
    ),
    ...collectPublicApiProductionDependencyViolations(graph, publicApiApps),
    ...collectDockerBuildClosureViolations(repoRoot, graph),
  ].sort(compareViolations);
}

function isApplicationWorkspace({ directory }: WorkspaceNode) {
  return directory.startsWith("apps/");
}

function isProtectedSharedPackage({ directory, iamWorkspace }: WorkspaceNode) {
  return directory.startsWith("packages/") && iamWorkspace?.kind !== "test-support";
}

function loadSourceSnapshot(repoRoot: string, protectedSourceRoots: readonly string[]): readonly IndexedSourceFile[] {
  const sourceFiles = protectedSourceRoots
    .flatMap((sourceRoot) => collectProductionTypeScriptFiles(join(repoRoot, ...sourceRoot.split("/"))))
    .sort(compareText);

  return sourceFiles.map((absoluteFile) => {
    const file = toPosixPath(relative(repoRoot, absoluteFile));
    const content = readFileSync(absoluteFile, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      absoluteFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    return indexSourceFile(file, sourceFile);
  });
}

function collectProductionTypeScriptFiles(root: string): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  visit(root);
  return files;

  function visit(directory: string) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      compareText(left.name, right.name),
    );

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludedSourceDirectories.has(entry.name)) visit(absolutePath);
        continue;
      }
      if (entry.isFile() && isProductionTypeScriptFile(entry.name)) files.push(absolutePath);
    }
  }
}

function isProductionTypeScriptFile(file: string) {
  return /\.(?:ts|tsx|mts)$/u.test(file) && !/\.(?:spec|test)\.(?:ts|tsx|mts)$/u.test(file);
}

function indexSourceFile(file: string, sourceFile: ts.SourceFile): IndexedSourceFile {
  const dependencies: StaticDependency[] = [];
  const typeReferences: ts.TypeReferenceNode[] = [];

  visit(sourceFile);
  return {
    file,
    sourceFile,
    dependencies,
    typeReferences,
  };

  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      dependencies.push({ declaration: node, moduleSpecifier: node.moduleSpecifier.text });
    }
    if (ts.isTypeReferenceNode(node)) typeReferences.push(node);
    ts.forEachChild(node, visit);
  }
}

function collectConsumerOwnedPortViolations(sources: readonly IndexedSourceFile[]): ArchitectureViolation[] {
  return sources
    .filter((source) => source.file.endsWith(".port.ts"))
    .flatMap((source) => {
      const importViolations = source.dependencies.flatMap(
        ({ declaration, moduleSpecifier }): ArchitectureViolation[] => {
          if (!ts.isImportDeclaration(declaration) || !isConcreteRepositoryModule(moduleSpecifier)) return [];
          return [
            {
              ruleId: "consumer-owned-port",
              file: source.file,
              line: lineOf(source.sourceFile, declaration),
              message:
                `Consumer-owned ports must not import concrete repository module "${moduleSpecifier}"; ` +
                "declare the required protocol locally.",
            },
          ];
        },
      );
      const pickViolations = source.typeReferences.flatMap((reference): ArchitectureViolation[] => {
        if (reference.typeName.getText(source.sourceFile) !== "Pick") return [];
        const providerType = reference.typeArguments?.[0];
        if (!providerType) return [];
        const providerTypeName = referencedTypeName(providerType, source.sourceFile);
        if (!/(?:Repository|Service)$/u.test(providerTypeName)) return [];
        return [
          {
            ruleId: "consumer-owned-port",
            file: source.file,
            line: lineOf(source.sourceFile, reference),
            message:
              `Consumer-owned ports must not derive their interface from provider type "${providerTypeName}" with Pick; ` +
              "declare the required members directly.",
          },
        ];
      });

      return [...importViolations, ...pickViolations];
    });
}

function collectDependencyDirectionViolations(
  sources: readonly IndexedSourceFile[],
  layeredBackendSourceRoots: readonly string[],
): ArchitectureViolation[] {
  return sources.flatMap((source) => {
    const sourceRoot = layeredBackendSourceRoots.find((root) => isPathAtOrBelow(source.file, root));
    if (!sourceRoot && !isPathAtOrBelow(source.file, "apps/gateway/src")) return [];
    return collectSourceDependencyDirectionViolations(source, sourceRoot, layeredBackendSourceRoots);
  });
}

function collectStaticModuleOwnershipViolations(
  sources: readonly IndexedSourceFile[],
  rules: readonly StaticModuleOwnershipRule[],
  canonicalStaticSourceRoots: ReadonlyMap<string, string>,
  layeredBackendSourceRoots: readonly string[],
): ArchitectureViolation[] {
  return sources.flatMap((source) => {
    const applicableRules = rules.filter(
      (rule) =>
        rule.sourceScopes.some((scope) => isPathAtOrBelow(source.file, scope)) &&
        !rule.allowedSources?.some((owner) => isPathAtOrBelow(source.file, owner)),
    );
    if (applicableRules.length === 0) return [];

    return source.dependencies.flatMap(({ declaration, moduleSpecifier }) => {
      const normalizedSpecifier = normalizeStaticModulePath(moduleSpecifier);
      const normalizedTargets = normalizeStaticModuleEdges(
        source.file,
        normalizedSpecifier,
        canonicalStaticSourceRoots,
        layeredBackendSourceRoots,
      );
      const matchesTarget = (pattern: StaticModulePattern) =>
        pattern.kind === "specifier"
          ? normalizedSpecifier === pattern.module
          : normalizedTargets.some((target) => matchesStaticModulePattern(target, pattern));
      return applicableRules.flatMap((rule): ArchitectureViolation[] => {
        if (rule.dependencyKind === "value" && !hasValueDependency(declaration)) return [];
        if (!rule.targets.some(matchesTarget) || rule.allowedTargets?.some(matchesTarget)) return [];
        return [
          {
            ruleId: rule.ruleId,
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message: rule.message(moduleSpecifier, declaration),
          },
        ];
      });
    });
  });
}

function collectSourceDependencyDirectionViolations(
  source: IndexedSourceFile,
  sourceRoot: string | undefined,
  layeredBackendSourceRoots: readonly string[],
): ArchitectureViolation[] {
  const isCompositionOwner = sourceRoot && isPathAtOrBelow(source.file, `${sourceRoot}/composition`);
  const isRepositoryImplementation =
    sourceRoot && source.file.startsWith(`${sourceRoot}/services/`) && source.file.endsWith(".repository.ts");
  return source.dependencies.flatMap(({ declaration, moduleSpecifier }): ArchitectureViolation[] => {
    const normalizedSpecifier = normalizeStaticModulePath(moduleSpecifier);
    const aliasedModule = resolveAliasedAppModule(normalizedSpecifier, layeredBackendSourceRoots);
    if (
      moduleSpecifier === "@iam/db" &&
      hasValueDependency(declaration) &&
      !isCompositionOwner &&
      !isRepositoryImplementation
    ) {
      return [
        {
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message:
            `Production modules must not ${valueDependencyOperation(declaration)} ` +
            `database singleton "${moduleSpecifier}"; ` +
            "only composition and repository implementations own database wiring.",
        },
      ];
    }
    if (source.file.includes("/src/services/") && isApplicationUseCaseModule(normalizedSpecifier, aliasedModule)) {
      return [
        {
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message:
            `Service modules must not ${dependencyOperation(declaration)} ` +
            `application use case "${moduleSpecifier}"; ` +
            "use cases may depend on services, not the reverse.",
        },
      ];
    }
    if (source.file.includes("/src/routes/") || source.file.startsWith("apps/gateway/src/http/")) {
      if (matchesStaticModulePattern(moduleSpecifier, { kind: "package", module: "@iam/unit-of-work" })) {
        return [
          {
            ruleId: "dependency-direction",
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message:
              `Route modules must not ${dependencyOperation(declaration)} ` +
              `UnitOfWork from "${moduleSpecifier}"; ` +
              "delegate transaction workflows to an injected use case or service facade.",
          },
        ];
      }
      if (isAppLocalRepositoryModule(normalizedSpecifier, aliasedModule)) {
        return [
          {
            ruleId: "dependency-direction",
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message:
              `Route modules must not ${dependencyOperation(declaration)} ` +
              `app-local repository "${moduleSpecifier}"; ` +
              "depend on an injected use case or service facade.",
          },
        ];
      }
    }
    if (!hasValueDependency(declaration)) return [];
    const appLocalModule = resolveAppLocalModule(source.file, moduleSpecifier, sourceRoot, aliasedModule);
    if (appLocalModule === "lib/infra/redis") {
      if (isCompositionOwner || source.file.startsWith(`${sourceRoot}/lib/infra/`)) return [];
      return [
        {
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message:
            `Production modules must not ${valueDependencyOperation(declaration)} ` +
            `app Redis singleton "${moduleSpecifier}"; ` +
            "only composition and Redis infrastructure owners may wire it.",
        },
      ];
    }
    if (appLocalModule === "lib/logger") {
      if (
        isCompositionOwner ||
        source.file === `${sourceRoot}/app.ts` ||
        source.file === `${sourceRoot}/lib/logger.ts` ||
        isPathAtOrBelow(source.file, `${sourceRoot}/lib/logger`)
      ) {
        return [];
      }
      return [
        {
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message:
            `Production modules must not ${valueDependencyOperation(declaration)} ` +
            `app logger singleton "${moduleSpecifier}"; ` +
            "only composition, app assembly, and infrastructure owners may wire it.",
        },
      ];
    }
    if (isConcreteProviderModule(appLocalModule) || isConcreteProviderModule(aliasedModule?.path)) {
      if (isCompositionOwner) return [];
      return [
        {
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message:
            `Production modules must not ${valueDependencyOperation(declaration)} ` +
            `concrete provider "${moduleSpecifier}"; ` +
            "only composition owners may wire concrete providers.",
        },
      ];
    }
    return [];
  });
}

function collectPublicApiProductionDependencyViolations(
  graph: WorkspaceGraph,
  publicApiApps: readonly WorkspaceNode[],
): ArchitectureViolation[] {
  return publicApiApps.flatMap((app) => {
    const appName = app.name;
    if (!appName) return [];
    const forbiddenPackages = publicApiForbiddenPackages.get(appName);
    if (!forbiddenPackages) return [];
    const forbidden = new Set(forbiddenPackages);
    const visited = new Set([appName]);
    // Keep the dependency chain for diagnostics, including forbidden packages outside the workspace.
    const pending = [{ name: appName, path: [appName] }];
    const violations: ArchitectureViolation[] = [];

    const reported = new Set<string>();
    for (const { name, path } of pending) {
      for (const [dependency, version] of graph.byName.get(name)?.productionDependencies ?? []) {
        const target = /^(?:npm|workspace):((?:@[^/]+\/)?[^@/:]+)@/u.exec(version)?.[1] ?? dependency;
        const forbiddenName = forbidden.has(dependency) ? dependency : target;
        if (forbidden.has(forbiddenName)) {
          if (!reported.has(forbiddenName)) {
            reported.add(forbiddenName);
            violations.push({
              ruleId: publicApiDependencyRuleId,
              file: app.manifestPath,
              line: 1,
              message: `Forbidden production dependency: ${[...path, forbiddenName].join(" -> ")}.`,
            });
          }
        } else if (!visited.has(target) && graph.byName.has(target)) {
          visited.add(target);
          pending.push({ name: target, path: [...path, target] });
        }
      }
    }
    return violations;
  });
}

function collectDockerBuildClosureViolations(repoRoot: string, graph: WorkspaceGraph): ArchitectureViolation[] {
  const protectedManifests = new Set(
    [...graph.byManifestPath.values()].filter(isProtectedSharedPackage).map(({ manifestPath }) => manifestPath),
  );

  return [...graph.byManifestPath.values()].filter(isApplicationWorkspace).flatMap((app) => {
    const file = `${app.directory}/Dockerfile`;
    const dockerFile = join(repoRoot, file);
    if (!existsSync(dockerFile)) return [];

    const copySources = collectDockerCopySources(readFileSync(dockerFile, "utf8"));
    const copiedManifests = [...copySources].filter((source) => graph.byManifestPath.has(source));
    const closure = expandWorkspaceClosure(graph, [app.manifestPath, ...copiedManifests]);
    const imageName = app.name ?? `@iam/${posix.basename(app.directory)}`;

    return [...closure].flatMap((manifestPath): ArchitectureViolation[] => {
      const workspace = graph.byManifestPath.get(manifestPath);
      if (!workspace) return [];
      const workspaceName = workspace.name ?? workspace.directory;
      const isImageApp = manifestPath === app.manifestPath;

      if (isImageApp || protectedManifests.has(manifestPath)) {
        const directorySource = `${workspace.directory}/`;
        const requiredSources = [manifestPath];
        if (!isImageApp || !copySources.has(`${directorySource}src/`)) requiredSources.push(directorySource);

        return requiredSources
          .filter((source) => !copySources.has(source))
          .map((source) => ({
            ruleId: "docker-build-closure",
            file,
            line: 1,
            message: `Docker image ${imageName} consumes ${workspaceName} but does not COPY "${source}" from the workspace.`,
          }));
      }

      if (copySources.has(manifestPath)) return [];
      const dependencies = expandWorkspaceClosure(graph, [manifestPath]);
      if (![...dependencies].some((dependency) => protectedManifests.has(dependency))) return [];
      return [
        {
          ruleId: "docker-build-closure",
          file,
          line: 1,
          message:
            `Docker image ${imageName} reaches protected architecture workspaces through ${workspaceName} ` +
            `but does not COPY "${manifestPath}" from the workspace.`,
        },
      ];
    });
  });
}

function collectDockerCopySources(content: string) {
  return new Set(
    content.split(/\r?\n/u).flatMap((line) => {
      const match = /^\s*COPY\s+(\S+)\s+\S+\s*$/u.exec(line);
      const source = match?.[1]?.replace(/^\.\//u, "");
      return source ? [source] : [];
    }),
  );
}

function hasValueDependency(declaration: StaticDependencyDeclaration) {
  if (ts.isExportDeclaration(declaration)) {
    if (declaration.isTypeOnly) return false;
    if (!declaration.exportClause || !ts.isNamedExports(declaration.exportClause)) return true;
    return declaration.exportClause.elements.some((element) => !element.isTypeOnly);
  }
  const clause = declaration.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name) return true;
  if (!clause.namedBindings) return false;
  if (ts.isNamespaceImport(clause.namedBindings)) return true;
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function dependencyOperation(declaration: StaticDependencyDeclaration) {
  return ts.isImportDeclaration(declaration) ? "import" : "re-export";
}

function valueDependencyOperation(declaration: StaticDependencyDeclaration) {
  return ts.isImportDeclaration(declaration) ? "value-import" : "value-re-export";
}

type AliasedAppModule = Readonly<{ sourceRoot: string; path: string }>;

function isConcreteProviderModule(path: string | undefined) {
  return /^(?:routes|services)\/.+\.(?:repository|service)$/u.test(path ?? "");
}

function isApplicationUseCaseModule(normalizedModule: string, aliasedModule: AliasedAppModule | undefined) {
  return (
    aliasedModule?.path === "use-cases" ||
    aliasedModule?.path.startsWith("use-cases/") === true ||
    (normalizedModule.startsWith(".") && normalizedModule.split("/").includes("use-cases"))
  );
}

function resolveAppLocalModule(
  sourceFile: string,
  moduleSpecifier: string,
  sourceRoot: string | undefined,
  aliasedModule: AliasedAppModule | undefined,
) {
  if (!sourceRoot) return undefined;
  if (aliasedModule?.sourceRoot === sourceRoot) return aliasedModule.path;
  if (!moduleSpecifier.startsWith(".")) return undefined;
  const appRelativeFile = sourceFile.slice(sourceRoot.length + 1);
  return normalizeStaticModulePath(posix.normalize(posix.join(posix.dirname(appRelativeFile), moduleSpecifier)));
}

function isAppLocalRepositoryModule(normalizedModule: string, aliasedModule: AliasedAppModule | undefined) {
  return normalizedModule.endsWith(".repository") && (normalizedModule.startsWith(".") || aliasedModule !== undefined);
}

function resolveAliasedAppModule(
  normalizedModule: string,
  layeredBackendSourceRoots: readonly string[],
): AliasedAppModule | undefined {
  for (const sourceRoot of layeredBackendSourceRoots) {
    const app = posix.basename(posix.dirname(sourceRoot));
    for (const prefix of [`@${app}`, `~${app}/src`]) {
      if (normalizedModule === prefix) return { sourceRoot, path: "" };
      if (normalizedModule.startsWith(`${prefix}/`)) {
        return { sourceRoot, path: normalizedModule.slice(prefix.length + 1) };
      }
    }
  }
  return undefined;
}

function normalizeStaticModulePath(modulePath: string) {
  const withoutExtension = modulePath.replace(/\.[jt]sx?$/u, "");
  return withoutExtension.endsWith("/index") ? withoutExtension.slice(0, -"/index".length) : withoutExtension;
}

function normalizeStaticModuleEdges(
  sourceFile: string,
  normalizedModule: string,
  canonicalStaticSourceRoots: ReadonlyMap<string, string>,
  layeredBackendSourceRoots: readonly string[],
) {
  const normalizedTargets = new Set([normalizedModule]);
  const canonicalSourceModule = resolveCanonicalStaticSourceModule(normalizedModule, canonicalStaticSourceRoots);
  if (canonicalSourceModule) normalizedTargets.add(canonicalSourceModule);
  const aliasedModule = resolveAliasedAppModule(normalizedModule, layeredBackendSourceRoots);
  if (aliasedModule) {
    normalizedTargets.add(normalizeStaticModulePath(posix.join(aliasedModule.sourceRoot, aliasedModule.path)));
  } else if (normalizedModule.startsWith(".")) {
    normalizedTargets.add(
      normalizeStaticModulePath(posix.normalize(posix.join(posix.dirname(sourceFile), normalizedModule))),
    );
  }
  return [...normalizedTargets];
}

function resolveCanonicalStaticSourceModule(
  modulePath: string,
  canonicalStaticSourceRoots: ReadonlyMap<string, string>,
) {
  for (const [packageName, sourceRoot] of canonicalStaticSourceRoots) {
    if (modulePath === packageName) return sourceRoot;
    if (modulePath.startsWith(`${packageName}/`))
      return posix.join(sourceRoot, modulePath.slice(packageName.length + 1));
  }
  return undefined;
}

function matchesStaticModulePattern(modulePath: string, pattern: StaticModulePattern) {
  return pattern.kind === "exact" ? modulePath === pattern.module : isPathAtOrBelow(modulePath, pattern.module);
}

function isPathAtOrBelow(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function referencedTypeName(type: ts.TypeNode, sourceFile: ts.SourceFile) {
  if (ts.isTypeReferenceNode(type)) return type.typeName.getText(sourceFile);
  return type.getText(sourceFile);
}

function isConcreteRepositoryModule(moduleSpecifier: string) {
  return (
    moduleSpecifier.endsWith(".repository") ||
    moduleSpecifier.endsWith(".repository.ts") ||
    moduleSpecifier.split("/").includes("repositories")
  );
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function compareViolations(left: ArchitectureViolation, right: ArchitectureViolation) {
  return (
    compareText(left.ruleId, right.ruleId) ||
    compareText(left.file, right.file) ||
    left.line - right.line ||
    compareText(left.message, right.message)
  );
}

function compareText(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}
