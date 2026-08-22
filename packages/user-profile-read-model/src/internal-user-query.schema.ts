import { z } from "@hono/zod-openapi";
import {
  OrganizationResponsibilityTypeCode,
  OrganizationType,
} from "@iam/contracts";

export const INTERNAL_USER_PROFILE_DSL_BUDGET = {
  maxDepth: 8,
  maxNodes: 64,
  maxBooleanChildren: 16,
  maxInValues: 50,
  maxCodeLength: 128,
} as const;

export const INTERNAL_USER_PROFILE_RESULT_LIMIT = 500;

const CodeSchema = z.string().min(1).max(
  INTERNAL_USER_PROFILE_DSL_BUDGET.maxCodeLength,
);
const TypeCodeSchema = z.enum(OrganizationResponsibilityTypeCode);
const OrganizationTypeSchema = z.enum(OrganizationType);

const TypeCodeInValuesSchema = z.array(TypeCodeSchema)
  .min(1)
  .transform(values => [...new Set(values)])
  .pipe(z.array(TypeCodeSchema).max(INTERNAL_USER_PROFILE_DSL_BUDGET.maxInValues));
const CodeInValuesSchema = z.array(CodeSchema)
  .min(1)
  .transform(values => [...new Set(values)])
  .pipe(z.array(CodeSchema).max(INTERNAL_USER_PROFILE_DSL_BUDGET.maxInValues));
const OrganizationTypeInValuesSchema = z.array(OrganizationTypeSchema)
  .min(1)
  .transform(values => [...new Set(values)])
  .pipe(z.array(OrganizationTypeSchema).max(INTERNAL_USER_PROFILE_DSL_BUDGET.maxInValues));

const ResponsibilityConditionSchema = z.union([
  z.object({
    field: z.literal("responsibility.type.code"),
    op: z.literal("eq"),
    value: TypeCodeSchema,
  }).strict(),
  z.object({
    field: z.literal("responsibility.type.code"),
    op: z.literal("in"),
    value: TypeCodeInValuesSchema,
  }).strict(),
  z.object({
    field: z.literal("responsibility.targetOrganization.code"),
    op: z.literal("eq"),
    value: CodeSchema,
  }).strict(),
  z.object({
    field: z.literal("responsibility.targetOrganization.code"),
    op: z.literal("in"),
    value: CodeInValuesSchema,
  }).strict(),
  z.object({
    field: z.literal("responsibility.targetOrganization.code"),
    op: z.literal("withinSubtreeOf"),
    value: CodeSchema,
  }).strict(),
  z.object({
    field: z.literal("responsibility.targetOrganization.type"),
    op: z.literal("eq"),
    value: OrganizationTypeSchema,
  }).strict(),
  z.object({
    field: z.literal("responsibility.targetOrganization.type"),
    op: z.literal("in"),
    value: OrganizationTypeInValuesSchema,
  }).strict(),
]);

type ResponsibilityCondition = z.infer<typeof ResponsibilityConditionSchema>;

export type InternalUserProfileResponsibilityFilterDsl
  = | ResponsibilityCondition
    | { all: InternalUserProfileResponsibilityFilterDsl[] }
    | { any: InternalUserProfileResponsibilityFilterDsl[] }
    | { not: InternalUserProfileResponsibilityFilterDsl };

export type InternalUserProfileEmploymentFilterDsl
  = | { all: InternalUserProfileEmploymentFilterDsl[] }
    | { any: InternalUserProfileEmploymentFilterDsl[] }
    | { not: InternalUserProfileEmploymentFilterDsl }
    | {
      nested: "responsibilities";
      where: InternalUserProfileResponsibilityFilterDsl;
    };

export type InternalUserProfileFilterDsl
  = | { all: InternalUserProfileFilterDsl[] }
    | { any: InternalUserProfileFilterDsl[] }
    | { not: InternalUserProfileFilterDsl }
    | {
      nested: "employments";
      where: InternalUserProfileEmploymentFilterDsl;
    };

const ResponsibilityFilterDslSchema: z.ZodType<InternalUserProfileResponsibilityFilterDsl>
  = z.lazy(() => z.union([
    ResponsibilityConditionSchema,
    booleanAllSchema(ResponsibilityFilterDslSchema),
    booleanAnySchema(ResponsibilityFilterDslSchema),
    z.object({ not: ResponsibilityFilterDslSchema }).strict(),
  ])).openapi("InternalUserProfileResponsibilityFilterDsl");

const EmploymentFilterDslSchema: z.ZodType<InternalUserProfileEmploymentFilterDsl>
  = z.lazy(() => z.union([
    booleanAllSchema(EmploymentFilterDslSchema),
    booleanAnySchema(EmploymentFilterDslSchema),
    z.object({ not: EmploymentFilterDslSchema }).strict(),
    z.object({
      nested: z.literal("responsibilities"),
      where: ResponsibilityFilterDslSchema,
    }).strict(),
  ])).openapi("InternalUserProfileEmploymentFilterDsl");

const UserFilterDslSchema: z.ZodType<InternalUserProfileFilterDsl>
  = z.lazy(() => z.union([
    booleanAllSchema(UserFilterDslSchema),
    booleanAnySchema(UserFilterDslSchema),
    z.object({ not: UserFilterDslSchema }).strict(),
    z.object({
      nested: z.literal("employments"),
      where: EmploymentFilterDslSchema,
    }).strict(),
  ])).openapi("InternalUserProfileFilterDsl");

export const InternalUserProfileFilterDslSchema = z.preprocess((input, ctx) => {
  const budgetViolation = findBudgetViolation(input);
  if (budgetViolation !== null) {
    ctx.addIssue({ code: "custom", message: budgetViolation });
    return z.NEVER;
  }
  return input;
}, UserFilterDslSchema);

export const InternalUserProfileSearchRequestSchema = z.object({
  filter: InternalUserProfileFilterDslSchema,
}).strict().openapi("InternalUserProfileSearchRequest");

export type InternalUserProfileSearchRequest = z.infer<
  typeof InternalUserProfileSearchRequestSchema
>;

function booleanAllSchema<T>(child: z.ZodType<T>) {
  return z.object({
    all: z.array(child)
      .min(1)
      .max(INTERNAL_USER_PROFILE_DSL_BUDGET.maxBooleanChildren),
  }).strict();
}

function booleanAnySchema<T>(child: z.ZodType<T>) {
  return z.object({
    any: z.array(child)
      .min(1)
      .max(INTERNAL_USER_PROFILE_DSL_BUDGET.maxBooleanChildren),
  }).strict();
}

function findBudgetViolation(input: unknown): string | null {
  const pending: { depth: number; value: unknown }[] = [{ depth: 1, value: input }];
  let nodes = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > INTERNAL_USER_PROFILE_DSL_BUDGET.maxNodes)
      return "DSL node budget exceeded";
    if (current.depth > INTERNAL_USER_PROFILE_DSL_BUDGET.maxDepth)
      return "DSL depth budget exceeded";
    if (!isRecord(current.value))
      continue;

    const booleanChildren = "all" in current.value
      ? current.value.all
      : current.value.any;
    if (Array.isArray(booleanChildren)) {
      if (booleanChildren.length > INTERNAL_USER_PROFILE_DSL_BUDGET.maxBooleanChildren)
        return "DSL children budget exceeded";
      for (const child of booleanChildren)
        pending.push({ depth: current.depth + 1, value: child });
      continue;
    }

    if ("not" in current.value) {
      pending.push({ depth: current.depth + 1, value: current.value.not });
      continue;
    }
    if ("nested" in current.value)
      pending.push({ depth: current.depth + 1, value: current.value.where });
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
