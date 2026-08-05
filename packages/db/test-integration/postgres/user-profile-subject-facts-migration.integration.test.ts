import type { PostgresTestHarness } from "./postgres-harness";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const FEATURE_MIGRATION = new URL(
  "../../src/migrations/20260730175954_old_peter_quill/migration.sql",
  import.meta.url,
);
const SUBJECT_IDENTIFIER = "730828fb-d9ed-4e9d-83f7-d58175dd1019";

type JsonValue
  = | boolean
    | JsonValue[]
    | null
    | number
    | string
    | { [key: string]: JsonValue };

let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await requireHarness().sql`DROP TABLE IF EXISTS user_profile`;
});

describe("User Profile Subject Facts migration", () => {
  test("stages nullable publication columns while preserving legacy rows", async () => {
    const sql = requireHarness().sql;
    await createLegacyUserProfileTable(sql);
    await sql`
      INSERT INTO user_profile (
        user_id,
        username,
        status,
        profile_schema_version,
        detail,
        search_doc
      )
      VALUES (1, 'legacy-user', 1, 1, '{}', '{}')
    `;

    await sql.file(FEATURE_MIGRATION, { cache: false });

    const columns = await sql<{ columnName: string }[]>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'user_profile'
    `;
    expect(columns.map(column => column.columnName).sort()).toEqual([
      "create_time",
      "detail",
      "is_delete",
      "mobile",
      "name",
      "profile_schema_version",
      "rebuilt_at",
      "search_doc",
      "search_visible",
      "source_dirty_version",
      "status",
      "subject_facts",
      "subject_identifier",
      "update_time",
      "user_id",
      "username",
      "wx_id",
    ]);

    const [legacy] = await sql<{
      name: string | null;
      sourceDirtyVersion: string | null;
      subjectFacts: unknown;
      subjectIdentifier: string | null;
    }[]>`
      SELECT
        name,
        source_dirty_version::text AS "sourceDirtyVersion",
        subject_facts AS "subjectFacts",
        subject_identifier::text AS "subjectIdentifier"
      FROM user_profile
      WHERE user_id = 1
    `;
    expect(legacy).toEqual({
      name: null,
      sourceDirtyVersion: null,
      subjectFacts: null,
      subjectIdentifier: null,
    });

    const firstInsert = await insertProfile(sql, {
      userId: 2,
      username: "first-subject",
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "1",
      subjectFacts: {},
    });
    expect(firstInsert).toHaveLength(1);
    const duplicateSubjectInsert = await insertProfile(sql, {
      userId: 3,
      username: "duplicate-subject",
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "2",
      subjectFacts: { employments: [] },
    });
    expect(duplicateSubjectInsert).toHaveLength(1);
    const nullSubjectInsert = await insertProfile(sql, {
      userId: 4,
      username: "staged-null-subject",
      subjectIdentifier: null,
      sourceDirtyVersion: null,
      subjectFacts: null,
    });
    expect(nullSubjectInsert).toHaveLength(1);
  });

  test("enforces only the staged positive-version and object-shape checks", async () => {
    const sql = requireHarness().sql;
    await createLegacyUserProfileTable(sql);
    await sql.file(FEATURE_MIGRATION, { cache: false });

    await expectPostgresErrorCode(insertProfile(sql, {
      userId: 1,
      username: "zero-version",
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "0",
      subjectFacts: {},
    }), "23514");
    await expectPostgresErrorCode(insertProfile(sql, {
      userId: 2,
      username: "array-facts",
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "1",
      subjectFacts: [],
    }), "23514");
  });
});

function requireHarness(): PostgresTestHarness {
  if (!harness)
    throw new Error("PostgreSQL test harness was not initialized");
  return harness;
}

async function createLegacyUserProfileTable(sql: PostgresTestHarness["sql"]) {
  await sql.unsafe(`
    CREATE TABLE user_profile (
      user_id integer PRIMARY KEY,
      username varchar(64) NOT NULL,
      mobile varchar(20),
      wx_id varchar(255),
      status integer NOT NULL,
      is_delete boolean DEFAULT false NOT NULL,
      search_visible boolean DEFAULT false NOT NULL,
      profile_schema_version integer NOT NULL,
      detail jsonb NOT NULL,
      search_doc jsonb NOT NULL,
      rebuilt_at timestamp DEFAULT now() NOT NULL,
      create_time timestamp DEFAULT now() NOT NULL,
      update_time timestamp DEFAULT now() NOT NULL
    )
  `);
}

async function insertProfile(
  sql: PostgresTestHarness["sql"],
  input: {
    userId: number;
    username: string;
    subjectIdentifier: string | null;
    sourceDirtyVersion: string | null;
    subjectFacts: JsonValue;
  },
) {
  const subjectFacts = input.subjectFacts === null
    ? null
    : sql.json(input.subjectFacts);
  return await sql`
    INSERT INTO user_profile (
      user_id,
      subject_identifier,
      username,
      name,
      status,
      profile_schema_version,
      source_dirty_version,
      detail,
      search_doc,
      subject_facts
    )
    VALUES (
      ${input.userId},
      ${input.subjectIdentifier},
      ${input.username},
      ${input.username},
      1,
      1,
      ${input.sourceDirtyVersion},
      '{}',
      '{}',
      ${subjectFacts}
    )
    RETURNING user_id
  `;
}
