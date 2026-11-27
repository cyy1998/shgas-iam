import process from "node:process";
import { fileURLToPath } from "node:url";
import { requireDedicatedPostgresTestUrl, TEST_POSTGRES_URL_ENV } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const [templateName] = process.argv.slice(2);
const databaseUrl = process.env[TEST_POSTGRES_URL_ENV];
if (!databaseUrl || !templateName)
  throw new Error("Template setup requires a dedicated PostgreSQL URL and template name");
if (!/^[a-z][a-z0-9_]{0,62}$/u.test(templateName))
  throw new Error(`Invalid PostgreSQL test template name: ${templateName}`);

requireDedicatedPostgresTestUrl({
  name: TEST_POSTGRES_URL_ENV,
  value: databaseUrl,
  environment: process.env,
});

const baseDatabaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (templateName === baseDatabaseName) {
  throw new Error(`PostgreSQL test template name ${templateName} must differ from the base test database`);
}

const templateUrl = new URL(databaseUrl);
templateUrl.pathname = `/${templateName}`;
requireDedicatedPostgresTestUrl({
  name: "IAM_TEST_POSTGRES_TEMPLATE",
  value: templateUrl.href,
  environment: process.env,
});

const admin = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
try {
  const [existing] = await admin<{ datistemplate: boolean; datallowconn: boolean }[]>`
    SELECT datistemplate, datallowconn FROM pg_database WHERE datname = ${templateName}
  `;
  if (existing) {
    if (!(existing.datistemplate === true && existing.datallowconn === false)) {
      throw new Error(`Refusing to drop PostgreSQL database ${templateName}: it is not a sealed test template`);
    }
    await admin`ALTER DATABASE ${admin(templateName)} IS_TEMPLATE false`;
    await admin`DROP DATABASE ${admin(templateName)} WITH (FORCE)`;
  }
  await admin`CREATE DATABASE ${admin(templateName)} TEMPLATE template0`;
  try {
    const sql = postgres(templateUrl.href, { max: 1, connect_timeout: 5 });
    try {
      const migrationsFolder = fileURLToPath(new URL("../../src/migrations/", import.meta.url));
      await migrate(drizzle({ client: sql }), { migrationsFolder });
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (error) {
    try {
      await admin`DROP DATABASE ${admin(templateName)} WITH (FORCE)`;
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "PostgreSQL test template migration and cleanup failed");
    }
    throw error;
  }
  await admin`ALTER DATABASE ${admin(templateName)} IS_TEMPLATE true ALLOW_CONNECTIONS false`;
} finally {
  await admin.end({ timeout: 5 });
}
