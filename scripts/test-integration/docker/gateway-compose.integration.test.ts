import { expect, test } from "bun:test";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "../harness/command-fixture";
import { syntheticAppEnvironment } from "./compose-fixture";
import { dockerCliEnvironment } from "./docker-cli-fixture";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
for (const mode of ["dev", "prod"]) {
  test(
    `${mode} Compose provides the independent Gateway target, readonly credential and shutdown budget`,
    async () => {
      await withCommandFixture("iam-gateway-compose-", async (root, signal) => {
        await mkdir(join(root, "docker"));
        const file = mode === "dev" ? "compose.dev.yaml" : "compose.prod.apps.yaml";
        const composePath = join(root, "docker", file);
        await copyFile(join(repositoryRoot, "docker", file), composePath);
        const databaseUrl = "postgresql://synthetic-reader:synthetic-password@postgres.invalid/iam_test";
        const environment = {
          ...syntheticAppEnvironment,
          IAM_GATEWAY_DATABASE_URL: databaseUrl,
          IAM_GATEWAY_APISIX_ADMIN_KEY: "synthetic-admin-key",
          APISIX_ADMIN_KEY: "synthetic-admin-key",
          APISIX_ADMIN_ALLOW_CIDR: "192.0.2.0/24",
          APISIX_ETCD_ROOT_PASSWORD: "synthetic-etcd-password",
          APISIX_OTEL_COLLECTOR_ENDPOINT: "127.0.0.1:9",
          IAM_GATEWAY_OPERATION_TIMEOUT_MS: "90000",
          IAM_GATEWAY_APISIX_REQUEST_TIMEOUT_MS: "8000",
          IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS: "100000",
        };
        const envFile = join(root, "synthetic.env");
        await writeFile(
          envFile,
          Object.entries(environment)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
          "utf8",
        );
        await writeFile(join(root, ".env"), "IAM_GATEWAY_DATABASE_URL=must-not-be-loaded\n", "utf8");
        const renderedFile = join(root, "rendered.json");
        const result = await runOwnedCommand(
          [
            "docker",
            "compose",
            "--project-directory",
            root,
            "--project-name",
            "iam-gateway-config-test",
            "--env-file",
            envFile,
            "--file",
            composePath,
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
        expect(result.exitCode).toBe(0);
        const rendered = JSON.parse(await readFile(renderedFile, "utf8"));
        const gateway = rendered.services["gateway-api"];
        expect(gateway.environment).toMatchObject({
          IAM_GATEWAY_DATABASE_URL: databaseUrl,
          IAM_GATEWAY_APISIX_ADMIN_URL: "http://apisix:9180/apisix/admin",
          IAM_GATEWAY_APISIX_ADMIN_KEY: "synthetic-admin-key",
          IAM_GATEWAY_PORT: "30004",
          IAM_GATEWAY_OPERATION_TIMEOUT_MS: "90000",
          IAM_GATEWAY_SHUTDOWN_TIMEOUT_MS: "100000",
        });
        expect(gateway.ports).toMatchObject([{ host_ip: "127.0.0.1", target: 30004, published: "30004" }]);
        expect(gateway.stop_grace_period).toBe("5m10s");
        if (mode === "dev") {
          expect(gateway.depends_on.apisix.condition).toBe("service_healthy");
          expect(gateway.depends_on.db.condition).toBe("service_healthy");
        } else {
          expect(gateway.depends_on).toBeUndefined();
        }
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
}

test(
  "existing E2E publisher waits for Gateway HTTP and receives its run-scoped credential input",
  async () => {
    await withCommandFixture("iam-gateway-e2e-compose-", async (root, signal) => {
      const envFile = join(root, "synthetic.env");
      await writeFile(envFile, "IAM_E2E_RUN_ID=gateway-config-validation\n", "utf8");
      const renderedFile = join(root, "rendered.json");
      const result = await runOwnedCommand(
        [
          "docker",
          "compose",
          "--project-directory",
          repositoryRoot,
          "--env-file",
          envFile,
          "--file",
          join(repositoryRoot, "e2e/system/compose.yaml"),
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
      expect(result.exitCode).toBe(0);
      const rendered = JSON.parse(await readFile(renderedFile, "utf8"));
      const publisher = rendered.services["gateway-sync"];
      expect(publisher.environment).toMatchObject({
        IAM_E2E_GATEWAY_API_ORIGIN: "http://gateway-api:30004",
        IAM_E2E_RUN_ID: "gateway-config-validation",
      });
      expect(publisher.depends_on["gateway-api"].condition).toBe("service_healthy");
      expect(rendered.services.seed.environment.IAM_E2E_RUN_ID).toBe("gateway-config-validation");
      expect(rendered.services["gateway-api"].environment.IAM_GATEWAY_APISIX_ADMIN_URL).toBe(
        "http://apisix:9180/apisix/admin",
      );
    });
  },
  COMMAND_FIXTURE_TEST_TIMEOUT_MS,
);
