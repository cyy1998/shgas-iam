import { describe, expect, it } from "bun:test";
import { renderEnvPlaceholders, renderEnvValue } from "../env";
import { isRecord, materializeManifest } from "../manifest";
import { validateManifest } from "../validators";
import { createManifestSource, createManifestVariables } from "./manifest-fixture";
import { sourceOpenTelemetryPluginMetadata, sourcePluginConfig, sourceRoute, sourceUpstream } from "./test-helpers";

describe("caller-owned manifest materialization", () => {
  it.each(["test:catalog", "preview:files", "test:iam"])(
    "generates scoped resource identities and local references for %s",
    (scope) => {
      const manifest = materializeManifest(createManifestSource(), scope);
      const { app, env } = manifest.scope;
      expect(validateManifest(manifest)).toEqual([]);
      expect(manifest.resources.services).toMatchObject([{ id: `${app}.${env}`, name: `${app}.${env}` }]);
      expect(manifest.resources.services[0]).not.toHaveProperty("upstream_id");
      expect(manifest.resources.routes[0]).toMatchObject({
        id: `${app}.browser.${env}`,
        name: `${app}.browser.${env}`,
        service_id: `${app}.${env}`,
        upstream_id: `${app}.api.${env}`,
        plugin_config_id: `${app}.browser.${env}`,
        labels: { managed_by: "shgas-iam", source: "repo-manifest", app, env },
      });
      expect(manifest.resources.routes[0]).not.toHaveProperty("key");
      expect(manifest.resources.routes[0]).not.toHaveProperty("upstream");
      expect(manifest.resources.routes[0]).not.toHaveProperty("plugin_config");
      expect(manifest.resources.plugin_metadata).toMatchObject([{ id: "opentelemetry" }]);
    },
  );

  it("adds reserved labels to all seven resource kinds and preserves caller labels", () => {
    const manifest = materializeManifest(
      {
        service: {
          labels: { team: "platform" },
          plugin_configs: [sourcePluginConfig({ labels: { template: "api" } })],
        },
        upstreams: [sourceUpstream({ labels: { tier: "backend" } })],
        plugin_metadata: [sourceOpenTelemetryPluginMetadata()],
        routes: [sourceRoute({ plugin_config: "api-plugin" })],
        consumers: [{ key: "reader" }],
        ssls: [{ key: "tls", cert: "certificate", private_key: "${TLS_PRIVATE_KEY}" }],
      },
      "test:iam",
    );
    const reservedLabels = { managed_by: "shgas-iam", source: "repo-manifest", env: "test", app: "iam" };
    const { services, upstreams, plugin_configs, plugin_metadata, routes, consumers, ssls } = manifest.resources;

    expect(validateManifest(manifest)).toEqual([]);
    expect(services).toMatchObject([{ labels: { ...reservedLabels, team: "platform" } }]);
    expect(upstreams).toMatchObject([
      { id: "iam.api.test", name: "iam.api.test", labels: { ...reservedLabels, tier: "backend" } },
    ]);
    expect(plugin_configs).toMatchObject([
      { id: "iam.api-plugin.test", name: "iam.api-plugin.test", labels: { ...reservedLabels, template: "api" } },
    ]);
    expect(plugin_metadata).toMatchObject([{ labels: reservedLabels }]);
    expect(routes).toMatchObject([{ labels: reservedLabels }]);
    expect(consumers).toMatchObject([{ labels: reservedLabels }]);
    expect(ssls).toMatchObject([{ labels: reservedLabels }]);
  });

  it("preserves route-specific upstreams and nested authentication and rewrite plugins", () => {
    const manifest = materializeManifest(createManifestSource(), "test:catalog");
    expect(manifest.resources.routes.find((route) => route.id === "catalog.frontend.test")).toMatchObject({
      service_id: "catalog.test",
      upstream_id: "catalog.frontend.test",
      plugin_config_id: "catalog.api.test",
      plugins: {
        "forward-auth": {
          uri: "${AUTHZ_URL}",
          allow_degradation: false,
          request_headers: ["apikey"],
          upstream_headers: ["X-User-Info"],
        },
        "proxy-rewrite": { regex_uri: ["^/workspace/(.*)", "/$1"], headers: { remove: ["X-User-Info"] } },
      },
    });
    expect(manifest.resources.routes.find((route) => route.id === "catalog.browser.test")).toMatchObject({
      upstream_id: "catalog.api.test",
    });
  });

  it("leaves terminal redirects without generated service or upstream references", () => {
    const manifest = materializeManifest(createManifestSource(), "test:catalog");
    const redirect = manifest.resources.routes.find((route) => route.id === "catalog.redirect.test");
    expect(redirect).toMatchObject({
      name: "catalog.redirect.test",
      uri: "/workspace",
      labels: { managed_by: "shgas-iam", source: "repo-manifest", env: "test", app: "catalog" },
      plugins: { redirect: { uri: "/workspace/", ret_code: 302, append_query_string: true } },
    });
    expect(redirect).not.toHaveProperty("service_id");
    expect(redirect).not.toHaveProperty("upstream_id");
    expect(redirect).not.toHaveProperty("terminal");
  });

  it("renders host matchers, dynamic-port authorities and nested variables without changing nginx variables", () => {
    const source = createManifestSource();
    const rendered = renderEnvValue(source, createManifestVariables(), "request");
    if (!isRecord(rendered)) throw new Error("Rendered manifest must be an object");
    const manifest = materializeManifest(rendered, "test:catalog");
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.resources.routes[0]).toMatchObject({ hosts: ["public.example.test", "private.example.test"] });
    expect(manifest.resources.routes[1]).toMatchObject({
      uris: ["/oidc", "/oidc/*"],
      vars: [["http_host", "==", "127.0.0.1:43123"]],
      plugins: {
        "proxy-rewrite": {
          headers: { set: { "X-IAM-Entry-Network": "internal", "X-Forwarded-Host": "$http_host" } },
        },
      },
    });
    expect(manifest.resources.upstreams[0]?.nodes).toEqual({ "api.example.test:30000": 1 });
    expect(manifest.resources.plugin_configs[1]).toMatchObject({
      plugins: { cors: { allow_origins: "https://public.example.test" } },
    });
    expect(manifest.resources.routes[3]).toMatchObject({
      plugins: { "forward-auth": { uri: "http://auth.example.test:8080/auth" } },
    });
    expect(source.upstreams[0]?.nodes).toEqual({ "${API_HOST}:${API_PORT}": 1 });
  });

  it("retains separate plugin references for browser CORS and token exchange", () => {
    const manifest = materializeManifest(createManifestSource(), "test:catalog");
    const browser = manifest.resources.routes.find((route) => route.id === "catalog.browser.test");
    const token = manifest.resources.routes.find((route) => route.id === "catalog.token.test");
    expect(browser).toMatchObject({ uri: "/sso/*", plugin_config_id: "catalog.browser.test" });
    expect(token).toMatchObject({ uri: "/sso/token", priority: 100, plugin_config_id: "catalog.api.test" });
    expect(manifest.resources.plugin_configs.find((config) => config.id === browser?.plugin_config_id)).toMatchObject({
      plugins: { cors: { allow_origins: "${BROWSER_ORIGIN}" } },
    });
    expect(
      manifest.resources.plugin_configs.find((config) => config.id === token?.plugin_config_id),
    ).not.toHaveProperty("plugins.cors");
  });

  it("rejects missing environment placeholders when rendering is enabled", () => {
    expect(() => renderEnvPlaceholders("host: ${MISSING_HOST}", {}, "manifest.yaml")).toThrow(
      "manifest.yaml references missing environment variable MISSING_HOST",
    );
  });
});

