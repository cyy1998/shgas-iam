import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "bun:test";
import ts from "typescript";

type ImportRecord = {
  file: string;
  moduleSpecifier: string;
  hasValueImport: boolean;
};

const sourceRoot = join(import.meta.dir, "..");

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
  return collectSourceFiles(sourceRoot).flatMap((file) => {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const relativeFile = toPosixPath(relative(sourceRoot, file));
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
  return moduleSpecifier === "@admin-api/services/audit/audit.service";
}

describe("Admin API DI architecture", () => {
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
});
