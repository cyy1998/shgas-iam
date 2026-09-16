import { fileURLToPath } from "node:url";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createWorkerPostgresTestHarness } from "./postgres-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;
let journalSchema: string;
beforeEach(async () => {
  harness = await createWorkerPostgresTestHarness();
  const [row] = await harness.sql<{ schema: string }[]>`SELECT current_schema() AS schema`;
  journalSchema = row!.schema;
});
afterEach(async () => {
  await harness?.close();
});

async function run(mode: "inventory" | "apply" | "verify", expectedExitCode = 0) {
  return await runProcessCommandSmoke({
    label: "Managed callback configuration upgrade",
    start: () => spawnOwnedProcessTree({
      executable: process.execPath,
      args: ["--no-env-file", "run", "client-managed-callback:upgrade", mode, "--writers-stopped", "--migrations-schema", journalSchema],
      cwd: workerRoot,
      env: { ...process.env, IAM_WORKER_DATABASE_URL: harness.commandDatabaseUrl, NO_COLOR: "1" },
    }),
    completionTimeoutMs: 15_000,
    cleanupTimeoutMs: 5_000,
    maxOutputBytes: 256 * 1024,
    expectedExitCode,
  });
}
const managed = {
  protocol: "custom-sso",
  callbackType: "managed",
  validRedirectUrls: ["https://app.example/work/*"],
  subjectClaims: ["subjectIdentifier"],
};
async function seed(code: string, config: unknown) {
  await harness.sql`INSERT INTO client (client_code,client_name,client_secret,ext_attributes,sso_config)
    VALUES (${code},'Retained','internal-secret','{}',${JSON.stringify(config)}::jsonb)`;
}
async function facts() {
  return Array.from(await harness.sql`SELECT to_jsonb(c) AS value FROM client c ORDER BY client_code`);
}

test("official command rejects malformed source patterns before every mode and preserves the complete transaction", async () => {
  await harness.sql.file(new URL("../../../../packages/db/src/migrations/20260916050609_explicit_callback_type/migration.sql", import.meta.url));
  const source = { ...managed, callbackEndpoint: "https://obsolete.example/fixed" };
  await seed("a-managed", source);
  await seed("z-managed", { ...source, validRedirectUrls: ["*"] });
  const before = await facts();
  for (const mode of ["inventory", "apply", "verify"] as const) {
    const rejected = await run(mode, 1);
    expect(rejected.output).toContain("Managed callback upgrade failed");
    const after = await facts();
    expect(after).toEqual(before);
  }
  // The old CHECK still applies after failure; no earlier row or constraint was changed.
  await seed("still-old", source);
  await harness.sql`UPDATE client SET sso_config = ${JSON.stringify(source)}::jsonb WHERE client_code = 'z-managed'`;
  const applied = await run("apply");
  expect(applied.output).toContain("\"changes\":[\"a-managed\",\"still-old\",\"z-managed\"]");
  const verified = await run("verify");
  expect(verified.output).toContain("\"changes\":[]");
  const after = await facts();
  expect(after[0]!.value.sso_config).toEqual(managed);
  const repeated = await run("apply");
  expect(repeated.output).toContain("\"changes\":[]");
  const repeatedFacts = await facts();
  expect(repeatedFacts).toEqual(after);
});

test.each([
  { ...managed, validRedirectUrls: ["*"] },
  { ...managed, callbackType: "business", callbackEndpoint: "https://business.example/cb", validRedirectUrls: ["https://*.com/*"] },
  { protocol: "oidc", clientType: "public", redirectUris: ["ftp://oidc.example/cb"], postLogoutRedirectUris: [], allowedScopes: ["openid"] },
])("all modes reject invalid already-final configurations without normalizing other facts: %j", async (invalid) => {
  await seed("a-valid", managed);
  await seed("z-invalid", invalid);
  const before = await facts();
  for (const mode of ["inventory", "apply", "verify"] as const) {
    const rejected = await run(mode, 1);
    expect(rejected.output).toContain("Managed callback upgrade failed");
    const after = await facts();
    expect(after).toEqual(before);
  }
});
