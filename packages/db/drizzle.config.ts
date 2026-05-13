import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "",
  },
});
