import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import {
  applyPlan,
  loadManifest,
  planChanges,
  renderEnvPlaceholders,
  validateManifest,
} from "../apisix-sync";

const manifestDirs: string[] = [];

afterEach(() => {
  manifestDirs.length = 0;
});

describe("apisix manifest validation", () => {
  it("accepts the checked-in dev IAM manifest", async () => {
    const manifest = await loadManifest("dev:iam");
    expect(validateManifest(manifest)).toEqual([]);
  });

  it("loads app-scoped manifests from env:app directories", async () => {
    const manifest = await loadManifest("prod:tender");

    expect(manifest.manifestDir.endsWith("gateway/apisix/manifests/prod/tender")).toBe(true);
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.resources.services.map(service => service.name)).toContain("tender-api-prod");
  });

  it("rejects broken route references", async () => {
    const manifest = await loadManifest("test", await createManifestDir({
      routes: [
        repoObject({
          id: "route-a",
          uri: "/a/*",
          service_id: "missing-service",
        }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("missing service missing-service"))).toBe(true);
  });

  it("rejects duplicate ids", async () => {
    const manifest = await loadManifest("test", await createManifestDir({
      routes: [
        repoObject({ id: "route-a", uri: "/a/*" }),
        repoObject({ id: "route-a", uri: "/b/*" }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("duplicate routes id route-a"))).toBe(true);
  });

  it("rejects secret-looking fields in manifests", async () => {
    const manifest = await loadManifest("test", await createManifestDir({
      consumers: [
        repoObject({
          username: "internal",
          credentials: [
            {
              type: "key-auth",
              config: {
                key: "plain-text-api-key",
              },
            },
          ],
        }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.path.includes(".credentials[0].config.key"))).toBe(true);
  });

  it("renders environment placeholders before parsing manifest YAML", async () => {
    const manifest = await loadManifest("test", await createManifestDir({
      upstreams: [
        repoObject({
          id: "api",
          nodes: {
            "${IAM_API_HOST}:${IAM_API_PORT}": 1,
          },
        }),
      ],
    }), {
      renderEnv: true,
      env: {
        IAM_API_HOST: "api.internal",
        IAM_API_PORT: "30000",
      },
    });

    expect(manifest.resources.upstreams.at(0)?.nodes).toEqual({
      "api.internal:30000": 1,
    });
  });

  it("rejects missing environment placeholders when rendering is enabled", () => {
    expect(() => renderEnvPlaceholders("host: ${MISSING_HOST}", {}, "routes.yaml"))
      .toThrow("routes.yaml references missing environment variable MISSING_HOST");
  });
});

describe("apisix sync planning", () => {
  it("plans creates, updates, delete candidates, and ignored objects by source label", () => {
    const desiredRoute = repoObject({ id: "route-a", uri: "/a/*" });
    const manifest = createLoadedManifest({
      routes: [desiredRoute],
    });

    const plan = planChanges(manifest, createRemoteState({
      routes: [
        repoObject({ id: "route-a", uri: "/changed/*" }),
        repoObject({ id: "route-b", uri: "/removed/*" }),
        dynamicObject({ id: "route-c", uri: "/dynamic/*" }),
        { id: "route-d", uri: "/manual/*" },
      ],
    }));

    expect(plan.creates).toHaveLength(0);
    expect(plan.updates.map(change => change.id)).toEqual(["route-a"]);
    expect(plan.deletes.map(change => change.id)).toEqual(["route-b"]);
    expect(plan.ignoredDynamic.map(change => change.id)).toEqual(["route-c"]);
    expect(plan.ignoredUnmanaged.map(change => change.id)).toEqual(["route-d"]);
  });

  it("does not write during dry-run apply", async () => {
    const calls: string[] = [];
    const client = {
      upsert: async () => calls.push("upsert"),
      delete: async () => calls.push("delete"),
    };
    const plan = {
      creates: [{ kind: "routes", id: "route-a", desired: repoObject({ id: "route-a" }) }],
      updates: [{ kind: "routes", id: "route-b", desired: repoObject({ id: "route-b" }) }],
      deletes: [{ kind: "routes", id: "route-c", remote: repoObject({ id: "route-c" }) }],
      ignoredDynamic: [],
      ignoredOutOfScope: [],
      ignoredUnmanaged: [],
    } as any;

    const result = await applyPlan(client as any, plan, { dryRun: true, prune: true });

    expect(calls).toEqual([]);
    expect(result.applied.created).toHaveLength(0);
    expect(result.applied.updated).toHaveLength(0);
    expect(result.applied.deleted).toHaveLength(0);
  });

  it("only prunes repo-managed delete candidates when prune is explicit", async () => {
    const calls: string[] = [];
    const client = {
      upsert: async (_kind: string, id: string) => calls.push(`upsert:${id}`),
      delete: async (_kind: string, id: string) => calls.push(`delete:${id}`),
    };
    const plan = {
      creates: [{ kind: "routes", id: "route-a", desired: repoObject({ id: "route-a" }) }],
      updates: [],
      deletes: [{ kind: "routes", id: "route-b", remote: repoObject({ id: "route-b" }) }],
      ignoredDynamic: [{ kind: "routes", id: "route-c", remote: dynamicObject({ id: "route-c" }) }],
      ignoredOutOfScope: [],
      ignoredUnmanaged: [{ kind: "routes", id: "route-d", remote: { id: "route-d" } }],
    } as any;

    await applyPlan(client as any, plan, { dryRun: false, prune: true });

    expect(calls).toEqual(["upsert:route-a", "delete:route-b"]);
  });

  it("does not plan deletes for repo-managed objects outside the selected app scope", () => {
    const desiredRoute = repoObject({ id: "route-a", uri: "/a/*", labels: { env: "prod", app: "tender" } });
    const manifest = createLoadedManifest({
      routes: [desiredRoute],
    }, { env: "prod", app: "tender" });

    const plan = planChanges(manifest, createRemoteState({
      routes: [
        repoObject({ id: "route-a", uri: "/a/*", labels: { env: "prod", app: "tender" } }),
        repoObject({ id: "route-b", uri: "/iam/*", labels: { env: "prod", app: "iam" } }),
      ],
    }));

    expect(plan.deletes).toHaveLength(0);
    expect(plan.ignoredOutOfScope.map(change => change.id)).toEqual(["route-b"]);
  });
});

async function createManifestDir(overrides: Record<string, unknown[]>): Promise<string> {
  const manifestDir = await mkdtemp(path.join(tmpdir(), "apisix-manifest-"));
  manifestDirs.push(manifestDir);

  await writeFile(path.join(manifestDir, "routes.yaml"), toYaml("routes", overrides.routes ?? []));
  await writeFile(path.join(manifestDir, "upstreams.yaml"), toYaml("upstreams", overrides.upstreams ?? []));
  await writeFile(path.join(manifestDir, "services.yaml"), toYaml("services", overrides.services ?? []));
  await writeFile(path.join(manifestDir, "plugin-configs.yaml"), toYaml("plugin_configs", overrides.plugin_configs ?? []));
  await writeFile(path.join(manifestDir, "consumers.yaml"), toYaml("consumers", overrides.consumers ?? []));
  await writeFile(path.join(manifestDir, "ssl.yaml"), toYaml("ssls", overrides.ssls ?? []));

  return manifestDir;
}

function createLoadedManifest(overrides: Record<string, unknown[]>, scope: { env: string; app?: string } = { env: "test" }): any {
  return {
    env: scope.app ? `${scope.env}:${scope.app}` : scope.env,
    scope,
    manifestDir: "/tmp/manifest",
    resources: createRemoteState(overrides),
  };
}

function createRemoteState(overrides: Record<string, unknown[]>): any {
  return {
    routes: overrides.routes ?? [],
    upstreams: overrides.upstreams ?? [],
    services: overrides.services ?? [],
    plugin_configs: overrides.plugin_configs ?? [],
    consumers: overrides.consumers ?? [],
    ssls: overrides.ssls ?? [],
  };
}

function repoObject(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...value,
    labels: {
      managed_by: "shgas-iam",
      source: "repo-manifest",
      env: "test",
      ...(value.labels as Record<string, unknown> | undefined),
    },
  };
}

function dynamicObject(value: Record<string, unknown>): Record<string, unknown> {
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

function toYaml(key: string, value: unknown[]): string {
  return `${key}: ${JSON.stringify(value, null, 2)}\n`;
}
