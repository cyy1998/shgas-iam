import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  collectUserProfileBusinessBoundaryViolations as collectUserProfileBusinessBoundaryViolationsFromSource,
} from "@iam/user-profile-read-model/testing/user-profile-business-boundary";
import { describe, expect, test } from "bun:test";
import ts from "typescript";

type ImportRecord = {
  file: string;
  moduleSpecifier: string;
  hasValueImport: boolean;
};

const sourceRoot = join(import.meta.dir, "..");
const workspaceRoot = join(sourceRoot, "../../..");

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts") || fullPath.includes(`${sep}test${sep}`)) {
      return [];
    }
    return [fullPath];
  });
}

function collectSourceFilesIfExists(dir: string): string[] {
  return existsSync(dir) ? collectSourceFiles(dir) : [];
}

function hasValueImport(importClause: ts.ImportClause | undefined) {
  if (!importClause)
    return true;
  if (importClause.isTypeOnly)
    return false;
  if (importClause.name)
    return true;
  const bindings = importClause.namedBindings;
  if (!bindings)
    return false;
  if (ts.isNamespaceImport(bindings))
    return true;
  return bindings.elements.some(element => !element.isTypeOnly);
}

function collectImports(): ImportRecord[] {
  return collectImportsFromRoot(sourceRoot);
}

function collectImportsFromRoot(root: string): ImportRecord[] {
  return collectSourceFilesIfExists(root).flatMap((file) => {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const relativeFile = toPosixPath(relative(root, file));
    return source.statements.flatMap((statement): ImportRecord[] => {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        return [];
      }
      return [{
        file: relativeFile,
        moduleSpecifier: statement.moduleSpecifier.text,
        hasValueImport: hasValueImport(statement.importClause),
      }];
    });
  });
}

function isRepositoryOwnedPortModule(moduleSpecifier: string) {
  return moduleSpecifier.endsWith(".repository")
    || moduleSpecifier.endsWith(".repository.ts")
    || moduleSpecifier.split("/").includes("repositories");
}

function collectPortOwnershipViolationsFromSource(file: string, content: string) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const reasons = new Set<string>();
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleSpecifier = node.moduleSpecifier.text;
      if (isRepositoryOwnedPortModule(moduleSpecifier))
        reasons.add(`imports ${moduleSpecifier}`);
    }
    if (ts.isTypeReferenceNode(node)
      && node.typeName.getText(source) === "Pick"
      && node.typeArguments?.[0]) {
      const providerType = node.typeArguments[0].getText(source);
      if (/(?:Repository|Service)$/u.test(providerType))
        reasons.add(`derives Pick<${providerType}>`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return reasons.size === 0 ? [] : [`${file}: ${[...reasons].join("; ")}`];
}

function collectProductionPortOwnershipViolations() {
  return collectSourceFiles(sourceRoot)
    .filter(file => file.endsWith(".port.ts"))
    .flatMap(file => collectPortOwnershipViolationsFromSource(
      toPosixPath(relative(sourceRoot, file)),
      readFileSync(file, "utf8"),
    ));
}

function importsUserProfileProducerFromJobs(file: string) {
  return /import\s*\{[^}]*\bcreateUserProfileJobProducer\b[^}]*\}\s*from\s*["']@iam\/jobs["']/u
    .test(readFileSync(file, "utf8"));
}

function importsUserProfileProducerFromReadModel(file: string) {
  return /import\s*\{[^}]*\bcreateUserProfileJobProducer\b[^}]*\}\s*from\s*["']@iam\/user-profile-read-model\/producer["']/u
    .test(readFileSync(file, "utf8"));
}

function isComposition(file: string) {
  return file.startsWith("composition/");
}

function isRepositoryImplementation(file: string) {
  return file.startsWith("services/") && file.endsWith(".repository.ts");
}

function isAppAssembly(file: string) {
  return file === "app.ts";
}

function isRouteProductionModule(file: string) {
  return file.startsWith("routes/");
}

function isAppLocalRepositoryImport(moduleSpecifier: string) {
  return /^@api\/.+\.repository$/u.test(moduleSpecifier)
    || (moduleSpecifier.startsWith(".") && moduleSpecifier.endsWith(".repository"));
}

function isAppLocalUseCaseImport(moduleSpecifier: string) {
  return /^@api\/use-cases(?:\/|$)/u.test(moduleSpecifier)
    || (moduleSpecifier.startsWith(".") && moduleSpecifier.split("/").includes("use-cases"));
}

