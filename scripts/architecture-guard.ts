import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import ts from "typescript";

export type ArchitectureViolation = Readonly<{
  ruleId: string;
  file: string;
  line: number;
  message: string;
}>;

type IndexedSourceFile = Readonly<{
  file: string;
  sourceFile: ts.SourceFile;
  imports: readonly ts.ImportDeclaration[];
  reExports: readonly ts.ExportDeclaration[];
  typeReferences: readonly ts.TypeReferenceNode[];
}>;

type StaticDependencyDeclaration = ts.ImportDeclaration | ts.ExportDeclaration;

type StaticModulePattern = Readonly<
  | { kind: "exact"; module: string }
  | { kind: "prefix"; module: string }
  | { kind: "suffix"; module: string }
  | { kind: "prefix-suffix"; prefix: string; suffix: string }
>;

type StaticSourcePattern = string | Readonly<{
  prefix: string;
  suffix: string;
}>;

type StaticModuleOwnershipRule = Readonly<{
  ruleId: "session-runtime-owner" | "worker-ownership";
  sourceScopes: readonly StaticSourcePattern[];
  targets: readonly StaticModulePattern[];
  allowedSources: readonly StaticSourcePattern[];
  dependencyKind: "all" | "value";
  message: (moduleSpecifier: string, declaration: StaticDependencyDeclaration) => string;
}>;

const protectedSourceRoots = [
  "apps/api/src",
  "apps/admin-api/src",
  "apps/oidc-provider/src",
  "apps/worker/src",
  "packages/role-assignment-resolution/src",
  "packages/user-profile-read-model/src",
] as const;

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

const backendDockerApps = ["api", "admin-api", "oidc-provider", "worker"] as const;

const architectureWorkspaceRoots = new Map([
  ["@iam/role-assignment-resolution", "packages/role-assignment-resolution"],
  ["@iam/user-profile-read-model", "packages/user-profile-read-model"],
]);

