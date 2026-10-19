import type { ManifestObject, ManifestScope, ValidationIssue } from "./types";

export const ownershipPolicy = {
  managedBy: "shgas-iam",
  repoSource: "repo-manifest",
  dynamicSource: "dynamic-registry",
  labelKeys: {
    managedBy: "managed_by",
    source: "source",
    env: "env",
    app: "app",
  },
} as const;

export function getLabel(resource: ManifestObject, name: string): string | undefined {
  const labels = resource.labels;
  if (!isRecord(labels)) {
    return undefined;
  }

  const value = labels[name];
  return typeof value === "string" ? value : undefined;
}

export function isRepoManaged(resource: ManifestObject): boolean {
  return (
    getLabel(resource, ownershipPolicy.labelKeys.managedBy) === ownershipPolicy.managedBy &&
    getLabel(resource, ownershipPolicy.labelKeys.source) === ownershipPolicy.repoSource
  );
}

export function isDynamicRegistryManaged(resource: ManifestObject): boolean {
  return (
    getLabel(resource, ownershipPolicy.labelKeys.managedBy) === ownershipPolicy.managedBy &&
    getLabel(resource, ownershipPolicy.labelKeys.source) === ownershipPolicy.dynamicSource
  );
}

export function isInManifestScope(resource: ManifestObject, scope: ManifestScope): boolean {
  return (
    getLabel(resource, ownershipPolicy.labelKeys.env) === scope.env &&
    getLabel(resource, ownershipPolicy.labelKeys.app) === scope.app
  );
}

export function validateResourceScope(
  file: string,
  basePath: string,
  resource: ManifestObject,
  scope: ManifestScope,
  issues: ValidationIssue[],
): void {
  if (getLabel(resource, ownershipPolicy.labelKeys.env) !== scope.env) {
    issues.push({
      code: "SCOPE_ENV_MISMATCH",
      file,
      path: `${basePath}.labels.env`,
    });
  }

  if (getLabel(resource, ownershipPolicy.labelKeys.app) !== scope.app) {
    issues.push({
      code: "SCOPE_APP_MISMATCH",
      file,
      path: `${basePath}.labels.app`,
    });
  }
}

function isRecord(value: unknown): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
