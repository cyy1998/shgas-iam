import { createEmptyResourceMap } from "./resources";
import type { LoadedManifest, ManifestObject, ManifestScope, ResourceKind } from "./types";

const scopeSegmentPattern = /^[a-z0-9][a-z0-9-]*$/;

/** Materialize caller-owned YAML without reading a server-side file. */
export function materializeManifest(source: ManifestObject, env: string): LoadedManifest {
  const scope = parseManifestScope(env);
  const manifest = "request";
  return { env, scope, manifest, source, resources: materializeSourceManifest(source, scope, manifest) };
}

export function parseManifestScope(env: string): ManifestScope {
  const parts = env.split(":");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`Invalid manifest scope: ${env}. Scope must use <env>:<app> format.`);
  }

  const stage = parts[0];
  const app = parts[1];
  if (!stage || !app) {
    throw new Error(`Invalid manifest scope: ${env}. Scope must use <env>:<app> format.`);
  }

  if (!scopeSegmentPattern.test(stage) || !scopeSegmentPattern.test(app)) {
    throw new Error(`Invalid manifest scope: ${env}. env and app may only use lowercase letters, digits, and hyphens.`);
  }

  return { env: stage, app };
}

export function formatScope(scope: ManifestScope): string {
  return `${scope.env}:${scope.app}`;
}

function materializeSourceManifest(
  source: ManifestObject,
  scope: ManifestScope,
  manifest: string,
): Record<ResourceKind, ManifestObject[]> {
  const resources = createEmptyResourceMap();
  const service = isRecord(source.service) ? source.service : undefined;

  if (service) {
    resources.services = [materializeService(service, scope)];
    resources.plugin_configs = readObjectList(service.plugin_configs, "service.plugin_configs", manifest).map(
      (item, index) => materializeKeyedResource(item, scope, index, "plugin_configs"),
    );
  }

  resources.upstreams = readObjectList(source.upstreams, "upstreams", manifest).map((item, index) =>
    materializeKeyedResource(item, scope, index, "upstreams"),
  );
  resources.plugin_metadata = readObjectList(source.plugin_metadata, "plugin_metadata", manifest).map((item, index) =>
    materializeKeyedResource(item, scope, index, "plugin_metadata"),
  );
  resources.routes = readObjectList(source.routes, "routes", manifest).map((item, index) =>
    materializeRoute(item, scope, index),
  );
  resources.consumers = readObjectList(source.consumers, "consumers", manifest).map((item, index) =>
    materializeKeyedResource(item, scope, index, "consumers"),
  );
  resources.ssls = readObjectList(source.ssls, "ssls", manifest).map((item, index) =>
    materializeKeyedResource(item, scope, index, "ssls"),
  );

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
  kind: "upstreams" | "plugin_configs" | "plugin_metadata" | "consumers" | "ssls",
): ManifestObject {
  const key = getSourceKey(source, index);
  const id = kind === "plugin_metadata" ? key : formatGeneratedId(scope, key);
  const resource = omitSourceFields(source, ["key"]);

  if (kind === "consumers") {
    return {
      ...resource,
      username: `${scope.app}_${key}_${scope.env}`,
      labels: materializeLabels(source, scope),
    };
  }

  if (kind === "ssls") {
    delete resource.private_key;
    return {
      ...resource,
      id,
      ...(source.private_key === undefined ? {} : { key: source.private_key }),
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
    throw new Error(`${manifest} must contain an array at ${sourcePath}`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`${manifest} ${sourcePath}[${index}] must be an object`);
    }
    return item;
  });
}

function getSourceKey(source: ManifestObject, index: number): string {
  return typeof source.key === "string" ? source.key : `invalid-key-${index}`;
}

function formatGeneratedId(scope: ManifestScope, key?: string): string {
  return key === undefined ? `${scope.app}.${scope.env}` : `${scope.app}.${key}.${scope.env}`;
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

export function isRecord(value: unknown): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
