import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

type ResourceKind = "routes" | "upstreams" | "services" | "plugin_configs" | "consumers" | "ssls";

type ManifestObject = Record<string, unknown>;

interface ResourceDefinition {
  kind: ResourceKind;
  fileName: string;
  topKey: string;
  endpoint: string;
  idFields: string[];
}

interface LoadedManifest {
  env: string;
  manifestDir: string;
  resources: Record<ResourceKind, ManifestObject[]>;
}

interface ValidationIssue {
  file: string;
  path: string;
  message: string;
}

interface PlannedChange {
  kind: ResourceKind;
  id: string;
  desired?: ManifestObject;
  remote?: ManifestObject;
}

interface ChangePlan {
  creates: PlannedChange[];
  updates: PlannedChange[];
  deletes: PlannedChange[];
  ignoredDynamic: PlannedChange[];
  ignoredUnmanaged: PlannedChange[];
}

interface ApplyResult {
  plan: ChangePlan;
  dryRun: boolean;
  prune: boolean;
  applied: {
    created: PlannedChange[];
    updated: PlannedChange[];
    deleted: PlannedChange[];
  };
}

interface CliOptions {
  env: string;
  manifestDir?: string;
  adminUrl: string;
  adminKey?: string;
  dryRun: boolean;
  prune: boolean;
  json: boolean;
}

const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));

const resourceDefinitions: ResourceDefinition[] = [
  {
    kind: "routes",
    fileName: "routes.yaml",
    topKey: "routes",
    endpoint: "routes",
    idFields: ["id"],
  },
  {
    kind: "upstreams",
    fileName: "upstreams.yaml",
    topKey: "upstreams",
    endpoint: "upstreams",
    idFields: ["id"],
  },
  {
    kind: "services",
    fileName: "services.yaml",
    topKey: "services",
    endpoint: "services",
    idFields: ["id"],
  },
  {
    kind: "plugin_configs",
    fileName: "plugin-configs.yaml",
    topKey: "plugin_configs",
    endpoint: "plugin_configs",
    idFields: ["id"],
  },
  {
    kind: "consumers",
    fileName: "consumers.yaml",
    topKey: "consumers",
    endpoint: "consumers",
    idFields: ["username", "id"],
  },
  {
    kind: "ssls",
    fileName: "ssl.yaml",
    topKey: "ssls",
    endpoint: "ssls",
    idFields: ["id"],
  },
];

const managedBy = "shgas-iam";
const repoSource = "repo-manifest";
const dynamicSource = "dynamic-registry";
const generatedRemoteFields = new Set(["create_time", "update_time", "modifiedIndex", "key"]);
const apisixDefaultFields: Record<string, unknown> = {
  hash_on: "vars",
  priority: 0,
  status: 1,
};
const writeOrder: ResourceKind[] = ["upstreams", "plugin_configs", "services", "consumers", "ssls", "routes"];
const deleteOrder: ResourceKind[] = [...writeOrder].reverse();

export async function loadManifest(env: string, manifestDir = defaultManifestDir(env)): Promise<LoadedManifest> {
  const resources = emptyResources();

  for (const definition of resourceDefinitions) {
    const filePath = path.join(manifestDir, definition.fileName);
    const parsed = await readYamlFile(filePath);
    const value = parsed[definition.topKey] ?? [];

    if (!Array.isArray(value)) {
      throw new Error(`${relativePath(filePath)} must contain an array at ${definition.topKey}`);
    }

    resources[definition.kind] = value.map((item, index) => {
      if (!isRecord(item)) {
        throw new Error(`${relativePath(filePath)} ${definition.topKey}[${index}] must be an object`);
      }
      return item;
    });
  }

  return { env, manifestDir, resources };
}

export function validateManifest(manifest: LoadedManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const idsByKind = new Map<ResourceKind, Set<string>>();

  for (const definition of resourceDefinitions) {
    const ids = new Set<string>();
    idsByKind.set(definition.kind, ids);

    for (const [index, resource] of manifest.resources[definition.kind].entries()) {
      const file = path.join(manifest.manifestDir, definition.fileName);
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

      if (!isRepoManaged(resource)) {
        issues.push({
          file,
          path: `${basePath}.labels`,
          message: `repo manifest objects must include labels.managed_by=${managedBy} and labels.source=${repoSource}`,
        });
      }

      if (getLabel(resource, "source") === dynamicSource) {
        issues.push({
          file,
          path: `${basePath}.labels.source`,
          message: "dynamic-registry objects are owned by IAM runtime state and must not be declared in repo manifests",
        });
      }

      collectSensitiveIssues(file, basePath, resource, issues);
    }
  }

  validateReferences(manifest, idsByKind, issues);

  return issues;
}

