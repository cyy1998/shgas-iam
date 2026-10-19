import { z } from "@hono/zod-openapi";
import { userProfiles } from "@iam/db/schema";
import type { FilterForShape, FilterScalarValue } from "@iam/filter-engine";
import {
  createFilterEngine,
  createFilterTransportSchemas,
  FILTER_MAX_CHILDREN,
  FILTER_MAX_DEPTH,
  FILTER_MAX_IN_VALUES,
  FILTER_MAX_NODES,
  FILTER_MAX_RAW_VALUES,
  FILTER_OPERATORS,
  findFilterBudgetViolation,
} from "@iam/filter-engine";
import type { SQL } from "drizzle-orm";
import { V3_USER_PROFILE_SEARCH_STRUCTURE } from "../schema/profile-v3-search.schema";

export type V3UserProfileScalarValue = FilterScalarValue;
export type V3UserProfileFilter = FilterForShape<typeof V3_USER_PROFILE_SEARCH_STRUCTURE.fields>;
export const V3_USER_PROFILE_FILTER_OPERATORS = FILTER_OPERATORS;
export const V3_USER_PROFILE_FILTER_MAX_DEPTH = FILTER_MAX_DEPTH;
export const V3_USER_PROFILE_FILTER_MAX_NODES = FILTER_MAX_NODES;
export const V3_USER_PROFILE_FILTER_MAX_CHILDREN = FILTER_MAX_CHILDREN;
export const V3_USER_PROFILE_FILTER_MAX_IN_VALUES = FILTER_MAX_IN_VALUES;
export const V3_USER_PROFILE_FILTER_MAX_RAW_VALUES = FILTER_MAX_RAW_VALUES;
export const findV3UserProfileFilterBudgetViolation = findFilterBudgetViolation;

const transportSchemas = createFilterTransportSchemas({
  annotateExpression: (schema) =>
    schema.openapi("V3UserProfileFilterExpression", {
      description: "通用递归 Filter AST；字段、操作符和 value 类型由 Search Document 公开结构严格裁决。",
    }),
});
export const V3UserProfileFilterTransportSchema = transportSchemas.expressionSchema;

export const V3UserProfileSearchTransportRequestSchema = z
  .object({
    filter: transportSchemas.budgetedSchema,
  })
  .strict()
  .openapi("V3UserProfileSearchRequest");

const engine = createFilterEngine(V3_USER_PROFILE_SEARCH_STRUCTURE);
export const V3UserProfileFilterSchema = engine.filterSchema;
export const V3UserProfileSearchRequestSchema = z.object({ filter: V3UserProfileFilterSchema }).strict();
export type V3UserProfileSearchRequest = z.infer<typeof V3UserProfileSearchRequestSchema>;
export function compileV3UserProfileFilter(filter: unknown): SQL {
  return engine.compile(filter, userProfiles.searchDoc);
}
