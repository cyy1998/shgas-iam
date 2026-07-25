import { posix, win32 } from "node:path";
import ts from "typescript";

const USER_PROFILE_SOURCE_PATH = "/packages/user-profile-read-model/src";
const USER_PROFILE_PACKAGE = "@iam/user-profile-read-model";
const USER_PROFILE_QUERY_MODULE = `${USER_PROFILE_PACKAGE}/query`;
const FORBIDDEN_IDENTIFIERS = new Set([
  "ExpandUserProfileScope",
  "ExpandUserProfileScopeJobPayload",
  "ExpandUserProfileScopeJobPayloadSchema",
  "UserProfileAffectedUserRepository",
  "UserProfileAffectedUserResolverPort",
  "UserProfileDirtyMarker",
  "UserProfileDirtyReason",
  "UserProfileDirtyRepository",
  "UserProfileJobProducer",
  "UserProfileRebuildJobQueuePort",
  "UserProfileScopeRepository",
  "UserProfileScopeType",
  "UserProfileScopeTypeSchema",
  "buildScopeExpansionJobId",
  "createUserProfileAffectedUserRepository",
  "createUserProfileDirtyMarker",
  "createUserProfileDirtyRepository",
  "createUserProfileJobProducer",
  "createUserProfileScopeExpansionCompatibility",
  "createUserProfileScopeRepository",
  "enqueueScopeExpansionJob",
  "markScopeDirty",
  "markUsersDirty",
  "profileDirtyMarker",
  "userProfileDirtyMarker",
]);

/**
 * Repository-convention maintainability guard, not a source-code security boundary.
 * It covers canonical static named imports/re-exports, ordinary cross-package paths,
 * and direct legacy identifiers without generalized data-flow or obfuscation analysis.
 */
export function collectUserProfileBusinessBoundaryViolations(file: string, sourceText: string) {
  if (isUserProfileSourceFile(file))
    return [];

  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const reasons = new Set<string>();

  function visit(node: ts.Node) {
    if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text))
      reasons.add(`uses forbidden identifier ${node.text}`);

    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && hasNamedImports(node.importClause)
    ) {
      inspectImport(node.moduleSpecifier.text, file, reasons);
    }

    if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.exportClause
      && ts.isNamedExports(node.exportClause)
    ) {
      inspectReExport(node.moduleSpecifier.text, file, reasons);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return reasons.size === 0
    ? []
    : [`${file}: ${[...reasons].sort().join("; ")}`];
}

function hasNamedImports(importClause: ts.ImportClause | undefined) {
  return importClause?.namedBindings !== undefined
    && ts.isNamedImports(importClause.namedBindings);
}

function inspectImport(
  moduleSpecifier: string,
  file: string,
  reasons: Set<string>,
) {
  const canonicalModule = canonicalizeUserProfileModuleSpecifier(
    moduleSpecifier,
    file,
  );
  if (
    isUserProfileModule(canonicalModule)
    && canonicalModule !== USER_PROFILE_QUERY_MODULE
  ) {
    reasons.add(`imports forbidden User Profile module ${moduleSpecifier}`);
  }
}

function inspectReExport(
  moduleSpecifier: string,
  file: string,
  reasons: Set<string>,
) {
  const canonicalModule = canonicalizeUserProfileModuleSpecifier(
    moduleSpecifier,
    file,
  );
  if (isUserProfileModule(canonicalModule))
    reasons.add(`re-exports forbidden User Profile module ${moduleSpecifier}`);
}

function isUserProfileModule(moduleSpecifier: string) {
  return moduleSpecifier === USER_PROFILE_PACKAGE
    || moduleSpecifier.startsWith(`${USER_PROFILE_PACKAGE}/`);
}

function canonicalizeUserProfileModuleSpecifier(
  moduleSpecifier: string,
  containingFile: string,
) {
  if (!isRelativeModuleSpecifier(moduleSpecifier))
    return moduleSpecifier;

  const pathApi = isWindowsPath(containingFile) ? win32 : posix;
  if (!pathApi.isAbsolute(containingFile))
    return moduleSpecifier;

  const relativeSpecifier = pathApi === posix
    ? moduleSpecifier.replaceAll("\\", "/")
    : moduleSpecifier;
  const resolvedModule = normalizePath(
    pathApi.resolve(pathApi.dirname(containingFile), relativeSpecifier),
  );
  const suffix = userProfileSourceSuffix(resolvedModule);
  if (suffix === undefined)
    return moduleSpecifier;

  const modulePath = suffix
    .replace(/\.[cm]?[jt]sx?$/u, "")
    .replace(/\/index$/u, "");
  return `${USER_PROFILE_PACKAGE}${modulePath}`;
}

function isUserProfileSourceFile(file: string) {
  return userProfileSourceSuffix(normalizePath(file)) !== undefined;
}

function isRelativeModuleSpecifier(moduleSpecifier: string) {
  return /^\.\.?[\\/]/u.test(moduleSpecifier);
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/");
}

function userProfileSourceSuffix(path: string) {
  const sourceIndex = path.lastIndexOf(USER_PROFILE_SOURCE_PATH);
  if (sourceIndex < 0)
    return undefined;
  const suffix = path.slice(sourceIndex + USER_PROFILE_SOURCE_PATH.length);
  return suffix === "" || suffix.startsWith("/") ? suffix : undefined;
}

function isWindowsPath(path: string) {
  return /^[a-z]:[\\/]/iu.test(path);
}