const staticModuleOwnershipRules: readonly StaticModuleOwnershipRule[] = [
  {
    ruleId: "session-runtime-owner",
    sourceScopes: [
      "apps/api/src/routes/sso",
      "apps/api/src/use-cases/sso",
      "apps/api/src/composition",
    ],
    targets: [
      { kind: "prefix", module: "@iam/api-core/session" },
      { kind: "exact", module: "apps/api/src/services/session/custom-sso-session-kernel.adapter" },
      { kind: "exact", module: "apps/api/src/lib/infra/redis" },
      { kind: "prefix", module: "apps/api/src/lib/integrations" },
    ],
    allowedSources: ["apps/api/src/composition"],
    dependencyKind: "all",
    message: moduleSpecifier =>
      `Custom SSO routes and use cases must not import session runtime module "${moduleSpecifier}"; `
      + "depend on their injected application interface.",
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: [
      "apps/admin-api/src/services/user",
      "apps/admin-api/src/services/client",
      "apps/admin-api/src/services/session-revocation",
      "apps/admin-api/src/composition",
    ],
    targets: [
      { kind: "exact", module: "@iam/api-core/oidc" },
      { kind: "prefix", module: "@iam/api-core/session/kernel" },
      { kind: "suffix", module: "custom-sso-session-kernel.adapter" },
      { kind: "suffix", module: "oidc-session-kernel.adapter" },
      { kind: "exact", module: "apps/admin-api/src/lib/infra/redis" },
    ],
    allowedSources: [
      "apps/admin-api/src/services/session-revocation",
      "apps/admin-api/src/composition",
    ],
    dependencyKind: "all",
    message: moduleSpecifier =>
      `Admin user and client services must not import session runtime module "${moduleSpecifier}"; `
      + "depend on the consumer-owned Session Revocation port.",
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [
      { kind: "exact", module: "@iam/db" },
      { kind: "exact", module: "apps/oidc-provider/src/lib/redis" },
      { kind: "exact", module: "apps/oidc-provider/src/lib/logger" },
    ],
    allowedSources: ["apps/oidc-provider/src/composition"],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only OIDC composition may ${valueDependencyOperation(declaration)} `
      + `runtime infrastructure module "${moduleSpecifier}".`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [{ kind: "exact", module: "@iam/db/schema" }],
    allowedSources: [{
      prefix: "apps/oidc-provider/src/repositories",
      suffix: ".repository.ts",
    }],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only OIDC repository implementations may ${valueDependencyOperation(declaration)} `
      + `database schema "${moduleSpecifier}".`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [{ kind: "exact", module: "ioredis" }],
    allowedSources: [
      "apps/oidc-provider/src/stores",
      "apps/oidc-provider/src/storage",
    ],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only OIDC stores and storage modules may ${valueDependencyOperation(declaration)} `
      + `Redis client "${moduleSpecifier}".`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [{
      kind: "prefix-suffix",
      prefix: "apps/oidc-provider/src/repositories",
      suffix: ".repository",
    }],
    allowedSources: ["apps/oidc-provider/src/composition/repositories"],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only OIDC repository composition may ${valueDependencyOperation(declaration)} `
      + `concrete repository "${moduleSpecifier}".`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [{ kind: "exact", module: "apps/oidc-provider/src/storage/redis-adapter" }],
    allowedSources: [
      "apps/oidc-provider/src/composition/provider",
      "apps/oidc-provider/src/composition/stores",
    ],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only declared OIDC storage composition owners may ${valueDependencyOperation(declaration)} `
      + `storage implementation "${moduleSpecifier}".`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [
      { kind: "exact", module: "apps/oidc-provider/src/security/client-auth-rate-limit" },
      { kind: "exact", module: "apps/oidc-provider/src/security/client-secret-verifier" },
    ],
    allowedSources: ["apps/oidc-provider/src/composition/security"],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only OIDC security composition may ${valueDependencyOperation(declaration)} `
      + `security implementation "${moduleSpecifier}".`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [{ kind: "exact", module: "@iam/api-core/session/kernel" }],
    allowedSources: [
      "apps/oidc-provider/src/composition/session",
      "apps/oidc-provider/src/session/oidc-session-kernel.adapter.ts",
    ],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only OIDC session composition and its Kernel adapter may ${valueDependencyOperation(declaration)} `
      + `Session Kernel module "${moduleSpecifier}".`,
  },
  {
    ruleId: "session-runtime-owner",
    sourceScopes: ["apps/oidc-provider/src"],
    targets: [{
      kind: "exact",
      module: "apps/oidc-provider/src/session/oidc-session-kernel.adapter",
    }],
    allowedSources: ["apps/oidc-provider/src/composition/session"],
    dependencyKind: "value",
    message: (moduleSpecifier, declaration) =>
      `Only OIDC session composition may ${valueDependencyOperation(declaration)} `
      + `session implementation "${moduleSpecifier}".`,
  },
  {
    ruleId: "worker-ownership",
    sourceScopes: ["apps/worker/src"],
    targets: [{ kind: "prefix", module: "apps/api/src" }],
    allowedSources: [],
    dependencyKind: "all",
    message: (moduleSpecifier, declaration) =>
      `Worker production sources must not ${dependencyOperation(declaration)} `
      + `API-private module "${moduleSpecifier}"; depend on a public workspace package.`,
  },
];

export function analyzeRepositoryArchitecture(repoRoot: string): readonly ArchitectureViolation[] {
  const sources = loadSourceSnapshot(repoRoot);
  return [
    ...collectConsumerOwnedPortViolations(sources),
    ...collectDependencyDirectionViolations(sources),
    ...collectRoleResolutionOwnerViolations(sources),
    ...collectUserProfileOwnerViolations(sources),
    ...collectStaticModuleOwnershipViolations(sources),
    ...collectDockerBuildClosureViolations(repoRoot),
  ].sort(compareViolations);
}

function loadSourceSnapshot(repoRoot: string): readonly IndexedSourceFile[] {
  const sourceFiles = protectedSourceRoots
    .flatMap(sourceRoot => collectProductionTypeScriptFiles(join(repoRoot, ...sourceRoot.split("/"))))
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
  if (!existsSync(root))
    return [];

  const files: string[] = [];
  visit(root);
  return files;

  function visit(directory: string) {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));

    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludedSourceDirectories.has(entry.name))
          visit(absolutePath);
        continue;
      }
      if (entry.isFile() && isProductionTypeScriptFile(entry.name))
        files.push(absolutePath);
    }
  }
}

function isProductionTypeScriptFile(file: string) {
  return /\.(?:ts|tsx)$/u.test(file)
    && !/\.(?:spec|test)\.(?:ts|tsx)$/u.test(file);
}

function indexSourceFile(file: string, sourceFile: ts.SourceFile): IndexedSourceFile {
  const imports: ts.ImportDeclaration[] = [];
  const reExports: ts.ExportDeclaration[] = [];
  const typeReferences: ts.TypeReferenceNode[] = [];

  visit(sourceFile);
  return {
    file,
    sourceFile,
    imports,
    reExports,
    typeReferences,
  };

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node))
      imports.push(node);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier)
      reExports.push(node);
    if (ts.isTypeReferenceNode(node))
      typeReferences.push(node);
    ts.forEachChild(node, visit);
  }
}

function collectConsumerOwnedPortViolations(
  sources: readonly IndexedSourceFile[],
): ArchitectureViolation[] {
  return sources
    .filter(source => source.file.endsWith(".port.ts"))
    .flatMap((source) => {
      const importViolations = source.imports.flatMap((declaration): ArchitectureViolation[] => {
        if (!ts.isStringLiteral(declaration.moduleSpecifier))
          return [];
        const moduleSpecifier = declaration.moduleSpecifier.text;
        if (!isConcreteRepositoryModule(moduleSpecifier))
          return [];
        return [{
          ruleId: "consumer-owned-port",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Consumer-owned ports must not import concrete repository module "${moduleSpecifier}"; `
            + "declare the required protocol locally.",
        }];
      });
      const pickViolations = source.typeReferences.flatMap((reference): ArchitectureViolation[] => {
        if (reference.typeName.getText(source.sourceFile) !== "Pick")
          return [];
        const providerType = reference.typeArguments?.[0];
        if (!providerType)
          return [];
        const providerTypeName = referencedTypeName(providerType, source.sourceFile);
        if (!/(?:Repository|Service)$/u.test(providerTypeName))
          return [];
        return [{
          ruleId: "consumer-owned-port",
          file: source.file,
          line: lineOf(source.sourceFile, reference),
          message: `Consumer-owned ports must not derive their interface from provider type "${providerTypeName}" with Pick; `
            + "declare the required members directly.",
        }];
      });

      return [...importViolations, ...pickViolations];
    });
}

