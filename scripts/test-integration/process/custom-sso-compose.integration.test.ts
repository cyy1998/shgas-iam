import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "./command-fixture";
import { dockerCliEnvironment } from "./docker-cli-fixture";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
const retryAfterVariable = "IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS";
const syntheticEnvironment = {
  POSTGRES_PASSWORD: "synthetic-postgres-password",
  POSTGRES_REPLICATION_PASSWORD: "synthetic-replication-password",
  POSTGRES_PRIMARY_HOST: "synthetic-postgres.invalid",
  POSTGRES_REPLICATION_SLOT: "synthetic_slot",
  REDIS_PASSWORD: "synthetic-redis-password",
  IAM_REDIS_HOST: "synthetic-redis.invalid",
  IAM_REDIS_PASSWORD: "synthetic-redis-password",
  IAM_API_MAGIC_CODE: "synthetic-magic-code",
  IAM_API_CAP_SECRET: "synthetic-cap-secret",
  IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: "synthetic-kid",
  IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: '{"synthetic-kid":"synthetic-key"}',
  IAM_API_WECHAT_CORP_ID: "synthetic-wechat-corp",
  IAM_API_WECHAT_CORP_SECRET: "synthetic-wechat-secret",
  IAM_API_SMS_URL: "https://synthetic-sms.invalid/send",
  IAM_API_SMS_SIGNATURE_KEY: "synthetic-sms-key",
  IAM_API_SSO_INTERNAL_ORIGIN: "https://synthetic-internal.invalid",
  IAM_API_SSO_EXTERNAL_ORIGIN: "https://synthetic-external.invalid",
  IAM_API_OIDC_CURRENT_JWK_JSON: '{"kid":"synthetic-kid"}',
  IAM_WORKER_BULL_BOARD_USERNAME: "synthetic-dashboard-user",
  IAM_WORKER_BULL_BOARD_PASSWORD: "synthetic-dashboard-password",
};

describe("Custom SSO Compose environment propagation", () => {
  test.each([
    { composeFile: "docker-compose-dev.yml", retryAfterSeconds: "47" },
    { composeFile: "docker-compose-prod.yml", retryAfterSeconds: "83" },
  ])(
    "$composeFile passes configured Projection Retry-After to the API",
    async ({ composeFile, retryAfterSeconds }) => {
      await withCommandFixture("iam-custom-sso-compose-", async (root, signal) => {
        await mkdir(join(root, "docker"));
        const composePath = join(root, "docker", composeFile);
        await copyFile(join(repositoryRoot, "docker", composeFile), composePath);
        const envFile = join(root, "synthetic.env");
        await writeFile(
          envFile,
          Object.entries({ ...syntheticEnvironment, [retryAfterVariable]: retryAfterSeconds })
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
          "utf8",
        );
        // Explicit env-file and the isolated child environment keep local overrides out of interpolation.
        await writeFile(join(root, ".env"), `${retryAfterVariable}=101\n`, "utf8");
        const renderedFile = join(root, "rendered.json");
        const result = await runOwnedCommand(
          [
            "docker",
            "compose",
            "--project-directory",
            root,
            "--project-name",
            "iam-custom-sso-config-test",
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
        const rendered = JSON.parse(await readFile(renderedFile, "utf8")) as {
          services: { api: { environment: Record<string, string> } };
        };
        expect(rendered.services.api.environment[retryAfterVariable]).toBe(retryAfterSeconds);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});
