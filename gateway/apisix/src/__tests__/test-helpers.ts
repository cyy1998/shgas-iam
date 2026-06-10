import type { LoadedManifest, ManifestObject, ResourceKind } from "../types";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEmptyResourceMap } from "../resources";

export async function createManifestDir(overrides: Partial<Record<ResourceKind, unknown[]>>): Promise<string> {
  const manifestDir = await mkdtemp(path.join(tmpdir(), "apisix-manifest-"));

  await writeFile(path.join(manifestDir, "routes.yaml"), toYaml("routes", overrides.routes ?? []));
  await writeFile(path.join(manifestDir, "upstreams.yaml"), toYaml("upstreams", overrides.upstreams ?? []));
  await writeFile(path.join(manifestDir, "services.yaml"), toYaml("services", overrides.services ?? []));
  await writeFile(
    path.join(manifestDir, "plugin-configs.yaml"),
    toYaml("plugin_configs", overrides.plugin_configs ?? []),
  );
  await writeFile(path.join(manifestDir, "consumers.yaml"), toYaml("consumers", overrides.consumers ?? []));
  await writeFile(path.join(manifestDir, "ssl.yaml"), toYaml("ssls", overrides.ssls ?? []));

  return manifestDir;
}

export function createLoadedManifest(
  overrides: Partial<Record<ResourceKind, ManifestObject[]>>,
  scope: { env: string; app: string } = { env: "test", app: "iam" },
): LoadedManifest {
  return {
    env: `${scope.env}:${scope.app}`,
    scope,
    manifestDir: "/tmp/manifest",
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

function toYaml(key: string, value: unknown[]): string {
  return `${key}: ${JSON.stringify(value, null, 2)}\n`;
}
