import type { LoadedManifest, ManifestObject, ResourceKind } from "../types";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { createEmptyResourceMap } from "../resources";

interface SourceManifestOverrides {
  service?: ManifestObject | false;
  upstreams?: ManifestObject[];
  routes?: ManifestObject[];
  plugin_configs?: ManifestObject[];
  consumers?: ManifestObject[];
  ssls?: ManifestObject[];
}

export async function createManifestFile(overrides: SourceManifestOverrides): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "apisix-manifest-"));
  const manifest = path.join(tempDir, "iam.yaml");
  const source: ManifestObject = {};

  if (overrides.service !== false) {
    source.service = {
      desc: "Test gateway app service",
      plugin_configs: overrides.plugin_configs ?? [],
      ...(overrides.service ?? {}),
    };
  }

  source.upstreams = overrides.upstreams ?? [];
  source.routes = overrides.routes ?? [];

  if (overrides.consumers !== undefined) {
    source.consumers = overrides.consumers;
  }

  if (overrides.ssls !== undefined) {
    source.ssls = overrides.ssls;
  }

  await writeFile(manifest, stringify(source, { lineWidth: 0 }), "utf8");

  return manifest;
}

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

export function createReporter() {
  const logs: string[] = [];
  const errors: string[] = [];

  return {
    logs,
    errors,
    reporter: {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    },
  };
}
