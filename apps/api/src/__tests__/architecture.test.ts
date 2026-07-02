import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
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

function importsUserProfileProducerFromJobs(file: string) {
  return /import\s*\{[^}]*\bcreateUserProfileJobProducer\b[^}]*\}\s*from\s*["']@iam\/jobs["']/u
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

function isApprovedAuditHelperImport(moduleSpecifier: string) {
  // Audit helper functions in this module build actor/request context and do not expose production singletons.
  return moduleSpecifier === "@api/services/audit/audit.service";
}

function isCustomSsoRuntimeBoundary(file: string) {
  return file === "middlewares/authentication.handler.ts"
    || file.startsWith("routes/auth/")
    || file.startsWith("routes/sso/")
    || file.startsWith("services/session/");
}

const legacyCustomSsoAuthorityKeyPatterns = [
  /global_session:/u,
  /auth_code:/u,
  /local_[^`'"]+_session:/u,
  /local_session_reverse:/u,
  /local_session_set:/u,
];

describe("API DI architecture", () => {
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

  test("keeps future worker app code free of API-private imports", () => {
    const workerSourceRoot = join(workspaceRoot, "apps/worker/src");
    const violations = collectImportsFromRoot(workerSourceRoot)
      .filter(({ moduleSpecifier }) => moduleSpecifier.startsWith("@api/"))
      .map(({ file, moduleSpecifier }) => `apps/worker/src/${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });
});
