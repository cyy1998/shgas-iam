import type { LoadedManifest, ManifestObject, ResourceKind, ValidationIssue } from "../types";
import { isRecord } from "../manifest";
import { getLabel, isRepoManaged, ownershipPolicy, validateResourceScope } from "../ownership-policy";
import { getResourceId, resourceDefinitions } from "../resources";

type Validator = (manifest: LoadedManifest) => ValidationIssue[];

const validators: Validator[] = [
  validateSourceSchema,
  validateIds,
  validateOwnershipLabels,
  validateScopeLabels,
  validateReferences,
  validateSensitiveValues,
  validateTrustedProxy,
  validateIamLoggingPolicy,
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

const generatedSourceFields = ["id", "name", "service_id", "upstream_id", "plugin_config_id"];
const reservedSourceLabels = ["managed_by", "source", "env", "app"];
const localKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateManifest(manifest: LoadedManifest): ValidationIssue[] {
  return validators.flatMap(validator => validator(manifest));
}

function validateSourceSchema(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const source = manifest.source;
  const service = source.service;
  const serviceIsRecord = isRecord(service);

  if (!serviceIsRecord) {
    issues.push({
      file: manifest.manifest,
      path: "service",
      message: "source manifest must contain exactly one service object",
    });
  }

  if (Object.hasOwn(source, "plugin_configs")) {
    issues.push({
      file: manifest.manifest,
      path: "plugin_configs",
      message: "top-level plugin_configs are not allowed; use service.plugin_configs",
    });
  }

  if (serviceIsRecord) {
    validateGeneratedFields(manifest.manifest, "service", service, issues);
    validateReservedLabels(manifest.manifest, "service", service, issues);
  }

  for (const sourceList of getSourceLists(manifest)) {
    validateLocalKeys(manifest.manifest, sourceList.path, sourceList.items, issues);
    for (const [index, item] of sourceList.items.entries()) {
      const basePath = `${sourceList.path}[${index}]`;
      validateGeneratedFields(manifest.manifest, basePath, item, issues);
      validateReservedLabels(manifest.manifest, basePath, item, issues);
    }
  }

  validateRouteSourceReferences(manifest, issues);

  return issues;
}

function validateLocalKeys(
  file: string,
  sourcePath: string,
  items: ManifestObject[],
  issues: ValidationIssue[],
): void {
  const seen = new Map<string, number>();

  for (const [index, item] of items.entries()) {
    const key = item.key;
    const keyPath = `${sourcePath}[${index}].key`;

    if (typeof key !== "string") {
      issues.push({
        file,
        path: keyPath,
        message: `${sourcePath}[${index}] must declare a string key`,
      });
      continue;
    }

    if (!localKeyPattern.test(key)) {
      issues.push({
        file,
        path: keyPath,
        message: `key ${key} must be a kebab-case segment`,
      });
    }

    const previous = seen.get(key);
    if (previous !== undefined) {
      issues.push({
        file,
        path: keyPath,
        message: `duplicate ${sourcePath} key ${key}; first declared at ${sourcePath}[${previous}].key`,
      });
      continue;
    }

    seen.set(key, index);
  }
}

function validateGeneratedFields(
  file: string,
  basePath: string,
  resource: ManifestObject,
  issues: ValidationIssue[],
): void {
  for (const field of generatedSourceFields) {
    if (Object.hasOwn(resource, field)) {
      issues.push({
        file,
        path: `${basePath}.${field}`,
        message: `${field} is generated and must not be declared in source manifests`,
      });
    }
  }
}

function validateReservedLabels(
  file: string,
  basePath: string,
  resource: ManifestObject,
  issues: ValidationIssue[],
): void {
  if (!isRecord(resource.labels)) {
    return;
  }

  for (const label of reservedSourceLabels) {
    if (Object.hasOwn(resource.labels, label)) {
      issues.push({
        file,
        path: `${basePath}.labels.${label}`,
        message: `reserved label ${label} cannot be overridden in source manifests`,
      });
    }
  }
}

function validateRouteSourceReferences(manifest: LoadedManifest, issues: ValidationIssue[]): void {
  const upstreamKeys = new Set(
    getSourceListItems(manifest.source.upstreams)
      .map(item => item.key)
      .filter((key): key is string => typeof key === "string"),
  );
  const pluginConfigKeys = new Set(
    getSourceListItems(isRecord(manifest.source.service) ? manifest.source.service.plugin_configs : undefined)
      .map(item => item.key)
      .filter((key): key is string => typeof key === "string"),
  );

  for (const [index, route] of getSourceListItems(manifest.source.routes).entries()) {
    const routeKey = typeof route.key === "string" ? route.key : `routes[${index}]`;

    if (route.terminal !== true) {
      if (typeof route.upstream !== "string") {
        issues.push({
          file: manifest.manifest,
          path: `routes[${index}].upstream`,
          message: `${routeKey} must declare upstream unless terminal is true`,
        });
      }
      else if (!upstreamKeys.has(route.upstream)) {
        issues.push({
          file: manifest.manifest,
          path: `routes[${index}].upstream`,
          message: `${routeKey} references missing upstream ${route.upstream}`,
        });
      }
    }

    if (route.plugin_config !== undefined) {
      if (typeof route.plugin_config !== "string") {
        issues.push({
          file: manifest.manifest,
          path: `routes[${index}].plugin_config`,
          message: `${routeKey} plugin_config must reference a service.plugin_configs key`,
        });
      }
      else if (!pluginConfigKeys.has(route.plugin_config)) {
        issues.push({
          file: manifest.manifest,
          path: `routes[${index}].plugin_config`,
          message: `${routeKey} references missing service plugin_config ${route.plugin_config}`,
        });
      }
    }
  }
}

function getSourceLists(manifest: LoadedManifest): Array<{ path: string; items: ManifestObject[] }> {
  return [
    { path: "upstreams", items: getSourceListItems(manifest.source.upstreams) },
    { path: "routes", items: getSourceListItems(manifest.source.routes) },
    {
      path: "service.plugin_configs",
      items: getSourceListItems(isRecord(manifest.source.service) ? manifest.source.service.plugin_configs : undefined),
    },
    { path: "consumers", items: getSourceListItems(manifest.source.consumers) },
    { path: "ssls", items: getSourceListItems(manifest.source.ssls) },
  ];
}

function getSourceListItems(value: unknown): ManifestObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function validateIds(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const definition of resourceDefinitions) {
    const ids = new Set<string>();
    const file = manifest.manifest;

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
    const file = manifest.manifest;
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
    const file = manifest.manifest;
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
    const file = manifest.manifest;
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
    const file = manifest.manifest;
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      collectSensitiveIssues(file, `${definition.topKey}[${index}]`, resource, issues);
    }
  }

  return issues;
}

