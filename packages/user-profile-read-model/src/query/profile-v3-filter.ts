import type { SQL, SQLWrapper } from "drizzle-orm";
import type {
  V3UserProfileSearchFactShape,
  V3UserProfileSearchOrganizationFact,
  V3UserProfileSearchScalarArrayFact,
  V3UserProfileSearchScalarFact,
} from "../schema/profile-v3-search.schema";
import { z } from "@hono/zod-openapi";
import { userProfiles } from "@iam/db/schema";
import { sql } from "drizzle-orm";
import {
  V3_USER_PROFILE_FILTER_MAX_STRING_LENGTH,
  V3_USER_PROFILE_SEARCH_STRUCTURE,
} from "../schema/profile-v3-search.schema";

export type V3UserProfileScalarValue = string | number | boolean;

export const V3_USER_PROFILE_FILTER_OPERATORS = [
  "eq",
  "in",
  "containsAny",
  "containsAll",
  "withinSubtreeOf",
] as const;

type V3UserProfileFilterOperator
  = typeof V3_USER_PROFILE_FILTER_OPERATORS[number];

interface ParsedCondition {
  readonly field: string;
  readonly op: V3UserProfileFilterOperator;
  readonly value: V3UserProfileScalarValue | V3UserProfileScalarValue[];
}

type ParsedFilter
  = | ParsedCondition
    | { and: ParsedFilter[] }
    | { or: ParsedFilter[] }
    | { not: ParsedFilter }
    | { exists: { path: string; where: ParsedFilter } };

type SearchPath<Prefix extends string, Field extends string>
  = Prefix extends "" ? Field : `${Prefix}.${Field}`;

type ConditionsForShape<
  Shape extends V3UserProfileSearchFactShape,
  Prefix extends string = "",
> = {
  [Field in keyof Shape & string]:
  Shape[Field] extends V3UserProfileSearchOrganizationFact<infer Fields, infer ValueSchema>
    ? | {
      field: SearchPath<Prefix, Field>;
      op: "withinSubtreeOf";
      value: z.infer<ValueSchema>;
    }
    | ConditionsForShape<Fields, SearchPath<Prefix, Field>>
    : Shape[Field] extends V3UserProfileSearchScalarFact<z.ZodType, infer ValueSchema>
      ? | {
        field: SearchPath<Prefix, Field>;
        op: "eq";
        value: z.infer<ValueSchema>;
      }
      | {
        field: SearchPath<Prefix, Field>;
        op: "in";
        value: z.infer<ValueSchema>[];
      }
      : Shape[Field] extends V3UserProfileSearchScalarArrayFact<z.ZodType, infer ItemValueSchema>
        ? {
            field: SearchPath<Prefix, Field>;
            op: "containsAny" | "containsAll";
            value: z.infer<ItemValueSchema>[];
          }
        : Shape[Field] extends { kind: "object"; fields: infer Fields extends V3UserProfileSearchFactShape }
          ? ConditionsForShape<Fields, SearchPath<Prefix, Field>>
          : never;
}[keyof Shape & string];

type ExistsForShape<
  Shape extends V3UserProfileSearchFactShape,
  Prefix extends string = "",
> = {
  [Field in keyof Shape & string]:
  Shape[Field] extends { kind: "collection"; fields: infer Fields extends V3UserProfileSearchFactShape }
    ? {
        exists: {
          path: SearchPath<Prefix, Field>;
          where: FilterForShape<Fields>;
        };
      }
    : Shape[Field] extends { kind: "object"; fields: infer Fields extends V3UserProfileSearchFactShape }
      ? ExistsForShape<Fields, SearchPath<Prefix, Field>>
      : never;
}[keyof Shape & string];

type FilterForShape<Shape extends V3UserProfileSearchFactShape>
  = | ConditionsForShape<Shape>
    | ExistsForShape<Shape>
    | { and: FilterForShape<Shape>[] }
    | { or: FilterForShape<Shape>[] }
    | { not: FilterForShape<Shape> };

export type V3UserProfileFilter = FilterForShape<
  typeof V3_USER_PROFILE_SEARCH_STRUCTURE.fields
>;

export const V3_USER_PROFILE_FILTER_MAX_DEPTH = 8;
export const V3_USER_PROFILE_FILTER_MAX_NODES = 64;
export const V3_USER_PROFILE_FILTER_MAX_CHILDREN = 16;
export const V3_USER_PROFILE_FILTER_MAX_IN_VALUES = 50;
export const V3_USER_PROFILE_FILTER_MAX_RAW_VALUES = 500;