export function planChanges(manifest: LoadedManifest, remote: Record<ResourceKind, ManifestObject[]>): ChangePlan {
  const plan: ChangePlan = {
    creates: [],
    updates: [],
    deletes: [],
    ignoredDynamic: [],
    ignoredUnmanaged: [],
  };

  for (const definition of resourceDefinitions) {
    const desired = new Map<string, ManifestObject>();

    for (const resource of manifest.resources[definition.kind]) {
      const id = getResourceId(definition, resource);
      if (id) {
        desired.set(id, resource);
      }
    }

    const remoteById = new Map<string, ManifestObject>();
    for (const resource of remote[definition.kind] ?? []) {
      const id = getResourceId(definition, resource);
      if (id) {
        remoteById.set(id, resource);
      }
    }

    for (const [id, desiredResource] of desired.entries()) {
      const remoteResource = remoteById.get(id);
      if (!remoteResource) {
        plan.creates.push({ kind: definition.kind, id, desired: desiredResource });
        continue;
      }

      if (stableStringify(normalizeForCompare(desiredResource)) !== stableStringify(normalizeForCompare(remoteResource))) {
        plan.updates.push({ kind: definition.kind, id, desired: desiredResource, remote: remoteResource });
      }
    }

    for (const [id, remoteResource] of remoteById.entries()) {
      if (desired.has(id)) {
        continue;
      }

      if (isDynamicRegistryManaged(remoteResource)) {
        plan.ignoredDynamic.push({ kind: definition.kind, id, remote: remoteResource });
      }
      else if (isRepoManaged(remoteResource)) {
        plan.deletes.push({ kind: definition.kind, id, remote: remoteResource });
      }
      else {
        plan.ignoredUnmanaged.push({ kind: definition.kind, id, remote: remoteResource });
      }
    }
  }

  return plan;
}

export async function loadRemoteState(client: ApisixAdminClient): Promise<Record<ResourceKind, ManifestObject[]>> {
  const remote = emptyResources();

  for (const definition of resourceDefinitions) {
    remote[definition.kind] = await client.list(definition);
  }

  return remote;
}

export async function applyPlan(
  client: ApisixAdminClient,
  plan: ChangePlan,
  options: { dryRun: boolean; prune: boolean },
): Promise<ApplyResult> {
  const applied = {
    created: [] as PlannedChange[],
    updated: [] as PlannedChange[],
    deleted: [] as PlannedChange[],
  };

  if (!options.dryRun) {
    for (const change of sortChanges(plan.creates, writeOrder)) {
      await client.upsert(change.kind, change.id, change.desired ?? {});
      applied.created.push(change);
    }

    for (const change of sortChanges(plan.updates, writeOrder)) {
      await client.upsert(change.kind, change.id, change.desired ?? {});
      applied.updated.push(change);
    }

    if (options.prune) {
      for (const change of sortChanges(plan.deletes, deleteOrder)) {
        await client.delete(change.kind, change.id);
        applied.deleted.push(change);
      }
    }
  }

  return {
    plan,
    dryRun: options.dryRun,
    prune: options.prune,
    applied,
  };
}

export class ApisixAdminClient {
  private readonly baseUrl: string;
  private readonly adminKey?: string;

  constructor(options: { adminUrl: string; adminKey?: string }) {
    this.baseUrl = options.adminUrl.replace(/\/+$/, "");
    this.adminKey = options.adminKey;
  }

  async list(definition: ResourceDefinition): Promise<ManifestObject[]> {
    const body = await this.request("GET", definition.endpoint);
    return unwrapApisixList(definition, body);
  }

  async upsert(kind: ResourceKind, id: string, resource: ManifestObject): Promise<void> {
    const definition = getDefinition(kind);
    await this.request("PUT", `${definition.endpoint}/${encodeURIComponent(id)}`, resource);
  }

