import type { PostgresTestHarness } from "./postgres-harness";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const FEATURE_MIGRATION = new URL(
  "../../src/migrations/20260821080203_tearful_microchip/migration.sql",
  import.meta.url,
);
const FEATURE_ROLLBACK = new URL(
  "../../src/migrations/20260821080203_tearful_microchip/rollback.sql",
  import.meta.url,
);

let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  const sql = requireHarness().sql;
  await sql`DROP TABLE IF EXISTS client`;
  await sql.unsafe(`
    CREATE TABLE client (
      client_code text PRIMARY KEY,
      custom_sso_enabled boolean NOT NULL DEFAULT false,
      custom_sso_config jsonb,
      custom_sso_secret_hash text,
      custom_sso_config_version integer NOT NULL DEFAULT 0,
      CONSTRAINT client_custom_sso_state_check CHECK (((
        (custom_sso_config IS NULL AND NOT custom_sso_enabled AND custom_sso_secret_hash IS NULL)
        OR
        (
          custom_sso_config IS NOT NULL
          AND custom_sso_config_version > 0
          AND custom_sso_config->>'subjectClaimCatalogVersion' = '1'
        )
      ) IS TRUE))
    )
  `);
});

describe("Custom SSO V2 catalog constraint migration", () => {
  test("keeps legacy rows for an operator-owned epoch while accepting only new V2 configurations", async () => {
    const sql = requireHarness().sql;
    await insertClient("legacy", 1);

    await sql.file(FEATURE_MIGRATION, { cache: false });

    const [legacy] = await sql<{ catalogVersion: number }[]>`
      SELECT (custom_sso_config->>'subjectClaimCatalogVersion')::integer AS "catalogVersion"
      FROM client
      WHERE client_code = 'legacy'
    `;
    expect(legacy?.catalogVersion).toBe(1);
    await insertClient("v2", 2);
    await expectPostgresErrorCode(insertClient("new-v1", 1), "23514");
  });

  test("rollback restores the V1 write constraint without rewriting stored configurations", async () => {
    const sql = requireHarness().sql;
    await sql.file(FEATURE_MIGRATION, { cache: false });
    await insertClient("v2-before-rollback", 2);

    await sql.file(FEATURE_ROLLBACK, { cache: false });

    await insertClient("v1-after-rollback", 1);
    await expectPostgresErrorCode(insertClient("v2-after-rollback", 2), "23514");
  });
});

async function insertClient(clientCode: string, catalogVersion: 1 | 2) {
  const sql = requireHarness().sql;
  return await sql`
    INSERT INTO client (
      client_code,
      custom_sso_enabled,
      custom_sso_config,
      custom_sso_config_version
    )
    VALUES (
      ${clientCode},
      true,
      ${sql.json({
        mode: "gateway",
        validRedirectUrls: ["https://client.example/sso/*"],
        subjectClaimCatalogVersion: catalogVersion,
        subjectClaims: ["subjectIdentifier"],
        orcas: { enabled: false },
      })},
      1
    )
  `;
}

function requireHarness(): PostgresTestHarness {
  if (!harness)
    throw new Error("PostgreSQL test harness was not initialized");
  return harness;
}
