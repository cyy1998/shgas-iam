import { defineConfig } from "drizzle-kit";
import { normalizeDatabaseUrl } from "./src/db/connection-url";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl === undefined ? "" : normalizeDatabaseUrl(databaseUrl).url,
  },
});
