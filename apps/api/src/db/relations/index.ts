import * as schema from "@api/db/schema";
import { defineRelations } from "drizzle-orm";
import { coreRelations } from "./core";

export const relations = defineRelations(schema, r => ({
  ...coreRelations(r),
}));