const transportScalarValueSchema = z.union([
  z.string().max(V3_USER_PROFILE_FILTER_MAX_STRING_LENGTH),
  z.number(),
  z.boolean(),
]);
const transportConditionValueSchema = z.union([
  transportScalarValueSchema,
  z.array(transportScalarValueSchema)
    .min(1)
    .max(V3_USER_PROFILE_FILTER_MAX_RAW_VALUES),
]);
export const V3UserProfileFilterTransportSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({
      and: z.array(V3UserProfileFilterTransportSchema)
        .min(1)
        .max(V3_USER_PROFILE_FILTER_MAX_CHILDREN),
    }).strict(),
    z.object({
      or: z.array(V3UserProfileFilterTransportSchema)
        .min(1)
        .max(V3_USER_PROFILE_FILTER_MAX_CHILDREN),
    }).strict(),
    z.object({ not: V3UserProfileFilterTransportSchema }).strict(),
    z.object({
      exists: z.object({
        path: z.string().min(1),
        where: V3UserProfileFilterTransportSchema,
      }).strict(),
    }).strict(),
    z.object({
      field: z.string().min(1),
      op: z.enum(V3_USER_PROFILE_FILTER_OPERATORS),
      value: transportConditionValueSchema,
    }).strict(),
  ]),
).openapi("V3UserProfileFilterExpression", {
  description: "通用递归 Filter AST；字段、操作符和 value 类型由 Search Document 公开结构严格裁决。",
});

const SafeV3UserProfileFilterTransportSchema = z.preprocess((input, context) => {
  const violation = findV3UserProfileFilterBudgetViolation(input);
  if (violation === null)
    return input;
  context.addIssue({ code: "custom", message: violation });
  return z.NEVER;
}, V3UserProfileFilterTransportSchema);

export const V3UserProfileSearchTransportRequestSchema = z.object({
  filter: SafeV3UserProfileFilterTransportSchema,
}).strict().openapi("V3UserProfileSearchRequest");

interface ComparablePath {
  readonly segments: string[];
  readonly fact:
    | V3UserProfileSearchScalarFact
    | V3UserProfileSearchScalarArrayFact
    | V3UserProfileSearchOrganizationFact;
}

interface CollectionPath {
  readonly segments: string[];
  readonly scope: SearchScope;
}

interface SearchScope {
  readonly comparableByPath: ReadonlyMap<string, ComparablePath>;
  readonly collectionByPath: ReadonlyMap<string, CollectionPath>;
}

const rootScope = buildSearchScope(V3_USER_PROFILE_SEARCH_STRUCTURE.fields);
const filterExpressionSchema = createFilterExpressionSchema(rootScope);

export const V3UserProfileFilterSchema = z.unknown()
  .superRefine(validateFilterBudget)
  .pipe(filterExpressionSchema);

export const V3UserProfileSearchRequestSchema = z.object({
  filter: V3UserProfileFilterSchema,
}).strict();

export type V3UserProfileSearchRequest = z.infer<
  typeof V3UserProfileSearchRequestSchema
>;

export function compileV3UserProfileFilter(filter: V3UserProfileFilter): SQL {
  return compileFilterInScope(
    filter,
    rootScope,
    userProfiles.searchDoc,
    { nextAlias: 1 },
  );
}

function buildSearchScope(fields: V3UserProfileSearchFactShape): SearchScope {
  const comparableByPath = new Map<string, ComparablePath>();
  const collectionByPath = new Map<string, CollectionPath>();

  function visit(shape: V3UserProfileSearchFactShape, prefix: string[]) {
    for (const [field, fact] of Object.entries(shape)) {
      const segments = [...prefix, field];
      if (fact.kind === "scalar" || fact.kind === "scalar-array") {
        comparableByPath.set(segments.join("."), { segments, fact });
        continue;
      }
      if (fact.kind === "object") {
        if (isOrganizationFact(fact))
          comparableByPath.set(segments.join("."), { segments, fact });
        visit(fact.fields, segments);
        continue;
      }
      collectionByPath.set(segments.join("."), {
        segments,
        scope: buildSearchScope(fact.fields),
      });
    }
  }

  visit(fields, []);
  return { comparableByPath, collectionByPath };
}

