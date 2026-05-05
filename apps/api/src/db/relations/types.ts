import type * as schema from "@api/db/schema";
import type { ExtractTablesFromSchema, RelationsBuilder, RelationsBuilderConfig } from "drizzle-orm";

export type Schema = ExtractTablesFromSchema<typeof schema>;
export type RelationsConfig = RelationsBuilderConfig<Schema>;
export type RelationsHelper = RelationsBuilder<Schema>;
