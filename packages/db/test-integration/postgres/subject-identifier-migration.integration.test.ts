import type { PostgresTestHarness } from "./postgres-harness";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { z } from "zod";
import { createPostgresTestHarness, expectPostgresErrorCode } from "./postgres-harness";

const KNOWN_SUBJECT_IDENTIFIER = "57b0e34d-bf33-4671-87ea-4ed2f1b0e420";
const FEATURE_MIGRATION = new URL(
  "../../src/migrations/20260730153725_protocol_neutral_subject_identity/migration.sql",
  import.meta.url,
);

let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

afterAll(async () => {
  await harness?.close();
});

describe("Subject Identifier migration", () => {
  test("preserves existing identities and the generated non-null unique contract", async () => {
    const sql = requireHarness().sql;
    await sql.unsafe(`
      CREATE TABLE "user" (
        "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "username" text NOT NULL,
        "oidc_subject" uuid DEFAULT gen_random_uuid() NOT NULL,
        CONSTRAINT "user_oidc_subject_key" UNIQUE ("oidc_subject")
      )
    `);
    await sql`
      INSERT INTO "user" ("username", "oidc_subject")
      VALUES ('existing-user', ${KNOWN_SUBJECT_IDENTIFIER})
    `;

    await sql.file(FEATURE_MIGRATION, { cache: false });

    const columns = await sql<{ columnName: string }[]>`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'user'
    `;
    expect(columns.map(column => column.columnName)).toContain("subject_identifier");
    expect(columns.map(column => column.columnName)).not.toContain("oidc_subject");

    const [existing] = await sql<{ subjectIdentifier: string }[]>`
      SELECT subject_identifier::text AS "subjectIdentifier"
      FROM "user"
      WHERE username = 'existing-user'
    `;
    expect(existing?.subjectIdentifier).toBe(KNOWN_SUBJECT_IDENTIFIER);

    const [generated] = await sql<{ subjectIdentifier: string }[]>`
      INSERT INTO "user" ("username")
      VALUES ('generated-user')
      RETURNING subject_identifier::text AS "subjectIdentifier"
    `;
    expect(z.uuid().safeParse(generated?.subjectIdentifier).success).toBe(true);

    await expectPostgresErrorCode(sql`
      INSERT INTO "user" ("username", "subject_identifier")
      VALUES ('null-subject', ${null})
    `, "23502");
    await expectPostgresErrorCode(sql`
      INSERT INTO "user" ("username", "subject_identifier")
      VALUES ('duplicate-subject', ${KNOWN_SUBJECT_IDENTIFIER})
    `, "23505");
  });
});

function requireHarness(): PostgresTestHarness {
  if (!harness)
    throw new Error("PostgreSQL test harness was not initialized");
  return harness;
}