  async delete(kind: ResourceKind, id: string): Promise<void> {
    const definition = getDefinition(kind);
    await this.request("DELETE", `${definition.endpoint}/${encodeURIComponent(id)}`);
  }

  private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.adminKey) {
      headers["X-API-KEY"] = this.adminKey;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}/${endpoint.replace(/^\/+/, "")}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`APISIX Admin API ${method} ${endpoint} failed: ${response.status} ${text}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const options = parseCliOptions(args);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (!["validate", "diff", "apply"].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

  const manifest = await loadManifest(options.env, options.manifestDir);
  const issues = validateManifest(manifest);

  if (issues.length > 0) {
    printValidationIssues(issues, options.json);
    process.exitCode = 1;
    return;
  }

  if (command === "validate") {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, env: manifest.env, resources: countResources(manifest.resources) }, null, 2));
    }
    else {
      console.log(`APISIX manifest validation passed for env=${manifest.env}`);
      printResourceCounts(manifest.resources);
    }
    return;
  }

  const adminKey = options.adminKey ?? process.env.APISIX_ADMIN_KEY;
  if (!adminKey) {
    throw new Error("APISIX_ADMIN_KEY is required for diff/apply");
  }

  const client = new ApisixAdminClient({
    adminUrl: options.adminUrl,
    adminKey,
  });
  const remote = await loadRemoteState(client);
  const plan = planChanges(manifest, remote);

  if (command === "diff") {
    printPlan(plan, options.json);
    return;
  }

  const result = await applyPlan(client, plan, { dryRun: options.dryRun, prune: options.prune });
  printApplyResult(result, options.json);
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    env: process.env.APISIX_MANIFEST_ENV ?? "dev",
    adminUrl: process.env.APISIX_ADMIN_URL ?? "http://127.0.0.1:9180/apisix/admin",
    adminKey: process.env.APISIX_ADMIN_KEY,
    dryRun: false,
    prune: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--") {
      continue;
    }
    else if (arg === "--env") {
      options.env = requireValue(arg, next);
      index += 1;
    }
    else if (arg === "--manifest-dir") {
      options.manifestDir = requireValue(arg, next);
      index += 1;
    }
    else if (arg === "--admin-url") {
      options.adminUrl = requireValue(arg, next);
      index += 1;
    }
    else if (arg === "--admin-key") {
      options.adminKey = requireValue(arg, next);
      index += 1;
    }
    else if (arg === "--dry-run") {
      options.dryRun = true;
    }
    else if (arg === "--prune") {
      options.prune = true;
    }
    else if (arg === "--json") {
      options.json = true;
    }
    else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function requireValue(option: string, value: string | undefined): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function defaultManifestDir(env: string): string {
  return path.join(repoRoot, "gateway/apisix/manifests", env);
}

async function readYamlFile(filePath: string): Promise<ManifestObject> {
  const content = await readFile(filePath, "utf8");
  const parsed = parseYaml(content) ?? {};

  if (!isRecord(parsed)) {
    throw new Error(`${relativePath(filePath)} must contain a YAML object`);
  }

  return parsed;
}

function validateReferences(
  manifest: LoadedManifest,
  idsByKind: Map<ResourceKind, Set<string>>,
  issues: ValidationIssue[],
): void {
  const upstreamIds = idsByKind.get("upstreams") ?? new Set<string>();
  const serviceIds = idsByKind.get("services") ?? new Set<string>();
  const pluginConfigIds = idsByKind.get("plugin_configs") ?? new Set<string>();

  for (const [index, route] of manifest.resources.routes.entries()) {
    const file = path.join(manifest.manifestDir, "routes.yaml");
    const routeId = String(route.id ?? `routes[${index}]`);

    addMissingReferenceIssue({
      file,
      path: `routes[${index}].service_id`,
      ownerId: routeId,
      targetId: route.service_id,
      targetIds: serviceIds,
      targetType: "service",
      issues,
    });
    addMissingReferenceIssue({
      file,
      path: `routes[${index}].upstream_id`,
      ownerId: routeId,
      targetId: route.upstream_id,
      targetIds: upstreamIds,
      targetType: "upstream",
      issues,
    });
    addMissingReferenceIssue({
      file,
      path: `routes[${index}].plugin_config_id`,
      ownerId: routeId,
      targetId: route.plugin_config_id,
      targetIds: pluginConfigIds,
      targetType: "plugin_config",
      issues,
    });
  }

  for (const [index, service] of manifest.resources.services.entries()) {
    const file = path.join(manifest.manifestDir, "services.yaml");
    const serviceId = String(service.id ?? `services[${index}]`);

    addMissingReferenceIssue({
      file,
      path: `services[${index}].upstream_id`,
      ownerId: serviceId,
      targetId: service.upstream_id,
      targetIds: upstreamIds,
      targetType: "upstream",
      issues,
    });
  }
}

function addMissingReferenceIssue(options: {
  file: string;
  path: string;
  ownerId: string;
  targetId: unknown;
  targetIds: Set<string>;
  targetType: string;
  issues: ValidationIssue[];
}): void {
  if (typeof options.targetId !== "string") {
    return;
  }

  if (!options.targetIds.has(options.targetId)) {
    options.issues.push({
      file: options.file,
      path: options.path,
      message: `${options.ownerId} references missing ${options.targetType} ${options.targetId}`,
    });
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
  return currentPath.endsWith(".labels.source")
    || currentPath.endsWith(".labels.managed_by")
    || currentPath.endsWith(".labels.env")
    || currentPath.endsWith(".labels.template")
    || currentPath.endsWith(".plugins.prometheus.prefer_name");
}

function getResourceId(definition: ResourceDefinition, resource: ManifestObject): string | undefined {
  for (const field of definition.idFields) {
    const value = resource[field];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

function getLabel(resource: ManifestObject, name: string): string | undefined {
  const labels = resource.labels;
  if (!isRecord(labels)) {
    return undefined;
  }

  const value = labels[name];
  return typeof value === "string" ? value : undefined;
}

function isRepoManaged(resource: ManifestObject): boolean {
  return getLabel(resource, "managed_by") === managedBy && getLabel(resource, "source") === repoSource;
}

function isDynamicRegistryManaged(resource: ManifestObject): boolean {
  return getLabel(resource, "managed_by") === managedBy && getLabel(resource, "source") === dynamicSource;
}

function normalizeForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizeForCompare(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (generatedRemoteFields.has(key) || child === undefined) {
      continue;
    }
    if (Object.is(apisixDefaultFields[key], child)) {
      continue;
    }
    normalized[key] = normalizeForCompare(child);
  }

  return normalized;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortChanges(changes: PlannedChange[], order: ResourceKind[]): PlannedChange[] {
  return [...changes].sort((left, right) => {
    const leftIndex = order.indexOf(left.kind);
    const rightIndex = order.indexOf(right.kind);
    return leftIndex - rightIndex || left.id.localeCompare(right.id);
  });
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sortKeys(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, sortKeys(value[key])]),
  );
}

function unwrapApisixList(definition: ResourceDefinition, body: unknown): ManifestObject[] {
  if (Array.isArray(body)) {
    return body.filter(isRecord);
  }

  if (!isRecord(body)) {
    return [];
  }

  const candidate = Array.isArray(body.list)
    ? body.list
    : isRecord(body.value) && Array.isArray(body.value.list)
      ? body.value.list
      : Array.isArray(body.value)
        ? body.value
        : [];

  return candidate
    .map((item) => {
      if (!isRecord(item)) {
        return undefined;
      }

      const value = isRecord(item.value) ? { ...item.value } : { ...item };
      if (!getResourceId(definition, value) && typeof item.key === "string") {
        const id = item.key.split("/").filter(Boolean).at(-1);
        if (id) {
          value[definition.idFields[0]] = id;
        }
      }
      return value;
    })
    .filter(isRecord);
}

function getDefinition(kind: ResourceKind): ResourceDefinition {
  const definition = resourceDefinitions.find(item => item.kind === kind);
  if (!definition) {
    throw new Error(`Unknown resource kind: ${kind}`);
  }
  return definition;
}

function emptyResources(): Record<ResourceKind, ManifestObject[]> {
  return {
    routes: [],
    upstreams: [],
    services: [],
    plugin_configs: [],
    consumers: [],
    ssls: [],
  };
}

function countResources(resources: Record<ResourceKind, ManifestObject[]>): Record<ResourceKind, number> {
  return Object.fromEntries(
    resourceDefinitions.map(definition => [definition.kind, resources[definition.kind].length]),
  ) as Record<ResourceKind, number>;
}

function printResourceCounts(resources: Record<ResourceKind, ManifestObject[]>): void {
  const counts = countResources(resources);
  for (const definition of resourceDefinitions) {
    console.log(`- ${definition.kind}: ${counts[definition.kind]}`);
  }
}

function printValidationIssues(issues: ValidationIssue[], asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify({ ok: false, issues: serializeIssues(issues) }, null, 2));
    return;
  }

  console.error(`APISIX manifest validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- ${relativePath(issue.file)}:${issue.path} ${issue.message}`);
  }
}

function printPlan(plan: ChangePlan, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(serializePlan(plan), null, 2));
    return;
  }

  console.log("APISIX gateway diff:");
  printChangeGroup("create", plan.creates);
  printChangeGroup("update", plan.updates);
  printChangeGroup("delete candidates", plan.deletes);
  printChangeGroup("ignored dynamic-registry", plan.ignoredDynamic);
  printChangeGroup("ignored unmanaged", plan.ignoredUnmanaged);
}

function printApplyResult(result: ApplyResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify({
      ...serializePlan(result.plan),
      dryRun: result.dryRun,
      prune: result.prune,
      applied: serializeApplied(result.applied),
    }, null, 2));
    return;
  }

  console.log(result.dryRun ? "APISIX apply dry-run complete:" : "APISIX apply complete:");
  printChangeGroup("planned create", result.plan.creates);
  printChangeGroup("planned update", result.plan.updates);
  printChangeGroup(result.prune ? "planned delete" : "delete candidates (use --prune)", result.plan.deletes);
  printChangeGroup("ignored dynamic-registry", result.plan.ignoredDynamic);
  printChangeGroup("ignored unmanaged", result.plan.ignoredUnmanaged);

  if (!result.dryRun) {
    printChangeGroup("created", result.applied.created);
    printChangeGroup("updated", result.applied.updated);
    printChangeGroup("deleted", result.applied.deleted);
  }
}

function printChangeGroup(label: string, changes: PlannedChange[]): void {
  console.log(`- ${label}: ${changes.length}`);
  for (const change of changes) {
    console.log(`  - ${change.kind}/${change.id}`);
  }
}

function serializePlan(plan: ChangePlan): Record<string, unknown> {
  return {
    creates: serializeChanges(plan.creates),
    updates: serializeChanges(plan.updates),
    deletes: serializeChanges(plan.deletes),
    ignoredDynamic: serializeChanges(plan.ignoredDynamic),
    ignoredUnmanaged: serializeChanges(plan.ignoredUnmanaged),
  };
}

function serializeApplied(applied: ApplyResult["applied"]): Record<string, unknown> {
  return {
    created: serializeChanges(applied.created),
    updated: serializeChanges(applied.updated),
    deleted: serializeChanges(applied.deleted),
  };
}

function serializeChanges(changes: PlannedChange[]): Array<Pick<PlannedChange, "kind" | "id">> {
  return changes.map(change => ({ kind: change.kind, id: change.id }));
}

function serializeIssues(issues: ValidationIssue[]): Array<{ file: string; path: string; message: string }> {
  return issues.map(issue => ({
    file: relativePath(issue.file),
    path: issue.path,
    message: issue.message,
  }));
}

function printHelp(): void {
  console.log(`Usage:
  bun gateway/apisix/scripts/apisix-sync.ts validate [--env dev]
  bun gateway/apisix/scripts/apisix-sync.ts diff --env dev --admin-url http://127.0.0.1:9180/apisix/admin
  bun gateway/apisix/scripts/apisix-sync.ts apply --env dev --dry-run
  bun gateway/apisix/scripts/apisix-sync.ts apply --env dev --prune

Options:
  --env <name>             Manifest environment, default: dev
  --manifest-dir <path>    Override manifest directory
  --admin-url <url>        APISIX Admin API base URL
  --admin-key <key>        APISIX Admin API key, or use APISIX_ADMIN_KEY
  --dry-run                Plan apply without writes
  --prune                  Delete repo-managed remote objects removed from manifest
  --json                   Print machine-readable output`);
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath);
}

function isRecord(value: unknown): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
