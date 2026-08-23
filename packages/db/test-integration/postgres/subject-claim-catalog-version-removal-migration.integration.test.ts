import type { PostgresTestHarness } from "./postgres-harness";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createPostgresTestHarness } from "./postgres-harness";

const FEATURE_MIGRATION = new URL(
  "../../src/migrations/20260823091908_remove_subject_claim_catalog_version/migration.sql",
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
      custom_sso_config_version integer NOT NULL DEFAULT 0
    )
  `);
});

describe("Subject Claim Catalog version removal migration", () => {
  test("removes any legacy marker while preserving valid current configuration", async () => {
    const sql = requireHarness().sql;
    await insertGatewayClient("v1", 1);
    await insertGatewayClient("v2", 2);
    await insertGatewayClient("unknown", 999);
    await insertGatewayClient("missing", undefined);
    await installLegacyCatalogConstraint();

    await sql.file(FEATURE_MIGRATION, { cache: false });

    const rows = await sql<{ clientCode: string; config: Record<string, unknown> }[]>`
      SELECT client_code AS "clientCode", custom_sso_config AS config
      FROM client
      ORDER BY client_code
    `;
    expect(rows.map(row => row.clientCode)).toEqual(["missing", "unknown", "v1", "v2"]);
    for (const row of rows) {
      expect(row.config).toEqual({
        mode: "gateway",
        validRedirectUrls: ["https://client.example/sso/*"],
        subjectClaims: ["subjectIdentifier"],
        orcas: { enabled: false },
      });
    }

    const markerError = await captureError(insertGatewayClient("marker-after-migration", 2));
    expect(markerError).toBeDefined();
    await insertGatewayClient("current", undefined);
  });

  test("rejects an invalid remaining V2 configuration without rewriting stored rows", async () => {
    const sql = requireHarness().sql;
    await sql`
      INSERT INTO client (
        client_code,
        custom_sso_enabled,
        custom_sso_config,
        custom_sso_config_version
      )
      VALUES (
        'invalid-claim',
        true,
        ${sql.json({
          mode: "gateway",
          validRedirectUrls: ["https://client.example/sso/*"],
          subjectClaimCatalogVersion: 1,
          subjectClaims: ["subjectIdentifier", "unknown:claim"],
          orcas: { enabled: false },
        })},
        1
      )
    `;
    await installLegacyCatalogConstraint();

    const migrationError = await captureError(sql.file(FEATURE_MIGRATION, { cache: false }));
    expect(migrationError).toBeDefined();

    const [row] = await sql<{ marker: number }[]>`
      SELECT (custom_sso_config->>'subjectClaimCatalogVersion')::integer AS marker
      FROM client
      WHERE client_code = 'invalid-claim'
    `;
    expect(row?.marker).toBe(1);
  });

  test("rejects configuration that does not satisfy the remaining strict schema", async () => {
    const sql = requireHarness().sql;
    await sql`
      INSERT INTO client (
        client_code,
        custom_sso_enabled,
        custom_sso_config,
        custom_sso_secret_hash,
        custom_sso_config_version
      )
      VALUES (
        'invalid-endpoint',
        true,
        ${sql.json({
          mode: "independent",
          validRedirectUrls: ["https://client.example/sso/*"],
          subjectClaimCatalogVersion: 2,
          subjectClaims: ["subjectIdentifier"],
          callbackEndpoint: "not-a-url",
          logoutEndpoint: "https://client.example/logout",
        })},
        'hash',
        1
      )
    `;
    await installLegacyCatalogConstraint();

    const migrationError = await captureError(sql.file(FEATURE_MIGRATION, { cache: false }));
    expect(migrationError).toBeDefined();

    const [row] = await sql<{ marker: number }[]>`
      SELECT (custom_sso_config->>'subjectClaimCatalogVersion')::integer AS marker
      FROM client
      WHERE client_code = 'invalid-endpoint'
    `;
    expect(row?.marker).toBe(2);
  });
});

async function installLegacyCatalogConstraint() {
  const sql = requireHarness().sql;
  await sql.unsafe(`
    ALTER TABLE client
    ADD CONSTRAINT client_custom_sso_state_check CHECK (
      custom_sso_config IS NULL
      OR custom_sso_config->>'subjectClaimCatalogVersion' = '2'
    ) NOT VALID
  `);
}

async function insertGatewayClient(clientCode: string, marker: number | undefined) {
  const sql = requireHarness().sql;
  const config = {
    mode: "gateway",
    validRedirectUrls: ["https://client.example/sso/*"],
    subjectClaims: ["subjectIdentifier"],
    orcas: { enabled: false },
    ...(marker === undefined ? {} : { subjectClaimCatalogVersion: marker }),
  };

  return await sql`
    INSERT INTO client (
      client_code,
      custom_sso_enabled,
      custom_sso_config,
      custom_sso_config_version
    )
    VALUES (${clientCode}, true, ${sql.json(config)}, 1)
  `;
}

function requireHarness(): PostgresTestHarness {
  if (!harness)
    throw new Error("PostgreSQL test harness was not initialized");
  return harness;
}

async function captureError(promise: Promise<unknown>) {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  return undefined;
}
