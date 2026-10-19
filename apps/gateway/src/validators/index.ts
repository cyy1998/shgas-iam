import { isRecord } from "../manifest";
import { getLabel, isRepoManaged, ownershipPolicy, validateResourceScope } from "../ownership-policy";
import { getResourceId, resourceDefinitions } from "../resources";
import type { LoadedManifest, ManifestObject, ResourceKind, ValidationIssue } from "../types";

type Validator = (manifest: LoadedManifest) => ValidationIssue[];

const validators: Validator[] = [
  validateSourceSchema,
  validateIds,
  validateOwnershipLabels,
  validateScopeLabels,
  validateReferences,
  validateTlsMaterial,
  validateSensitiveValues,
  validateTrustedProxy,
  validateIamLoggingPolicy,
];

function validateTlsMaterial(manifest: LoadedManifest): ValidationIssue[] {
  return manifest.resources.ssls.flatMap((resource, index) =>
    typeof resource.cert === "string" &&
    resource.cert.length > 0 &&
    typeof resource.key === "string" &&
    resource.key.length > 0
      ? []
      : [{ code: "SSL_MATERIAL_REQUIRED", file: manifest.manifest, path: `ssls[${index}]` }],
  );
}

const generatedSourceFields = ["id", "name", "service_id", "upstream_id", "plugin_config_id"];
const reservedSourceLabels = ["managed_by", "source", "env", "app"];
const localKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateManifest(
  manifest: LoadedManifest,
  options: { sensitiveValues?: boolean } = {},
): ValidationIssue[] {
  return validators
    .filter((validator) => options.sensitiveValues !== false || validator !== validateSensitiveValues)
    .flatMap((validator) => validator(manifest));
}

