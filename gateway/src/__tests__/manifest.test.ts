import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { parse as parseYaml } from "yaml";
import { renderEnvPlaceholders } from "../env";
import { loadManifest } from "../manifest";
import { validateManifest } from "../validators";
import { createManifestFile, sourcePluginConfig, sourceRoute, sourceUpstream } from "./test-helpers";

function getSsoRoutes(manifest: Awaited<ReturnType<typeof loadManifest>>) {
  return manifest.resources.routes.filter(route => route.uri === "/sso/*");
}

function expectRootRedirectToSsoLogin(manifest: Awaited<ReturnType<typeof loadManifest>>) {
  const route = manifest.resources.routes.find(route => route.id === `iam.root-redirect.${manifest.scope.env}`);
  const redirect = (route?.plugins as Record<string, unknown> | undefined)?.redirect;

  expect(route).toMatchObject({
    name: `iam.root-redirect.${manifest.scope.env}`,
    uri: "/",
    priority: 100,
  });
  expect(route).not.toHaveProperty("service_id");
  expect(route).not.toHaveProperty("upstream_id");
  expect(redirect).toEqual({
    uri: "/portal/login",
    ret_code: 302,
  });
}

function getEntryNetwork(route: Record<string, unknown>) {
  return (((route.plugins as Record<string, unknown> | undefined)?.["proxy-rewrite"] as Record<string, unknown> | undefined)
    ?.headers as Record<string, unknown> | undefined)?.set as Record<string, unknown> | undefined;
}

function expectSsoRoutesClassifyEntryNetwork(manifest: Awaited<ReturnType<typeof loadManifest>>, hosts: string[]) {
  const routes = getSsoRoutes(manifest);

  expect(routes).toHaveLength(2);
  expect(routes.map(route => route.hosts).flat().sort()).toEqual([...hosts].sort());
  expect(routes.every(route => route.service_id === `iam.${manifest.scope.env}`)).toBe(true);
  expect(routes.every(route => route.upstream_id === `iam.api.${manifest.scope.env}`)).toBe(true);
  expect(routes.every(route => route.plugin_config_id === `iam.sso-api-plugin.${manifest.scope.env}`)).toBe(true);
  expect(routes.some(route => route.id === `iam.sso.${manifest.scope.env}`)).toBe(false);
  expect(routes.some(route => route.hosts === undefined)).toBe(false);
  expect(routes.map(route => getEntryNetwork(route)?.["X-IAM-Entry-Network"]).sort()).toEqual(["external", "internal"]);
  expect(routes.every(route => (route.plugins as Record<string, unknown> | undefined)?.cors === undefined)).toBe(true);

  const ssoPluginConfig = manifest.resources.plugin_configs.find(
    config => config.id === `iam.sso-api-plugin.${manifest.scope.env}`,
  );
  expect(ssoPluginConfig?.plugins).toMatchObject({
    "request-id": expect.objectContaining({
      header_name: "X-Request-Id",
      include_in_response: true,
    }),
    "opentelemetry": expect.objectContaining({
      sampler: expect.objectContaining({
        name: "always_on",
      }),
    }),
    "limit-req": expect.any(Object),
    "real-ip": expect.any(Object),
    "cors": expect.any(Object),
  });
}

function expectTokenExchangeToExcludeBrowserCors(manifest: Awaited<ReturnType<typeof loadManifest>>) {
  const tokenRoutes = manifest.resources.routes.filter(route => route.uri === "/sso/token");
  const browserRoutes = getSsoRoutes(manifest);

  expect(tokenRoutes).toHaveLength(2);
  expect(tokenRoutes.map(route => route.hosts).flat().sort())
    .toEqual(browserRoutes.map(route => route.hosts).flat().sort());
  expect(tokenRoutes.map(route => getEntryNetwork(route)?.["X-IAM-Entry-Network"]).sort())
    .toEqual(["external", "internal"]);

  for (const route of tokenRoutes) {
    const routePlugins = route.plugins as Record<string, unknown> | undefined;
    const pluginConfig = manifest.resources.plugin_configs.find(config => config.id === route.plugin_config_id);
    const configPlugins = pluginConfig?.plugins as Record<string, unknown> | undefined;

    expect(route.priority).toBeGreaterThan(
      Math.max(...browserRoutes.map(browserRoute => Number(browserRoute.priority ?? 0))),
    );
    expect(route.service_id).toBe(`iam.${manifest.scope.env}`);
    expect(route.upstream_id).toBe(`iam.api.${manifest.scope.env}`);
    expect(route.plugin_config_id).toBe(`iam.api-ip-rate-limit.${manifest.scope.env}`);
    expect(route).not.toHaveProperty("methods");
    expect(routePlugins?.cors).toBeUndefined();
    expect(configPlugins?.cors).toBeUndefined();
  }

  for (const route of browserRoutes) {
    const pluginConfig = manifest.resources.plugin_configs.find(config => config.id === route.plugin_config_id);
    const configPlugins = pluginConfig?.plugins as Record<string, unknown> | undefined;

    expect(route.uri).toBe("/sso/*");
    expect(configPlugins?.cors).toEqual(expect.any(Object));
  }
}