function collectRoleResolutionOwnerViolations(
  sources: readonly IndexedSourceFile[],
): ArchitectureViolation[] {
  return sources.flatMap((source) => {
    const dependencies = [...source.imports, ...source.reExports];
    const schemaViolations = isRoleAssignmentSchemaOwner(source.file)
      ? []
      : dependencies.flatMap((declaration): ArchitectureViolation[] => {
          if (!ts.isStringLiteral(declaration.moduleSpecifier))
            return [];
          const moduleSpecifier = declaration.moduleSpecifier.text;
          if (normalizeStaticModulePath(moduleSpecifier) !== "@iam/db/schema/role-assignments")
            return [];
          return [{
            ruleId: "role-resolution-owner",
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message: "Only Role Assignment Resolver implementation and the Admin Role Management repository "
              + `may ${dependencyOperation(declaration)} dedicated Role Assignment schema entry `
              + `"${moduleSpecifier}".`,
          }];
        });
    const resolverValueViolations = isRoleAssignmentResolverValueOwner(source.file)
      ? []
      : dependencies.flatMap((declaration): ArchitectureViolation[] => {
          if (!ts.isStringLiteral(declaration.moduleSpecifier))
            return [];
          const moduleSpecifier = declaration.moduleSpecifier.text;
          if (normalizeStaticModulePath(moduleSpecifier) !== "@iam/role-assignment-resolution"
            || !hasValueDependency(declaration)) {
            return [];
          }
          return [{
            ruleId: "role-resolution-owner",
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message: `Only declared composition and User Profile module owners may `
              + `${valueDependencyOperation(declaration)} Role Assignment Resolver package `
              + `"${moduleSpecifier}".`,
          }];
        });

    return [...schemaViolations, ...resolverValueViolations];
  });
}

