import type { db as database } from "@iam/db";
import { relations } from "@iam/db/relations";
import { drizzle } from "drizzle-orm/postgres-js";
import createPostgresClient from "postgres";

export const INTERNAL_USER_STATEMENT_TIMEOUT_MS = 2_000;

interface InternalUserPostgresOptions {
  readonly connection: {
    readonly application_name: string;
    readonly statement_timeout: number;
  };
}

type InternalUserPostgresClient = ReturnType<typeof createPostgresClient>;

export interface CreateInternalUserQueryResourceOptions {
  readonly databaseUrl: string;
  readonly createSql?: (
    databaseUrl: string,
    options: InternalUserPostgresOptions,
  ) => InternalUserPostgresClient;
  readonly createDatabase?: (client: InternalUserPostgresClient) => typeof database;
}

export function createInternalUserQueryResource(
  options: CreateInternalUserQueryResourceOptions,
) {
  return createQueryResource(options, "iam-api-internal-user-v3");
}

function createQueryResource(
  options: CreateInternalUserQueryResourceOptions,
  applicationName: string,
) {
  const client = (options.createSql ?? createPostgresClient)(
    options.databaseUrl,
    {
      connection: {
        application_name: applicationName,
        statement_timeout: INTERNAL_USER_STATEMENT_TIMEOUT_MS,
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
