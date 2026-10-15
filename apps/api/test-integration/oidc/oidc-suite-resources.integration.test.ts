import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readManagedResourceRun,
  runManagedComposeCommand,
} from "../../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../../scripts/test-resources/owned-command.mjs";
import { fixtureBunExecutable } from "../support/fixture-process";

test("standalone OIDC suite owns managed resources and closes its real candidate and driver", async () => {
  const directory = await mkdtemp(join(tmpdir(), "iam-api-suite-wiring-"));
  const config = join(directory, "config.json");
  // Empty plan selection exercises lifecycle wiring without claiming an official suite result.
  await writeFile(
    config,
    JSON.stringify({
      suiteOrigin: "http://127.0.0.1:1",
      outputDirectory: directory,
      candidate: "resource-wiring-only",
      issuerMode: "dual",
      plans: [],
    }),
  );
  const result = await runOwnedCommand({
    executable: fixtureBunExecutable(),
    args: ["--no-env-file", "run", "test-integration/oidc/oidc-suite.fixture.ts", config],
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: {
      ...process.env,
      IAM_API_TEST_DATABASE_URL: "postgres://unmanaged:unmanaged@127.0.0.1:1/unmanaged",
      IAM_API_TEST_REDIS_URL: "redis://127.0.0.1:1/0",
    },
    timeoutMs: 90000,
    cleanupTimeoutMs: 10000,
    logFile: join(directory, "entry.log"),
  });
  expect(result.exitCode).toBe(0);
  const recordPath = /record (test-results\/integration\/[^\s]+\/run.json)/u.exec(result.output)?.[1];
  if (!recordPath) throw new Error(`Standalone suite did not publish its resource record: ${directory}`);
  const run = await readManagedResourceRun(fileURLToPath(new URL("../../../../", import.meta.url)), recordPath);
  expect(run.record.status).toBe("cleaned");
  const remaining = await runManagedComposeCommand(run, ["ps", "--all", "--quiet"]);
  expect(remaining.output.trim()).toBe("");
  const owner = JSON.parse(await readFile(join(directory, "candidate-api.log.owner.json"), "utf8"));
  for (const port of [owner.port, owner.proxyPort, owner.internalProxyPort]) {
    let reachable = false;
    try {
      await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(1000) });
      reachable = true;
    } catch {
      /* The real listeners must be closed before the command returns. */
    }
    expect(reachable).toBe(false);
  }
  const selected = JSON.parse(await readFile(join(directory, "results.json"), "utf8"));
  expect(selected).toEqual([]);
}, 120000);
