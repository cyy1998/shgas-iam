import { expect, test } from "bun:test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "../harness/command-fixture";
import { syntheticAppEnvironment } from "./compose-fixture";
import { dockerCliEnvironment } from "./docker-cli-fixture";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
const dataEnvironment = {
  POSTGRES_PASSWORD: "synthetic-postgres-password",
  POSTGRES_REPLICATION_PASSWORD: "synthetic-replication-password",
  POSTGRES_PRIMARY_HOST: "synthetic-postgres.invalid",
  REDIS_PASSWORD: "synthetic-redis-password",
};
const gatewayEnvironment = {
  APISIX_ETCD_ROOT_PASSWORD: "synthetic-etcd-password",
  APISIX_ADMIN_KEY: "synthetic-admin-key",
  APISIX_ADMIN_ALLOW_CIDR: "192.0.2.0/24",
  APISIX_OTEL_COLLECTOR_ENDPOINT: "synthetic-alloy.invalid:4318",
};
const observabilityEnvironment = {
  GRAFANA_ROOT_URL: "https://synthetic-grafana.invalid",
  GRAFANA_ADMIN_PASSWORD: "synthetic-admin-password",
  GRAFANA_OIDC_CLIENT_SECRET: "synthetic-oidc-secret",
  GRAFANA_OIDC_AUTH_URL: "https://synthetic-iam.invalid/oidc/auth",
  GRAFANA_OIDC_TOKEN_URL: "https://synthetic-iam.invalid/oidc/token",
  GRAFANA_OIDC_USERINFO_URL: "https://synthetic-iam.invalid/oidc/me",
  IAM_LOG_HOST: "synthetic-host",
  LOKI_PUSH_URL: "https://synthetic-loki.invalid/loki/api/v1/push",
};
const dataServices = ["postgres-primary", "postgres-replica-1", "postgres-replica-2", "redis"];
const appServices = [
  "api",
  "admin-api",
  "sso",
  "admin",
  "worker-user-profile",
  "worker-organization-search",
  "worker-dashboard",
  "gateway-api",
];
const gatewayServices = ["apisix-etcd-init", "apisix-etcd", "apisix"];

test.each([
  {
    files: ["compose.dev.yaml"],
    environment: syntheticAppEnvironment,
    services: ["db", "redis", "apisix-etcd", "apisix", ...appServices, "loki", "grafana", "alloy"],
  },
  { files: ["compose.prod.data.yaml"], environment: dataEnvironment, services: dataServices },
  { files: ["compose.prod.apps.yaml"], environment: syntheticAppEnvironment, services: appServices },
  { files: ["compose.prod.gateway.yaml"], environment: gatewayEnvironment, services: gatewayServices },
  {
    files: ["compose.prod.observability.yaml"],
    environment: observabilityEnvironment,
    services: ["loki", "grafana", "alloy"],
  },
  {
    files: ["compose.prod.data.yaml", "compose.prod.apps.yaml", "compose.prod.gateway.yaml"],
    environment: { ...dataEnvironment, ...syntheticAppEnvironment, ...gatewayEnvironment },
    services: [...dataServices, ...appServices, ...gatewayServices],
  },
])(
  "$files renders independently or as a shared project with usable build and configuration paths",
  async ({ files, environment, services }) => {
    await withCommandFixture("iam-production-compose-", async (root, signal) => {
      const envFile = join(root, "synthetic.env");
      await writeFile(
        envFile,
        Object.entries(environment)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
        "utf8",
      );
      const renderedFile = join(root, "rendered.json");
      const result = await runOwnedCommand(
        [
          "docker",
          "compose",
          "--env-file",
          envFile,
          "--profile",
          "ops",
          "--profile",
          "observability",
          ...files.flatMap((file) => ["--file", join(repositoryRoot, "docker", file)]),
          "config",
          "--format",
          "json",
          "--output",
          renderedFile,
        ],
        root,
        signal,
        20_000,
        dockerCliEnvironment(),
      );
      expect(result.exitCode, result.output).toBe(0);
      const rendered = JSON.parse(await readFile(renderedFile, "utf8"));
      expect(Object.keys(rendered.services).sort()).toEqual([...services].sort());
      for (const serviceName of services) {
        const service = rendered.services[serviceName];
        if (service.build) {
          const dockerfile = await stat(join(service.build.context, service.build.dockerfile));
          expect(dockerfile.isFile()).toBe(true);
        }
        for (const volume of service.volumes ?? []) {
          if (volume.type !== "bind" || !volume.read_only) continue;
          // The daemon socket belongs to the deployment host, not the repository checkout.
          if (volume.target === "/var/run/docker.sock") continue;
          const source = await stat(volume.source);
          const directoryMount = ["/etc/grafana/provisioning", "/var/lib/grafana/dashboards"].includes(volume.target);
          expect(source.isDirectory()).toBe(directoryMount);
          expect(source.isFile()).toBe(!directoryMount);
        }
      }
    });
  },
  COMMAND_FIXTURE_TEST_TIMEOUT_MS,
);

test(
  "production environment example resolves the deployed APISIX configuration",
  async () => {
    await withCommandFixture("iam-production-template-", async (root, signal) => {
      const renderedFile = join(root, "rendered.json");
      const result = await runOwnedCommand(
        [
          "docker",
          "compose",
          "--env-file",
          join(repositoryRoot, "docker/.env.prod.example"),
          "--file",
          join(repositoryRoot, "docker/compose.prod.gateway.yaml"),
          "config",
          "--format",
          "json",
          "--output",
          renderedFile,
        ],
        root,
        signal,
        20_000,
        dockerCliEnvironment(),
      );
      expect(result.exitCode, result.output).toBe(0);
      const rendered = JSON.parse(await readFile(renderedFile, "utf8"));
      const configMount = rendered.services.apisix.volumes.find(
        (volume: { target: string }) => volume.target === "/usr/local/apisix/conf/config.yaml",
      );
      const config = await readFile(configMount.source, "utf8");
      const expectedConfig = await readFile(join(repositoryRoot, "docker/apisix/config.prod.example.yaml"), "utf8");
      expect(config).toBe(expectedConfig);
    });
  },
  COMMAND_FIXTURE_TEST_TIMEOUT_MS,
);
