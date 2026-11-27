import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { requireExternalTestUrl } from "@iam/test-support/external-test-resources";
import { spawnOwnedProcessTree, withReadyProcess } from "@iam/test-support/process-smoke-harness";
import { createEntryEnvironment } from "../support/api-env.fixture";
import { useApiPostgresTestHarness } from "../support/postgres-test-file.fixture";

const getDatabase = useApiPostgresTestHarness();

test("SSO API starts with protocol settings, verifies storage and shuts down", async () => {
  const result = await withReadyProcess({
    label: "SSO API entry",
    temporaryDirectoryPrefix: "iam-sso-api-entry-",
    start(context) {
      return spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: createEntryEnvironment(context, {
          IAM_SSO_API_DATABASE_URL: getDatabase().databaseUrl,
          IAM_SSO_API_REDIS_URL: requireExternalTestUrl({
            environment: process.env,
            lane: "SSO API entry",
            name: "IAM_TEST_REDIS_URL",
          }),
        }),
      });
    },
    childReadinessEvidence: ({ port }) => `server: http://localhost:${port}`,
    async probe({ hostname, port }, signal) {
      const response = await fetch(`http://${hostname}:${port}/ready`, { signal, headers: { Connection: "close" } });
      const body = await response.json();
      return response.ok ? body : undefined;
    },
  });
  expect(result).toEqual({ status: "ok" });
}, 30_000);