function validateSourceSchema(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const source = manifest.source;
  const service = source.service;
  const serviceIsRecord = isRecord(service);

  if (!serviceIsRecord) {
    issues.push({
      code: "SERVICE_REQUIRED",
      file: manifest.manifest,
      path: "service",
    });
  }

  if (Object.hasOwn(source, "plugin_configs")) {
    issues.push({
      code: "PLUGIN_CONFIGS_LOCATION",
      file: manifest.manifest,
      path: "plugin_configs",
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

function validateLocalKeys(file: string, sourcePath: string, items: ManifestObject[], issues: ValidationIssue[]): void {
  const seen = new Set<string>();

  for (const [index, item] of items.entries()) {
    const key = item.key;
    const keyPath = `${sourcePath}[${index}].key`;

    if (typeof key !== "string") {
      issues.push({
        code: "LOCAL_KEY_REQUIRED",
        file,
        path: keyPath,
      });
      continue;
    }

    if (!localKeyPattern.test(key)) {
      issues.push({
        code: "LOCAL_KEY_INVALID",
        file,
        path: keyPath,
      });
    }

    if (seen.has(key)) {
      issues.push({
        code: "LOCAL_KEY_DUPLICATE",
        file,
        path: keyPath,
      });
      continue;
    }

    seen.add(key);
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
        code: "GENERATED_FIELD",
        file,
        path: `${basePath}.${field}`,
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
        code: "RESERVED_LABEL",
        file,
        path: `${basePath}.labels.${label}`,
      });
    }
  }
}

function validateRouteSourceReferences(manifest: LoadedManifest, issues: ValidationIssue[]): void {
  const upstreamKeys = new Set(
    getSourceListItems(manifest.source.upstreams)
      .map((item) => item.key)
      .filter((key): key is string => typeof key === "string"),
  );
  const pluginConfigKeys = new Set(
    getSourceListItems(isRecord(manifest.source.service) ? manifest.source.service.plugin_configs : undefined)
      .map((item) => item.key)
      .filter((key): key is string => typeof key === "string"),
  );

  for (const [index, route] of getSourceListItems(manifest.source.routes).entries()) {
    if (route.terminal !== true) {
      if (typeof route.upstream !== "string") {
        issues.push({
          code: "UPSTREAM_REQUIRED",
          file: manifest.manifest,
          path: `routes[${index}].upstream`,
        });
      } else if (!upstreamKeys.has(route.upstream)) {
        issues.push({
          code: "REFERENCE_NOT_FOUND",
          file: manifest.manifest,
          path: `routes[${index}].upstream`,
        });
      }
    }

    if (route.plugin_config !== undefined) {
      if (typeof route.plugin_config !== "string") {
        issues.push({
          code: "PLUGIN_CONFIG_REFERENCE_INVALID",
          file: manifest.manifest,
          path: `routes[${index}].plugin_config`,
        });
      } else if (!pluginConfigKeys.has(route.plugin_config)) {
        issues.push({
          code: "REFERENCE_NOT_FOUND",
          file: manifest.manifest,
          path: `routes[${index}].plugin_config`,
        });
      }
    }
  }
}

function getSourceLists(manifest: LoadedManifest): Array<{ path: string; items: ManifestObject[] }> {
  return [
    { path: "upstreams", items: getSourceListItems(manifest.source.upstreams) },
    { path: "plugin_metadata", items: getSourceListItems(manifest.source.plugin_metadata) },
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
          code: "ID_REQUIRED",
          file,
          path: basePath,
        });
      } else if (ids.has(id)) {
        issues.push({
          code: "ID_DUPLICATE",
          file,
          path: `${basePath}.${definition.idFields[0]}`,
        });
      } else {
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
          code: "OWNERSHIP_LABELS_REQUIRED",
          file,
          path: `${basePath}.labels`,
        });
      }

      if (getLabel(resource, ownershipPolicy.labelKeys.source) === ownershipPolicy.dynamicSource) {
        issues.push({
          code: "DYNAMIC_SOURCE_FORBIDDEN",
          file,
          path: `${basePath}.labels.source`,
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
          .map((resource) => getResourceId(definition, resource))
          .filter((id): id is string => id !== undefined),
      ),
    );
  }

  for (const definition of resourceDefinitions) {
    const file = manifest.manifest;
    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      for (const reference of definition.references) {
        const targetId = resource[reference.field];
        if (typeof targetId !== "string") {
          continue;
        }

        const targetIds = idsByKind.get(reference.targetKind) ?? new Set<string>();
        if (!targetIds.has(targetId)) {
          issues.push({
            code: "REFERENCE_NOT_FOUND",
            file,
            path: `${definition.topKey}[${index}].${reference.field}`,
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
      collectSensitiveIssues(file, `${definition.topKey}[${index}]`, resource, definition.kind, issues);
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
  if (!manifest.resources.plugin_metadata.some((metadata) => metadata.id === "opentelemetry")) {
    issues.push({
      code: "IAM_TELEMETRY_REQUIRED",
      file: manifest.manifest,
      path: "plugin_metadata",
    });
  }

  const pluginConfigsById = new Map(
    manifest.resources.plugin_configs
      .filter((config) => typeof config.id === "string")
      .map((config) => [config.id as string, config]),
  );

  for (const [index, route] of manifest.resources.routes.entries()) {
    const routePlugins = getPlugins(route);
    collectForbiddenLoggerPluginIssues(manifest.manifest, `routes[${index}].plugins`, routePlugins, issues);

    const pluginConfig =
      typeof route.plugin_config_id === "string" ? pluginConfigsById.get(route.plugin_config_id) : undefined;
    if (!hasPlugin(routePlugins, "request-id") && !hasPlugin(getPlugins(pluginConfig), "request-id")) {
      issues.push({
        code: "IAM_REQUEST_ID_REQUIRED",
        file: manifest.manifest,
        path: `routes[${index}]`,
      });
    }

    if (!hasPlugin(routePlugins, "opentelemetry") && !hasPlugin(getPlugins(pluginConfig), "opentelemetry")) {
      issues.push({
        code: "IAM_TRACING_REQUIRED",
        file: manifest.manifest,
        path: `routes[${index}]`,
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
  if (!isRecord(resource)) return undefined;
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
  if (!plugins) return;
  for (const pluginName of ["loki-logger", "http-logger", "file-logger"]) {
    if (hasPlugin(plugins, pluginName)) {
      issues.push({
        code: "IAM_LOGGER_FORBIDDEN",
        file,
        path: `${basePath}.${pluginName}`,
      });
    }
  }
}

function collectSensitiveIssues(
  file: string,
  basePath: string,
  value: unknown,
  kind: ResourceKind,
  issues: ValidationIssue[],
): void {
  walkValue(value, basePath, (currentPath, currentValue, segments) => {
    if (typeof currentValue === "string" && containsSecretMaterial(currentValue) && !isSecretReference(currentValue)) {
      issues.push({
        code: "SECRET_REFERENCE_REQUIRED",
        file,
        path: currentPath,
      });
      return;
    }

    if (
      typeof currentValue === "string" &&
      isSensitiveField(kind, segments) &&
      !isAllowedSensitivePlaceholder(currentValue)
    ) {
      issues.push({
        code: "SECRET_REFERENCE_REQUIRED",
        file,
        path: currentPath,
      });
    }
  });
}

function collectTrustedProxyIssues(file: string, basePath: string, value: unknown, issues: ValidationIssue[]): void {
  walkValue(value, basePath, (currentPath, currentValue) => {
    if (
      typeof currentValue === "string" &&
      /\.plugins\.real-ip\.trusted_addresses\[\d+\]$/.test(currentPath) &&
      isAllAddressesCidr(currentValue)
    ) {
      issues.push({
        code: "TRUSTED_PROXY_ALL_ADDRESSES",
        file,
        path: currentPath,
      });
    }
  });
}

function walkValue(
  value: unknown,
  currentPath: string,
  visitor: (path: string, value: unknown, segments: readonly (string | number)[]) => void,
  segments: readonly (string | number)[] = [],
): void {
  visitor(currentPath, value, segments);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkValue(item, `${currentPath}[${index}]`, visitor, [...segments, index]);
    });
    return;
  }

  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      walkValue(child, `${currentPath}.${key}`, visitor, [...segments, key]);
    }
  }
}

function containsSecretMaterial(value: string): boolean {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value) ||
    /(?:password|secret|private[_-]?key|admin[_-]?key|jwt[_-]?secret|signature[_-]?key)\s*[:=]/i.test(value)
  );
}

function isAllAddressesCidr(value: string): boolean {
  return value === "0.0.0.0/0" || value === "::/0";
}

function isSensitiveField(kind: ResourceKind, segments: readonly (string | number)[]): boolean {
  const key = segments.at(-1);
  if (typeof key !== "string") return false;
  if (
    /^(?:password|secret|private[_-]?key|admin[_-]?key|jwt[_-]?secret|signature[_-]?key|apikey|api[_-]?key)$/i.test(key)
  ) {
    return true;
  }
  return (
    (kind === "ssls" && segments.length === 1 && key === "key") ||
    (segments.length === 3 && segments[0] === "plugins" && segments[1] === "key-auth" && key === "key") ||
    (kind === "consumers" &&
      segments.length === 4 &&
      segments[0] === "credentials" &&
      typeof segments[1] === "number" &&
      segments[2] === "config" &&
      key === "key")
  );
}

function isAllowedSensitivePlaceholder(value: string): boolean {
  return isSecretReference(value) || value.startsWith("${") || value.endsWith("_REF");
}

function isSecretReference(value: string): boolean {
  return /^\$\{[A-Z0-9_]+(?::[^}]*)?\}$/.test(value) || /^secret:\/\//.test(value) || /^vault:\/\//.test(value);
}
