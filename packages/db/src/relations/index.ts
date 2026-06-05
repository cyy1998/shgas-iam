import { defineRelations } from "drizzle-orm";
import * as schema from "../schema";
import { coreRelations } from "./core";
import { logRelations } from "./log";

export const relations = defineRelations(schema, r => ({
  ...coreRelations(r),
  ...logRelations(r),
}));
