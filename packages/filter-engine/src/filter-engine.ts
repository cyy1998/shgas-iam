import type { SQL, SQLWrapper } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type {
  SearchFactShape,
  SearchObjectFact,
  SearchOrganizationFact,
  SearchScalarArrayFact,
  SearchScalarFact,
} from "./structure";

export type FilterScalarValue = string | number | boolean;

export const FILTER_OPERATORS = ["eq", "in", "containsAny", "containsAll", "withinSubtreeOf"] as const;

type FilterOperator = (typeof FILTER_OPERATORS)[number];

interface ParsedCondition {
  readonly field: string;
  readonly op: FilterOperator;
  readonly value: FilterScalarValue | FilterScalarValue[];
}

type ParsedFilter =
  | ParsedCondition
  | { and: ParsedFilter[] }
  | { or: ParsedFilter[] }
  | { not: ParsedFilter }
  | { exists: { path: string; where: ParsedFilter } };

type SearchPath<Prefix extends string, Field extends string> = Prefix extends "" ? Field : `${Prefix}.${Field}`;

type ConditionsForShape<Shape extends SearchFactShape, Prefix extends string = ""> = {
  [Field in keyof Shape & string]: Shape[Field] extends SearchOrganizationFact<infer Fields, infer ValueSchema>
    ?
        | {
            field: SearchPath<Prefix, Field>;
            op: "withinSubtreeOf";
            value: z.infer<ValueSchema>;
          }
        | ConditionsForShape<Fields, SearchPath<Prefix, Field>>
    : Shape[Field] extends SearchScalarFact<z.ZodType, infer ValueSchema>
      ?
          | {
              field: SearchPath<Prefix, Field>;
              op: "eq";
              value: z.infer<ValueSchema>;
            }
          | {
              field: SearchPath<Prefix, Field>;
              op: "in";
              value: z.infer<ValueSchema>[];
            }
      : Shape[Field] extends SearchScalarArrayFact<z.ZodType, infer ItemValueSchema>
        ? {
            field: SearchPath<Prefix, Field>;
            op: "containsAny" | "containsAll";
            value: z.infer<ItemValueSchema>[];
          }
        : Shape[Field] extends { kind: "object"; fields: infer Fields extends SearchFactShape }
          ? ConditionsForShape<Fields, SearchPath<Prefix, Field>>
          : never;
}[keyof Shape & string];

type ExistsForShape<Shape extends SearchFactShape, Prefix extends string = ""> = {
  [Field in keyof Shape & string]: Shape[Field] extends {
    kind: "collection";
    fields: infer Fields extends SearchFactShape;
  }
    ? {
        exists: {
          path: SearchPath<Prefix, Field>;
          where: FilterForShape<Fields>;
        };
      }
    : Shape[Field] extends { kind: "object"; fields: infer Fields extends SearchFactShape }
      ? ExistsForShape<Fields, SearchPath<Prefix, Field>>
      : never;
}[keyof Shape & string];

export type FilterForShape<Shape extends SearchFactShape> =
  | ConditionsForShape<Shape>
  | ExistsForShape<Shape>
  | { and: FilterForShape<Shape>[] }
  | { or: FilterForShape<Shape>[] }
  | { not: FilterForShape<Shape> };

export const FILTER_MAX_DEPTH = 8;
export const FILTER_MAX_NODES = 64;
export const FILTER_MAX_CHILDREN = 16;
export const FILTER_MAX_IN_VALUES = 50;
export const FILTER_MAX_RAW_VALUES = 500;

export class FilterValidationError extends Error {
  constructor() {
    super("Filter does not satisfy its structure or resource budget");
    this.name = new.target.name;
  }
}

interface ComparablePath {
  readonly segments: string[];
  readonly fact: SearchScalarFact | SearchScalarArrayFact | SearchOrganizationFact;
}

interface CollectionPath {
  readonly segments: string[];
  readonly scope: SearchScope;
}

