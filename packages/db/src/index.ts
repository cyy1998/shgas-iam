import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "./relations";
import { createSingleton } from "./singleton";

function createQueryClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return postgres(connectionString);
}

const queryClient = createSingleton("postgres:drizzle", createQueryClient, {
  destroy: client => client.end(),
});

export const db = drizzle({
  client: queryClient,
  relations,
});

export default db;

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DbTransaction;

export async function closeDb() {
  await queryClient.end();
}
