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

function readSourceFile(file: string) {
  return readFileSync(join(sourceRoot, file), "utf8");
}

function parseSourceFile(file: string) {
  return ts.createSourceFile(file, readSourceFile(file), ts.ScriptTarget.Latest, true);
}

function collectNamedCalls(source: ts.SourceFile, calleeName: string) {
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === calleeName) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return calls;
}

function findFactoryBinding(source: ts.SourceFile, factoryName: string) {
  let result: { binding: string; firstArgument: string | undefined } | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression)
      && node.initializer.expression.text === factoryName) {
      result = {
        binding: node.name.text,
        firstArgument: node.initializer.arguments[0]?.getText(source),
      };
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

function objectArgumentPropertyValue(source: ts.SourceFile, call: ts.CallExpression, propertyName: string) {
  const argument = call.arguments[0];
  if (!argument || !ts.isObjectLiteralExpression(argument))
    return undefined;

  for (const property of argument.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === propertyName)
      return property.name.text;
    if (ts.isPropertyAssignment(property)
      && property.name.getText(source).replaceAll(/["']/gu, "") === propertyName) {
      return property.initializer.getText(source);
    }
  }
  return undefined;
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
  return /^@admin-api\/.+\.repository$/u.test(moduleSpecifier)
    || (moduleSpecifier.startsWith(".") && moduleSpecifier.endsWith(".repository"));
}

function isAppLocalUseCaseImport(moduleSpecifier: string) {
  return /^@admin-api\/use-cases(?:\/|$)/u.test(moduleSpecifier)
    || (moduleSpecifier.startsWith(".") && moduleSpecifier.split("/").includes("use-cases"));
}

function isApprovedAuditHelperImport(moduleSpecifier: string) {
  // Audit helper functions in this module build actor/request context and do not expose production singletons.
  return moduleSpecifier === "@admin-api/services/audit/audit.service";
}

function isUserOrClientServiceModule(file: string) {
  return file.startsWith("services/user/") || file.startsWith("services/client/");
}

function forbiddenSessionRevocationBypass(moduleSpecifier: string) {
  return moduleSpecifier === "@iam/api-core/oidc"
    || moduleSpecifier === "@iam/api-core/session/kernel"
    || moduleSpecifier.includes("session/kernel/keys")
    || moduleSpecifier.includes("custom-sso-session-kernel.adapter")
    || moduleSpecifier.includes("oidc-session-kernel.adapter")
    || moduleSpecifier === "@admin-api/lib/infra/redis";
}

describe("Admin API DI architecture", () => {
  test("composes transaction-bound user-profile invalidation as the only projection write port", () => {
    const txComposition = readSourceFile("composition/tx/index.ts");
    const repositoryComposition = readSourceFile("composition/repositories/index.ts");
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

  test("creates the role assignment resolver at the composition root and injects it into consumers", () => {
    const rootComposition = parseSourceFile("composition/index.ts");
    const serviceComposition = parseSourceFile("composition/services/index.ts");
    const repositoryBinding = findFactoryBinding(rootComposition, "createAdminApiRepositories");
    const resolverBinding = findFactoryBinding(rootComposition, "createRoleAssignmentResolver");
    const serviceFactoryCalls = collectNamedCalls(rootComposition, "createAdminApiServices");
    const userServiceCalls = collectNamedCalls(serviceComposition, "createUserService");
    const employmentServiceCalls = collectNamedCalls(serviceComposition, "createEmploymentService");
    const violations: string[] = [];

    if (!repositoryBinding || !resolverBinding || repositoryBinding.firstArgument !== resolverBinding.firstArgument)
      violations.push("Admin composition does not create repositories and the resolver with the same DbClient");

    const serviceFactoryCall = serviceFactoryCalls.length === 1 ? serviceFactoryCalls[0] : undefined;
    if (!serviceFactoryCall || !resolverBinding
      || objectArgumentPropertyValue(rootComposition, serviceFactoryCall, "roleAssignmentResolver")
      !== resolverBinding.binding) {
      violations.push("Admin composition does not pass its role assignment resolver to service composition");
    }

    for (const [consumer, calls] of [
      ["UserService", userServiceCalls],
      ["EmploymentService", employmentServiceCalls],
    ] as const) {
      const call = calls.length === 1 ? calls[0] : undefined;
      if (!call || objectArgumentPropertyValue(serviceComposition, call, "roleAssignmentResolver") === undefined)
        violations.push(`${consumer} does not receive the role assignment resolver`);
    }

    expect(violations).toEqual([]);
  });

  test("keeps Effective Role resolution out of the admin role repository", () => {
    const roleRepository = readSourceFile("services/role/role.repository.ts");
    const violations = [
      /\bgetRolesByEmploymentId\b/u.test(roleRepository)
        ? "RoleRepository still exposes the old per-employment Effective Role query"
        : null,
      /\broleAssignedToEmploymentWhere\b/u.test(roleRepository)
        ? "RoleRepository still owns the old assignment and organization-closure predicate"
        : null,
    ].filter((violation): violation is string => violation !== null);

    expect(violations).toEqual([]);
  });

  test("detects provider-derived ports without rejecting port or platform narrowing", () => {
    const allowed = collectPortOwnershipViolationsFromSource("allowed.port.ts", `
      import type { IncomingMessage } from "node:http";
      import type { ClockPort } from "@admin-api/composition/runtime";
      type HeaderRequest = Pick<IncomingMessage, "headers">;
      type ClockReader = Pick<ClockPort, "nowDate">;
    `);
    const forbidden = collectPortOwnershipViolationsFromSource("forbidden.port.ts", `
      import type { UserRepository } from "./user.repository";
      interface UserService { findUser: () => Promise<unknown> }
      type UserReader = Pick<
        UserRepository,
        "getUserByUsernameForAdmin"
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

  test("keeps user resignation owned by application use-case composition", () => {
    const employmentService = readSourceFile("services/employment/employment.service.ts");
    const employmentAdapter = readSourceFile("routes/admin/employment/employment.adapter.ts");
    const serviceComposition = readSourceFile("composition/services/index.ts");
    const routeComposition = readSourceFile("composition/routes/index.ts");
    const rootComposition = readSourceFile("composition/index.ts");
    const useCaseCompositionPath = join(sourceRoot, "composition/use-cases/index.ts");
    const useCaseComposition = existsSync(useCaseCompositionPath)
      ? readSourceFile("composition/use-cases/index.ts")
      : "";
    const violations = [
      /\basync function resignUser\b/u.test(employmentService)
        ? "EmploymentService implements resignUser"
        : null,
      /employmentService\.resignUser\b/u.test(employmentAdapter)
        ? "employment adapter binds resignation through EmploymentService"
        : null,
      /createResignUserUseCase/u.test(serviceComposition)
        ? "service composition creates resign-user use-case"
        : null,
      !existsSync(useCaseCompositionPath)
        ? "composition/use-cases/index.ts is missing"
        : null,
      !/\bcreateResignUserUseCase\(/u.test(useCaseComposition)
        ? "use-case composition does not create the resign-user use-case"
        : null,
      !/sessionRevocation:\s*options\.sessionRevocation/u.test(useCaseComposition)
        ? "use-case composition does not bind session revocation to resign-user"
        : null,
      !/\buseCases:\s*ReturnType<typeof createAdminApiUseCases>/u.test(rootComposition)
        ? "Admin composition does not expose a separate useCases field"
        : null,
      !/sessionRevocation:\s*session\.revocation/u.test(rootComposition)
        ? "Admin composition does not inject session revocation into use cases"
        : null,
      !/resignUser:\s*useCases\.employment\.resignUser/u.test(routeComposition)
        ? "route composition does not inject the resignation facade separately"
        : null,
    ].filter((violation): violation is string => violation !== null);

    expect(violations).toEqual([]);
  });

  test("keeps the resignation ports consumer-owned", () => {
    const port = readSourceFile("use-cases/employment/resign-user/resign-user.port.ts");
    const forbiddenPatterns = [
      /\bPick\s*</u,
      /\.repository[/"']/u,
      /\.service[/"']/u,
      /\/routes\//u,
      /\.adapter[/"']/u,
    ];
    const violations = forbiddenPatterns
      .filter(pattern => pattern.test(port))
      .map(pattern => `resign-user.port.ts contains ${pattern}`);
    const requiredMethods = [
      "getUserByUsernameForAdmin",
      "updateUserByUsername",
      "endActiveEmploymentsByUserId",
      "recordAuditLog",
      "recordChanges",
      "revokeUserSessions",
    ];
    violations.push(...requiredMethods
      .filter(method => !port.includes(method))
      .map(method => `resign-user.port.ts does not declare ${method}`));

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
        if (moduleSpecifier === "@admin-api/lib/infra/redis")
          return true;
        if (moduleSpecifier === "@admin-api/lib/logger")
          return !isAppAssembly(file);
        if (/^@admin-api\/services\/.+\.(?:service|repository)$/.test(moduleSpecifier))
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
        || moduleSpecifier === "@admin-api/lib/infra/redis"
        || moduleSpecifier === "@admin-api/lib/logger"
        || /^@admin-api\/services\/.+\.(?:service|repository)$/.test(moduleSpecifier))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(routeFactoryViolations).toEqual([]);
  });

  test("keeps admin user and client services behind the Session Revocation port", () => {
    const violations = collectImports()
      .filter(({ file }) => isUserOrClientServiceModule(file))
      .filter(({ moduleSpecifier }) => forbiddenSessionRevocationBypass(moduleSpecifier))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });

  test("does not import old user-profile producer or dirty modules", () => {
    const importViolations = collectImports()
      .filter(({ moduleSpecifier }) =>
        moduleSpecifier.startsWith("@api/services/user-profile")
        || moduleSpecifier.startsWith("@admin-api/services/user-profile")
        || moduleSpecifier.startsWith("@iam/domain/user-profile"))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    const producerViolations = collectSourceFiles(sourceRoot)
      .filter(importsUserProfileProducerFromJobs)
      .map(file => `${toPosixPath(relative(sourceRoot, file))} imports createUserProfileJobProducer from @iam/jobs`);

    expect([...importViolations, ...producerViolations]).toEqual([]);
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