function getForwardAuthConfig(route: Record<string, unknown>) {
  return (route.plugins as Record<string, unknown> | undefined)?.["forward-auth"] as Record<string, unknown> | undefined;
}

function getTenderInternalAuthzRequestHeaders(manifest: Awaited<ReturnType<typeof loadManifest>>) {
  const route = manifest.resources.routes.find((candidate) => {
    const forwardAuth = getForwardAuthConfig(candidate);
    return typeof forwardAuth?.uri === "string" && forwardAuth.uri.endsWith("/auth/internal-authz");
  });

  return getForwardAuthConfig(route ?? {})?.request_headers;
}

describe("apisix manifest validation", () => {
  it("accepts the checked-in dev IAM manifest", async () => {
    const manifest = await loadManifest("dev:iam");
    expect(validateManifest(manifest)).toEqual([]);
    expectRootRedirectToSsoLogin(manifest);
    expect(manifest.resources.plugin_metadata).toContainEqual(expect.objectContaining({
      id: "opentelemetry",
      set_ngx_var: true,
      collector: expect.objectContaining({
        address: "${APISIX_OTEL_COLLECTOR_ENDPOINT}",
        request_timeout: 3,
      }),
    }));
    expect(manifest.resources.routes.every((route) => {
      const routePlugins = route.plugins as Record<string, unknown> | undefined;
      const pluginConfig = manifest.resources.plugin_configs.find(config => config.id === route.plugin_config_id);
      const configPlugins = pluginConfig?.plugins as Record<string, unknown> | undefined;
      return routePlugins?.["request-id"] !== undefined || configPlugins?.["request-id"] !== undefined;
    })).toBe(true);
    expect(manifest.resources.routes.every((route) => {
      const routePlugins = route.plugins as Record<string, unknown> | undefined;
      const pluginConfig = manifest.resources.plugin_configs.find(config => config.id === route.plugin_config_id);
      const configPlugins = pluginConfig?.plugins as Record<string, unknown> | undefined;
      return routePlugins?.opentelemetry !== undefined || configPlugins?.opentelemetry !== undefined;
    })).toBe(true);
  });

  it("splits dev IAM SSO routes by host and injects entry network", async () => {
    const manifest = await loadManifest("dev:iam");

    expectSsoRoutesClassifyEntryNetwork(manifest, [
      "${IAM_SSO_EXTERNAL_HOST}",
      "${IAM_SSO_INTERNAL_HOST}",
    ]);
  });

  it("renders prod IAM SSO hosts and injects entry network enum values", async () => {
    const manifest = await loadManifest("prod:iam", undefined, {
      renderEnv: true,
      env: {
        IAM_SSO_CORS_ALLOW_ORIGINS: "https://iam.example.com",
        IAM_SSO_EXTERNAL_HOST: "iam.example.com",
        IAM_SSO_INTERNAL_HOST: "iam.internal.example.com",
        PROD_IAM_ADMIN_API_UPSTREAM_HOST: "iam-admin-api.internal",
        PROD_IAM_ADMIN_API_UPSTREAM_PORT: "30001",
        PROD_IAM_ADMIN_FRONTEND_UPSTREAM_HOST: "iam-admin.internal",
        PROD_IAM_ADMIN_FRONTEND_UPSTREAM_PORT: "80",
        PROD_IAM_API_UPSTREAM_HOST: "iam-api.internal",
        PROD_IAM_API_UPSTREAM_PORT: "30000",
        PROD_IAM_OIDC_PROVIDER_UPSTREAM_HOST: "iam-oidc-provider.internal",
        PROD_IAM_OIDC_PROVIDER_UPSTREAM_PORT: "30002",
        PROD_IAM_SSO_FRONTEND_UPSTREAM_HOST: "iam-sso.internal",
        PROD_IAM_SSO_FRONTEND_UPSTREAM_PORT: "80",
        APISIX_OTEL_COLLECTOR_ENDPOINT: "alloy:4318",
        TENCENT_NGINX_TRUSTED_CIDR: "10.0.0.0/24",
      },
    });

    expect(validateManifest(manifest)).toEqual([]);
    expectRootRedirectToSsoLogin(manifest);
    expectSsoRoutesClassifyEntryNetwork(manifest, [
      "iam.example.com",
      "iam.internal.example.com",
    ]);
  });

  it("keeps token exchange outside browser CORS while authorize and callback retain it", async () => {
    const manifests = await Promise.all([
      loadManifest("dev:iam"),
      loadManifest("prod:iam"),
    ]);

    for (const manifest of manifests) {
      expectTokenExchangeToExcludeBrowserCors(manifest);
    }
  });

  it("loads app-scoped manifests from env:app single files", async () => {
    const manifest = await loadManifest("prod:tender");

    expect(manifest.manifest.replaceAll("\\", "/").endsWith("gateway/manifests/prod/tender.yaml")).toBe(true);
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.resources.services).toHaveLength(1);
    expect(manifest.resources.services.at(0)).toMatchObject({
      id: "tender.prod",
      name: "tender.prod",
    });
    expect(manifest.resources.services.at(0)).not.toHaveProperty("upstream_id");
  });

  it("rejects old app manifest directories passed as overrides", async () => {
    await expect(
      loadManifest("prod:tender", path.join(process.cwd(), "manifests", "prod")),
    ).rejects.toThrow();
  });

  it("materializes local keys into dot ids, references, labels, and terminal routes", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
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
            "opentelemetry": {
              sampler: {
                name: "always_on",
              },
            },
            "redirect": {
              uri: "/login",
              ret_code: 302,
            },
          },
        }),
      ],
    }));

    expect(validateManifest(manifest)).toEqual([]);
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

  it("forwards only apikey to tender internal authz routes", async () => {
    const manifests = await Promise.all([
      loadManifest("dev:tender"),
      loadManifest("prod:tender"),
    ]);

    for (const manifest of manifests) {
      const requestHeaders = getTenderInternalAuthzRequestHeaders(manifest);

      expect(requestHeaders).toEqual(["apikey"]);
      expect(requestHeaders).not.toContain("IP-Chain");
      expect(requestHeaders).not.toContain("Cookie");
      expect(requestHeaders).not.toContain("Authorization");
    }
  });

  it("preserves tender forward-auth and proxy-rewrite behavior after materialization", async () => {
    const manifest = await loadManifest("prod:tender");
    const apiRoute = manifest.resources.routes.find(route => route.id === "tender.api.prod");
    const publicRoute = manifest.resources.routes.find(route => route.id === "tender.public.prod");
    const thirdpartyRoute = manifest.resources.routes.find(route => route.id === "tender.thirdparty.prod");

    expect(apiRoute).toMatchObject({
      service_id: "tender.prod",
      upstream_id: "tender.api.prod",
      plugin_config_id: "tender.api-ip-rate-limit.prod",
    });
    expect(getForwardAuthConfig(apiRoute ?? {})?.request_headers).toEqual(["Cookie", "Client", "Authorization"]);
    expect((apiRoute?.plugins as Record<string, unknown> | undefined)?.["proxy-rewrite"]).toMatchObject({
      regex_uri: ["^/api/tender/(.*)", "/$1"],
    });
    expect((publicRoute?.plugins as Record<string, unknown> | undefined)?.["proxy-rewrite"]).toMatchObject({
      regex_uri: ["^/api/tender/(.*)", "/$1"],
    });
    expect(getForwardAuthConfig(thirdpartyRoute ?? {})?.request_headers).toEqual(["apikey"]);
    expect((thirdpartyRoute?.plugins as Record<string, unknown> | undefined)?.["proxy-rewrite"]).toMatchObject({
      regex_uri: ["^/thirdparty/tender/(.*)", "/thirdparty/$1"],
    });
  });

  it("preserves Tender and GDS special upstream overrides", async () => {
    const [tender, gds] = await Promise.all([
      loadManifest("prod:tender"),
      loadManifest("prod:gds"),
    ]);

    expect(tender.resources.routes.find(route => route.id === "tender.frontend-external.prod")).toMatchObject({
      service_id: "tender.prod",
      upstream_id: "tender.frontend-external.prod",
    });
    expect(tender.resources.routes.find(route => route.id === "tender.minio.prod")).toMatchObject({
      service_id: "tender.prod",
      upstream_id: "tender.minio.prod",
    });
    expect(gds.resources.routes.find(route => route.id === "gds.external-frontend.prod")).toMatchObject({
      service_id: "gds.prod",
      upstream_id: "gds.external-frontend.prod",
    });
    expect(gds.resources.routes.find(route => route.id === "gds.dashboard.prod")).toMatchObject({
      service_id: "gds.prod",
      upstream_id: "gds.dashboard.prod",
    });
  });

  it("rejects broken route references", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      upstreams: [
        sourceUpstream(),
      ],
      routes: [
        sourceRoute({
          upstream: "missing-upstream",
        }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("references missing upstream missing-upstream"))).toBe(true);
  });

  it("rejects missing service plugin_config references", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      upstreams: [
        sourceUpstream(),
      ],
      routes: [
        sourceRoute({
          plugin_config: "missing-plugin",
        }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("missing service plugin_config missing-plugin"))).toBe(true);
  });

  it("rejects duplicate and invalid source keys", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      upstreams: [
        sourceUpstream({ key: "api" }),
        sourceUpstream({ key: "api" }),
      ],
      routes: [
        sourceRoute({ key: "Route.A" }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("duplicate upstreams key api"))).toBe(true);
    expect(issues.some(issue => issue.message.includes("key Route.A must be a kebab-case segment"))).toBe(true);
  });

  it("rejects generated source fields and reserved label overrides", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
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
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.path === "service.id")).toBe(true);
    expect(issues.some(issue => issue.path === "upstreams[0].name")).toBe(true);
    expect(issues.some(issue => issue.path === "routes[0].service_id")).toBe(true);
    expect(issues.some(issue => issue.path === "upstreams[0].labels.managed_by")).toBe(true);
  });

  it("rejects secret-looking fields in manifests", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
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
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.path.includes(".credentials[0].config.key"))).toBe(true);
  });

  it("accepts APISIX limit-req variable key selectors", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
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
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.path.includes(".plugins.limit-req.key"))).toBe(false);
  });

  it("rejects rendered real-ip trusted_addresses that trust every source", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
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
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("must not trust all source addresses"))).toBe(true);
  });

  it("allows unresolved real-ip trusted_addresses placeholders", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
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
    }));

    expect(validateManifest(manifest)).toEqual([]);
  });

  it("rejects IAM routes without request-id", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      upstreams: [
        sourceUpstream(),
      ],
      routes: [
        sourceRoute(),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("must enable request-id"))).toBe(true);
  });

  it("rejects IAM routes without opentelemetry", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      upstreams: [
        sourceUpstream(),
      ],
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
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("must enable opentelemetry"))).toBe(true);
  });

  it("rejects IAM manifests without opentelemetry plugin metadata", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      plugin_metadata: [],
      upstreams: [
        sourceUpstream(),
      ],
      plugin_configs: [
        sourcePluginConfig(),
      ],
      routes: [
        sourceRoute({
          plugin_config: "api-plugin",
        }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("must configure opentelemetry plugin_metadata"))).toBe(true);
  });

  it("rejects IAM Loki/http/file logger plugins", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      upstreams: [
        sourceUpstream(),
      ],
      plugin_configs: [
        sourcePluginConfig({
          key: "api-logger",
          plugins: {
            "request-id": { header_name: "X-Request-Id", include_in_response: true },
            "opentelemetry": { sampler: { name: "always_on" } },
            "loki-logger": { endpoint_addr: "http://loki:3100" },
          },
        }),
      ],
      routes: [
        sourceRoute({
          plugin_config: "api-logger",
        }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("loki-logger must not be used"))).toBe(true);
  });

  it("configures APISIX JSON stdout access logs without sensitive fields", async () => {
    for (const configPath of ["config.dev.yaml", "config.prod.example.yaml"]) {
      const parsed = parseYaml(await readFile(path.join(process.cwd(), "config", configPath), "utf8"));
      const httpConfig = parsed.nginx_config.http;
      const format = httpConfig.access_log_format as string;

      expect(httpConfig.access_log).toBe("/dev/stdout");
      expect(parsed.plugins).toContain("opentelemetry");
      expect(parsed.plugins).not.toContain("...");
      expect(parsed.plugin_attr.opentelemetry).toMatchObject({
        set_ngx_var: true,
        collector: {
          request_timeout: 3,
        },
      });
      for (const field of [
        "event",
        "sourceApp",
        "requestId",
        "traceId",
        "spanId",
        "traceparent",
        "method",
        "path",
        "statusCode",
        "durationMs",
        "upstreamStatus",
        "upstreamAddr",
      ]) {
        expect(format).toContain(`"${field}"`);
      }
      expect(format).toContain("$opentelemetry_trace_id");
      expect(format).toContain("$opentelemetry_span_id");
      expect(format).toContain("$opentelemetry_context_traceparent");
      expect(format).not.toMatch(/request_body|resp_body|authorization|cookie|set_cookie|\$args/i);
    }
  });

  it("renders environment placeholders after parsing manifest YAML", async () => {
    const manifest = await loadManifest("test:iam", await createManifestFile({
      upstreams: [
        sourceUpstream({
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
    expect(() => renderEnvPlaceholders("host: ${MISSING_HOST}", {}, "manifest.yaml"))
      .toThrow("manifest.yaml references missing environment variable MISSING_HOST");
  });
});
