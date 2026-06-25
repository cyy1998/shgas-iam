import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ImportRecord = {
  file: string;
  moduleSpecifier: string;
  resolvedModule: string;
  hasValueImport: boolean;
};

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function toPosixPath(path: string) {
  return path.split(sep).join("/");
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory())
      return collectSourceFiles(fullPath);
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts"))
      return [];
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

function resolveLocalModule(file: string, moduleSpecifier: string) {
  if (!moduleSpecifier.startsWith("."))
    return moduleSpecifier;
  const absoluteFile = join(sourceRoot, file);
  const resolved = resolve(dirname(absoluteFile), moduleSpecifier);
  return toPosixPath(relative(sourceRoot, resolved));
}

function collectImports(): ImportRecord[] {
  return collectSourceFiles(sourceRoot).flatMap((file) => {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const relativeFile = toPosixPath(relative(sourceRoot, file));
    return source.statements.flatMap((statement): ImportRecord[] => {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        return [];
      const moduleSpecifier = statement.moduleSpecifier.text;
      return [{
        file: relativeFile,
        moduleSpecifier,
        resolvedModule: resolveLocalModule(relativeFile, moduleSpecifier),
        hasValueImport: hasValueImport(statement.importClause),
      }];
    });
  });
}

function isComposition(file: string) {
  return file.startsWith("composition/");
}

function isRepositoryImplementation(file: string) {
  return file.startsWith("repositories/") && file.endsWith(".repository.ts");
}

function isRedisBackedBoundary(file: string) {
  return file.startsWith("stores/") || file.startsWith("storage/");
}

function isConcreteRepositoryModule(resolvedModule: string) {
  return resolvedModule.startsWith("repositories/") && resolvedModule.endsWith(".repository.ts");
}

function isAllowedKernelLifecyclePatternFile(file: string) {
  return file === "env.ts"
    || file === "__tests__/architecture.test.ts";
}

describe("oIDC provider DI architecture", () => {
  it("keeps DB, Redis, logger, and concrete repository value imports behind approved boundaries", () => {
    const violations = collectImports()
      .filter(item => item.hasValueImport)
      .filter(({ file, moduleSpecifier, resolvedModule }) => {
        if (isComposition(file))
          return false;
        if (moduleSpecifier === "@iam/db")
          return true;
        if (resolvedModule === "lib/redis.ts")
          return true;
        if (resolvedModule === "lib/logger.ts")
          return true;
        if (isConcreteRepositoryModule(resolvedModule))
          return true;
        if (moduleSpecifier === "ioredis")
          return !isRedisBackedBoundary(file);
        return false;
      })
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });

  it("allows repository schema imports and Redis-backed storage imports only at their boundaries", () => {
    const violations = collectImports()
      .filter(item => item.hasValueImport)
      .filter(({ file, moduleSpecifier }) => {
        if (moduleSpecifier === "@iam/db/schema")
          return !isRepositoryImplementation(file);
        if (moduleSpecifier === "ioredis")
          return !isRedisBackedBoundary(file);
        return false;
      })
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);

    expect(violations).toEqual([]);
  });

  it("keeps Session Kernel Redis lifecycle keys behind the Kernel public API", () => {
    const forbiddenKernelKeyPatterns = [
      /sess:v2:(?:active|lookup|revoked|revoked_lookup|index):/,
      /active:[pcba]:/,
      /lookup:[pca]:/,
      /revoked(?:_lookup)?:[pca]:/,
      /index:(?:user|client|client-protocol|principal|binding|protocol):/,
    ];

    const violations = collectSourceFiles(sourceRoot).flatMap((file) => {
      const relativeFile = toPosixPath(relative(sourceRoot, file));
      if (isAllowedKernelLifecyclePatternFile(relativeFile))
        return [];
      const source = readFileSync(file, "utf8");
      return forbiddenKernelKeyPatterns.some(pattern => pattern.test(source))
        ? [relativeFile]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps production wiring off legacy OIDC session stores and binding ids", () => {
    const deletedStoreModules = new Set([
      "stores/global-session.store.ts",
      "stores/provider-session-binding.store.ts",
      "stores/return-handle.store.ts",
    ]);
    const importViolations = collectImports()
      .filter(({ resolvedModule }) => deletedStoreModules.has(resolvedModule))
      .map(({ file, moduleSpecifier }) => `${file} imports ${moduleSpecifier}`);
    const bindingIdViolations = collectSourceFiles(sourceRoot).flatMap((file) => {
      const relativeFile = toPosixPath(relative(sourceRoot, file));
      const source = readFileSync(file, "utf8");
      return source.includes("legacy:")
        ? [`${relativeFile} contains legacy binding id literal`]
        : [];
    });

    expect([...importViolations, ...bindingIdViolations]).toEqual([]);
  });
});