function isApprovedAuditHelperImport(moduleSpecifier: string) {
  // Audit helper functions in this module build actor/request context and do not expose production singletons.
  return moduleSpecifier === "@api/services/audit/audit.service";
}

function isCustomSsoRuntimeBoundary(file: string) {
  return file === "middlewares/authentication.handler.ts"
    || file.startsWith("routes/auth/")
    || file.startsWith("routes/sso/")
    || file.startsWith("services/session/")
    || file.startsWith("services/sso/")
    || file.startsWith("use-cases/sso/");
}

const legacyCustomSsoCompletionOperationNames = new Set([
  "consumeAuthCode",
  "createLocalSession",
]);

const sessionKernelModelNames = new Set([
  "PrincipalSession",
  "ProtocolArtifact",
]);

function isCustomSsoApplicationBoundary(file: string) {
  return file.startsWith("routes/sso/")
    || file.startsWith("use-cases/sso/");
}

function isCustomSsoCompletionBoundary(file: string) {
  return file === "services/session/custom-sso-session-kernel.adapter.ts"
    || file.startsWith("routes/sso/")
    || file.startsWith("use-cases/sso/complete-sso-callback/")
    || file.startsWith("use-cases/sso/exchange-sso-code/");
}

function isSessionKernelModule(moduleSpecifier: string) {
  return moduleSpecifier === "@iam/api-core/session"
    || moduleSpecifier.startsWith("@iam/api-core/session/");
}

