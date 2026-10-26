import { describe, expect, it } from "bun:test";
import { renderEnvPlaceholders, renderEnvValue } from "../env";
import { isRecord, materializeManifest } from "../manifest";
import { validateManifest } from "../validators";
import { createManifestSource, createManifestVariables } from "./manifest-fixture";

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
      uri: "/workspace",
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
    expect(manifest.resources.upstreams[0]).toMatchObject({ nodes: { "api.example.test:30000": 1 } });
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

  it("reports missing upstream and plugin references in caller input", () => {
    const source = createManifestSource();
    source.upstreams = [];
    source.service.plugin_configs = [];
    const issues = validateManifest(materializeManifest(source, "test:catalog"));
    expect(issues).toContainEqual({ code: "REFERENCE_NOT_FOUND", file: "request", path: "routes[0].upstream" });
    expect(issues).toContainEqual({ code: "REFERENCE_NOT_FOUND", file: "request", path: "routes[0].plugin_config" });
  });

  it("rejects missing environment placeholders when rendering is enabled", () => {
    expect(() => renderEnvPlaceholders("host: ${MISSING_HOST}", {}, "manifest.yaml")).toThrow(
      "manifest.yaml references missing environment variable MISSING_HOST",
    );
  });
});
