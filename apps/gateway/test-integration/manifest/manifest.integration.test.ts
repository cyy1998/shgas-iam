import { describe, expect, it } from "bun:test";
import { sourcePluginConfig, sourceRoute, sourceUpstream } from "../../src/__tests__/test-helpers";
import { validateManifest } from "../../src/validators";
import { createManifestFile, loadManifest, registerManifestFixtureCleanup } from "./fixture";

registerManifestFixtureCleanup();

describe("apisix manifest validation", () => {
  it("materializes local keys into dot ids, references, labels, and terminal routes", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        service: {
          labels: {
            team: "platform",
          },
        },
        upstreams: [
          sourceUpstream({
            key: "api",
            labels: {
              tier: "backend",
            },
          }),
        ],
        plugin_configs: [
          sourcePluginConfig({
            key: "api-plugin",
            labels: {
              template: "api-plugin",
            },
          }),
        ],
        consumers: [{ key: "reader" }],
        ssls: [{ key: "tls", cert: "certificate", private_key: "${TLS_PRIVATE_KEY}" }],
        routes: [
          sourceRoute({
            key: "api",
            plugin_config: "api-plugin",
          }),
          sourceRoute({
            key: "redirect",
            upstream: undefined,
            terminal: true,
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
              redirect: {
                uri: "/login",
                ret_code: 302,
              },
            },
          }),
        ],
      }),
    );

    expect(validateManifest(manifest)).toEqual([]);
    for (const resources of Object.values(manifest.resources)) {
      expect(resources.length).toBeGreaterThan(0);
      for (const resource of resources) {
        expect(resource.labels).toMatchObject({
          managed_by: "shgas-iam",
          source: "repo-manifest",
          env: "test",
          app: "iam",
        });
      }
    }
    expect(manifest.resources.services.at(0)).toMatchObject({
      id: "iam.test",
      name: "iam.test",
      labels: {
        managed_by: "shgas-iam",
        source: "repo-manifest",
        env: "test",
        app: "iam",
        team: "platform",
      },
    });
    expect(manifest.resources.upstreams.at(0)).toMatchObject({
      id: "iam.api.test",
      name: "iam.api.test",
      labels: {
        tier: "backend",
      },
    });
    expect(manifest.resources.plugin_configs.at(0)).toMatchObject({
      id: "iam.api-plugin.test",
      name: "iam.api-plugin.test",
      labels: {
        template: "api-plugin",
      },
    });
    expect(manifest.resources.routes.at(0)).toMatchObject({
      id: "iam.api.test",
      name: "iam.api.test",
      service_id: "iam.test",
      upstream_id: "iam.api.test",
      plugin_config_id: "iam.api-plugin.test",
    });
    expect(manifest.resources.routes.at(1)).toMatchObject({
      id: "iam.redirect.test",
      name: "iam.redirect.test",
    });
    expect(manifest.resources.routes.at(1)).not.toHaveProperty("service_id");
    expect(manifest.resources.routes.at(1)).not.toHaveProperty("upstream_id");
    expect(manifest.resources.routes.at(1)).not.toHaveProperty("terminal");
  });
  it("rejects broken route references", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        upstreams: [sourceUpstream()],
        routes: [
          sourceRoute({
            upstream: "missing-upstream",
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues).toContainEqual({
      code: "REFERENCE_NOT_FOUND",
      file: manifest.manifest,
      path: "routes[0].upstream",
    });
  });
  it("rejects missing service plugin_config references", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        upstreams: [sourceUpstream()],
        routes: [
          sourceRoute({
            plugin_config: "missing-plugin",
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues).toContainEqual({
      code: "REFERENCE_NOT_FOUND",
      file: manifest.manifest,
      path: "routes[0].plugin_config",
    });
  });
  it("rejects duplicate and invalid source keys", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        upstreams: [sourceUpstream({ key: "api" }), sourceUpstream({ key: "api" })],
        routes: [sourceRoute({ key: "Route.A" })],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues).toContainEqual({
      code: "LOCAL_KEY_DUPLICATE",
      file: manifest.manifest,
      path: "upstreams[1].key",
    });
    expect(issues).toContainEqual({
      code: "LOCAL_KEY_INVALID",
      file: manifest.manifest,
      path: "routes[0].key",
    });
  });
  it("rejects generated source fields and reserved label overrides", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        service: {
          id: "manual-service-id",
        },
        upstreams: [
          sourceUpstream({
            name: "manual-upstream-name",
            labels: {
              managed_by: "someone-else",
            },
          }),
        ],
        routes: [
          sourceRoute({
            service_id: "manual-service",
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.path === "service.id")).toBe(true);
    expect(issues.some((issue) => issue.path === "upstreams[0].name")).toBe(true);
    expect(issues.some((issue) => issue.path === "routes[0].service_id")).toBe(true);
    expect(issues.some((issue) => issue.path === "upstreams[0].labels.managed_by")).toBe(true);
  });
  it("rejects secret-looking fields in manifests", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        consumers: [
          {
            key: "internal",
            credentials: [
              {
                type: "key-auth",
                config: {
                  key: "plain-text-api-key",
                },
              },
            ],
          },
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.path.includes(".credentials[0].config.key"))).toBe(true);
  });
  it("accepts APISIX limit-req variable key selectors", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        plugin_configs: [
          sourcePluginConfig({
            key: "api-limit",
            plugins: {
              "limit-req": {
                rate: 5,
                burst: 0,
                rejected_code: 429,
                key_type: "var",
                key: "remote_addr",
                policy: "local",
              },
            },
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.path.includes(".plugins.limit-req.key"))).toBe(false);
  });
  it("rejects rendered real-ip trusted_addresses that trust every source", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        plugin_configs: [
          sourcePluginConfig({
            key: "api-real-ip",
            plugins: {
              "real-ip": {
                source: "http_x_real_ip",
                trusted_addresses: ["0.0.0.0/0"],
                recursive: true,
              },
            },
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.code === "TRUSTED_PROXY_ALL_ADDRESSES")).toBe(true);
  });
  it("allows unresolved real-ip trusted_addresses placeholders", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        plugin_configs: [
          sourcePluginConfig({
            key: "api-real-ip",
            plugins: {
              "request-id": {
                header_name: "X-Request-Id",
                include_in_response: true,
              },
              "real-ip": {
                source: "http_x_real_ip",
                trusted_addresses: ["${TENCENT_NGINX_TRUSTED_CIDR}"],
                recursive: true,
              },
            },
          }),
        ],
      }),
    );

    expect(validateManifest(manifest)).toEqual([]);
  });
  it("rejects IAM routes without request-id", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        upstreams: [sourceUpstream()],
        routes: [sourceRoute()],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.code === "IAM_REQUEST_ID_REQUIRED")).toBe(true);
  });
  it("rejects IAM routes without opentelemetry", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        upstreams: [sourceUpstream()],
        routes: [
          sourceRoute({
            plugins: {
              "request-id": {
                header_name: "X-Request-Id",
                include_in_response: true,
              },
            },
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.code === "IAM_TRACING_REQUIRED")).toBe(true);
  });
  it("rejects IAM manifests without opentelemetry plugin metadata", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        plugin_metadata: [],
        upstreams: [sourceUpstream()],
        plugin_configs: [sourcePluginConfig()],
        routes: [
          sourceRoute({
            plugin_config: "api-plugin",
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.code === "IAM_TELEMETRY_REQUIRED")).toBe(true);
  });
  it("rejects IAM Loki/http/file logger plugins", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        upstreams: [sourceUpstream()],
        plugin_configs: [
          sourcePluginConfig({
            key: "api-logger",
            plugins: {
              "request-id": { header_name: "X-Request-Id", include_in_response: true },
              opentelemetry: { sampler: { name: "always_on" } },
              "loki-logger": { endpoint_addr: "http://loki:3100" },
            },
          }),
        ],
        routes: [
          sourceRoute({
            plugin_config: "api-logger",
          }),
        ],
      }),
    );

    const issues = validateManifest(manifest);
    expect(issues.some((issue) => issue.code === "IAM_LOGGER_FORBIDDEN")).toBe(true);
  });
  it("renders environment placeholders after parsing manifest YAML", async () => {
    const manifest = await loadManifest(
      "test:iam",
      await createManifestFile({
        upstreams: [
          sourceUpstream({
            nodes: {
              "${IAM_API_HOST}:${IAM_API_PORT}": 1,
            },
          }),
        ],
      }),
      {
        renderEnv: true,
        env: {
          IAM_API_HOST: "api.internal",
          IAM_API_PORT: "30000",
        },
      },
    );

    expect(manifest.resources.upstreams.at(0)?.nodes).toEqual({
      "api.internal:30000": 1,
    });
  });
});
