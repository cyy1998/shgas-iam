import { afterAll, beforeAll, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { UserDocumentWorkStatus } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { userDocumentRebuildStates, userDocuments, users } from "@iam/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createPostgresTestHarness, type PostgresTestHarness } from "../support/postgres-harness";

let harness: PostgresTestHarness;
let db: ReturnType<typeof createDb>;

function createDb() {
  return drizzle({ client: harness.sql, relations });
}

beforeAll(async () => {
  harness = await createPostgresTestHarness();
  db = createDb();
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../src/migrations", import.meta.url)),
    migrationsSchema: harness.schemaName,
  });
  const accounts = await db
    .insert(users)
    .values([
      { id: 10, username: "published", name: "Published" },
      { id: 11, username: "deleted", name: "Deleted", isDelete: true },
      { id: 12, username: "unpublished", name: "Unpublished" },
    ])
    .returning();
  await db.insert(userDocuments).values(
    accounts
      .filter((account) => account.id !== 12)
      .map((account) => ({
        userId: account.id,
        subjectIdentifier: account.subjectIdentifier,
        schemaVersion: 1,
        sourceVersion: String(account.id),
        publishedAt: new Date("2026-10-26T00:00:00Z"),
        document: account.isDelete ? null : { user: { username: account.username } },
      })),
  );
  await db.insert(userDocumentRebuildStates).values([
    { userId: 10, version: "10", status: UserDocumentWorkStatus.Processed },
    { userId: 11, version: "11", status: UserDocumentWorkStatus.Processed },
  ]);
});

afterAll(async () => {
  await harness?.close();
});

test("loads each user's own document and rebuild state, preserving tombstones and absent records", async () => {
  const accounts = await db.query.users.findMany({
    columns: { id: true },
    orderBy: { id: "asc" },
    with: {
      document: { columns: { userId: true, sourceVersion: true, document: true } },
      rebuildState: { columns: { userId: true, version: true, status: true } },
    },
  });

  expect(accounts).toEqual([
    {
      id: 10,
      document: { userId: 10, sourceVersion: "10", document: { user: { username: "published" } } },
      rebuildState: { userId: 10, version: "10", status: UserDocumentWorkStatus.Processed },
    },
    {
      id: 11,
      document: { userId: 11, sourceVersion: "11", document: null },
      rebuildState: { userId: 11, version: "11", status: UserDocumentWorkStatus.Processed },
    },
    { id: 12, document: null, rebuildState: null },
  ]);
});