function createFilterExpressionSchema(scope: SearchScope): z.ZodType<V3UserProfileFilter> {
  const conditionSchema = createConditionSchema(scope);
  const collectionSchemas = [...scope.collectionByPath.entries()].map(([path, collection]) =>
    z.object({
      exists: z.object({
        path: z.literal(path),
        where: createFilterExpressionSchema(collection.scope),
      }).strict(),
    }).strict(),
  );
  const expressionSchema: z.ZodType<V3UserProfileFilter> = z.lazy(() => z.union(([
    conditionSchema,
    z.object({
      and: z.array(expressionSchema).min(1).max(V3_USER_PROFILE_FILTER_MAX_CHILDREN),
    }).strict(),
    z.object({
      or: z.array(expressionSchema).min(1).max(V3_USER_PROFILE_FILTER_MAX_CHILDREN),
    }).strict(),
    z.object({ not: expressionSchema }).strict(),
    ...collectionSchemas,
  ] as unknown) as [
    z.ZodType<V3UserProfileFilter>,
    z.ZodType<V3UserProfileFilter>,
    ...z.ZodType<V3UserProfileFilter>[],
  ]));
  return expressionSchema;
}

function createConditionSchema(scope: SearchScope): z.ZodType<ParsedCondition> {
  const paths = [...scope.comparableByPath.keys()];
  const pathSchema = z.enum(paths as [string, ...string[]]);
  return z.object({
    field: pathSchema,
    op: z.string(),
    value: z.unknown(),
  }).strict().transform((condition, context) => {
    const comparable = scope.comparableByPath.get(condition.field)!;
    if (isOrganizationFact(comparable.fact)) {
      if (condition.op !== "withinSubtreeOf") {
        addInvalidOperatorIssue(context);
        return z.NEVER;
      }
      const value = comparable.fact.organization.valueSchema.safeParse(condition.value);
      if (!value.success) {
        addInvalidValueIssue(context);
        return z.NEVER;
      }
      return {
        field: condition.field,
        op: "withinSubtreeOf",
        value: value.data,
      };
    }
    if (comparable.fact.kind === "scalar") {
      if (condition.op === "eq") {
        const value = comparable.fact.valueSchema.safeParse(condition.value);
        if (!value.success) {
          addInvalidValueIssue(context);
          return z.NEVER;
        }
        return {
          field: condition.field,
          op: "eq",
          value: value.data as V3UserProfileScalarValue,
        };
      }
      if (condition.op === "in") {
        const values = normalizeMembershipValues(
          condition.value,
          comparable.fact.valueSchema,
          context,
        );
        if (values === z.NEVER)
          return z.NEVER;
        return { field: condition.field, op: "in", value: values };
      }
      addInvalidOperatorIssue(context);
      return z.NEVER;
    }

    if (condition.op !== "containsAny" && condition.op !== "containsAll") {
      addInvalidOperatorIssue(context);
      return z.NEVER;
    }
    const values = normalizeMembershipValues(
      condition.value,
      comparable.fact.itemValueSchema,
      context,
    );
    if (values === z.NEVER)
      return z.NEVER;
    return { field: condition.field, op: condition.op, value: values };
  });
}

function normalizeMembershipValues(
  input: unknown,
  valueSchema: z.ZodType,
  context: z.RefinementCtx,
): V3UserProfileScalarValue[] | typeof z.NEVER {
  if (!Array.isArray(input) || input.length === 0) {
    addInvalidValueIssue(context);
    return z.NEVER;
  }
  const normalized: V3UserProfileScalarValue[] = [];
  const distinct = new Set<V3UserProfileScalarValue>();
  for (const rawValue of input) {
    const value = valueSchema.safeParse(rawValue);
    if (!value.success) {
      addInvalidValueIssue(context);
      return z.NEVER;
    }
    const typedValue = value.data as V3UserProfileScalarValue;
    if (distinct.has(typedValue))
      continue;
    distinct.add(typedValue);
    if (distinct.size > V3_USER_PROFILE_FILTER_MAX_IN_VALUES) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `Filter value contains more than ${V3_USER_PROFILE_FILTER_MAX_IN_VALUES} distinct items`,
      });
      return z.NEVER;
    }
    normalized.push(typedValue);
  }
  return normalized;
}

