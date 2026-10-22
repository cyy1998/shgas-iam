import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { renderEnvValue } from "../env";
import { materializeManifest, parseManifestScope } from "../manifest";
import type { EnvMap } from "../types";

export const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export function relativePath(file: string) {
  return path.relative(repositoryRoot, file);
}
export async function loadManifest(scope: string, file?: string, options: { renderEnv?: boolean; env?: EnvMap } = {}) {
  const parsed = parseManifestScope(scope);
  const manifest = file ?? path.join(repositoryRoot, "docker", "apisix", "manifests", parsed.env, `${parsed.app}.yaml`);
  const source = parse(await readFile(manifest, "utf8"));
  return {
    ...materializeManifest(options.renderEnv ? renderEnvValue(source, options.env ?? {}, manifest) : source, scope),
    manifest,
  };
}

import { createEmptyResourceMap } from "../resources";
import type { LoadedManifest, ManifestObject, ResourceKind } from "../types";

export function createLoadedManifest(
  overrides: Partial<Record<ResourceKind, ManifestObject[]>>,
  scope: { env: string; app: string } = { env: "test", app: "iam" },
): LoadedManifest {
  return {
    env: `${scope.env}:${scope.app}`,
    scope,
    manifest: "/tmp/manifest.yaml",
    source: {
      service: {
        desc: "Test gateway app service",
        plugin_configs: [],
      },
      upstreams: [],
      routes: [],
    },
    resources: createResourceState(overrides),
  };
}

export function createResourceState(
  overrides: Partial<Record<ResourceKind, ManifestObject[]>>,
): Record<ResourceKind, ManifestObject[]> {
  return {
    ...createEmptyResourceMap(),
    ...overrides,
  };
}

export function repoObject(value: Record<string, unknown>): ManifestObject {
  return {
    ...value,
    labels: {
      managed_by: "shgas-iam",
      source: "repo-manifest",
      env: "test",
      app: "iam",
      ...(value.labels as Record<string, unknown> | undefined),
    },
  };
}

export function sourceUpstream(value: Record<string, unknown> = {}): ManifestObject {
  return {
    key: "api",
    nodes: {
      "127.0.0.1:3000": 1,
    },
    ...value,
  };
}

export function sourceRoute(value: Record<string, unknown> = {}): ManifestObject {
  return {
    key: "route-a",
    uri: "/a/*",
    upstream: "api",
    ...value,
  };
}

export function sourcePluginConfig(value: Record<string, unknown> = {}): ManifestObject {
  return {
    key: "api-plugin",
    plugins: {
      "request-id": {
        header_name: "X-Request-Id",
        include_in_response: true,
      },
      opentelemetry: {
        sampler: {
          name: "always_on",
        },
      },
    },
    ...value,
  };
}

export function sourceOpenTelemetryPluginMetadata(value: Record<string, unknown> = {}): ManifestObject {
  return {
    key: "opentelemetry",
    set_ngx_var: true,
    resource: {
      "service.name": "shgas-iam-apisix",
    },
    collector: {
      address: "alloy:4318",
      request_timeout: 3,
    },
    ...value,
  };
}

export function dynamicObject(value: Record<string, unknown>): ManifestObject {
  return {
    ...value,
    labels: {
      managed_by: "shgas-iam",
      source: "dynamic-registry",
      app_code: "example",
      config_version: "1",
      ...(value.labels as Record<string, unknown> | undefined),
    },
  };
}
