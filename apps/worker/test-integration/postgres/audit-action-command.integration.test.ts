import process from "node:process";
import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("historical audit action maintenance command", () => {
  let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
  beforeAll(async () => {
    harness = await createWorkerPostgresTestHarness();
  });
  afterAll(async () => {
    if (harness)
      await harness.close();
  });
  beforeEach(async () => {
    await harness.sql`TRUNCATE audit_log RESTART IDENTITY`;
  });

  async function seed(action: string, outcome = "success") {
    await harness.sql`
      INSERT INTO audit_log (action, outcome, actor_type, target_type, source_app, details,
        event_time, actor_user_id, actor_username, actor_client_code, actor_system_key,
        target_id, target_code, request_id, trace_id, ip, user_agent, route, method)
      VALUES (${action}, ${outcome}, 'user', 'user', 'api', '{"fixture":true}',
        '2026-01-01', 7, 'fixture', 'client', 'system', 8, 'target', 'request', 'trace',
        '127.0.0.1', 'fixture agent', '/login', 'POST')`;
  }
  async function rows() {
    return Array.from(await harness.sql`SELECT * FROM audit_log ORDER BY id`);
  }
  async function run(args: string[], expectedExitCode = 0, url = harness.commandDatabaseUrl) {
    return await runProcessCommandSmoke({
      label: "audit action command",
      start: () => spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "audit:actions", ...args],
        cwd: workerRoot,
        env: { ...process.env, IAM_WORKER_DATABASE_URL: url, NO_COLOR: "1" },
      }),
      completionTimeoutMs: 15_000,
      cleanupTimeoutMs: 5_000,
      maxOutputBytes: 64 * 1024,
      expectedExitCode,
    });
  }

  test("inventory preserves rows and apply canonicalizes eight actions without changing other facts", async () => {
    const fixtures = [
      ["auth.login.success", "success", "auth.login"],
      ["auth.login.password.success", "success", "auth.login.password"],
      ["auth.login.password.failure", "failure", "auth.login.password"],
      ["auth.login.mobile.success", "success", "auth.login.mobile"],
      ["auth.login.mobile.failure", "failure", "auth.login.mobile"],
      ["auth.login.local.success", "success", "auth.login.local"],
      ["auth.login.oa.success", "success", "auth.login.oa"],
      ["auth.login.wechat.success", "success", "auth.login.wechat"],
      ["unknown.success", "failure", "unknown.success"],
      ["auth.login", "failure", "auth.login"],
    ];
    for (const [action, outcome] of fixtures) await seed(action!, outcome!);
    const before = await rows();
    const inventory = await run(["inventory"]);
    expect(inventory.output).toContain("\"legacyRows\":\"8\"");
    const afterInventory = await rows();
    expect(afterInventory).toEqual(before);
    await run(["verify"], 1);
    const applied = await run(["apply", "--writers-stopped"]);
    expect(applied.output).toContain("\"updatedRows\":\"8\"");
    const after = await rows();
    expect(after).toEqual(before.map((row, index) => ({ ...row, action: fixtures[index]![2] })));
    const again = await run(["apply", "--writers-stopped"]);
    expect(again.output).toContain("\"updatedRows\":\"0\"");
    await run(["verify"]);
    const verified = await rows();
    expect(verified).toEqual(after);
  }, 60_000);

  test("a late conflict prevents every write and reports only bounded numeric locations", async () => {
    await seed("auth.login.success");
    for (let index = 0; index < 25; index++) await seed("auth.login.mobile.failure", "private-invalid");
    const before = await rows();
    const inventory = await run(["inventory"], 1);
    expect(inventory.output).toContain("\"conflictRows\":\"25\"");
    const failed = await run(["apply", "--writers-stopped"], 1);
    expect(failed.output).toContain("\"updatedRows\":\"0\"");
    expect(failed.output).toContain("\"conflictIds\":[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]");
    expect(failed.output).not.toContain("private-invalid");
    const after = await rows();
    expect(after).toEqual(before);
  }, 30_000);

  test("database failure rolls back all updates and permits retry after correction", async () => {
    await seed("auth.login.success");
    await seed("auth.login.password.success");
    const before = await rows();
    await harness.sql.unsafe(`CREATE FUNCTION reject_audit_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.action = 'auth.login.password' THEN RAISE EXCEPTION 'private database error'; END IF;
      RETURN NEW; END $$`);
    await harness.sql.unsafe(`CREATE TRIGGER reject_audit_update BEFORE UPDATE ON audit_log
      FOR EACH ROW EXECUTE FUNCTION reject_audit_update()`);
    try {
      const failed = await run(["apply", "--writers-stopped"], 1);
      expect(failed.output).toContain("\"reason\":\"operation-failed\"");
      expect(failed.output).not.toContain("private database error");
      const after = await rows();
      expect(after).toEqual(before);
    }
    finally {
      await harness.sql.unsafe("DROP TRIGGER reject_audit_update ON audit_log");
      await harness.sql.unsafe("DROP FUNCTION reject_audit_update()");
    }
    await run(["apply", "--writers-stopped"]);
    await run(["verify"]);
  }, 30_000);

  test("apply waits for an existing writer and includes its committed conflict in the zero-write preflight", async () => {
    await seed("auth.login.success");
    const writer = await harness.sql.reserve();
    let command: ReturnType<typeof run> | undefined;
    try {
      await writer`BEGIN`;
      await writer`INSERT INTO audit_log (action, outcome, actor_type, target_type, source_app, details)
        VALUES ('auth.login.mobile.failure', 'success', 'user', 'user', 'api', '{}')`;
      command = run(["apply", "--writers-stopped"], 1);
      let waiting = false;
      const deadline = Date.now() + 5000;
      while (!waiting && Date.now() < deadline) {
        const active = await harness.sql`SELECT 1 FROM pg_stat_activity
          WHERE application_name = 'iam-audit-action-maintenance-v1' AND wait_event_type = 'Lock'`;
        waiting = active.length > 0;
        if (!waiting)
          await Bun.sleep(20);
      }
      expect(waiting).toBe(true);
      await writer`COMMIT`;
      const failed = await command;
      expect(failed.output).toContain("\"conflictRows\":\"1\"");
      expect(failed.output).toContain("\"updatedRows\":\"0\"");
      const after = await rows();
      expect(after.map(row => row.action)).toEqual(["auth.login.success", "auth.login.mobile.failure"]);
    }
    finally {
      await writer`ROLLBACK`;
      writer.release();
      if (command)
        await command;
    }
  }, 30_000);

  test("arguments fail before connecting and connection or incomplete verify failures remain safe", async () => {
    for (const args of [[], ["apply"], ["verify", "--writers-stopped"], ["inventory", "extra"], ["apply", "--writers-stopped", "extra"]]) {
      const invalid = await run(args, 2, "not-a-url-private");
      expect(invalid.output).toContain("\"reason\":\"invalid-arguments\"");
      expect(invalid.output).not.toContain("not-a-url-private");
    }
    const unavailable = new URL(harness.commandDatabaseUrl);
    for (const invalidUrl of ["", "private-invalid-url", "https://private-invalid-host/iam"]) {
      const invalid = await run(["verify"], 1, invalidUrl);
      expect(invalid.output).toContain("\"reason\":\"operation-failed\"");
      expect(invalid.output).not.toContain("private-invalid");
    }
    unavailable.password = "wrong-private-password";
    const failed = await run(["verify"], 1, unavailable.toString());
    expect(failed.output).toContain("\"reason\":\"operation-failed\"");
    expect(failed.output).not.toContain("wrong-private-password");
    await harness.sql`ALTER TABLE audit_log RENAME TO unavailable_audit_log`;
    try {
      await run(["verify"], 1);
    }
    finally {
      await harness.sql`ALTER TABLE unavailable_audit_log RENAME TO audit_log`;
    }
    await run(["verify"]);
    await run(["apply", "--writers-stopped"]);
  }, 60_000);
});
