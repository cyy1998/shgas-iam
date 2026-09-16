import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

test("fixed source CLI apply and independent all-client verify precede successful final schema contraction", async () => {
  const harness = await createWorkerPostgresTestHarness({ clientSsoUpgradeSource: true });
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const path = fileURLToPath(new URL(`../../test-results/iam194-upgrade-${randomUUID()}.json`, import.meta.url));
  const migration = new URL("../../../../packages/db/src/migrations/20260914173743_confused_mystique/migration.sql", import.meta.url);
  async function command(args: string[], expectedExitCode = 0) {
    const result = await runProcessCommandSmoke({ label: "SSO source-to-final migration", completionTimeoutMs: 15000, cleanupTimeoutMs: 5000, expectedExitCode, start: () => spawnOwnedProcessTree({ executable: process.execPath, args: ["--no-env-file", "run", "client-sso:upgrade", ...args], cwd: root, env: { ...process.env, IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl, NO_COLOR: "1" } }) });
    const line = result.output.replaceAll("[stdout] ", "").split("\n").find(value => value.startsWith("{\"version\":1"));
    if (!line)
      throw new Error("Missing migration report");
    return JSON.parse(line);
  }
  async function contract() {
    await harness.sql.begin(async (tx) => {
      await tx.file(migration, { cache: false });
    });
  }
  try {
    await mkdir(fileURLToPath(new URL("../../test-results", import.meta.url)), { recursive: true });
    await harness.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,oidc_config,oidc_enabled,oidc_secret_hash,oidc_config_version)
      VALUES ('business','Business','independent-internal','{}',${JSON.stringify({ clientType: "confidential", redirectUris: ["https://rp.test/callback"], postLogoutRedirectUris: [], allowedScopes: ["openid"], tokenEndpointAuthMethod: "client_secret_basic" })}::jsonb,true,'old-hash',1)`;
    await harness.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes) VALUES ('internal','Internal','retained-internal','{}')`;
    let blocked: unknown;
    try {
      await contract();
    }
    catch (error) {
      blocked = error;
    }
    expect(blocked).toMatchObject({ code: "23514" });
    const inventory = await command(["inventory", "--writers-stopped"]);
    const manifest = { version: 1, layout: "dual-to-single-v1", clients: inventory.clients.map(({ clientCode, sourceDigest, credentialId }: {
      clientCode: string;
      sourceDigest: string;
      credentialId: string;
    }) => ({ clientCode, sourceDigest, credentialId })) };
    await writeFile(path, JSON.stringify(manifest), "utf8");
    await command(["apply", "--writers-stopped", "--manifest", path]);
    await command(["verify", "--writers-stopped", "--manifest", path, "--all"]);
    const before = await harness.sql`SELECT id,client_code,client_name,client_secret,sso_config,sso_enabled,sso_secret,sso_credential_id,sso_secret_updated_at FROM client ORDER BY id`;
    await contract();
    const after = await harness.sql`SELECT id,client_code,client_name,client_secret,sso_config,sso_enabled,sso_secret,sso_credential_id,sso_secret_updated_at FROM client ORDER BY id`;
    expect(after).toEqual(before);
    const final = createClientSnapshotRepository(harness.db);
    const ordinary = await final.loadClient("business");
    const credential = await final.loadCredential("business");
    expect(ordinary).toMatchObject({ ssoEnabled: true, ssoConfig: { protocol: "oidc", clientType: "confidential" } });
    expect(credential?.secret).toHaveLength(43);
    expect(JSON.stringify(ordinary)).not.toContain(credential!.secret);
    const refused = await command(["verify", "--writers-stopped", "--manifest", path, "--all"], 1);
    expect(refused.status).toBe("failed");
  }
  finally {
    await Promise.all([harness.close(), rm(path, { force: true })]);
  }
}, 60000);
