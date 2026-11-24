import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { requireDedicatedPostgresTestUrl } from "./dedicated-postgres-test-url";

export { requireDedicatedPostgresTestUrl } from "./dedicated-postgres-test-url";

type TestClientOptions = Pick<postgres.Options<Record<string, never>>, "max" | "debug" | "onnotice">;

interface PostgresTestHarnessOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly name: string;
  readonly forbiddenEnvironmentNames?: readonly string[];
  readonly client?: TestClientOptions;
}

export async function createPostgresTestHarness(options: PostgresTestHarnessOptions) {
  const baseUrl = dedicatedDatabaseUrl(options);
  const templateName = options.environment.IAM_TEST_POSTGRES_TEMPLATE;
  if (!templateName || !/^[a-z][a-z0-9_]{0,62}$/u.test(templateName)) {
    throw new Error("IAM_TEST_POSTGRES_TEMPLATE must name the prepared PostgreSQL test template");
  }
  return await cloneDatabase(baseUrl, templateName, options.client);
}

export async function createEmptyPostgresTestHarness(options: PostgresTestHarnessOptions) {
  return await cloneDatabase(dedicatedDatabaseUrl(options), "template0", options.client);
}

function dedicatedDatabaseUrl({ environment, name, forbiddenEnvironmentNames = [] }: PostgresTestHarnessOptions) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} must be supplied with a dedicated PostgreSQL test URL`);
  const workspaceDevelopmentName = name.replace(/_TEST_DATABASE_URL$/u, "_DATABASE_URL");
  const forbidden = new Set(["DATABASE_URL", ...forbiddenEnvironmentNames]);
  if (workspaceDevelopmentName !== name) forbidden.add(workspaceDevelopmentName);
  return requireDedicatedPostgresTestUrl({
    name,
    value,
    forbidden: [...forbidden].map((name) => ({ name, value: environment[name] })),
  });
}

async function cloneDatabase(baseUrl: string, templateName: string, client?: TestClientOptions) {
  const databaseName = `iam_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  const databaseUrl = url.href;
  const admin = postgres(baseUrl, { max: 1, connect_timeout: 5, connection: { statement_timeout: 30_000 } });
  const sql = postgres(databaseUrl, { connect_timeout: 5, ...client });
  let created = false;
  let closing: Promise<void> | undefined;
  function close() {
    closing ??= (async () => {
      const failures: unknown[] = [];
      for (const cleanup of [
        () => sql.end({ timeout: 5 }),
        () => created && admin`DROP DATABASE IF EXISTS ${admin(databaseName)} WITH (FORCE)`,
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
    created = true;
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

  return {
    databaseUrl,
    sql,
    async reset() {
      const tables = await sql<{ name: string }[]>`
        SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables
        WHERE schemaname = current_schema() AND tablename <> '__drizzle_migrations'
        ORDER BY tablename
      `;
      if (tables.length > 0) {
        // The catalog query produces quoted, schema-qualified identifiers.
        await sql.unsafe(`TRUNCATE TABLE ${tables.map(({ name }) => name).join(", ")} RESTART IDENTITY CASCADE`);
      }
    },
    close,
  };
}
