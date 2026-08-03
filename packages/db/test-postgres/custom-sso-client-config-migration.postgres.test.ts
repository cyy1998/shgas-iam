import type { PostgresTestHarness } from "./postgres-harness";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const FEATURE_MIGRATION = new URL(
  "../src/migrations/20260731002026_complete_quentin_quire/migration.sql",
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
  await requireHarness().sql`DROP TABLE IF EXISTS client`;
});

describe("Custom SSO client configuration migration", () => {
  test("stages independent fields and enforces unconfigured, Gateway, and Independent storage states", async () => {
    const sql = requireHarness().sql;
    await sql.unsafe(`
      CREATE TABLE client (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        client_code text NOT NULL UNIQUE
      )
    `);
    await sql`INSERT INTO client (client_code) VALUES ('legacy-client')`;

    await sql.file(FEATURE_MIGRATION, { cache: false });

    const [legacy] = await sql<{
      customSsoConfig: unknown;
      customSsoConfigVersion: number;
      customSsoEnabled: boolean;
      customSsoSecretHash: string | null;
    }[]>`
      SELECT
        custom_sso_enabled AS "customSsoEnabled",
        custom_sso_config AS "customSsoConfig",
        custom_sso_secret_hash AS "customSsoSecretHash",
        custom_sso_config_version AS "customSsoConfigVersion"
      FROM client
      WHERE client_code = 'legacy-client'
    `;
    expect(legacy).toEqual({
      customSsoEnabled: false,
      customSsoConfig: null,
      customSsoSecretHash: null,
      customSsoConfigVersion: 0,
    });

    await expectPostgresErrorCode(sql`
      INSERT INTO client (
        client_code,
        custom_sso_enabled,
        custom_sso_config
      )
      VALUES ('enabled-without-config', true, ${null})
    `, "23514");

    await expectPostgresErrorCode(sql`
      INSERT INTO client (
        client_code,
        custom_sso_config,
        custom_sso_secret_hash
      )
      VALUES ('gateway-with-secret', ${sql.json({ mode: "gateway" })}, 'hash')
    `, "23514");

    await expectPostgresErrorCode(sql`
      INSERT INTO client (client_code, custom_sso_config)
      VALUES ('independent-without-secret', ${sql.json({ mode: "independent" })})
    `, "23514");

    const inserted = await sql`
      INSERT INTO client (
        client_code,
        custom_sso_enabled,
        custom_sso_config,
        custom_sso_secret_hash,
        custom_sso_config_version
      )
      VALUES ('independent', true, ${sql.json({ mode: "independent" })}, 'hash', 1)
      RETURNING client_code
    `;
    expect(inserted).toHaveLength(1);
  });
});

function requireHarness(): PostgresTestHarness {
  if (!harness)
    throw new Error("PostgreSQL test harness was not initialized");
  return harness;
}
