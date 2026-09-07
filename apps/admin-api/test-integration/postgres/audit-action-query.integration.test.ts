import process from "node:process";
import { fileURLToPath } from "node:url";
import { createAuditRepository } from "@admin-api/services/audit/audit.repository";
import { AuditLogPaginationQueryDtoSchema } from "@admin-api/services/audit/audit.schema";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

describe("Admin audit queries after historical action normalization", () => {
  let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;
  beforeAll(async () => {
    harness = await createAdminApiPostgresTestHarness();
  });
  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  async function command(args: string[]) {
    const result = await runProcessCommandSmoke({
      label: "audit normalization before Admin query",
      start: () => spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "audit:actions", ...args],
        cwd: fileURLToPath(new URL("../../../worker/", import.meta.url)),
        env: { ...process.env, IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl, NO_COLOR: "1" },
      }),
      completionTimeoutMs: 15_000,
      cleanupTimeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
      expectedExitCode: 0,
    });
    const report = result.output.replaceAll("[stdout] ", "").split(/\r?\n/u).find(line => line.startsWith("{\"version\":1"));
    if (!report)
      throw new Error("audit command did not emit its versioned report");
    return JSON.parse(report);
  }

  test("migrates mixed actions then preserves exact filters, outcomes, counts, pagination and facts", async () => {
    const service = createAdminAuditService({ auditRepository: createAuditRepository(harness.db) });
    const fixtures = [
      ["auth.login.success", "success"],
      ["auth.login.password.success", "success"],
      ["auth.login.password.failure", "failure"],
      ["auth.login.mobile.success", "success"],
      ["auth.login.mobile.failure", "failure"],
      ["auth.login.local.success", "success"],
      ["auth.login.oa.success", "success"],
      ["auth.login.wechat.success", "success"],
      ["auth.login.password", "success"],
      ["auth.login.password", "failure"],
      ["external.import.success", "failure"],
    ];
    for (const [action, outcome] of fixtures) {
      await harness.sql`INSERT INTO audit_log (action, outcome, actor_type, target_type, source_app,
        event_time, actor_username, target_code, request_id, details)
        VALUES (${action!}, ${outcome!}, 'user', 'user', 'iam-api',
          '2026-01-01', 'fixture', 'target', 'audit-query-fixture', '{"fixture":true}')`;
    }
    async function search(conditions: Record<string, unknown> = {}, pageNum = 1, pageSize = 20) {
      return await service.searchAuditLogsForAdmin(AuditLogPaginationQueryDtoSchema.parse({
        conditions,
        pageNum,
        pageSize,
      }));
    }
    const before = await search();
    expect(before).toMatchObject({ total: 11, pageNum: 1, pageSize: 20, pages: 1 });
    const inventory = await command(["inventory"]);
    expect(inventory).toMatchObject({ version: 1, totalRows: "11", legacyRows: "8" });
    const applied = await command(["apply", "--writers-stopped"]);
    expect(applied).toMatchObject({ updatedRows: "8" });
    const repeated = await command(["apply", "--writers-stopped"]);
    expect(repeated).toMatchObject({ updatedRows: "0" });
    const verified = await command(["verify"]);
    expect(verified).toMatchObject({ status: "completed", legacyRows: "0", totalRows: "11" });
    const after = await search();
    expect(after.total).toBe(11);
    expect(after.result.map(({ action: _action, ...facts }) => facts))
      .toEqual(before.result.map(({ action: _action, ...facts }) => facts));
    const password = await search({ action: "auth.login.password" });
    expect(password.total).toBe(4);
    expect(password.result.map(row => row.action)).toEqual([
      "auth.login.password",
      "auth.login.password",
      "auth.login.password",
      "auth.login.password",
    ]);
    const success = await search({ action: "auth.login.password", outcome: "success" });
    const failure = await search({ action: "auth.login.password", outcome: "failure" });
    expect(success.total).toBe(2);
    expect(failure.total).toBe(2);
    expect(success.result.map(row => row.outcome)).toEqual(["success", "success"]);
    expect(failure.result.map(row => row.outcome)).toEqual(["failure", "failure"]);
    const combined = await search({ action: "auth.login.password", actions: ["auth.login.password", "auth.login.mobile"], outcome: "failure" }, 2, 2);
    expect(combined).toMatchObject({ total: 3, pages: 2, pageNum: 2, pageSize: 2 });
    expect(combined.result).toHaveLength(1);
    expect(combined.result[0]).toMatchObject({ action: "auth.login.password", outcome: "failure" });
    const unknown = await search({ action: "external.import.success", outcome: "failure" });
    expect(unknown).toMatchObject({ total: 1, result: [{ action: "external.import.success", outcome: "failure" }] });
    const oldName = await search({ action: "auth.login.password.failure" });
    expect(oldName).toMatchObject({ result: [], total: 0, pages: 0 });
  }, 60_000);
});
