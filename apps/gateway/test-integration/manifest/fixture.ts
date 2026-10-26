import { afterEach } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { sourceOpenTelemetryPluginMetadata } from "../../src/__tests__/test-helpers";
import { renderEnvValue } from "../../src/env";
import { materializeManifest } from "../../src/manifest";
import type { EnvMap, ManifestObject } from "../../src/types";

const fixtureDirectories: string[] = [];

export async function loadManifest(
  scope: string,
  manifest: string,
  options: { renderEnv?: boolean; env?: EnvMap } = {},
) {
  const source = parse(await readFile(manifest, "utf8"));
  return {
    ...materializeManifest(options.renderEnv ? renderEnvValue(source, options.env ?? {}, manifest) : source, scope),
    manifest,
  };
}

export function registerManifestFixtureCleanup() {
  afterEach(async () => {
    for (const directory of fixtureDirectories.splice(0)) await rm(directory, { recursive: true, force: true });
  });
}

interface SourceManifestOverrides {
  service?: ManifestObject | false;
  upstreams?: ManifestObject[];
  plugin_metadata?: ManifestObject[];
  routes?: ManifestObject[];
  plugin_configs?: ManifestObject[];
  consumers?: ManifestObject[];
  ssls?: ManifestObject[];
}

export async function createManifestFile(overrides: SourceManifestOverrides): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "apisix-manifest-"));
  fixtureDirectories.push(tempDir);
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
  source.plugin_metadata = overrides.plugin_metadata ?? [sourceOpenTelemetryPluginMetadata()];
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
