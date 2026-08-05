import type { PostgresTestHarness } from "./postgres-harness";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import postgres from "postgres";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const TIGHTENING_MIGRATION = new URL(
  "../../src/migrations/20260801144944_sturdy_landau/migration.sql",
  import.meta.url,
);
const EXPLICIT_ROLLBACK = new URL(
  "../../src/migrations/20260801144944_sturdy_landau/rollback.sql",
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
  await sql.unsafe(`
    DROP TABLE IF EXISTS client, user_profile_dirty, user_profile, "user" CASCADE
  `);
  await createStagedSchema(sql);
});

describe("Subject Projection cutover tightening migration", () => {
  test("fails its verification guard before changing a staged incomplete profile", async () => {
    const sql = requireHarness().sql;
    await insertUser(sql, 1, "00000000-0000-4000-8000-000000000001");
    await sql`
      INSERT INTO user_profile_dirty (user_id, dirty_version, status)
      VALUES (1, 1, 'processed')
    `;
    await sql`
      INSERT INTO user_profile (
        user_id,
        subject_identifier,
        name,
        profile_schema_version,
        source_dirty_version,
        subject_facts
      )
      VALUES (1, ${null}, 'User 1', 1, 1, ${sql.json({ employments: [] })})
    `;

    await expectPostgresErrorCode(
      sql.file(TIGHTENING_MIGRATION, { cache: false }),
      "23514",
    );

    const [column] = await sql<{ isNullable: string }[]>`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'user_profile'
        AND column_name = 'subject_identifier'
    `;
    expect(column?.isNullable).toBe("YES");
    expect(await indexExists(sql)).toBe(false);
  });

  test("tightens verified data, enforces the unique/config constraints, and supports explicit rollback", async () => {
    const sql = requireHarness().sql;
    await insertVerifiedProjection(sql);

    await sql.file(TIGHTENING_MIGRATION, { cache: false });

    const columns = await sql<{ columnName: string; isNullable: string }[]>`
      SELECT column_name AS "columnName", is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'user_profile'
        AND column_name IN (
          'subject_identifier',
          'name',
          'source_dirty_version',
          'subject_facts'
        )
      ORDER BY column_name
    `;
    expect([...columns]).toEqual([
      { columnName: "name", isNullable: "NO" },
      { columnName: "source_dirty_version", isNullable: "NO" },
      { columnName: "subject_facts", isNullable: "NO" },
      { columnName: "subject_identifier", isNullable: "NO" },
    ]);
    expect(await indexExists(sql)).toBe(true);
    await expectPostgresErrorCode(sql`
      INSERT INTO user_profile (
        user_id,
        subject_identifier,
        name,
        profile_schema_version,
        source_dirty_version,
        subject_facts
      )
      VALUES (
        3,
        '00000000-0000-4000-8000-000000000001',
        'Duplicate',
        1,
        1,
        ${sql.json({ employments: [] })}
      )
    `, "23505");
    await expectPostgresErrorCode(sql`
      INSERT INTO client (
        client_code,
        custom_sso_config,
        custom_sso_config_version
      )
      VALUES ('invalid-gateway', ${sql.json({ mode: "gateway" })}, 1)
    `, "23514");
    await sql`
      INSERT INTO client (
        client_code,
        custom_sso_enabled,
        custom_sso_config,
        custom_sso_config_version
      )
      VALUES (
        'gateway',
        true,
        ${sql.json({
          mode: "gateway",
          validRedirectUrls: ["https://gateway.example.com/sso/*"],
          subjectClaimCatalogVersion: 1,
          subjectClaims: ["subjectIdentifier"],
          orcas: { enabled: false },
        })},
        1
      )
    `;

    await sql.file(EXPLICIT_ROLLBACK, { cache: false });

    expect(await indexExists(sql)).toBe(false);
    const [rolledBack] = await sql<{ isNullable: string }[]>`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'user_profile'
        AND column_name = 'subject_identifier'
    `;
    expect(rolledBack?.isNullable).toBe("YES");
    await sql`
      INSERT INTO client (client_code, custom_sso_config)
      VALUES ('legacy-gateway', ${sql.json({ mode: "gateway" })})
    `;
  });

  test("proves at approximate volume that the normal unique index waits for writers and requires the maintenance freeze", async () => {
    const sql = requireHarness().sql;
    await insertVerifiedProjection(sql);
    await insertApproximateProjection(sql, 10_000);
    const [volume] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count FROM user_profile
    `;
    expect(volume?.count).toBe(10_002);
    const [schema] = await sql<{ schemaName: string }[]>`
      SELECT current_schema() AS "schemaName"
    `;
    const databaseUrl = process.env.IAM_DB_TEST_DATABASE_URL!;
    const blocker = postgres(databaseUrl, {
      connection: { search_path: schema!.schemaName },
      max: 1,
    });
    let release!: () => void;
    let locked!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lockReady = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const heldLock = blocker.begin(async (tx) => {
      await tx`LOCK TABLE user_profile IN ROW EXCLUSIVE MODE`;
      locked();
      await releaseGate;
    });
    await lockReady;
    try {
      await sql`SET lock_timeout = '100ms'`;
      await expectPostgresErrorCode(sql`
        CREATE UNIQUE INDEX user_profile_subject_identifier_idx
        ON user_profile (subject_identifier)
      `, "55P03");
    }
    finally {
      await sql`RESET lock_timeout`;
      release();
      await heldLock;
      await blocker.end();
    }

    await sql.file(TIGHTENING_MIGRATION, { cache: false });
    expect(await indexExists(sql)).toBe(true);
  });
});

async function createStagedSchema(sql: ReturnType<typeof postgres>) {
  await sql.unsafe(`
    CREATE TABLE "user" (
      id integer PRIMARY KEY,
      subject_identifier uuid NOT NULL UNIQUE
    );
    CREATE TABLE user_profile_dirty (
      user_id integer PRIMARY KEY,
      dirty_version bigint NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE user_profile (
      user_id integer PRIMARY KEY,
      subject_identifier uuid,
      name text,
      profile_schema_version integer NOT NULL,
      source_dirty_version bigint,
      subject_facts jsonb,
      CONSTRAINT user_profile_source_dirty_version_positive_check
        CHECK (source_dirty_version IS NULL OR source_dirty_version > 0),
      CONSTRAINT user_profile_subject_facts_object_check
        CHECK (subject_facts IS NULL OR jsonb_typeof(subject_facts) = 'object')
    );
    CREATE TABLE client (
      client_code text PRIMARY KEY,
      custom_sso_enabled boolean NOT NULL DEFAULT false,
      custom_sso_config jsonb,
      custom_sso_secret_hash text,
      custom_sso_config_version integer NOT NULL DEFAULT 0,
      CONSTRAINT client_custom_sso_state_check CHECK ((
        (custom_sso_config IS NULL AND NOT custom_sso_enabled AND custom_sso_secret_hash IS NULL)
        OR (
          custom_sso_config IS NOT NULL
          AND (
            (custom_sso_config->>'mode' = 'gateway' AND custom_sso_secret_hash IS NULL)
            OR
            (custom_sso_config->>'mode' = 'independent' AND custom_sso_secret_hash IS NOT NULL)
          )
        )
      )),
      CONSTRAINT client_custom_sso_config_version_check
        CHECK (custom_sso_config_version >= 0)
    )
  `);
}

async function insertVerifiedProjection(sql: ReturnType<typeof postgres>) {
  await insertUser(sql, 1, "00000000-0000-4000-8000-000000000001");
  await insertUser(sql, 2, "00000000-0000-4000-8000-000000000002");
  await sql`
    INSERT INTO user_profile_dirty (user_id, dirty_version, status)
    VALUES (1, 3, 'processed'), (2, 5, 'processed')
  `;
  await sql`
    INSERT INTO user_profile (
      user_id,
      subject_identifier,
      name,
      profile_schema_version,
      source_dirty_version,
      subject_facts
    )
    VALUES
      (1, '00000000-0000-4000-8000-000000000001', 'User 1', 1, 3, ${sql.json({ employments: [] })}),
      (2, '00000000-0000-4000-8000-000000000002', 'User 2', 1, 5, ${sql.json({ employments: [] })})
  `;
  await sql`INSERT INTO client (client_code) VALUES ('unconfigured')`;
}

async function insertApproximateProjection(
  sql: ReturnType<typeof postgres>,
  count: number,
) {
  await sql`
    INSERT INTO "user" (id, subject_identifier)
    SELECT
      generated.user_id,
      ('00000000-0000-4000-8000-' || lpad(generated.user_id::text, 12, '0'))::uuid
    FROM generate_series(3, ${count + 2}) AS generated(user_id)
  `;
  await sql`
    INSERT INTO user_profile_dirty (user_id, dirty_version, status)
    SELECT generated.user_id, 1, 'processed'
    FROM generate_series(3, ${count + 2}) AS generated(user_id)
  `;
  await sql`
    INSERT INTO user_profile (
      user_id,
      subject_identifier,
      name,
      profile_schema_version,
      source_dirty_version,
      subject_facts
    )
    SELECT
      subject.id,
      subject.subject_identifier,
      'User ' || subject.id,
      1,
      1,
      jsonb_build_object('employments', '[]'::jsonb)
    FROM "user" AS subject
    WHERE subject.id >= 3
  `;
}

async function insertUser(
  sql: ReturnType<typeof postgres>,
  id: number,
  subjectIdentifier: string,
) {
  await sql`
    INSERT INTO "user" (id, subject_identifier)
    VALUES (${id}, ${subjectIdentifier})
  `;
}

async function indexExists(sql: ReturnType<typeof postgres>) {
  const [row] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'user_profile_subject_identifier_idx'
    ) AS exists
  `;
  return row?.exists ?? false;
}

function requireHarness(): PostgresTestHarness {
  if (!harness)
    throw new Error("PostgreSQL test harness was not initialized");
  return harness;
}
