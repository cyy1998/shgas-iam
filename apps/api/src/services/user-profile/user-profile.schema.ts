import type { UserProfileDirtyReason, UserProfileDirtyStatus } from "@iam/contracts";
import { z } from "@hono/zod-openapi";
import { UserProfileDirtyReasonSchema, UserProfileDirtyStatusSchema, UserStatus, UserType } from "@iam/contracts";

export const CURRENT_USER_PROFILE_SCHEMA_VERSION = 1;

export const UserProfileSearchEmploymentDocSchema = z.object({
  id: z.number().int().positive(),
  org: z.object({
    id: z.number().int().positive(),
    code: z.string(),
    ancestorCodes: z.array(z.string()),
    ancestorDepths: z.array(z.number().int().nonnegative()),
    ancestorKeys: z.array(z.string()),
    companyCodes: z.array(z.string()),
  }),
  position: z.object({
    id: z.number().int().positive(),
    code: z.string(),
  }),
  roles: z.array(z.string()),
  privileges: z.array(z.string()),
  isPrimary: z.boolean(),
});

export const UserProfileSearchDocSchema = z.object({
  user: z.object({
    id: z.number().int().positive(),
    username: z.string(),
    name: z.string(),
    mobile: z.string().nullable(),
    wxId: z.string().nullable(),
    userType: z.enum(UserType),
    status: z.enum(UserStatus),
  }),
  employments: z.array(UserProfileSearchEmploymentDocSchema),
});

export const UserProfileDirtyStatusDtoSchema = UserProfileDirtyStatusSchema;
export const UserProfileDirtyReasonDtoSchema = UserProfileDirtyReasonSchema;

export const UserProfileDirtyDtoSchema = z.object({
  userId: z.number().int().positive(),
  status: UserProfileDirtyStatusDtoSchema,
  reasonCodes: z.array(UserProfileDirtyReasonDtoSchema),
  dirtyAt: z.date(),
  processingStartedAt: z.date().nullable(),
  processedAt: z.date().nullable(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  lastJobId: z.string().nullable(),
});

const UserProfileUserFieldSchema = z.enum([
  "user.id",
  "user.username",
  "user.name",
  "user.mobile",
  "user.wxId",
  "user.userType",
  "user.status",
]);

const UserProfileEmploymentFieldSchema = z.enum([
  "employment.id",
  "employment.org.id",
  "employment.org.code",
  "employment.org.ancestorCodes",
  "employment.org.ancestorDepths",
  "employment.org.ancestorKeys",
  "employment.org.companyCodes",
  "employment.position.id",
  "employment.position.code",
  "employment.roles",
  "employment.privileges",
  "employment.isPrimary",
]);

export const UserProfileFilterFieldSchema = z.union([
  UserProfileUserFieldSchema,
  UserProfileEmploymentFieldSchema,
]);

export const UserProfileFilterOperatorSchema = z.enum(["eq", "in", "containsAny", "containsAll"]);

const UserProfileFilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

export type UserProfileUserField = z.infer<typeof UserProfileUserFieldSchema>;
export type UserProfileEmploymentField = z.infer<typeof UserProfileEmploymentFieldSchema>;
export type UserProfileFilterField = z.infer<typeof UserProfileFilterFieldSchema>;
export type UserProfileFilterOperator = z.infer<typeof UserProfileFilterOperatorSchema>;
export type UserProfileFilterValue = z.infer<typeof UserProfileFilterValueSchema>;

export type UserProfileFilterCondition = {
  field: UserProfileFilterField;
  op: UserProfileFilterOperator;
  value: UserProfileFilterValue;
};

export type UserProfileFilterDsl
  = | UserProfileFilterCondition
    | { all: UserProfileFilterDsl[] }
    | { any: UserProfileFilterDsl[] }
    | { not: UserProfileFilterDsl }
    | { nested: "employments"; where: UserProfileFilterDsl };

const BaseUserProfileFilterDslSchema: z.ZodType<UserProfileFilterDsl> = z.lazy(() => z.union([
  z.object({
    field: UserProfileFilterFieldSchema,
    op: UserProfileFilterOperatorSchema,
    value: UserProfileFilterValueSchema,
  }).strict(),
  z.object({ all: z.array(BaseUserProfileFilterDslSchema).min(1) }).strict(),
  z.object({ any: z.array(BaseUserProfileFilterDslSchema).min(1) }).strict(),
  z.object({ not: BaseUserProfileFilterDslSchema }).strict(),
  z.object({
    nested: z.literal("employments"),
    where: BaseUserProfileFilterDslSchema,
  }).strict(),
]));

export const UserProfileFilterDslSchema = BaseUserProfileFilterDslSchema.superRefine((dsl, ctx) => {
  validateEmploymentFieldsAreNested(dsl, false, ctx);
  validateFilterOperators(dsl, ctx);
});

export function createUserProfileDslSearchRequestSchema(maxLimit: number) {
  return z.object({
    filter: UserProfileFilterDslSchema,
    limit: z.number().int().positive().max(maxLimit).optional(),
  }).strict().openapi("UserProfileDslSearchRequest");
}

export function isEmploymentField(field: UserProfileFilterField): field is UserProfileEmploymentField {
  return field.startsWith("employment.");
}

export function buildAncestorKey(code: string, depth: number) {
  return `${code}#${depth}`;
}

export type UserProfileSearchDoc = z.infer<typeof UserProfileSearchDocSchema>;
export type UserProfileDirtyDto = z.infer<typeof UserProfileDirtyDtoSchema>;
export type UserProfileDirtyStatusType = UserProfileDirtyStatus;
export type UserProfileDirtyReasonType = UserProfileDirtyReason;

function validateEmploymentFieldsAreNested(
  node: UserProfileFilterDsl,
  insideEmploymentNested: boolean,
  ctx: z.RefinementCtx,
) {
  if ("field" in node) {
    if (isEmploymentField(node.field) && !insideEmploymentNested) {
      ctx.addIssue({
        code: "custom",
        path: ["field"],
        message: "employment fields must be inside a nested employments filter",
      });
    }
    return;
  }

  if ("nested" in node) {
    validateEmploymentFieldsAreNested(node.where, true, ctx);
    return;
  }

  if ("all" in node) {
    node.all.forEach(child => validateEmploymentFieldsAreNested(child, insideEmploymentNested, ctx));
    return;
  }

  if ("any" in node) {
    node.any.forEach(child => validateEmploymentFieldsAreNested(child, insideEmploymentNested, ctx));
    return;
  }

  validateEmploymentFieldsAreNested(node.not, insideEmploymentNested, ctx);
}

function validateFilterOperators(node: UserProfileFilterDsl, ctx: z.RefinementCtx) {
  if ("field" in node) {
    const arrayValue = Array.isArray(node.value);
    if ((node.op === "in" || node.op === "containsAny" || node.op === "containsAll") && !arrayValue) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `${node.op} requires an array value`,
      });
    }
    if (node.op === "eq" && arrayValue) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "eq requires a scalar value",
      });
    }
    return;
  }

  if ("nested" in node) {
    validateFilterOperators(node.where, ctx);
    return;
  }

  if ("all" in node) {
    node.all.forEach(child => validateFilterOperators(child, ctx));
    return;
  }

  if ("any" in node) {
    node.any.forEach(child => validateFilterOperators(child, ctx));
    return;
  }

  validateFilterOperators(node.not, ctx);
}