function collectCustomSsoSeamViolationsFromSource(file: string, content: string) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const reasons = new Set<string>();
  const applicationBoundary = isCustomSsoApplicationBoundary(file);
  const completionBoundary = isCustomSsoCompletionBoundary(file);

  function visit(node: ts.Node) {
    if (applicationBoundary
      && ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && isSessionKernelModule(node.moduleSpecifier.text)) {
      reasons.add(`imports ${node.moduleSpecifier.text}`);
    }
    if (applicationBoundary
      && ts.isIdentifier(node)
      && sessionKernelModelNames.has(node.text)) {
      reasons.add(`uses Session Kernel model ${node.text}`);
    }
    if (completionBoundary
      && (ts.isIdentifier(node) || ts.isStringLiteral(node))
      && legacyCustomSsoCompletionOperationNames.has(node.text)) {
      reasons.add(`uses legacy completion operation ${node.text}`);
    }
    if (completionBoundary
      && ts.isIdentifier(node)
      && (node.text === "ConsumedSsoAuthCode" || node.text === "CustomSsoConsumedAuthCode")) {
      reasons.add(`uses legacy intermediate model ${node.text}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return reasons.size === 0 ? [] : [`${file}: ${[...reasons].sort().join("; ")}`];
}

const legacyCustomSsoAuthorityKeyPatterns = [
  /global_session:/u,
  /auth_code:/u,
  /local_[^`'"]+_session:/u,
  /local_session_reverse:/u,
  /local_session_set:/u,
];

describe("API DI architecture", () => {
  test("composes transaction-bound user-profile invalidation as the only projection write port", () => {
    const txComposition = readFileSync(join(sourceRoot, "composition/tx/index.ts"), "utf8");
    const repositoryComposition = readFileSync(join(sourceRoot, "composition/repositories/index.ts"), "utf8");
    const invalidationCall = txComposition.match(
      /userProfileInvalidation:\s*createUserProfileInvalidation\(\{(?<deps>[\s\S]*?)\}\),/u,
    );
    const dependencies = invalidationCall?.groups?.deps ?? "";
    const violations = [
      !/createTxPorts:\s*\(tx,\s*lifecycle\)\s*=>/u.test(txComposition)
        ? "transaction-port factory does not receive lifecycle"
        : null,
      invalidationCall === null
        ? "transaction ports do not expose UserProfileInvalidation"
        : null,
      !/\bdb:\s*tx\b/u.test(dependencies)
        ? "UserProfileInvalidation does not use the current transaction DbClient"
        : null,
      !/\bjobProducer:\s*options\.userProfileJobProducer\b/u.test(dependencies)
        ? "UserProfileInvalidation does not use the existing rebuild queue adapter"
        : null,
      !/\blifecycle\b/u.test(dependencies)
        ? "UserProfileInvalidation does not receive transaction lifecycle"
        : null,
      !/\bclock:\s*options\.clock\b/u.test(dependencies)
        ? "UserProfileInvalidation does not use the application clock"
        : null,
      /\b(?:profileDirtyMarker|createUserProfileDirtyMarker)\b/u.test(txComposition)
        ? "transaction ports still expose the legacy dirty marker"
        : null,
      /\b(?:userProfileDirty|createUserProfileDirtyRepository)\b/u.test(repositoryComposition)
        ? "normal repository composition still owns the User Profile dirty repository"
        : null,
      /\b(?:userProfileScope|createUserProfileScopeRepository|UserProfileAffectedUserResolverPort)\b/u
        .test(repositoryComposition)
        ? "normal repository composition still owns User Profile scope resolution"
        : null,
    ].filter((violation): violation is string => violation !== null);

    expect(violations).toEqual([]);
  });

  test("detects provider-derived ports without rejecting port or platform narrowing", () => {
    const allowed = collectPortOwnershipViolationsFromSource("allowed.port.ts", `
      import type { IncomingMessage } from "node:http";
      import type { RedisPort } from "@api/composition/runtime";
      type HeaderRequest = Pick<IncomingMessage, "headers">;
      type RedisReader = Pick<RedisPort, "get">;
    `);
    const forbidden = collectPortOwnershipViolationsFromSource("forbidden.port.ts", `
      import type { UserRepository } from "./user.repository";
      interface UserService { findUser: () => Promise<unknown> }
      type UserReader = Pick<
        UserRepository,
        "getUserByUsername"
      >;
      type UserLookup = Pick<UserService, "findUser">;
    `);

    expect(allowed).toEqual([]);
    expect(forbidden).toEqual([
      "forbidden.port.ts: imports ./user.repository; derives Pick<UserRepository>; derives Pick<UserService>",
    ]);
  });

  test("keeps all production ports consumer-owned", () => {
    expect(collectProductionPortOwnershipViolations()).toEqual([]);
  });

  test("keeps route production modules off app-local repositories and UnitOfWork", () => {
    const violations = collectImports()
      .filter(({ file }) => isRouteProductionModule(file))
      .filter(({ moduleSpecifier }) =>
        isAppLocalRepositoryImport(moduleSpecifier)
        || moduleSpecifier === "@iam/api-core/uow")
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });

  test("keeps domain-aligned services from importing application use-cases", () => {
    const violations = collectImports()
      .filter(({ file }) => file.startsWith("services/"))
      .filter(({ moduleSpecifier }) => isAppLocalUseCaseImport(moduleSpecifier))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });

  test("keeps production service, repository, db, redis, and logger value imports behind composition", () => {
    const violations = collectImports()
      .filter(item => item.hasValueImport)
      .filter(({ file, moduleSpecifier }) => {
        if (isComposition(file))
          return false;
        if (isApprovedAuditHelperImport(moduleSpecifier))
          return false;
        if (moduleSpecifier === "@iam/db")
          return !isRepositoryImplementation(file);
        if (moduleSpecifier === "@api/lib/infra/redis")
          return true;
        if (moduleSpecifier === "@api/lib/logger")
          return !isAppAssembly(file);
        if (/^@api\/services\/.+\.(?:service|repository)$/.test(moduleSpecifier))
          return true;
        if (/^@api\/routes\/.+\.service$/.test(moduleSpecifier))
          return true;
        return false;
      })
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });

  test("keeps route index and tier middleware factories free of production dependencies", () => {
    const routeFactoryViolations = collectImports()
      .filter(item => item.hasValueImport)
      .filter(({ file }) => file.startsWith("routes/") && (file.endsWith(".index.ts") || file.endsWith("_middleware.ts")))
      .filter(({ moduleSpecifier }) =>
        moduleSpecifier === "@iam/db"
        || moduleSpecifier === "@api/lib/infra/redis"
        || moduleSpecifier === "@api/lib/logger"
        || /^@api\/services\/.+\.(?:service|repository)$/.test(moduleSpecifier)
        || /^@api\/routes\/.+\.service$/.test(moduleSpecifier))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(routeFactoryViolations).toEqual([]);
  });

  test("keeps migrated open routes free of application service factories", () => {
    const openRouteRoot = join(sourceRoot, "routes/open");
    const violations = collectSourceFilesIfExists(openRouteRoot)
      .map(file => ({
        file: toPosixPath(relative(openRouteRoot, file)),
        content: readFileSync(file, "utf8"),
      }))
      .filter(({ file, content }) =>
        file === "open.port.ts"
        || file === "open.service.ts"
        || /\bexport\s+function\s+create\w*Service\b/u.test(content))
      .map(({ file }) => file);

    expect(violations).toEqual([]);
  });

  test("keeps migrated auth routes free of application services and stateful helpers", () => {
    const authRouteRoot = join(sourceRoot, "routes/auth");
    const legacyFiles = new Set([
      "auth.port.ts",
      "auth.service.ts",
      "login-credential.helper.ts",
      "login-failure.helper.ts",
    ]);
    const violations = collectSourceFilesIfExists(authRouteRoot)
      .map(file => ({
        file: toPosixPath(relative(authRouteRoot, file)),
        content: readFileSync(file, "utf8"),
      }))
      .filter(({ file, content }) =>
        legacyFiles.has(file)
        || /\bexport\s+function\s+create\w*Service\b/u.test(content))
      .map(({ file }) => file);

    expect(violations).toEqual([]);
  });

  test("keeps migrated SSO routes free of application services and stateful workflow dependencies", () => {
    const ssoRouteRoot = join(sourceRoot, "routes/sso");
    const legacyFiles = new Set(["sso.port.ts", "sso.service.ts"]);
    const fileViolations = collectSourceFilesIfExists(ssoRouteRoot)
      .map(file => ({
        file: toPosixPath(relative(ssoRouteRoot, file)),
        content: readFileSync(file, "utf8"),
      }))
      .filter(({ file, content }) =>
        legacyFiles.has(file)
        || /\bexport\s+function\s+create\w*Service\b/u.test(content))
      .map(({ file }) => file);
    const dependencyViolations = collectImports()
      .filter(item => item.hasValueImport && item.file.startsWith("routes/sso/"))
      .filter(({ moduleSpecifier }) =>
        moduleSpecifier === "@api/lib/infra/redis"
        || moduleSpecifier === "@api/services/session/custom-sso-session-kernel.adapter"
        || moduleSpecifier.startsWith("@api/services/audit/events/")
        || moduleSpecifier.startsWith("@api/integrations/"))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect([...fileViolations, ...dependencyViolations]).toEqual([]);
  });

  test("keeps Account Recovery ports consumer-owned", () => {
    const accountRecoveryRoots = [
      join(sourceRoot, "services/account-recovery"),
      join(sourceRoot, "use-cases/account-recovery"),
    ];
    const violations = accountRecoveryRoots
      .flatMap(collectSourceFilesIfExists)
      .filter(file => file.endsWith(".port.ts"))
      .flatMap((file) => {
        const content = readFileSync(file, "utf8");
        const relativeFile = toPosixPath(relative(sourceRoot, file));
        return [
          /from\s+["'][^"']+\.repository["']/u.test(content)
            ? `${relativeFile} imports a repository module`
            : null,
          /\bPick\s*<[^>]*(?:Repository|Service)\b/u.test(content)
            ? `${relativeFile} derives a provider-owned port`
            : null,
        ].filter((violation): violation is string => violation !== null);
      });

    expect(violations).toEqual([]);
  });

  test("keeps Authentication ports consumer-owned", () => {
    const authenticationRoots = [
      join(sourceRoot, "services/authentication"),
      join(sourceRoot, "use-cases/authentication"),
    ];
    const violations = authenticationRoots
      .flatMap(collectSourceFilesIfExists)
      .filter(file => file.endsWith(".port.ts"))
      .flatMap((file) => {
        const content = readFileSync(file, "utf8");
        const relativeFile = toPosixPath(relative(sourceRoot, file));
        return [
          /from\s+["'][^"']+\.repository["']/u.test(content)
            ? `${relativeFile} imports a repository module`
            : null,
          /\bPick\s*<[^>]*(?:Repository|Service)\b/u.test(content)
            ? `${relativeFile} derives a provider-owned port`
            : null,
          /from\s+["']@api\/(?:routes|services)\/.+\.(?:service|adapter)["']/u.test(content)
            ? `${relativeFile} imports a concrete application module`
            : null,
        ].filter((violation): violation is string => violation !== null);
      });

    expect(violations).toEqual([]);
  });

  test("keeps SSO ports consumer-owned", () => {
    const ssoRoots = [
      join(sourceRoot, "services/sso"),
      join(sourceRoot, "use-cases/sso"),
    ];
    const violations = ssoRoots
      .flatMap(collectSourceFilesIfExists)
      .filter(file => file.endsWith(".port.ts"))
      .flatMap((file) => {
        const content = readFileSync(file, "utf8");
        const relativeFile = toPosixPath(relative(sourceRoot, file));
        return [
          /from\s+["'][^"']+\.repository["']/u.test(content)
            ? `${relativeFile} imports a repository module`
            : null,
          /\bPick\s*<[^>]*(?:Repository|Service|Adapter)\b/u.test(content)
            ? `${relativeFile} derives a provider-owned port`
            : null,
          /from\s+["']@api\/(?:routes|services)\/.+\.(?:service|adapter|type)["']/u.test(content)
            ? `${relativeFile} imports a concrete application module`
            : null,
        ].filter((violation): violation is string => violation !== null);
      });

    expect(violations).toEqual([]);
  });

  test("detects leaked Custom SSO models and legacy completion operations without matching explanatory text", () => {
    const allowed = collectCustomSsoSeamViolationsFromSource(
      "use-cases/sso/complete-sso-callback/complete-sso-callback.port.ts",
      `
        import type { AuditRequestContext } from "@iam/domain/audit";
        const migrationNote = "consumeAuthCode and createLocalSession are retired";
        interface GatewayLoginCompletionPort {
          completeGatewayLogin: (requestContext?: AuditRequestContext) => Promise<{ token: string }>;
        }
      `,
    );
    const forbiddenSessionKernelConsumer = collectCustomSsoSeamViolationsFromSource(
      "use-cases/sso/exchange-sso-code/exchange-sso-code.port.ts",
      `
        import type {
          PrincipalSession as Session,
          ProtocolArtifact,
        } from "@iam/api-core/session/kernel";
        interface GrantContext {
          artifact: ProtocolArtifact;
          principalSession: Session;
        }
      `,
    );
    const forbiddenLegacyConsumer = collectCustomSsoSeamViolationsFromSource(
      "use-cases/sso/exchange-sso-code/exchange-sso-code.port.ts",
      `
        interface ConsumedSsoAuthCode {
          userId: number;
        }
        interface CompletionPort {
          consumeAuthCode: () => Promise<ConsumedSsoAuthCode>;
          "createLocalSession": () => Promise<string>;
        }
      `,
    );
    const forbiddenProvider = collectCustomSsoSeamViolationsFromSource(
      "services/session/custom-sso-session-kernel.adapter.ts",
      `
        const resolveGrant = () => ({});
        const createCredential = () => ({});
        export function createAdapter() {
          return {
            consumeAuthCode: resolveGrant,
            createLocalSession: createCredential,
          };
        }
      `,
    );

    expect(allowed).toEqual([]);
    expect(forbiddenSessionKernelConsumer).toEqual([
      "use-cases/sso/exchange-sso-code/exchange-sso-code.port.ts: "
      + "imports @iam/api-core/session/kernel; "
      + "uses Session Kernel model PrincipalSession; "
      + "uses Session Kernel model ProtocolArtifact",
    ]);
    expect(forbiddenLegacyConsumer).toEqual([
      "use-cases/sso/exchange-sso-code/exchange-sso-code.port.ts: "
      + "uses legacy completion operation consumeAuthCode; "
      + "uses legacy completion operation createLocalSession; "
      + "uses legacy intermediate model ConsumedSsoAuthCode",
    ]);
    expect(forbiddenProvider).toEqual([
      "services/session/custom-sso-session-kernel.adapter.ts: "
      + "uses legacy completion operation consumeAuthCode; "
      + "uses legacy completion operation createLocalSession",
    ]);
  });

  test("keeps Custom SSO Session Kernel models and legacy completion operations behind the module seam", () => {
    const violations = collectSourceFiles(sourceRoot)
      .map(file => ({
        file: toPosixPath(relative(sourceRoot, file)),
        content: readFileSync(file, "utf8"),
      }))
      .flatMap(({ file, content }) => collectCustomSsoSeamViolationsFromSource(file, content));

    expect(violations).toEqual([]);
  });

  test("keeps SSO composition owned by useCases", () => {
    const compositionRoot = join(sourceRoot, "composition");
    const violations = collectSourceFilesIfExists(compositionRoot)
      .flatMap((file) => {
        const content = readFileSync(file, "utf8");
        const relativeFile = toPosixPath(relative(sourceRoot, file));
        return [
          /@api\/routes\/sso\/sso\.service/u.test(content)
            ? `${relativeFile} imports the legacy SSO service`
            : null,
          /\bssoService\s*:/u.test(content)
            ? `${relativeFile} exposes ssoService`
            : null,
          /\bservices\.sso\b/u.test(content)
            ? `${relativeFile} consumes services.sso`
            : null,
        ].filter((violation): violation is string => violation !== null);
      });

    expect(violations).toEqual([]);
  });

  test("keeps custom SSO runtime off legacy Redis authority keys", () => {
    const customSsoRuntimeFiles = collectSourceFiles(sourceRoot)
      .map(file => toPosixPath(relative(sourceRoot, file)))
      .filter(isCustomSsoRuntimeBoundary);

    const keyViolations = customSsoRuntimeFiles.flatMap((file) => {
      const content = readFileSync(join(sourceRoot, file), "utf8");
      return legacyCustomSsoAuthorityKeyPatterns
        .filter(pattern => pattern.test(content))
        .map(pattern => `${file} contains ${pattern}`);
    });
    const importViolations = collectImports()
      .filter(({ file }) => isCustomSsoRuntimeBoundary(file))
      .filter(({ moduleSpecifier }) => moduleSpecifier === "@iam/api-core/session")
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect([...keyViolations, ...importViolations]).toEqual([]);
  });

  test("keeps user-profile read model ownership out of old API/domain/jobs paths", () => {
    const importViolations = collectImports()
      .filter(({ moduleSpecifier }) =>
        moduleSpecifier.startsWith("@api/services/user-profile")
        || moduleSpecifier.startsWith("@iam/domain/user-profile"))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    const producerViolations = collectSourceFiles(sourceRoot)
      .filter(importsUserProfileProducerFromJobs)
      .map(file => `${toPosixPath(relative(sourceRoot, file))} imports createUserProfileJobProducer from @iam/jobs`);

    expect([...importViolations, ...producerViolations]).toEqual([]);
  });

  test("keeps user-profile worker-side APIs out of normal API composition", () => {
    const violations = collectImports()
      .filter(({ moduleSpecifier }) => moduleSpecifier === "@iam/user-profile-read-model/worker")
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });

  test("keeps business production modules behind UserProfileInvalidation", () => {
    const violations = collectSourceFiles(sourceRoot)
      .filter(file => !isComposition(toPosixPath(relative(sourceRoot, file))))
      .flatMap(file => collectUserProfileBusinessBoundaryViolationsFromSource(
        file,
        readFileSync(file, "utf8"),
      ));

    expect(violations).toEqual([]);
  });

  test("keeps source write paths from using scope expansion as the dirty fact", () => {
    const forbiddenScopeWakeUpPatterns = [
      /\benqueueScopeExpansionJob\b/u,
      /\bbuildScopeExpansionJobId\b/u,
      /\bExpandUserProfileScopeJobPayload\b/u,
    ];
    const sourceFiles = collectSourceFiles(sourceRoot)
      .map(file => toPosixPath(relative(sourceRoot, file)))
      .filter(file => !isComposition(file));

    const scopeViolations = sourceFiles.flatMap((file) => {
      const content = readFileSync(join(sourceRoot, file), "utf8");
      return forbiddenScopeWakeUpPatterns
        .filter(pattern => pattern.test(content))
        .map(pattern => `${file} contains ${pattern}`);
    });
    const producerViolations = collectSourceFiles(sourceRoot)
      .filter(file => !isComposition(toPosixPath(relative(sourceRoot, file))))
      .filter(importsUserProfileProducerFromReadModel)
      .map(file => `${toPosixPath(relative(sourceRoot, file))} imports createUserProfileJobProducer from read model`);

    expect([...scopeViolations, ...producerViolations]).toEqual([]);
  });

  test("keeps future worker app code free of API-private imports", () => {
    const workerSourceRoot = join(workspaceRoot, "apps/worker/src");
    const violations = collectImportsFromRoot(workerSourceRoot)
      .filter(({ moduleSpecifier }) => moduleSpecifier.startsWith("@api/"))
      .map(({ file, moduleSpecifier }) => `apps/worker/src/${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });
});
