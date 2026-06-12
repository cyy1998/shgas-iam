import { describe, expect, it } from "bun:test";
import { renderEnvPlaceholders } from "../env";
import { loadManifest } from "../manifest";
import { validateManifest } from "../validators";
import { createManifestDir, repoObject } from "./test-helpers";

function getSsoRoutes(manifest: Awaited<ReturnType<typeof loadManifest>>) {
  return manifest.resources.routes.filter(route => route.uri === "/sso/*");
}

function expectRootRedirectToSsoLogin(manifest: Awaited<ReturnType<typeof loadManifest>>) {
  const route = manifest.resources.routes.find(route => route.id === `iam-root-redirect-${manifest.scope.env}`);
  const redirect = (route?.plugins as Record<string, unknown> | undefined)?.redirect;

  expect(route).toMatchObject({
    name: `iam-root-redirect-${manifest.scope.env}`,
    uri: "/",
    priority: 100,
    status: 1,
  });
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
  expect(routes.every(route => route.service_id === `iam-api-${manifest.scope.env}`)).toBe(true);
  expect(routes.every(route => route.plugin_config_id === `iam-sso-api-plugin-${manifest.scope.env}`)).toBe(true);
  expect(routes.some(route => route.id === `iam-sso-${manifest.scope.env}`)).toBe(false);
  expect(routes.some(route => route.hosts === undefined)).toBe(false);
  expect(routes.map(route => getEntryNetwork(route)?.["X-IAM-Entry-Network"]).sort()).toEqual(["external", "internal"]);
  expect(routes.every(route => (route.plugins as Record<string, unknown> | undefined)?.cors === undefined)).toBe(true);

  const ssoPluginConfig = manifest.resources.plugin_configs.find(
    config => config.id === `iam-sso-api-plugin-${manifest.scope.env}`,
  );
  expect(ssoPluginConfig?.plugins).toMatchObject({
    "limit-req": expect.any(Object),
    "real-ip": expect.any(Object),
    "cors": expect.any(Object),
  });
}

describe("apisix manifest validation", () => {
  it("accepts the checked-in dev IAM manifest", async () => {
    const manifest = await loadManifest("dev:iam");
    expect(validateManifest(manifest)).toEqual([]);
    expectRootRedirectToSsoLogin(manifest);
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
        IAM_ADMIN_API_UPSTREAM_HOST: "iam-admin-api.internal",
        IAM_ADMIN_API_UPSTREAM_PORT: "30001",
        IAM_ADMIN_FRONTEND_UPSTREAM_HOST: "iam-admin.internal",
        IAM_ADMIN_FRONTEND_UPSTREAM_PORT: "80",
        IAM_API_UPSTREAM_HOST: "iam-api.internal",
        IAM_API_UPSTREAM_PORT: "30000",
        IAM_SSO_CORS_ALLOW_ORIGINS: "https://iam.example.com",
        IAM_SSO_EXTERNAL_HOST: "iam.example.com",
        IAM_SSO_FRONTEND_UPSTREAM_HOST: "iam-sso.internal",
        IAM_SSO_FRONTEND_UPSTREAM_PORT: "80",
        IAM_SSO_INTERNAL_HOST: "iam.internal.example.com",
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

  it("loads app-scoped manifests from env:app directories", async () => {
    const manifest = await loadManifest("prod:tender");

    expect(manifest.manifestDir.endsWith("gateway/apisix/manifests/prod/tender")).toBe(true);
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.resources.services.map(service => service.name)).toContain("tender-api-prod");
  });

  it("rejects broken route references", async () => {
    const manifest = await loadManifest("test:iam", await createManifestDir({
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
    const manifest = await loadManifest("test:iam", await createManifestDir({
      routes: [
        repoObject({ id: "route-a", uri: "/a/*" }),
        repoObject({ id: "route-a", uri: "/b/*" }),
      ],
    }));

    const issues = validateManifest(manifest);
    expect(issues.some(issue => issue.message.includes("duplicate routes id route-a"))).toBe(true);
  });

  it("rejects secret-looking fields in manifests", async () => {
    const manifest = await loadManifest("test:iam", await createManifestDir({
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

  it("accepts APISIX limit-req variable key selectors", async () => {
    const manifest = await loadManifest("test:iam", await createManifestDir({
      plugin_configs: [
        repoObject({
          id: "api-limit",
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
    const manifest = await loadManifest("test:iam", await createManifestDir({
      plugin_configs: [
        repoObject({
          id: "api-real-ip",
          plugins: {
            "real-ip": {
              source: "http_x_forwarded_for",
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
    const manifest = await loadManifest("test:iam", await createManifestDir({
      plugin_configs: [
        repoObject({
          id: "api-real-ip",
          plugins: {
            "real-ip": {
              source: "http_x_forwarded_for",
              trusted_addresses: ["${TENCENT_NGINX_TRUSTED_CIDR}"],
              recursive: true,
            },
          },
        }),
      ],
    }));

    expect(validateManifest(manifest)).toEqual([]);
  });

  it("renders environment placeholders after parsing manifest YAML", async () => {
    const manifest = await loadManifest("test:iam", await createManifestDir({
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
