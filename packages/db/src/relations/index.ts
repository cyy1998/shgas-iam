import { defineRelations } from "drizzle-orm";
import * as schema from "../schema";
import { coreRelations } from "./core";

export const relations = defineRelations(schema, r => ({
  ...coreRelations(r),
}));
