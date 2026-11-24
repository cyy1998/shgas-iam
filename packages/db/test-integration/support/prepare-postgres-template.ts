import process from "node:process";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const [templateName] = process.argv.slice(2);
const databaseUrl = process.env.IAM_DB_TEST_DATABASE_URL;
if (!databaseUrl || !templateName)
  throw new Error("Template setup requires a managed PostgreSQL URL and template name");

const admin = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
try {
  await admin`CREATE DATABASE ${admin(templateName)} TEMPLATE template0`;
  const templateUrl = new URL(databaseUrl);
  templateUrl.pathname = `/${templateName}`;
  const sql = postgres(templateUrl.href, { max: 1, connect_timeout: 5 });
  try {
    const migrationsFolder = fileURLToPath(new URL("../../src/migrations/", import.meta.url));
    await migrate(drizzle({ client: sql }), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
  await admin`ALTER DATABASE ${admin(templateName)} IS_TEMPLATE true ALLOW_CONNECTIONS false`;
} finally {
  await admin.end({ timeout: 5 });
}
