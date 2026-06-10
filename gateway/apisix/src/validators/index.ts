import type { LoadedManifest, ResourceKind, ValidationIssue } from "../types";
import path from "node:path";
import { isRecord } from "../manifest";
import { getLabel, isRepoManaged, ownershipPolicy, validateResourceScope } from "../ownership-policy";
import { getResourceId, resourceDefinitions } from "../resources";

type Validator = (manifest: LoadedManifest) => ValidationIssue[];

const validators: Validator[] = [
  validateIds,
  validateOwnershipLabels,
  validateScopeLabels,
  validateReferences,
  validateSensitiveValues,
  validateTrustedProxy,
];

const knownNonSecretKeyPaths = [
  ".labels.source",
  ".labels.managed_by",
  ".labels.env",
  ".labels.app",
  ".labels.template",
  ".plugins.limit-req.key",
  ".plugins.prometheus.prefer_name",
];

export function validateManifest(manifest: LoadedManifest): ValidationIssue[] {
  return validators.flatMap(validator => validator(manifest));
}

function validateIds(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const definition of resourceDefinitions) {
    const ids = new Set<string>();
    const file = path.join(manifest.manifestDir, definition.fileName);

    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      const basePath = `${definition.topKey}[${index}]`;
      const id = getResourceId(definition, resource);

      if (!id) {
        issues.push({
          file,
          path: basePath,
          message: `missing required id field (${definition.idFields.join(" or ")})`,
        });
      }
      else if (ids.has(id)) {
        issues.push({
          file,
          path: `${basePath}.${definition.idFields[0]}`,
          message: `duplicate ${definition.kind} id ${id}`,
        });
      }
      else {
        ids.add(id);
      }
    }
  }

  return issues;
}

function validateOwnershipLabels(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const definition of resourceDefinitions) {
    const file = path.join(manifest.manifestDir, definition.fileName);
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      const basePath = `${definition.topKey}[${index}]`;

      if (!isRepoManaged(resource)) {
        issues.push({
          file,
          path: `${basePath}.labels`,
          message: `repo manifest objects must include labels.managed_by=${ownershipPolicy.managedBy} and labels.source=${ownershipPolicy.repoSource}`,
        });
      }

      if (getLabel(resource, ownershipPolicy.labelKeys.source) === ownershipPolicy.dynamicSource) {
        issues.push({
          file,
          path: `${basePath}.labels.source`,
          message: "dynamic-registry objects are owned by IAM runtime state and must not be declared in repo manifests",
        });
      }
    }
  }

  return issues;
}

function validateScopeLabels(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const definition of resourceDefinitions) {
    const file = path.join(manifest.manifestDir, definition.fileName);
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      validateResourceScope(file, `${definition.topKey}[${index}]`, resource, manifest.scope, issues);
    }
  }

  return issues;
}

function validateReferences(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const idsByKind = new Map<ResourceKind, Set<string>>();

  for (const definition of resourceDefinitions) {
    idsByKind.set(
      definition.kind,
      new Set(
        manifest.resources[definition.kind]
          .map(resource => getResourceId(definition, resource))
          .filter((id): id is string => id !== undefined),
      ),
    );
  }

  for (const definition of resourceDefinitions) {
    const file = path.join(manifest.manifestDir, definition.fileName);
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      const ownerId = getResourceId(definition, resource) ?? `${definition.topKey}[${index}]`;

      for (const reference of definition.references) {
        const targetId = resource[reference.field];
        if (typeof targetId !== "string") {
          continue;
        }

        const targetIds = idsByKind.get(reference.targetKind) ?? new Set<string>();
        if (!targetIds.has(targetId)) {
          issues.push({
            file,
            path: `${definition.topKey}[${index}].${reference.field}`,
            message: `${ownerId} references missing ${reference.targetName} ${targetId}`,
          });
        }
      }
    }
  }

  return issues;
}

function validateSensitiveValues(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const definition of resourceDefinitions) {
    const file = path.join(manifest.manifestDir, definition.fileName);
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      collectSensitiveIssues(file, `${definition.topKey}[${index}]`, resource, issues);
    }
  }

  return issues;
}

function validateTrustedProxy(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const definition of resourceDefinitions) {
    const file = path.join(manifest.manifestDir, definition.fileName);
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      collectTrustedProxyIssues(file, `${definition.topKey}[${index}]`, resource, issues);
    }
  }

  return issues;
}

function collectSensitiveIssues(file: string, basePath: string, value: unknown, issues: ValidationIssue[]): void {
  walkValue(value, basePath, (currentPath, currentValue) => {
    const key = currentPath.split(".").at(-1) ?? "";

    if (typeof currentValue === "string" && containsSecretMaterial(currentValue) && !isSecretReference(currentValue)) {
      issues.push({
        file,
        path: currentPath,
        message: "secret-looking value must be provided through external environment or secret management",
      });
      return;
    }

    if (
      typeof currentValue === "string"
      && isSensitiveKeyName(key)
      && !isAllowedSensitivePlaceholder(currentValue)
      && !isKnownNonSecretKeyPath(currentPath)
    ) {
      issues.push({
        file,
        path: currentPath,
        message: "sensitive field must use a placeholder or external secret reference",
      });
    }
  });
}

function collectTrustedProxyIssues(file: string, basePath: string, value: unknown, issues: ValidationIssue[]): void {
  walkValue(value, basePath, (currentPath, currentValue) => {
    if (
      typeof currentValue === "string"
      && /\.plugins\.real-ip\.trusted_addresses\[\d+\]$/.test(currentPath)
      && isAllAddressesCidr(currentValue)
    ) {
      issues.push({
        file,
        path: currentPath,
        message: "real-ip trusted_addresses must not trust all source addresses",
      });
    }
  });
}

function walkValue(value: unknown, currentPath: string, visitor: (path: string, value: unknown) => void): void {
  visitor(currentPath, value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValue(item, `${currentPath}[${index}]`, visitor));
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      walkValue(child, `${currentPath}.${key}`, visitor);
    }
  }
}

function containsSecretMaterial(value: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)
    || /(?:password|secret|private[_-]?key|admin[_-]?key|jwt[_-]?secret|signature[_-]?key)\s*[:=]/i.test(value);
}

function isAllAddressesCidr(value: string): boolean {
  return value === "0.0.0.0/0" || value === "::/0";
}

function isSensitiveKeyName(key: string): boolean {
  return /^(?:password|secret|private[_-]?key|admin[_-]?key|jwt[_-]?secret|signature[_-]?key|apikey|api[_-]?key|key)$/i.test(key);
}

function isAllowedSensitivePlaceholder(value: string): boolean {
  return isSecretReference(value) || value.startsWith("${") || value.endsWith("_REF");
}

function isSecretReference(value: string): boolean {
  return /^\$\{[A-Z0-9_]+(?::[^}]*)?\}$/.test(value) || /^secret:\/\//.test(value) || /^vault:\/\//.test(value);
}

function isKnownNonSecretKeyPath(currentPath: string): boolean {
  return knownNonSecretKeyPaths.some(pathSuffix => currentPath.endsWith(pathSuffix));
}
