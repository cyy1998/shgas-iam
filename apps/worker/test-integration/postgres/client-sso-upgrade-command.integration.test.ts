import type { ClientSsoUpgradeManifest } from "../../src/commands/client-sso/upgrade-plan";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { hashSecret, verifySecret } from "@iam/api-core/security";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { ClientSsoProtocol } from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = fileURLToPath(
  new URL(`../../test-results/client-sso-upgrade-${randomUUID()}.json`, import.meta.url),
);
const oidc = {
  clientType: "confidential",
  redirectUris: ["https://business.test/callback"],
  postLogoutRedirectUris: [],
  allowedScopes: ["openid"],
  tokenEndpointAuthMethod: "client_secret_basic",
};
const independent = {
  mode: "independent",
  callbackEndpoint: "https://business.test/sso/callback",
  logoutEndpoint: "https://business.test/logout",
  validRedirectUrls: ["https://business.test/*"],
  subjectClaims: ["subjectIdentifier"],
};
const gateway = {
  mode: "gateway",
  validRedirectUrls: ["https://business.test/*"],
  subjectClaims: ["subjectIdentifier"],
  orcas: { enabled: true },
};

describe("Client single-protocol upgrade through independent command processes", () => {
  let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
  beforeAll(async () => {
    harness = await createWorkerPostgresTestHarness({ clientSsoUpgradeSource: true });
    await mkdir(fileURLToPath(new URL("../../test-results", import.meta.url)), { recursive: true });
  });
  afterAll(async () => {
    if (harness)
      await harness.close();
    try {
      await unlink(manifestPath);
    }
    catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
        throw error;
    }
  });
  beforeEach(async () => {
    await harness.reset();
    await harness.sql`TRUNCATE role RESTART IDENTITY CASCADE`;
  });

  async function run(args: string[], expectedExitCode = 0, url = harness.commandDatabaseUrl) {
    const result = await runProcessCommandSmoke({
      label: "Client SSO upgrade command",
      start: () =>
        spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["--no-env-file", "run", "client-sso:upgrade", ...args],
          cwd: workerRoot,
          env: { ...process.env, IAM_WORKER_DATABASE_URL: url, NO_COLOR: "1" },
        }),
      completionTimeoutMs: 15_000,
      cleanupTimeoutMs: 5_000,
      maxOutputBytes: 256 * 1024,
      expectedExitCode,
    });
    const json = result.output
      .replaceAll("[stdout] ", "")
      .split("\n")
      .find(line => line.startsWith("{\"version\":1"));
    if (!json)
      throw new Error("Missing safe report");
    return { output: result.output, report: JSON.parse(json) };
  }
  async function seed(code: string, protocols: "none" | "oidc" | "custom" | "gateway" | "dual") {
    const hasOidc = protocols === "oidc" || protocols === "dual";
    const hasCustom = ["custom", "gateway", "dual"].includes(protocols);
    const oldHash = await hashSecret("old-secret-not-recoverable", 4);
    const inserted
      = await harness.sql`INSERT INTO client (client_code, client_name, client_secret, ext_attributes,
      oidc_enabled, oidc_config, oidc_secret_hash, oidc_config_version,
      custom_sso_enabled, custom_sso_config, custom_sso_secret_hash, custom_sso_config_version)
      VALUES (${code}, 'Retained name', 'internal-private-credential', '{"retained":true}',
        ${hasOidc}, ${hasOidc ? JSON.stringify(oidc) : null}::jsonb, ${hasOidc ? oldHash : null}, ${hasOidc ? 2 : 0},
        ${hasCustom}, ${hasCustom ? JSON.stringify(protocols === "gateway" ? gateway : independent) : null}::jsonb,
        ${hasCustom && protocols !== "gateway" ? oldHash : null}, ${hasCustom ? 3 : 0}) RETURNING id`;
    await harness.sql`INSERT INTO role (role_code, role_name, client_id) VALUES (${`${code}:role`}, 'Retained role', ${inserted[0]!.id})`;
  }
  async function facts() {
    return Array.from(await harness.sql`SELECT to_jsonb(c) AS data FROM client c ORDER BY id`);
  }
  async function manifest(codes?: string[]) {
    const inventory = await run(["inventory", "--writers-stopped"]);
    const clients = inventory.report.clients
      .filter((row: { clientCode: string }) => !codes || codes.includes(row.clientCode))
      .map(
        ({
          clientCode,
          sourceDigest,
          credentialId,
        }: {
          clientCode: string;
          sourceDigest: string;
          credentialId: string;
        }) => ({ clientCode, sourceDigest, credentialId }),
      );
    const result: ClientSsoUpgradeManifest = {
      version: 1,
      layout: "dual-to-single-v1",
      clients,
    };
    return result;
  }
  async function execute(mode: "apply" | "verify", input: ClientSsoUpgradeManifest, exit = 0, all = false) {
    await writeFile(manifestPath, JSON.stringify(input), "utf8");
    return await run(
      [mode, "--writers-stopped", "--manifest", manifestPath, ...(all ? ["--all"] : [])],
      exit,
    );
  }

  test("dual selection and deployed Gateway address are required; one transaction preserves all old facts and roles", async () => {
    await seed("dual", "dual");
    await seed("gateway", "gateway");
    await seed("internal", "none");
    await seed("untouched", "custom");
    const before = await facts();
    const roles = Array.from(await harness.sql`SELECT * FROM role ORDER BY id`);
    const input = await manifest(["dual", "gateway", "internal"]);
    const pending = await execute("apply", input, 1);
    expect(pending.output).toContain("protocol-selection-required");
    expect(pending.output).toContain("deployed-callback-required");
    const afterPending = await facts();
    expect(afterPending).toEqual(before);
    input.clients[0]!.protocol = ClientSsoProtocol.Oidc;
    input.clients[1]!.gatewayCallback = "https://business.test:8443/login/finish?tenant=fixed";
    const applied = await execute("apply", input);
    expect(applied.report.updatedRows).toBe(2);
    const after = await facts();
    const targetFields = [
      "sso_enabled",
      "sso_config",
      "sso_secret",
      "sso_credential_id",
      "sso_secret_updated_at",
    ];
    const preserved = (rows: typeof after) =>
      rows.map(({ data }) =>
        Object.fromEntries(Object.entries(data).filter(([key]) => !targetFields.includes(key))),
      );
    expect(preserved(after)).toEqual(preserved(before));
    expect(after[2]).toEqual(before[2]);
    expect(after[3]).toEqual(before[3]);
    const rolesAfter = Array.from(await harness.sql`SELECT * FROM role ORDER BY id`);
    expect(rolesAfter).toEqual(roles);
    expect(after[0]!.data.sso_secret).not.toBe("old-secret-not-recoverable");
    const acceptedOld = await verifySecret(after[0]!.data.sso_secret, after[0]!.data.oidc_secret_hash);
    expect(acceptedOld).toBe(false);
    expect(after[1]!.data.sso_secret).toBeNull();
    expect(after[1]!.data.sso_config).toMatchObject({
      protocol: "custom-sso",
      callbackType: "managed",
      callbackEndpoint: "https://business.test:8443/login/finish?tenant=fixed",
      orcas: { enabled: true },
    });
    expect(applied.output).not.toContain(after[0]!.data.sso_secret);
    expect(applied.output).not.toContain("internal-private-credential");
    const repeat = await execute("apply", input);
    expect(repeat.report.updatedRows).toBe(0);
    await execute("verify", input);
    await execute("verify", input, 1, true);
    const final = await facts();
    expect(final).toEqual(after);
  }, 60_000);

  test("independent callback is kept, Public needs no Secret, full preflight requires every Client and independently detects corruption", async () => {
    await seed("business", "custom");
    await seed("public", "oidc");
    await seed("deleted", "none");
    await harness.sql`UPDATE client SET is_delete = true WHERE client_code = 'deleted'`;
    await harness.sql`UPDATE client SET oidc_config = ${JSON.stringify({ ...oidc, clientType: "public", tokenEndpointAuthMethod: "none" })}::jsonb, oidc_secret_hash = NULL WHERE client_code = 'public'`;
    const input = await manifest();
    await execute("verify", input, 1, true);
    const result = await execute("apply", input);
    const rows = await facts();
    expect(rows[0]!.data.sso_config.callbackEndpoint).toBe(independent.callbackEndpoint);
    expect(rows[0]!.data.sso_secret).toHaveLength(43);
    expect(rows[1]!.data.sso_secret).toBeNull();
    expect(result.output).not.toContain(rows[0]!.data.sso_secret);
    await execute("verify", input, 0, true);
    await harness.sql`UPDATE client SET sso_secret = custom_sso_secret_hash WHERE client_code = 'business'`;
    await execute("verify", input, 1, true);
    await harness.sql`UPDATE client SET sso_secret = ${rows[0]!.data.sso_secret} WHERE client_code = 'business'`;
    await harness.sql`UPDATE client SET sso_enabled = false WHERE client_code = 'business'`;
    await execute("verify", input, 1, true);
    const before = await facts();
    await execute("apply", input, 1);
    const after = await facts();
    expect(after).toEqual(before);
  }, 45_000);

  test("transaction failure rolls back the whole scope and the original manifest safely reruns", async () => {
    await seed("first", "oidc");
    await seed("second", "custom");
    const input = await manifest();
    const before = await facts();
    await harness.sql.unsafe(`CREATE FUNCTION reject_sso_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.client_code = 'second' THEN RAISE EXCEPTION 'private-error-%', NEW.sso_secret; END IF; RETURN NEW; END $$`);
    await harness.sql.unsafe(
      "CREATE TRIGGER reject_sso_update BEFORE UPDATE ON client FOR EACH ROW EXECUTE FUNCTION reject_sso_update()",
    );
    try {
      const failure = await execute("apply", input, 1);
      expect(failure.output).not.toContain("private-error-");
      const rolledBack = await facts();
      expect(rolledBack).toEqual(before);
    }
    finally {
      await harness.sql.unsafe("DROP TRIGGER reject_sso_update ON client");
      await harness.sql.unsafe("DROP FUNCTION reject_sso_update()");
    }
    await execute("apply", input);
    await execute("verify", input, 0, true);
  }, 45_000);

  test("unknown fields, source drift and unsupported layouts fail closed without exposing raw values", async () => {
    await seed("unknown", "oidc");
    const input = await manifest();
    await harness.sql`UPDATE client SET oidc_config = oidc_config || '{"private-unknown":"private-value"}'::jsonb`;
    const before = await facts();
    const inventory = await run(["inventory", "--writers-stopped"], 1);
    expect(inventory.output).not.toContain("private-value");
    await execute("apply", input, 1);
    const after = await facts();
    expect(after).toEqual(before);
    await harness.sql`ALTER TABLE client RENAME COLUMN sso_enabled TO unsupported_enabled`;
    try {
      await run(["inventory", "--writers-stopped"], 1);
      await execute("verify", input, 1, true);
    }
    finally {
      await harness.sql`ALTER TABLE client RENAME COLUMN unsupported_enabled TO sso_enabled`;
    }
  }, 30_000);

  test("a completed subset survives later failure and original selections combine for full verification", async () => {
    await seed("subset-a", "oidc");
    await seed("subset-b", "custom");
    const input = await manifest();
    const first = { ...input, clients: [input.clients[0]!] };
    const second = { ...input, clients: [input.clients[1]!] };
    await execute("apply", first);
    const afterFirst = await facts();
    second.clients[0]!.sourceDigest = "0".repeat(64);
    await execute("apply", second, 1);
    const afterFailure = await facts();
    expect(afterFailure).toEqual(afterFirst);
    const correct = await manifest(["subset-b"]);
    // Retain the original fixed credential identity when resuming the same approved scope.
    second.clients[0]!.sourceDigest = correct.clients[0]!.sourceDigest;
    await execute("apply", second);
    await execute("verify", input, 0, true);
    const final = await facts();
    expect(final[0]).toEqual(afterFirst[0]);
    const freshInventory = await manifest(["subset-a"]);
    await execute("apply", freshInventory, 1);
    const afterConflictingManifest = await facts();
    expect(afterConflictingManifest).toEqual(final);
  }, 45_000);

  test("apply waits for writers then rejects changed source facts under its lock", async () => {
    await seed("locked", "custom");
    const input = await manifest();
    const writer = await harness.sql.reserve();
    let command: ReturnType<typeof execute> | undefined;
    try {
      await writer`BEGIN`;
      await writer`UPDATE role SET role_name = 'Changed role'`;
      command = execute("apply", input, 1);
      let waiting = false;
      const deadline = Date.now() + 5000;
      while (!waiting && Date.now() < deadline) {
        const active = await harness.sql`SELECT 1 FROM pg_stat_activity
          WHERE application_name = 'iam-client-sso-upgrade-v1' AND wait_event_type = 'Lock'`;
        waiting = active.length > 0;
        if (!waiting)
          await Bun.sleep(20);
      }
      expect(waiting).toBe(true);
      await writer`COMMIT`;
      const result = await command;
      expect(result.output).toContain("source-changed-or-missing");
      const rows = await facts();
      expect(rows[0]!.data.sso_config).toBeNull();
      expect(rows[0]!.data.sso_secret).toBeNull();
    }
    finally {
      await writer`ROLLBACK`;
      writer.release();
      if (command)
        await command;
    }
  }, 30_000);

  test("invalid scope, missing stop gate and bad configuration exit safely before mutation", async () => {
    const empty: ClientSsoUpgradeManifest = {
      version: 1,
      layout: "dual-to-single-v1",
      clients: [],
    };
    await execute("verify", empty, 0, true);
    await execute("apply", empty, 1);
    await seed("safe", "none");
    for (const args of [
      [],
      ["inventory"],
      ["apply", "--writers-stopped"],
      ["verify", "--writers-stopped", "--all"],
    ]) {
      const result = await run(args, 2, "private-invalid-url");
      expect(result.output).not.toContain("private-invalid-url");
    }
    const input = await manifest();
    input.clients.push(input.clients[0]!);
    const result = await execute("apply", input, 1);
    expect(result.output).toContain("operation-failed");
    const badUrl = await run(["inventory", "--writers-stopped"], 1, "private-invalid-url");
    expect(badUrl.output).not.toContain("private-invalid-url");
  }, 30_000);

  test("inventory bound fails without truncating or modifying a larger database", async () => {
    await harness.sql`INSERT INTO client (client_code, client_name, client_secret, ext_attributes)
      SELECT 'bounded-' || n, 'Bounded fixture', 'internal-private-credential', '{}'::jsonb FROM generate_series(1, 1001) n`;
    const result = await run(["inventory", "--writers-stopped"], 1);
    expect(result.output).toContain("operation-failed");
    const count
      = await harness.sql`SELECT count(*)::int AS count FROM client WHERE sso_config IS NULL AND sso_secret IS NULL`;
    expect(count[0]!.count).toBe(1001);
  }, 20_000);
});
