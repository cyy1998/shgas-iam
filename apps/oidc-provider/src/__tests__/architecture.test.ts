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
  it("detects provider-derived ports without rejecting port or platform narrowing", () => {
    const allowed = collectPortOwnershipViolationsFromSource("allowed.port.ts", `
      import type { IncomingMessage } from "node:http";
      interface SessionStorePort { read: (id: string) => Promise<unknown> }
      type HeaderRequest = Pick<IncomingMessage, "headers">;
      type SessionReader = Pick<SessionStorePort, "read">;
    `);
    const forbidden = collectPortOwnershipViolationsFromSource("forbidden.port.ts", `
      import type { AuthorizationRepository } from "../repositories/authorization.repository.ts";
      interface ClaimsService { findClaims: () => Promise<unknown> }
      type ClaimReader = Pick<
        AuthorizationRepository,
        "buildClaim"
      >;
      type ClaimsLookup = Pick<ClaimsService, "findClaims">;
    `);

    expect(allowed).toEqual([]);
    expect(forbidden).toEqual([
      "forbidden.port.ts: imports ../repositories/authorization.repository.ts; derives Pick<AuthorizationRepository>; derives Pick<ClaimsService>",
    ]);
  });

  it("keeps all production ports consumer-owned", () => {
    expect(collectProductionPortOwnershipViolations()).toEqual([]);
  });

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

  it("keeps claims, security, and session wiring under their explicit composition owners", () => {
    const sourceFiles = collectSourceFiles(sourceRoot)
      .map(file => toPosixPath(relative(sourceRoot, file)));
    const claimsSource = readFileSync(join(sourceRoot, "provider/claims.ts"), "utf8");
    const providerComposition = readFileSync(join(sourceRoot, "composition/provider/index.ts"), "utf8");
    const violations: string[] = [];

    if (!claimsSource.includes("createOidcClaimsAdapter") || !claimsSource.includes("OidcClaimsAdapter"))
      violations.push("provider/claims.ts does not expose Claims Adapter symbols");
    if (claimsSource.includes("createOidcClaimsService") || claimsSource.includes("OidcClaimsService"))
      violations.push("provider/claims.ts exposes legacy Claims Service symbols");
    violations.push(...sourceFiles
      .filter(file => file.startsWith("composition/services/"))
      .map(file => `${file} remains under mixed services composition`));

    violations.push(...collectSourceFiles(sourceRoot).flatMap((file) => {
      const relativeFile = toPosixPath(relative(sourceRoot, file));
      if (relativeFile === "composition/security/index.ts" || relativeFile.startsWith("security/"))
        return [];
      const source = readFileSync(file, "utf8");
      return ["createClientAuthRateLimiter", "createOidcClientSecretVerifier"]
        .filter(factory => source.includes(factory))
        .map(factory => `${relativeFile} materializes security component with ${factory}`);
    }));

    if (providerComposition.includes("services"))
      violations.push("composition/provider/index.ts depends on mixed services composition");
    if (providerComposition.includes("globalSessionResolver"))
      violations.push("composition/provider/index.ts uses a secondary global session resolver alias");

    expect(violations).toEqual([]);
  });
});
