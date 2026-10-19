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
import { USER_PROFILE_SEARCH_STRUCTURE } from "../schema/profile-search.schema";

export type UserProfileScalarValue = FilterScalarValue;
export type UserProfileFilter = FilterForShape<typeof USER_PROFILE_SEARCH_STRUCTURE.fields>;
export const USER_PROFILE_FILTER_OPERATORS = FILTER_OPERATORS;
export const USER_PROFILE_FILTER_MAX_DEPTH = FILTER_MAX_DEPTH;
export const USER_PROFILE_FILTER_MAX_NODES = FILTER_MAX_NODES;
export const USER_PROFILE_FILTER_MAX_CHILDREN = FILTER_MAX_CHILDREN;
export const USER_PROFILE_FILTER_MAX_IN_VALUES = FILTER_MAX_IN_VALUES;
export const USER_PROFILE_FILTER_MAX_RAW_VALUES = FILTER_MAX_RAW_VALUES;
export const findUserProfileFilterBudgetViolation = findFilterBudgetViolation;

const transportSchemas = createFilterTransportSchemas({
  annotateExpression: (schema) =>
    schema.openapi("UserProfileFilterExpression", {
      description: "通用递归 Filter AST；字段、操作符和 value 类型由 Search Document 公开结构严格裁决。",
    }),
});
export const UserProfileFilterTransportSchema = transportSchemas.expressionSchema;

export const UserProfileSearchTransportRequestSchema = z
  .object({
    filter: transportSchemas.budgetedSchema,
  })
  .strict()
  .openapi("UserProfileSearchRequest");

const engine = createFilterEngine(USER_PROFILE_SEARCH_STRUCTURE);
export const UserProfileFilterSchema = engine.filterSchema;
export const UserProfileSearchRequestSchema = z.object({ filter: UserProfileFilterSchema }).strict();
export type UserProfileSearchRequest = z.infer<typeof UserProfileSearchRequestSchema>;
export function compileUserProfileFilter(filter: unknown): SQL {
  return engine.compile(filter, userProfiles.searchDoc);
}
