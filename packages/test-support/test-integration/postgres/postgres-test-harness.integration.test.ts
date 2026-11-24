import { expect, test } from "bun:test";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runWithOwnedTestResources } from "@iam/test-support/external-test-resources";
import { createEmptyPostgresTestHarness, createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import postgres from "postgres";

const options = { environment: process.env, name: "IAM_TEST_SUPPORT_TEST_DATABASE_URL" };
const databaseUrl = options.environment[options.name];
if (!databaseUrl) throw new Error("Use the root Integration entry to supply PostgreSQL");

test("root Integration publishes a sealed PostgreSQL template beside the legacy database", async () => {
  const sql = postgres(databaseUrl);
  try {
    const databases = await sql`
      SELECT datname, datistemplate, datallowconn FROM pg_database
      WHERE datname IN (current_database(), 'iam_test_template') ORDER BY datname
    `;
    expect([...databases]).toEqual([
      { datname: "iam_test", datistemplate: false, datallowconn: true },
      { datname: "iam_test_template", datistemplate: true, datallowconn: false },
    ]);
    expect(process.env.IAM_TEST_POSTGRES_TEMPLATE).toBe("iam_test_template");
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("concurrent clones contain the migrated baseline and isolate their data", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const openClone = async () => {
      const clone = await createPostgresTestHarness(options);
      registerCleanup(clone.close);
      return clone;
    };
    const [first, second] = await Promise.allSettled([openClone(), openClone()]);
    if (first.status === "rejected") throw first.reason;
    if (second.status === "rejected") throw second.reason;
    expect(first.value.databaseUrl).not.toBe(second.value.databaseUrl);
    const baseline = await first.value.sql<{ name: string }[]>`SELECT name FROM drizzle.__drizzle_migrations`;
    const migrations = await Array.fromAsync(
      new Bun.Glob("*/migration.sql").scan({
        cwd: fileURLToPath(new URL("../../../db/src/migrations/", import.meta.url)),
      }),
      (file) => basename(dirname(file)),
    );
    expect(migrations.length).toBeGreaterThan(0);
    expect(baseline.map(({ name }) => name).sort()).toEqual(migrations.sort());
    await first.value.sql`CREATE TABLE clone_marker (id int)`;
    const isolated = await second.value.sql`SELECT to_regclass('public.clone_marker') AS marker`;
    expect([...isolated]).toEqual([{ marker: null }]);
  });
});

test("reset discovers new tables, restarts identities and preserves migration journals", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const clone = await createPostgresTestHarness(options);
    registerCleanup(clone.close);
    await clone.sql`CREATE TABLE "new.events" (id int GENERATED ALWAYS AS IDENTITY, label text)`;
    await clone.sql`CREATE TABLE new_accounts (name text)`;
    await clone.sql`CREATE TABLE public.__drizzle_migrations (marker text)`;
    await clone.sql`INSERT INTO "new.events" (label) VALUES ('previous case')`;
    await clone.sql`INSERT INTO new_accounts VALUES ('previous account')`;
    await clone.sql`INSERT INTO public.__drizzle_migrations VALUES ('keep this journal')`;
    const journal = await clone.sql`SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id`;

    await clone.reset();

    const oldEvents = await clone.sql`SELECT * FROM "new.events"`;
    const oldAccounts = await clone.sql`SELECT * FROM new_accounts`;
    const publicJournal = await clone.sql`SELECT marker FROM public.__drizzle_migrations`;
    const result = await clone.sql`INSERT INTO "new.events" (label) VALUES ('next case') RETURNING id`;
    const preservedJournal = await clone.sql`SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id`;
    expect([...oldEvents]).toEqual([]);
    expect([...oldAccounts]).toEqual([]);
    expect([...publicJournal]).toEqual([{ marker: "keep this journal" }]);
    expect([...result]).toEqual([{ id: 1 }]);
    expect([...preservedJournal]).toEqual([...journal]);
  });
});

test("close removes the clone even with another connected client", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const clone = await createPostgresTestHarness(options);
    registerCleanup(clone.close);
    const peer = postgres(clone.databaseUrl);
    registerCleanup(() => peer.end({ timeout: 1 }));
    const [connection] = await peer`SELECT current_database() AS name`;
    const name = connection?.name;
    expect(name).toBe(new URL(clone.databaseUrl).pathname.slice(1));

    await Promise.all([clone.close(), clone.close()]);

    const admin = postgres(databaseUrl);
    registerCleanup(() => admin.end({ timeout: 1 }));
    const remaining = await admin`SELECT datname FROM pg_database WHERE datname = ${name}`;
    expect([...remaining]).toEqual([]);
  });
});

test("an empty clone works without a template record and can apply migrations independently", async () => {
  await runWithOwnedTestResources(async ({ registerCleanup }) => {
    const clone = await createEmptyPostgresTestHarness({
      ...options,
      environment: { [options.name]: databaseUrl },
    });
    registerCleanup(clone.close);
    const tables = await clone.sql`SELECT tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle')`;
    expect([...tables]).toEqual([]);

    await clone.sql`CREATE TABLE migration_example (id int PRIMARY KEY)`;
    const migrated = await clone.sql`INSERT INTO migration_example VALUES (1) RETURNING id`;
    expect([...migrated]).toEqual([{ id: 1 }]);
  });
});