describe("caller-owned manifest validation", () => {
  it("rejects a route referencing an unknown upstream key when another upstream exists", () => {
    const manifest = materializeManifest(
      {
        service: {},
        upstreams: [sourceUpstream()],
        routes: [sourceRoute({ upstream: "missing-upstream" })],
      },
      "test:catalog",
    );

    expect(validateManifest(manifest)).toEqual([
      { code: "REFERENCE_NOT_FOUND", file: "request", path: "routes[0].upstream" },
    ]);
  });

  it("rejects a route with a valid upstream and an unknown plugin config key", () => {
    const manifest = materializeManifest(
      {
        service: { plugin_configs: [sourcePluginConfig()] },
        upstreams: [sourceUpstream()],
        routes: [sourceRoute({ plugin_config: "missing-plugin" })],
      },
      "test:catalog",
    );

    expect(validateManifest(manifest)).toEqual([
      { code: "REFERENCE_NOT_FOUND", file: "request", path: "routes[0].plugin_config" },
    ]);
  });

  it("reports the exact paths of duplicate and invalid source keys", () => {
    const manifest = materializeManifest(
      { service: {}, upstreams: [sourceUpstream(), sourceUpstream()], routes: [sourceRoute({ key: "Route.A" })] },
      "test:catalog",
    );

    const issues = validateManifest(manifest);
    expect(issues).toHaveLength(2);
    expect(issues).toContainEqual({ code: "LOCAL_KEY_DUPLICATE", file: "request", path: "upstreams[1].key" });
    expect(issues).toContainEqual({ code: "LOCAL_KEY_INVALID", file: "request", path: "routes[0].key" });
  });

  it("reports generated source fields and reserved label overrides at their exact paths", () => {
    const manifest = materializeManifest(
      {
        service: { id: "manual-service-id" },
        upstreams: [sourceUpstream({ name: "manual-upstream-name", labels: { managed_by: "someone-else" } })],
        routes: [sourceRoute({ service_id: "manual-service" })],
      },
      "test:catalog",
    );
    const issues = validateManifest(manifest);

    expect(issues).toHaveLength(4);
    expect(issues).toContainEqual({ code: "GENERATED_FIELD", file: "request", path: "service.id" });
    expect(issues).toContainEqual({ code: "GENERATED_FIELD", file: "request", path: "upstreams[0].name" });
    expect(issues).toContainEqual({ code: "GENERATED_FIELD", file: "request", path: "routes[0].service_id" });
    expect(issues).toContainEqual({ code: "RESERVED_LABEL", file: "request", path: "upstreams[0].labels.managed_by" });
  });

  it("requires a secret reference for a key-auth consumer credential", () => {
    const manifest = materializeManifest(
      {
        service: {},
        consumers: [
          { key: "reader", credentials: [{ type: "key-auth", config: { key: "synthetic-plain-text-key" } }] },
        ],
      },
      "test:catalog",
    );

    expect(validateManifest(manifest)).toEqual([
      { code: "SECRET_REFERENCE_REQUIRED", file: "request", path: "consumers[0].credentials[0].config.key" },
    ]);
  });

  it("accepts a limit-req variable key in a plugin config", () => {
    const manifest = materializeManifest(
      {
        service: {
          plugin_configs: [
            sourcePluginConfig({
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
        },
      },
      "test:catalog",
    );

    expect(validateManifest(manifest)).toEqual([]);
  });
});

describe("real-ip trusted addresses", () => {
  const source = {
    service: {
      plugin_configs: [
        sourcePluginConfig({
          plugins: {
            "real-ip": {
              source: "http_x_real_ip",
              trusted_addresses: ["${TENCENT_NGINX_TRUSTED_CIDR}"],
              recursive: true,
            },
          },
        }),
      ],
    },
  };

  it.each(["0.0.0.0/0", "::/0"])("rejects a trusted address rendered as %s", (cidr) => {
    const rendered = renderEnvValue(source, { TENCENT_NGINX_TRUSTED_CIDR: cidr }, "request");
    if (!isRecord(rendered)) throw new Error("Rendered manifest must be an object");
    const manifest = materializeManifest(rendered, "test:catalog");

    expect(validateManifest(manifest)).toEqual([
      {
        code: "TRUSTED_PROXY_ALL_ADDRESSES",
        file: "request",
        path: "plugin_configs[0].plugins.real-ip.trusted_addresses[0]",
      },
    ]);
  });

  it("accepts an unresolved trusted address placeholder", () => {
    const manifest = materializeManifest(source, "test:catalog");

    expect(validateManifest(manifest)).toEqual([]);
  });
});

describe("IAM manifest observability policy", () => {
  it.each([
    {
      missing: "request-id",
      plugins: { opentelemetry: { sampler: { name: "always_on" } } },
      code: "IAM_REQUEST_ID_REQUIRED",
    },
    {
      missing: "opentelemetry",
      plugins: { "request-id": { header_name: "X-Request-Id", include_in_response: true } },
      code: "IAM_TRACING_REQUIRED",
    },
  ])("rejects a route missing $missing", ({ plugins, code }) => {
    const manifest = materializeManifest(
      {
        service: {},
        upstreams: [sourceUpstream()],
        plugin_metadata: [sourceOpenTelemetryPluginMetadata()],
        routes: [sourceRoute({ plugins })],
      },
      "test:iam",
    );

    expect(validateManifest(manifest)).toEqual([{ code, file: "request", path: "routes[0]" }]);
  });

  it("rejects a manifest without opentelemetry plugin metadata", () => {
    const manifest = materializeManifest(
      {
        service: { plugin_configs: [sourcePluginConfig()] },
        upstreams: [sourceUpstream()],
        routes: [sourceRoute({ plugin_config: "api-plugin" })],
      },
      "test:iam",
    );

    expect(validateManifest(manifest)).toEqual([
      { code: "IAM_TELEMETRY_REQUIRED", file: "request", path: "plugin_metadata" },
    ]);
  });

  const forbiddenLoggers = ["loki-logger", "http-logger", "file-logger"];

  it.each(forbiddenLoggers)("rejects %s on a route", (name) => {
    const manifest = materializeManifest(
      {
        service: { plugin_configs: [sourcePluginConfig()] },
        upstreams: [sourceUpstream()],
        plugin_metadata: [sourceOpenTelemetryPluginMetadata()],
        routes: [sourceRoute({ plugin_config: "api-plugin", plugins: { [name]: {} } })],
      },
      "test:iam",
    );

    expect(validateManifest(manifest)).toEqual([
      { code: "IAM_LOGGER_FORBIDDEN", file: "request", path: `routes[0].plugins.${name}` },
    ]);
  });

  it.each(forbiddenLoggers)("rejects %s in a plugin config", (name) => {
    const pluginConfig = sourcePluginConfig();
    if (!isRecord(pluginConfig.plugins)) throw new Error("Plugin config must contain a plugins object");
    const manifest = materializeManifest(
      {
        service: { plugin_configs: [{ ...pluginConfig, plugins: { ...pluginConfig.plugins, [name]: {} } }] },
        upstreams: [sourceUpstream()],
        plugin_metadata: [sourceOpenTelemetryPluginMetadata()],
        routes: [sourceRoute({ plugin_config: "api-plugin" })],
      },
      "test:iam",
    );

    expect(validateManifest(manifest)).toEqual([
      { code: "IAM_LOGGER_FORBIDDEN", file: "request", path: `plugin_configs[0].plugins.${name}` },
    ]);
  });
});
