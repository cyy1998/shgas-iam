import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { EmploymentStatus, OrganizationStatus, PositionStatus } from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("Employment verifier production command", () => {
  let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createWorkerPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.sql.unsafe(
      "TRUNCATE TABLE employment, position, organization, \"user\" RESTART IDENTITY CASCADE",
    );
    await harness.sql`
      INSERT INTO "user" (id, username, name)
      VALUES (1, 'employment-command-user', 'Employment Command User')
    `;
    await harness.sql`
      INSERT INTO position (id, post_code, post_name, status, is_delete)
      VALUES (1, 'EMP-CMD-POS', 'Employment Command Position', ${PositionStatus.Enable}, false)
    `;
    await harness.sql`
      INSERT INTO organization (
        id, org_code, org_name, parent_id, business_parent_id, path, level,
        org_type, status, is_delete
      )
      VALUES (
        1, 'EMP-CMD-ORG', 'Employment Command Organization', -1, -1,
        '/1', 1, 'Department', ${OrganizationStatus.Enable}, false
      )
    `;
    await harness.sql`
      INSERT INTO employment (
        id, user_id, pos_id, dept_id, is_primary, status, start_time,
        end_time, is_delete
      )
      VALUES (1, 1, 1, 1, false, 99, '2026-08-01T00:00:00.000Z', null, false)
    `;
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("exits non-zero for blockers and succeeds after operator correction", async () => {
    const failed = await runCommand(1);

    expect(failed.exitCode).toBe(1);
    expect(failed.output).toContain("Employment verification completed");
    expect(failed.output).toContain("unknown-employment-status");

    await harness.sql`
      UPDATE employment
      SET status = ${EmploymentStatus.Enable}
      WHERE id = 1
    `;

    const passed = await runCommand(0);

    expect(passed.exitCode).toBe(0);
    expect(passed.output).toContain("Employment verification completed");
    expect(passed.output).toContain("\"status\":\"passed\"");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  async function runCommand(expectedExitCode: number) {
    return await runProcessCommandSmoke({
      label: "Worker Employment verification command",
      start() {
        return spawnOwnedProcessTree({
          executable: process.execPath,
          args: [
            "--no-env-file",
            "run",
            "employment:verify",
          ],
          cwd: workerRoot,
          env: {
            ...process.env,
            NODE_ENV: "test",
            IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl,
            IAM_WORKER_LOG_LEVEL: "info",
            IAM_WORKER_LOG_FORMAT: "json",
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
        });
      },
      completionTimeoutMs: 15_000,
      cleanupTimeoutMs: 5_000,
      expectedExitCode,
      maxOutputBytes: 64 * 1024,
    });
  }
});