function validateTrustedProxy(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const definition of resourceDefinitions) {
    const file = manifest.manifest;
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      collectTrustedProxyIssues(file, `${definition.topKey}[${index}]`, resource, issues);
    }
  }

  return issues;
}

function validateIamLoggingPolicy(manifest: LoadedManifest): ValidationIssue[] {
  if (manifest.scope.app !== "iam") {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const pluginConfigsById = new Map(
    manifest.resources.plugin_configs
      .filter(config => typeof config.id === "string")
      .map(config => [config.id as string, config]),
  );

  for (const [index, route] of manifest.resources.routes.entries()) {
    const routeId = typeof route.id === "string" ? route.id : `routes[${index}]`;
    const routePlugins = getPlugins(route);
    collectForbiddenLoggerPluginIssues(
      manifest.manifest,
      `routes[${index}].plugins`,
      routePlugins,
      issues,
    );

    const pluginConfig = typeof route.plugin_config_id === "string"
      ? pluginConfigsById.get(route.plugin_config_id)
      : undefined;
    if (!hasPlugin(routePlugins, "request-id") && !hasPlugin(getPlugins(pluginConfig), "request-id")) {
      issues.push({
        file: manifest.manifest,
        path: `routes[${index}]`,
        message: `${routeId} must enable request-id through route plugins or plugin_config_id`,
      });
    }
  }

  for (const [index, pluginConfig] of manifest.resources.plugin_configs.entries()) {
    collectForbiddenLoggerPluginIssues(
      manifest.manifest,
      `plugin_configs[${index}].plugins`,
      getPlugins(pluginConfig),
      issues,
    );
  }

  return issues;
}

function getPlugins(resource: unknown): Record<string, unknown> | undefined {
  if (!isRecord(resource))
    return undefined;
  const plugins = resource.plugins;
  return isRecord(plugins) ? plugins : undefined;
}

function hasPlugin(plugins: Record<string, unknown> | undefined, pluginName: string): boolean {
  return plugins !== undefined && Object.hasOwn(plugins, pluginName);
}

function collectForbiddenLoggerPluginIssues(
  file: string,
  basePath: string,
  plugins: Record<string, unknown> | undefined,
  issues: ValidationIssue[],
) {
  if (!plugins)
    return;
  for (const pluginName of ["loki-logger", "http-logger", "file-logger"]) {
    if (hasPlugin(plugins, pluginName)) {
      issues.push({
        file,
        path: `${basePath}.${pluginName}`,
        message: `${pluginName} must not be used for IAM system logs; use stdout/stderr collection through Alloy`,
      });
    }
  }
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
