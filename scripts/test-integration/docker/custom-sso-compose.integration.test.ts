import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "../harness/command-fixture";
import { syntheticAppEnvironment } from "./compose-fixture";
import { dockerCliEnvironment } from "./docker-cli-fixture";

const repositoryRoot = join(import.meta.dirname, "..", "..", "..");
const retryAfterVariable = "IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS";

describe("Custom SSO Compose environment propagation", () => {
  test.each([
    { composeFile: "compose.dev.yaml", retryAfterSeconds: "47" },
    { composeFile: "compose.prod.apps.yaml", retryAfterSeconds: "83" },
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
          Object.entries({ ...syntheticAppEnvironment, [retryAfterVariable]: retryAfterSeconds })
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