function compileFilterInScope(
  filter: ParsedFilter,
  scope: SearchScope,
  document: SQLWrapper,
  aliases: { nextAlias: number },
): SQL {
  if ("and" in filter)
    return joinBooleanExpressions(filter.and.map(child => compileFilterInScope(child, scope, document, aliases)), sql` AND `);
  if ("or" in filter)
    return joinBooleanExpressions(filter.or.map(child => compileFilterInScope(child, scope, document, aliases)), sql` OR `);
  if ("not" in filter)
    return sql`NOT (${compileFilterInScope(filter.not, scope, document, aliases)})`;
  if ("exists" in filter) {
    const collection = scope.collectionByPath.get(filter.exists.path)!;
    const alias = `v3_search_scope_${aliases.nextAlias++}`;
    const candidate = sql.raw(`${alias}.value`);
    return sql`EXISTS (
      SELECT 1
      FROM jsonb_array_elements(${jsonbAtPath(document, collection.segments)})
        AS ${sql.raw(alias)}(value)
      WHERE ${compileFilterInScope(filter.exists.where, collection.scope, candidate, aliases)}
    )`;
  }

  const comparable = scope.comparableByPath.get(filter.field)!;
  if (filter.op === "withinSubtreeOf") {
    if (!isOrganizationFact(comparable.fact))
      throw new Error("Parsed withinSubtreeOf condition does not target an Organization reference");
    const organization = comparable.fact.organization;
    const alias = `v3_search_scope_${aliases.nextAlias++}`;
    const candidate = sql.raw(`${alias}.value`);
    return sql`EXISTS (
      SELECT 1
      FROM jsonb_array_elements(${jsonbAtPath(document, [...comparable.segments, organization.pathField])})
        AS ${sql.raw(alias)}(value)
      WHERE ${jsonbAtPath(candidate, [organization.codeField])} = ${JSON.stringify(filter.value)}::jsonb
    )`;
  }
  const fieldValue = jsonbAtPath(document, comparable.segments);
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  if (filter.op === "containsAll")
    return sql`COALESCE(${fieldValue} @> ${JSON.stringify(values)}::jsonb, FALSE)`;
  if (filter.op === "containsAny") {
    return joinBooleanExpressions(
      values.map(value => sql`COALESCE(${fieldValue} @> ${JSON.stringify([value])}::jsonb, FALSE)`),
      sql` OR `,
    );
  }
  return joinBooleanExpressions(
    values.map(value => sql`COALESCE(${fieldValue} = ${JSON.stringify(value)}::jsonb, FALSE)`),
    sql` OR `,
  );
}

function jsonbAtPath(document: SQLWrapper, segments: readonly string[]) {
  return sql`jsonb_extract_path(
    ${document},
    ${sql.join(segments.map(segment => sql`${segment}`), sql`, `)}
  )`;
}

function joinBooleanExpressions(expressions: SQL[], separator: SQL) {
  return sql`(${sql.join(expressions, separator)})`;
}

function isOrganizationFact(
  fact: V3UserProfileSearchFactShape[string],
): fact is V3UserProfileSearchOrganizationFact {
  return fact.kind === "object" && "organization" in fact;
}

function addInvalidOperatorIssue(context: z.RefinementCtx) {
  context.addIssue({
    code: "custom",
    path: ["op"],
    message: "Filter operator does not match the selected Search Document field",
  });
}

function addInvalidValueIssue(context: z.RefinementCtx) {
  context.addIssue({
    code: "custom",
    path: ["value"],
    message: "Filter value does not match the selected Search Document field",
  });
}

function validateFilterBudget(input: unknown, context: z.RefinementCtx) {
  const violation = findV3UserProfileFilterBudgetViolation(input);
  if (violation === null)
    return;
  context.addIssue({ code: "custom", message: violation });
}

export function findV3UserProfileFilterBudgetViolation(
  input: unknown,
): string | null {
  const pending: { value: unknown; depth: number }[] = [{ value: input, depth: 1 }];
  let nodes = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (current.depth > V3_USER_PROFILE_FILTER_MAX_DEPTH)
      return `Filter depth exceeds ${V3_USER_PROFILE_FILTER_MAX_DEPTH}`;
    if (nodes > V3_USER_PROFILE_FILTER_MAX_NODES)
      return `Filter node count exceeds ${V3_USER_PROFILE_FILTER_MAX_NODES}`;
    if (!isUnknownRecord(current.value))
      continue;

    if (
      Array.isArray(current.value.value)
      && current.value.value.length > V3_USER_PROFILE_FILTER_MAX_RAW_VALUES
    ) {
      return `Filter value contains more than ${V3_USER_PROFILE_FILTER_MAX_RAW_VALUES} raw items`;
    }

    for (const operator of ["and", "or"] as const) {
      const children = current.value[operator];
      if (!Array.isArray(children))
        continue;
      if (children.length > V3_USER_PROFILE_FILTER_MAX_CHILDREN)
        return `Filter ${operator} contains more than ${V3_USER_PROFILE_FILTER_MAX_CHILDREN} children`;
      for (const child of children)
        pending.push({ value: child, depth: current.depth + 1 });
    }
    if ("not" in current.value)
      pending.push({ value: current.value.not, depth: current.depth + 1 });
    if (isUnknownRecord(current.value.exists) && "where" in current.value.exists) {
      pending.push({
        value: current.value.exists.where,
        depth: current.depth + 1,
      });
    }
  }
  return null;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
