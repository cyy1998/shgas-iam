import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { db as database } from "@iam/db";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export interface OrganizationSearchPostgresTestHarness {
  db: typeof database;
  sql: ReturnType<typeof postgres>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createOrganizationSearchPostgresTestHarness(): Promise<OrganizationSearchPostgresTestHarness> {
  const databaseUrl = process.env.IAM_ORGANIZATION_SEARCH_TEST_DATABASE_URL;
  if (!databaseUrl)
    throw new Error("IAM_ORGANIZATION_SEARCH_TEST_DATABASE_URL must identify a dedicated test database");
  const parsed = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    ["", "postgres", "template0", "template1"].includes(parsed.pathname.slice(1).toLowerCase())
  ) {
    throw new Error("Organization Search requires a dedicated non-system PostgreSQL database");
  }
  for (const name of ["DATABASE_URL", "IAM_API_DATABASE_URL", "IAM_WORKER_DATABASE_URL"] as const) {
    const runtimeUrl = process.env[name];
    if (!runtimeUrl) continue;
    const runtime = new URL(runtimeUrl);
    if (
      runtime.hostname.toLowerCase() === parsed.hostname.toLowerCase() &&
      (runtime.port || "5432") === (parsed.port || "5432") &&
      runtime.pathname === parsed.pathname
    ) {
      throw new Error(`Organization Search test database must differ from ${name}`);
    }
  }
  const schema = `iam_organization_search_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(databaseUrl, { max: 1, onnotice() {} });
  let scoped: ReturnType<typeof postgres> | undefined;
  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`);
    scoped = postgres(databaseUrl, {
      connection: { search_path: schema, application_name: schema },
      max: 6,
      onnotice() {},
    });
    const db = drizzle({ client: scoped, relations });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../../db/src/migrations", import.meta.url)),
      migrationsSchema: schema,
    });
    return {
      db,
      sql: scoped,
      async reset() {
        await scoped!.unsafe(
          "TRUNCATE organization_search_change, organization_search_dirty, organization_search_document, organization_closure, organization RESTART IDENTITY CASCADE",
        );
      },
      async close() {
        await scoped!.end();
        await admin.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      },
    };
  } catch (error) {
    if (scoped) await scoped.end({ timeout: 1 });
    await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end({ timeout: 1 });
    throw error;
  }
}
