import { randomUUID } from "node:crypto";
import process from "node:process";
import postgres from "postgres";
import { requireDedicatedPostgresTestUrl, TEST_POSTGRES_URL_ENV } from "./dedicated-postgres-test-url";

export { requireDedicatedPostgresTestUrl, TEST_POSTGRES_URL_ENV } from "./dedicated-postgres-test-url";

type TestClientOptions = Pick<postgres.Options<Record<string, never>>, "max" | "debug" | "onnotice">;

export interface PostgresTestHarnessOptions {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly name?: string;
  readonly forbiddenEnvironmentNames?: readonly string[];
  readonly client?: TestClientOptions;
}

export interface DrizzlePostgresTestHarnessOptions<TDatabase> extends PostgresTestHarnessOptions {
  readonly createDb: (client: ReturnType<typeof postgres>) => TDatabase;
  readonly trackStop?: (close: () => Promise<void>) => void;
}

export type PostgresTestHarness = Awaited<ReturnType<typeof createPostgresTestHarness>>;
export type DrizzlePostgresTestHarness<TDatabase> = PostgresTestHarness & { readonly db: TDatabase };

export async function createPostgresTestHarness(options: PostgresTestHarnessOptions = {}) {
  const environment = options.environment ?? process.env;
  const baseUrl = dedicatedDatabaseUrl({ ...options, environment });
  const templateName = environment.IAM_TEST_POSTGRES_TEMPLATE;
  if (!templateName || !/^[a-z][a-z0-9_]{0,62}$/u.test(templateName)) {
    throw new Error("IAM_TEST_POSTGRES_TEMPLATE must name the prepared PostgreSQL test template");
  }
  return await cloneDatabase(baseUrl, templateName, options.client);
}

export async function createDrizzlePostgresTestHarness<TDatabase>(
  options: DrizzlePostgresTestHarnessOptions<TDatabase>,
): Promise<DrizzlePostgresTestHarness<TDatabase>> {
  const { createDb, trackStop, ...harnessOptions } = options;
  if (!trackStop) {
    const harness = await createPostgresTestHarness(harnessOptions);
    return { ...harness, db: createDb(harness.sql) };
  }

  let stopped = false;
  const ready = Promise.resolve().then(() => {
    if (stopped) throw new Error("API PostgreSQL fixture stopped during initialization");
    return createPostgresTestHarness(harnessOptions);
  });
  try {
    trackStop(async () => {
      stopped = true;
      // The shared harness cleans up on setup failure. Otherwise wait for the clone before dropping it.
      const harness = await ready.catch(() => undefined);
      await harness?.close();
    });
  } catch (error) {
    stopped = true;
    await ready.catch(() => undefined);
    throw error;
  }
  const harness = await ready;
  if (stopped) {
    await harness.close();
    throw new Error("API PostgreSQL fixture stopped during initialization");
  }
  return { ...harness, db: createDb(harness.sql) };
}

export async function createEmptyPostgresTestHarness(options: PostgresTestHarnessOptions = {}) {
  return await cloneDatabase(dedicatedDatabaseUrl(options), "template0", options.client);
}

function dedicatedDatabaseUrl({
  environment = process.env,
  name = TEST_POSTGRES_URL_ENV,
  forbiddenEnvironmentNames = [],
}: PostgresTestHarnessOptions = {}) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} must be supplied with a dedicated PostgreSQL test URL`);
  const forbidden = new Set(["DATABASE_URL", ...forbiddenEnvironmentNames]);
  return requireDedicatedPostgresTestUrl({
    environment,
    name,
    value,
    forbidden: [...forbidden].map((entry) => ({ name: entry, value: environment[entry] })),
  });
}

async function cloneDatabase(baseUrl: string, templateName: string, client?: TestClientOptions) {
  const databaseName = `iam_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  const databaseUrl = url.href;
  const admin = postgres(baseUrl, { max: 1, connect_timeout: 5, connection: { statement_timeout: 30_000 } });
  const sql = postgres(databaseUrl, { connect_timeout: 5, ...client });
  let closing: Promise<void> | undefined;
  function close() {
    closing ??= (async () => {
      const failures: unknown[] = [];
      for (const cleanup of [
        () => sql.end({ timeout: 5 }),
        // CREATE may have committed even if its response was lost.
        () => admin`DROP DATABASE IF EXISTS ${admin(databaseName)} WITH (FORCE)`,
        () => admin.end({ timeout: 5 }),
      ]) {
        try {
          await cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length)
        throw new AggregateError(failures, `PostgreSQL test database ${databaseName} cleanup failed`);
    })();
    return closing;
  }

  try {
    await admin`CREATE DATABASE ${admin(databaseName)} TEMPLATE ${admin(templateName)}`;
    const [connection] = await sql`SELECT current_database() AS name`;
    if (connection?.name !== databaseName) throw new Error("PostgreSQL did not connect to the cloned test database");
  } catch (error) {
    try {
      await close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `PostgreSQL test database ${databaseName} setup and cleanup failed`,
      );
    }
    throw error;
  }

  // Discover after fixture setup, then reuse the same plan for this clone.
  let resetPlan: ReturnType<typeof discoverResetPlan> | undefined;
  return {
    databaseUrl,
    sql,
    async reset() {
      resetPlan ??= discoverResetPlan(sql).catch((error) => {
        resetPlan = undefined;
        throw error;
      });
      const { tables, query } = await resetPlan;
      if (!query) return;
      const dirty = await sql.unsafe<{ position: number }[]>(query);
      if (dirty.length === 0) return;
      const targets = dirty.map(({ position }) => tables[position]?.name).filter((name) => name !== undefined);
      await sql.unsafe(`TRUNCATE TABLE ${targets.join(", ")} RESTART IDENTITY CASCADE`);
    },
    close,
  };
}

async function discoverResetPlan(sql: ReturnType<typeof postgres>) {
  const tables = await sql<{ name: string; sequences: Array<{ name: string; start: string }> }[]>`
    SELECT format('%I.%I', ns.nspname, tab.relname) AS name,
      COALESCE((
        SELECT json_agg(json_build_object('name', format('%I.%I', sn.nspname, seq.relname), 'start', ps.seqstart::text))
        FROM pg_depend dep
        JOIN pg_sequence ps ON ps.seqrelid = dep.objid
        JOIN pg_class seq ON seq.oid = ps.seqrelid
        JOIN pg_namespace sn ON sn.oid = seq.relnamespace
        WHERE dep.refclassid = 'pg_class'::regclass AND dep.refobjid = tab.oid
          AND dep.classid = 'pg_class'::regclass AND dep.deptype IN ('a', 'i')
      ), '[]'::json) AS sequences
    FROM pg_class tab
    JOIN pg_namespace ns ON ns.oid = tab.relnamespace
    WHERE ns.nspname = current_schema() AND tab.relkind IN ('r', 'p') AND tab.relname <> '__drizzle_migrations'
    ORDER BY tab.relname
  `;
  // Catalog identifiers are quoted. Sequence state can change even when a table stays empty.
  const probes = tables.map(({ name, sequences }, index) => {
    const checks = [
      `EXISTS (SELECT 1 FROM ${name} LIMIT 1)`,
      ...sequences.map((sequence) => `(SELECT is_called OR last_value <> ${sequence.start} FROM ${sequence.name})`),
    ];
    return `(${index}, ${checks.join(" OR ")})`;
  });
  const query =
    probes.length > 0
      ? `SELECT position FROM (VALUES ${probes.join(", ")}) AS probes(position, dirty) WHERE dirty`
      : "";
  return { tables, query };
}