function collectUserProfileOwnerViolations(
  sources: readonly IndexedSourceFile[],
): ArchitectureViolation[] {
  return sources.flatMap(source =>
    [...source.imports, ...source.reExports].flatMap((declaration): ArchitectureViolation[] => {
      if (!ts.isStringLiteral(declaration.moduleSpecifier))
        return [];
      const moduleSpecifier = declaration.moduleSpecifier.text;
      const normalizedModule = normalizeStaticModulePath(moduleSpecifier);
      if (normalizedModule === "@iam/user-profile-read-model/producer"
        && !isUserProfileProducerOwner(source.file)) {
        return [{
          ruleId: "user-profile-owner",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Only API and Admin API composition owners may ${dependencyOperation(declaration)} `
            + `User Profile producer entry "${moduleSpecifier}".`,
        }];
      }
      if (normalizedModule === "@iam/user-profile-read-model/worker"
        && !isUserProfileWorkerOwner(source.file)) {
        return [{
          ruleId: "user-profile-owner",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Only Worker composition may ${dependencyOperation(declaration)} `
            + `User Profile worker entry "${moduleSpecifier}".`,
        }];
      }
      if (normalizedModule === "@iam/user-profile-read-model/query/repository"
        && !isUserProfileQueryRepositoryOwner(source.file)) {
        return [{
          ruleId: "user-profile-owner",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Only API composition may ${dependencyOperation(declaration)} `
            + `User Profile query repository entry "${moduleSpecifier}".`,
        }];
      }
      return [];
    }),
  );
}

function collectDependencyDirectionViolations(
  sources: readonly IndexedSourceFile[],
): ArchitectureViolation[] {
  return sources
    .filter(source =>
      source.file.startsWith("apps/api/src/")
      || source.file.startsWith("apps/admin-api/src/"))
    .flatMap(collectSourceDependencyDirectionViolations);
}

function collectStaticModuleOwnershipViolations(
  sources: readonly IndexedSourceFile[],
): ArchitectureViolation[] {
  return sources.flatMap(source =>
    staticModuleOwnershipRules
      .filter(rule => rule.sourceScopes.some(scope => matchesStaticSourcePattern(source.file, scope)))
      .filter(rule => !rule.allowedSources.some(owner => matchesStaticSourcePattern(source.file, owner)))
      .flatMap(rule =>
        [...source.imports, ...source.reExports].flatMap((declaration): ArchitectureViolation[] => {
          if (!ts.isStringLiteral(declaration.moduleSpecifier))
            return [];
          if (rule.dependencyKind === "value" && !hasValueDependency(declaration))
            return [];
          const moduleSpecifier = declaration.moduleSpecifier.text;
          const normalizedTarget = normalizeStaticModuleEdge(source.file, moduleSpecifier);
          if (!rule.targets.some(pattern => matchesStaticModulePattern(normalizedTarget, pattern)))
            return [];
          return [{
            ruleId: rule.ruleId,
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message: rule.message(moduleSpecifier, declaration),
          }];
        })),
  );
}

function collectSourceDependencyDirectionViolations(
  source: IndexedSourceFile,
): ArchitectureViolation[] {
  return [...source.imports, ...source.reExports]
    .flatMap((declaration): ArchitectureViolation[] => {
      if (!ts.isStringLiteral(declaration.moduleSpecifier))
        return [];
      const moduleSpecifier = declaration.moduleSpecifier.text;
      if (moduleSpecifier === "@iam/db"
        && hasValueDependency(declaration)
        && !isCompositionOwner(source.file)
        && !isRepositoryImplementation(source.file)) {
        return [{
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Production modules must not ${valueDependencyOperation(declaration)} `
            + `database singleton "${moduleSpecifier}"; `
            + "only composition and repository implementations own database wiring.",
        }];
      }
      if (source.file.includes("/src/services/") && isApplicationUseCaseModule(moduleSpecifier)) {
        return [{
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Service modules must not ${dependencyOperation(declaration)} `
            + `application use case "${moduleSpecifier}"; `
            + "use cases may depend on services, not the reverse.",
        }];
      }
      if (source.file.includes("/src/routes/")) {
        if (moduleSpecifier === "@iam/api-core/uow") {
          return [{
            ruleId: "dependency-direction",
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message: `Route modules must not ${dependencyOperation(declaration)} `
              + `UnitOfWork from "${moduleSpecifier}"; `
              + "delegate transaction workflows to an injected use case or service facade.",
          }];
        }
        if (isAppLocalRepositoryModule(moduleSpecifier)) {
          return [{
            ruleId: "dependency-direction",
            file: source.file,
            line: lineOf(source.sourceFile, declaration),
            message: `Route modules must not ${dependencyOperation(declaration)} `
              + `app-local repository "${moduleSpecifier}"; `
              + "depend on an injected use case or service facade.",
          }];
        }
      }
      if (!hasValueDependency(declaration))
        return [];
      if (isAppRedisSingleton(source.file, moduleSpecifier)) {
        if (isCompositionOwner(source.file) || isRedisInfrastructureOwner(source.file))
          return [];
        return [{
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Production modules must not ${valueDependencyOperation(declaration)} `
            + `app Redis singleton "${moduleSpecifier}"; `
            + "only composition and Redis infrastructure owners may wire it.",
        }];
      }
      if (isAppLoggerSingleton(source.file, moduleSpecifier)) {
        if (isCompositionOwner(source.file)
          || isAppAssemblyOwner(source.file)
          || isLoggerInfrastructureOwner(source.file)) {
          return [];
        }
        return [{
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Production modules must not ${valueDependencyOperation(declaration)} `
            + `app logger singleton "${moduleSpecifier}"; `
            + "only composition, app assembly, and infrastructure owners may wire it.",
        }];
      }
      if (isConcreteProviderModule(source.file, moduleSpecifier)) {
        if (isCompositionOwner(source.file))
          return [];
        return [{
          ruleId: "dependency-direction",
          file: source.file,
          line: lineOf(source.sourceFile, declaration),
          message: `Production modules must not ${valueDependencyOperation(declaration)} `
            + `concrete provider "${moduleSpecifier}"; `
            + "only composition owners may wire concrete providers.",
        }];
      }
      return [];
    });
}

function collectDockerBuildClosureViolations(repoRoot: string): ArchitectureViolation[] {
  const workspaceDependencies = collectWorkspaceDependencyGraph(repoRoot);
  return backendDockerApps.flatMap((app) => {
    const packageFile = join(repoRoot, "apps", app, "package.json");
    const dockerFile = join(repoRoot, "apps", app, "Dockerfile");
    if (!existsSync(packageFile) || !existsSync(dockerFile))
      return [];

    const packageManifest = JSON.parse(readFileSync(packageFile, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
    };
    const copySources = collectDockerCopySources(readFileSync(dockerFile, "utf8"));
    const consumedWorkspaces = collectWorkspaceDependencyClosure(
      packageManifest.dependencies ?? {},
      workspaceDependencies,
    );
    return [...architectureWorkspaceRoots]
      .filter(([packageName]) => consumedWorkspaces.has(packageName))
      .flatMap(([packageName, packageRoot]): ArchitectureViolation[] =>
        [`${packageRoot}/package.json`, `${packageRoot}/`]
          .filter(requiredSource => !copySources.has(requiredSource))
          .map(requiredSource => ({
            ruleId: "docker-build-closure",
            file: `apps/${app}/Dockerfile`,
            line: 1,
            message: `Backend image ${packageManifest.name ?? `@iam/${app}`} consumes ${packageName} but does not COPY `
              + `"${requiredSource}" from the workspace.`,
          })));
  });
}

function collectWorkspaceDependencyGraph(repoRoot: string) {
  const workspaceRoots = ["apps", "packages"].flatMap((parent) => {
    const parentPath = join(repoRoot, parent);
    if (!existsSync(parentPath))
      return [];
    return readdirSync(parentPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `${parent}/${entry.name}`);
  });
  if (existsSync(join(repoRoot, "gateway", "package.json")))
    workspaceRoots.push("gateway");

  const graph = new Map<string, Record<string, string>>();
  for (const workspaceRoot of workspaceRoots.sort(compareText)) {
    const packageFile = join(repoRoot, ...workspaceRoot.split("/"), "package.json");
    if (!existsSync(packageFile))
      continue;
    const packageManifest = JSON.parse(readFileSync(packageFile, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
    };
    if (packageManifest.name)
      graph.set(packageManifest.name, packageManifest.dependencies ?? {});
  }
  return graph;
}

function collectWorkspaceDependencyClosure(
  dependencies: Record<string, string>,
  workspaceDependencies: ReadonlyMap<string, Record<string, string>>,
) {
  const consumedWorkspaces = new Set<string>();
  const pending = Object.keys(dependencies)
    .filter(packageName => workspaceDependencies.has(packageName));
  while (pending.length > 0) {
    const packageName = pending.shift()!;
    if (consumedWorkspaces.has(packageName))
      continue;
    consumedWorkspaces.add(packageName);
    for (const dependencyName of Object.keys(workspaceDependencies.get(packageName) ?? {})) {
      if (workspaceDependencies.has(dependencyName))
        pending.push(dependencyName);
    }
  }
  return consumedWorkspaces;
}

function collectDockerCopySources(content: string) {
  return new Set(content.split(/\r?\n/u).flatMap((line) => {
    const match = /^\s*COPY\s+(\S+)\s+\S+\s*$/u.exec(line);
    const source = match?.[1]?.replace(/^\.\//u, "");
    return source ? [source] : [];
  }));
}

function hasValueDependency(declaration: StaticDependencyDeclaration) {
  if (ts.isExportDeclaration(declaration)) {
    if (declaration.isTypeOnly)
      return false;
    if (!declaration.exportClause || !ts.isNamedExports(declaration.exportClause))
      return true;
    return declaration.exportClause.elements.some(element => !element.isTypeOnly);
  }
  const clause = declaration.importClause;
  if (!clause)
    return true;
  if (clause.isTypeOnly)
    return false;
  if (clause.name)
    return true;
  if (!clause.namedBindings)
    return false;
  if (ts.isNamespaceImport(clause.namedBindings))
    return true;
  return clause.namedBindings.elements.some(element => !element.isTypeOnly);
}

function dependencyOperation(declaration: StaticDependencyDeclaration) {
  return ts.isImportDeclaration(declaration) ? "import" : "re-export";
}

function valueDependencyOperation(declaration: StaticDependencyDeclaration) {
  return ts.isImportDeclaration(declaration) ? "value-import" : "value-re-export";
}

function isCompositionOwner(file: string) {
  return /^apps\/(?:api|admin-api)\/src\/composition(?:\/|$)/u.test(file);
}

function isRoleAssignmentSchemaOwner(file: string) {
  return file === "packages/role-assignment-resolution/src/internal/resolver.ts"
    || file === "apps/admin-api/src/services/role/role.repository.ts";
}

function isRoleAssignmentResolverValueOwner(file: string) {
  return /^apps\/(?:api|admin-api|oidc-provider|worker)\/src\/composition(?:\/|$)/u.test(file)
    || file === "packages/user-profile-read-model/src/user-profile-invalidation.ts"
    || file === "packages/user-profile-read-model/src/user-profile-worker.module.ts";
}

function isUserProfileProducerOwner(file: string) {
  return file.startsWith("packages/user-profile-read-model/src/")
    || /^apps\/(?:api|admin-api)\/src\/composition(?:\/|$)/u.test(file);
}

function isUserProfileWorkerOwner(file: string) {
  return file.startsWith("packages/user-profile-read-model/src/")
    || /^apps\/worker\/src\/composition(?:\/|$)/u.test(file);
}

function isUserProfileQueryRepositoryOwner(file: string) {
  return /^apps\/api\/src\/composition(?:\/|$)/u.test(file);
}

function isRepositoryImplementation(file: string) {
  return /^apps\/(?:api|admin-api)\/src\/services\//u.test(file)
    && file.endsWith(".repository.ts");
}

function isAppAssemblyOwner(file: string) {
  return /^apps\/(?:api|admin-api)\/src\/app\.ts$/u.test(file);
}

function isRedisInfrastructureOwner(file: string) {
  return /^apps\/(?:api|admin-api)\/src\/lib\/infra\//u.test(file);
}

function isLoggerInfrastructureOwner(file: string) {
  return /^apps\/(?:api|admin-api)\/src\/lib\/logger(?:\.ts|\/)/u.test(file);
}

function isAppRedisSingleton(sourceFile: string, moduleSpecifier: string) {
  return resolveAppLocalModule(sourceFile, moduleSpecifier) === "lib/infra/redis";
}

function isAppLoggerSingleton(sourceFile: string, moduleSpecifier: string) {
  return resolveAppLocalModule(sourceFile, moduleSpecifier) === "lib/logger";
}

function isConcreteProviderModule(sourceFile: string, moduleSpecifier: string) {
  const appLocalModule = resolveAppLocalModule(sourceFile, moduleSpecifier);
  const aliasedModule = resolveAliasedAppModule(moduleSpecifier);
  return /^(?:routes|services)\/.+\.(?:repository|service)$/u.test(appLocalModule ?? "")
    || /^(?:routes|services)\/.+\.(?:repository|service)$/u.test(aliasedModule?.path ?? "");
}

function isApplicationUseCaseModule(moduleSpecifier: string) {
  const normalizedModule = normalizeStaticModulePath(moduleSpecifier);
  const aliasedModule = resolveAliasedAppModule(moduleSpecifier);
  return aliasedModule?.path === "use-cases"
    || aliasedModule?.path.startsWith("use-cases/") === true
    || (normalizedModule.startsWith(".") && normalizedModule.split("/").includes("use-cases"));
}

function resolveAppLocalModule(sourceFile: string, moduleSpecifier: string) {
  const sourceMatch = /^apps\/(api|admin-api)\/src\/(.+)$/u.exec(sourceFile);
  if (!sourceMatch)
    return undefined;
  const [, app, appRelativeFile] = sourceMatch;
  const aliasedModule = resolveAliasedAppModule(moduleSpecifier);
  if (aliasedModule?.app === app)
    return aliasedModule.path;
  if (!moduleSpecifier.startsWith("."))
    return undefined;
  return normalizeStaticModulePath(
    posix.normalize(posix.join(posix.dirname(appRelativeFile), moduleSpecifier)),
  );
}

function isAppLocalRepositoryModule(moduleSpecifier: string) {
  const normalizedModule = normalizeStaticModulePath(moduleSpecifier);
  const aliasedModule = resolveAliasedAppModule(moduleSpecifier);
  return normalizedModule.endsWith(".repository")
    && (
      normalizedModule.startsWith(".")
      || aliasedModule !== undefined
    );
}

function resolveAliasedAppModule(moduleSpecifier: string) {
  const normalizedModule = normalizeStaticModulePath(moduleSpecifier);
  const aliases = [
    { prefix: "@api", app: "api" },
    { prefix: "@admin-api", app: "admin-api" },
    { prefix: "~api/src", app: "api" },
    { prefix: "~admin-api/src", app: "admin-api" },
  ] as const;
  for (const alias of aliases) {
    if (normalizedModule === alias.prefix)
      return { app: alias.app, path: "" };
    if (normalizedModule.startsWith(`${alias.prefix}/`)) {
      return {
        app: alias.app,
        path: normalizedModule.slice(alias.prefix.length + 1),
      };
    }
  }
  return undefined;
}

function normalizeStaticModulePath(modulePath: string) {
  const withoutTypeScriptExtension = modulePath.replace(/\.(?:ts|tsx)$/u, "");
  return withoutTypeScriptExtension.endsWith("/index")
    ? withoutTypeScriptExtension.slice(0, -"/index".length)
    : withoutTypeScriptExtension;
}

function normalizeStaticModuleEdge(sourceFile: string, moduleSpecifier: string) {
  const normalizedModule = normalizeStaticModulePath(moduleSpecifier);
  const aliasedModule = resolveAliasedAppModule(moduleSpecifier);
  if (aliasedModule) {
    return normalizeStaticModulePath(
      posix.join("apps", aliasedModule.app, "src", aliasedModule.path),
    );
  }
  if (normalizedModule.startsWith(".")) {
    return normalizeStaticModulePath(
      posix.normalize(posix.join(posix.dirname(sourceFile), normalizedModule)),
    );
  }
  return normalizedModule;
}

function matchesStaticModulePattern(modulePath: string, pattern: StaticModulePattern) {
  if (pattern.kind === "exact")
    return modulePath === pattern.module;
  if (pattern.kind === "prefix")
    return isPathAtOrBelow(modulePath, pattern.module);
  if (pattern.kind === "suffix")
    return modulePath === pattern.module || modulePath.endsWith(`/${pattern.module}`);
  return isPathAtOrBelow(modulePath, pattern.prefix) && modulePath.endsWith(pattern.suffix);
}

function matchesStaticSourcePattern(sourceFile: string, pattern: StaticSourcePattern) {
  if (typeof pattern === "string")
    return isPathAtOrBelow(sourceFile, pattern);
  return isPathAtOrBelow(sourceFile, pattern.prefix) && sourceFile.endsWith(pattern.suffix);
}

function isPathAtOrBelow(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function referencedTypeName(type: ts.TypeNode, sourceFile: ts.SourceFile) {
  if (ts.isTypeReferenceNode(type))
    return type.typeName.getText(sourceFile);
  return type.getText(sourceFile);
}

function isConcreteRepositoryModule(moduleSpecifier: string) {
  return moduleSpecifier.endsWith(".repository")
    || moduleSpecifier.endsWith(".repository.ts")
    || moduleSpecifier.split("/").includes("repositories");
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function compareViolations(left: ArchitectureViolation, right: ArchitectureViolation) {
  return compareText(left.ruleId, right.ruleId)
    || compareText(left.file, right.file)
    || left.line - right.line
    || compareText(left.message, right.message);
}

function compareText(left: string, right: string) {
  if (left < right)
    return -1;
  if (left > right)
    return 1;
  return 0;
}

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}
