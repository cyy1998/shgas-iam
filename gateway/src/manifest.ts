import type { EnvMap, LoadedManifest, ManifestObject, ManifestScope } from "./types";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { renderEnvValue } from "./env";
import { createEmptyResourceMap } from "./resources";

export const packageRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
export const repoRoot = path.resolve(packageRoot, "..");

const scopeSegmentPattern = /^[a-z0-9][a-z0-9-]*$/;

export async function loadManifest(
  env: string,
  manifest = defaultManifestPath(env),
  options: { renderEnv?: boolean; env?: EnvMap } = {},
): Promise<LoadedManifest> {
  const scope = parseManifestScope(env);
  const source = await readYamlFile(manifest, options);
  const resources = materializeSourceManifest(source, scope, manifest);

  return { env, scope, manifest, source, resources };
}

export function defaultManifestPath(env: string): string {
  const scope = parseManifestScope(env);
  return path.join(packageRoot, "manifests", scope.env, `${scope.app}.yaml`);
}

export function resolveManifestScope(explicitEnv?: string): string {
  const env = explicitEnv ?? process.env.APISIX_MANIFEST_ENV;
  if (!env) {
    throw new Error("Missing manifest scope. Provide --env <env:app> or APISIX_MANIFEST_ENV.");
  }

  parseManifestScope(env);
  return env;
}

export function parseManifestScope(env: string): ManifestScope {
  const parts = env.split(":");
  if (parts.length !== 2 || parts.some(part => part.length === 0)) {
    throw new Error(`Invalid manifest scope: ${env}. Scope must use <env>:<app> format.`);
  }

  const stage = parts[0];
  const app = parts[1];
  if (!stage || !app) {
    throw new Error(`Invalid manifest scope: ${env}. Scope must use <env>:<app> format.`);
  }

  if (!scopeSegmentPattern.test(stage) || !scopeSegmentPattern.test(app)) {
    throw new Error(
      `Invalid manifest scope: ${env}. env and app may only use lowercase letters, digits, and hyphens.`,
    );
  }

  return { env: stage, app };
}

export function formatScope(scope: ManifestScope): string {
  return `${scope.env}:${scope.app}`;
}

export function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath);
}

function materializeSourceManifest(
  source: ManifestObject,
  scope: ManifestScope,
  manifest: string,
): Record<"routes" | "upstreams" | "services" | "plugin_configs" | "consumers" | "ssls", ManifestObject[]> {
  const resources = createEmptyResourceMap();
  const service = isRecord(source.service) ? source.service : undefined;

  if (service) {
    resources.services = [materializeService(service, scope)];
    resources.plugin_configs = readObjectList(service.plugin_configs, "service.plugin_configs", manifest)
      .map((item, index) => materializeKeyedResource(item, scope, index, "plugin_configs"));
  }

  resources.upstreams = readObjectList(source.upstreams, "upstreams", manifest)
    .map((item, index) => materializeKeyedResource(item, scope, index, "upstreams"));
  resources.routes = readObjectList(source.routes, "routes", manifest)
    .map((item, index) => materializeRoute(item, scope, index));
  resources.consumers = readObjectList(source.consumers, "consumers", manifest)
    .map((item, index) => materializeKeyedResource(item, scope, index, "consumers"));
  resources.ssls = readObjectList(source.ssls, "ssls", manifest)
    .map((item, index) => materializeKeyedResource(item, scope, index, "ssls"));

  return resources;
}

function materializeService(source: ManifestObject, scope: ManifestScope): ManifestObject {
  const id = formatGeneratedId(scope);
  const resource = omitSourceFields(source, ["key", "plugin_configs"]);

  return {
    ...resource,
    id,
    name: id,
    labels: materializeLabels(source, scope),
  };
}

function materializeKeyedResource(
  source: ManifestObject,
  scope: ManifestScope,
  index: number,
  kind: "upstreams" | "plugin_configs" | "consumers" | "ssls",
): ManifestObject {
  const key = getSourceKey(source, index);
  const id = formatGeneratedId(scope, key);
  const resource = omitSourceFields(source, ["key"]);

  if (kind === "consumers") {
    return {
      ...resource,
      username: id,
      labels: materializeLabels(source, scope),
    };
  }

  return {
    ...resource,
    id,
    name: id,
    labels: materializeLabels(source, scope),
  };
}

function materializeRoute(source: ManifestObject, scope: ManifestScope, index: number): ManifestObject {
  const key = getSourceKey(source, index);
  const id = formatGeneratedId(scope, key);
  const resource = omitSourceFields(source, ["key", "upstream", "plugin_config", "terminal"]);
  const route: ManifestObject = {
    ...resource,
    id,
    name: id,
    labels: materializeLabels(source, scope),
  };

  if (source.terminal !== true) {
    route.service_id = formatGeneratedId(scope);
    if (typeof source.upstream === "string") {
      route.upstream_id = formatGeneratedId(scope, source.upstream);
    }
  }

  if (typeof source.plugin_config === "string") {
    route.plugin_config_id = formatGeneratedId(scope, source.plugin_config);
  }

  return route;
}

function readObjectList(value: unknown, sourcePath: string, manifest: string): ManifestObject[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${relativePath(manifest)} must contain an array at ${sourcePath}`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`${relativePath(manifest)} ${sourcePath}[${index}] must be an object`);
    }
    return item;
  });
}

function getSourceKey(source: ManifestObject, index: number): string {
  return typeof source.key === "string" ? source.key : `invalid-key-${index}`;
}

function formatGeneratedId(scope: ManifestScope, key?: string): string {
  return key === undefined
    ? `${scope.app}.${scope.env}`
    : `${scope.app}.${key}.${scope.env}`;
}

function materializeLabels(source: ManifestObject, scope: ManifestScope): Record<string, unknown> {
  const sourceLabels = isRecord(source.labels) ? source.labels : {};

  return {
    ...sourceLabels,
    managed_by: "shgas-iam",
    source: "repo-manifest",
    env: scope.env,
    app: scope.app,
  };
}

function omitSourceFields(source: ManifestObject, extraFields: string[]): ManifestObject {
  const generatedFields = ["id", "name", "service_id", "upstream_id", "plugin_config_id"];
  const result = { ...source };

  for (const field of [...generatedFields, ...extraFields, "labels"]) {
    delete result[field];
  }

  return result;
}

async function readYamlFile(
  filePath: string,
  options: { renderEnv?: boolean; env?: EnvMap } = {},
): Promise<ManifestObject> {
  const content = await readFile(filePath, "utf8");
  const parsed = parseYaml(content) ?? {};
  const rendered = options.renderEnv
    ? renderEnvValue(parsed, options.env ?? process.env, relativePath(filePath))
    : parsed;

  if (!isRecord(rendered)) {
    throw new Error(`${relativePath(filePath)} must contain a YAML object`);
  }

  return rendered;
}

export function isRecord(value: unknown): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
