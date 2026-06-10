import { describe, expect, it } from "bun:test";
import { renderEnvPlaceholders } from "../env";
import { loadManifest } from "../manifest";
import { validateManifest } from "../validators";
import { createManifestDir, repoObject } from "./test-helpers";

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