interface SearchScope {
  readonly comparableByPath: ReadonlyMap<string, ComparablePath>;
  readonly collectionByPath: ReadonlyMap<string, CollectionPath>;
}

export function createFilterEngine<const Fields extends SearchFactShape>(structure: SearchObjectFact<Fields>) {
  const scope = buildSearchScope(structure.fields);
  const filterSchema = z
    .unknown()
    .superRefine(validateFilterBudget)
    .pipe(createFilterExpressionSchema(scope)) as z.ZodType<FilterForShape<Fields>>;
  return {
    filterSchema,
    compile(filter: unknown, document: SQLWrapper): SQL {
      const parsed = filterSchema.safeParse(filter);
      if (!parsed.success) throw new FilterValidationError();
      return compileFilterInScope(parsed.data as ParsedFilter, scope, document, { nextAlias: 1 });
    },
  };
}

function buildSearchScope(fields: SearchFactShape): SearchScope {
  const comparableByPath = new Map<string, ComparablePath>();
  const collectionByPath = new Map<string, CollectionPath>();

  function visit(shape: SearchFactShape, prefix: string[]) {
    for (const [field, fact] of Object.entries(shape)) {
      const segments = [...prefix, field];
      if (fact.kind === "scalar" || fact.kind === "scalar-array") {
        comparableByPath.set(segments.join("."), { segments, fact });
        continue;
      }
      if (fact.kind === "object") {
        if (isOrganizationFact(fact)) comparableByPath.set(segments.join("."), { segments, fact });
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

function createFilterExpressionSchema(scope: SearchScope): z.ZodType<ParsedFilter> {
  const conditionSchema = createConditionSchema(scope);
  const collectionSchemas = [...scope.collectionByPath.entries()].map(([path, collection]) =>
    z
      .object({
        exists: z
          .object({
            path: z.literal(path),
            where: createFilterExpressionSchema(collection.scope),
          })
          .strict(),
      })
      .strict(),
  );
  const expressionSchema: z.ZodType<ParsedFilter> = z.lazy(() =>
    z.union([
      conditionSchema,
      z
        .object({
          and: z.array(expressionSchema).min(1).max(FILTER_MAX_CHILDREN),
        })
        .strict(),
      z
        .object({
          or: z.array(expressionSchema).min(1).max(FILTER_MAX_CHILDREN),
        })
        .strict(),
      z.object({ not: expressionSchema }).strict(),
      ...collectionSchemas,
    ] as unknown as [z.ZodType<ParsedFilter>, z.ZodType<ParsedFilter>, ...z.ZodType<ParsedFilter>[]]),
  );
  return expressionSchema;
}

function createConditionSchema(scope: SearchScope): z.ZodType<ParsedCondition> {
  const paths = [...scope.comparableByPath.keys()];
  const pathSchema = z.enum(paths as [string, ...string[]]);
  return z
    .object({
      field: pathSchema,
      op: z.string(),
      value: z.unknown(),
    })
    .strict()
    .transform((condition, context) => {
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
            value: value.data as FilterScalarValue,
          };
        }
        if (condition.op === "in") {
          const values = normalizeMembershipValues(condition.value, comparable.fact.valueSchema, context);
          if (values === z.NEVER) return z.NEVER;
          return { field: condition.field, op: "in", value: values };
        }
        addInvalidOperatorIssue(context);
        return z.NEVER;
      }

      if (condition.op !== "containsAny" && condition.op !== "containsAll") {
        addInvalidOperatorIssue(context);
        return z.NEVER;
      }
      const values = normalizeMembershipValues(condition.value, comparable.fact.itemValueSchema, context);
      if (values === z.NEVER) return z.NEVER;
      return { field: condition.field, op: condition.op, value: values };
    });
}

function normalizeMembershipValues(
  input: unknown,
  valueSchema: z.ZodType,
  context: z.RefinementCtx,
): FilterScalarValue[] | typeof z.NEVER {
  if (!Array.isArray(input) || input.length === 0) {
    addInvalidValueIssue(context);
    return z.NEVER;
  }
  const normalized: FilterScalarValue[] = [];
  const distinct = new Set<FilterScalarValue>();
  for (const rawValue of input) {
    const value = valueSchema.safeParse(rawValue);
    if (!value.success) {
      addInvalidValueIssue(context);
      return z.NEVER;
    }
    const typedValue = value.data as FilterScalarValue;
    if (distinct.has(typedValue)) continue;
    distinct.add(typedValue);
    if (distinct.size > FILTER_MAX_IN_VALUES) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `Filter value contains more than ${FILTER_MAX_IN_VALUES} distinct items`,
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
    return joinBooleanExpressions(
      filter.and.map((child) => compileFilterInScope(child, scope, document, aliases)),
      sql` AND `,
    );
  if ("or" in filter)
    return joinBooleanExpressions(
      filter.or.map((child) => compileFilterInScope(child, scope, document, aliases)),
      sql` OR `,
    );
  if ("not" in filter) return sql`NOT (${compileFilterInScope(filter.not, scope, document, aliases)})`;
  if ("exists" in filter) {
    const collection = scope.collectionByPath.get(filter.exists.path)!;
    const alias = `filter_scope_${aliases.nextAlias++}`;
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
    const alias = `filter_scope_${aliases.nextAlias++}`;
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
  if (filter.op === "containsAll") return sql`COALESCE(${fieldValue} @> ${JSON.stringify(values)}::jsonb, FALSE)`;
  if (filter.op === "containsAny") {
    return joinBooleanExpressions(
      values.map((value) => sql`COALESCE(${fieldValue} @> ${JSON.stringify([value])}::jsonb, FALSE)`),
      sql` OR `,
    );
  }
  return joinBooleanExpressions(
    values.map((value) => sql`COALESCE(${fieldValue} = ${JSON.stringify(value)}::jsonb, FALSE)`),
    sql` OR `,
  );
}

function jsonbAtPath(document: SQLWrapper, segments: readonly string[]) {
  return sql`jsonb_extract_path(
    ${document},
    ${sql.join(
      segments.map((segment) => sql`${segment}`),
      sql`, `,
    )}
  )`;
}

function joinBooleanExpressions(expressions: SQL[], separator: SQL) {
  return sql`(${sql.join(expressions, separator)})`;
}

function isOrganizationFact(fact: SearchFactShape[string]): fact is SearchOrganizationFact {
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
  const violation = findFilterBudgetViolation(input);
  if (violation === null) return;
  context.addIssue({ code: "custom", message: violation });
}

export function findFilterBudgetViolation(input: unknown): string | null {
  const pending: { value: unknown; depth: number }[] = [{ value: input, depth: 1 }];
  let nodes = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (current.depth > FILTER_MAX_DEPTH) return `Filter depth exceeds ${FILTER_MAX_DEPTH}`;
    if (nodes > FILTER_MAX_NODES) return `Filter node count exceeds ${FILTER_MAX_NODES}`;
    if (!isUnknownRecord(current.value)) continue;

    if (Array.isArray(current.value.value) && current.value.value.length > FILTER_MAX_RAW_VALUES) {
      return `Filter value contains more than ${FILTER_MAX_RAW_VALUES} raw items`;
    }

    for (const operator of ["and", "or"] as const) {
      const children = current.value[operator];
      if (!Array.isArray(children)) continue;
      if (children.length > FILTER_MAX_CHILDREN)
        return `Filter ${operator} contains more than ${FILTER_MAX_CHILDREN} children`;
      for (const child of children) pending.push({ value: child, depth: current.depth + 1 });
    }
    if ("not" in current.value) pending.push({ value: current.value.not, depth: current.depth + 1 });
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
