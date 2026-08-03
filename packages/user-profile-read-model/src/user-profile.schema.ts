import type { SubjectFactsEmployment } from "@iam/client-subject-projection";
import type { UserProfileDirtyReason, UserProfileDirtyStatus } from "@iam/contracts";
import type { UserDetailDto } from "@iam/domain/user";
import { z } from "@hono/zod-openapi";
import { UserProfileDirtyReasonSchema, UserProfileDirtyStatusSchema, UserStatus, UserType } from "@iam/contracts";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@iam/domain/employment";
import { UserDetailDtoSchema, UserDtoSchema } from "@iam/domain/user";

export type { EmploymentDetailDto } from "@iam/domain/employment";
export type { UserDetailDto, UserDto } from "@iam/domain/user";
export {
  EmploymentDetailDtoSchema,
  toEmploymentDto,
  UserDetailDtoSchema,
  UserDtoSchema,
};

export const CURRENT_USER_PROFILE_SCHEMA_VERSION = 1;

const SubjectOrganizationSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
}).strict();

const SubjectFactsEmploymentSchema: z.ZodType<SubjectFactsEmployment> = z.object({
  isPrimary: z.boolean(),
  organization: SubjectOrganizationSchema.extend({
    path: z.array(SubjectOrganizationSchema).min(1),
  }).strict(),
  position: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
  }).strict(),
  clientAuthorizations: z.array(z.object({
    clientCode: z.string().min(1),
    roles: z.array(z.object({
      code: z.string().min(1),
      privileges: z.array(z.string().min(1)),
    }).strict()).min(1),
  }).strict()),
}).strict();

export const SubjectFactsDocumentV1Schema = z.object({
  employments: z.array(SubjectFactsEmploymentSchema),
}).strict();

export type SubjectFactsDocumentV1 = z.infer<typeof SubjectFactsDocumentV1Schema>;

export const UserQueryDtoSchema = z.object({
  usernames: z.array(z.string()).describe("用户名列表").openapi({ example: ["138550", "136163"] }),
  names: z.array(z.string()).describe("姓名列表精确匹配").openapi({ example: ["张三", "李四"] }),
  phones: z.array(z.string()).describe("手机号列表").openapi({ example: ["17721462865"] }),
  wxIds: z.array(z.string()).describe("微信ID列表").openapi({ example: ["1592677631"] }),
  ancestorOrgCodes: z.array(z.string()).describe("用户岗位父级组织编码列表").openapi({ example: ["SR", "SB"] }),
  ancestorOrgDepths: z.array(z.number()).describe("用户岗位父级组织深度查询（只查询组织直属用户填0，递归查询不要传此参数）").openapi({ example: [0, 1, 2] }),
  positionCodes: z.array(z.string()).describe("岗位编码列表").openapi({ example: ["E033", "E034"] }),
  roleCodes: z.array(z.string()).describe("角色编码列表").openapi({ example: ["tender:default-user"] }),
}).partial().openapi("UserQueryDto");

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

export const PublishedUserProfileSchema = z.object({
  userId: z.number().int().positive(),
  subjectIdentifier: z.uuid(),
  username: z.string().min(1),
  name: z.string().min(1),
  mobile: z.string().nullable(),
  wxId: z.string().nullable(),
  status: z.enum(UserStatus),
  isDelete: z.boolean(),
  searchVisible: z.boolean(),
  profileSchemaVersion: z.literal(CURRENT_USER_PROFILE_SCHEMA_VERSION),
  sourceDirtyVersion: z.string().regex(/^[1-9]\d*$/u),
  detail: UserDetailDtoSchema,
  searchDoc: UserProfileSearchDocSchema,
  subjectFacts: SubjectFactsDocumentV1Schema,
  rebuiltAt: z.date(),
}).strict();

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

export interface UserProfileFilterCondition {
  field: UserProfileFilterField;
  op: UserProfileFilterOperator;
  value: UserProfileFilterValue;
}

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
export type PublishedUserProfile = z.infer<typeof PublishedUserProfileSchema>;
export type UserProfileDirtyDto = z.infer<typeof UserProfileDirtyDtoSchema>;
export type UserProfileDirtyStatusType = UserProfileDirtyStatus;
export type UserProfileDirtyReasonType = UserProfileDirtyReason;
export type UserQueryDto = z.infer<typeof UserQueryDtoSchema>;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const PROFILE_DETAIL_DATE_KEYS = new Set(["createTime", "updateTime", "startTime", "endTime"]);

export function parseUserProfileDetailDocument(input: unknown): UserDetailDto {
  return UserDetailDtoSchema.parse(reviveProfileDetailDates(input));
}

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

function reviveProfileDetailDates(value: unknown, key?: string): unknown {
  if (typeof value === "string" && key !== undefined && PROFILE_DETAIL_DATE_KEYS.has(key) && ISO_DATE_REGEX.test(value)) {
    return new Date(value);
  }

  if (value instanceof Date || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => reviveProfileDetailDates(item));
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [childKey, reviveProfileDetailDates(childValue, childKey)]),
  );
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
