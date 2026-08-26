import type { db as database } from "@iam/db";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import createPostgresClient from "postgres";

interface InternalQueryPostgresOptions {
  readonly connection: {
    readonly application_name: string;
    readonly statement_timeout: number;
  };
}

type InternalQueryPostgresClient = ReturnType<typeof createPostgresClient>;

export interface CreateInternalQueryResourceOptions {
  readonly databaseUrl: string;
  readonly createSql?: (
    databaseUrl: string,
    options: InternalQueryPostgresOptions,
  ) => InternalQueryPostgresClient;
  readonly createDatabase?: (
    client: InternalQueryPostgresClient,
  ) => typeof database;
}

export function createInternalQueryResource(
  options: CreateInternalQueryResourceOptions,
  config: {
    readonly applicationName: string;
    readonly statementTimeoutMs: number;
  },
) {
  const client = (options.createSql ?? createPostgresClient)(
    options.databaseUrl,
    {
      connection: {
        application_name: config.applicationName,
        statement_timeout: config.statementTimeoutMs,
      },
    },
  );
  return {
    db: options.createDatabase?.(client)
      ?? drizzle({ client, relations }),
    async close() {
      await client.end();
    },
  };
}
