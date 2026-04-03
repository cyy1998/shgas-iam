import { z } from "@hono/zod-openapi";
import { UserSchema as PrismaUserSchema } from "@/db/generated/schemas";
import { Status } from "@/enums/status";
import { createPageQuerySchema } from "@/lib/core/pagination/schema";
import { EmploymentDetailDtoSchema } from "../employment/employment.schema";

export const UserSchema = z.object(PrismaUserSchema.shape);

export const UserDtoSchema = UserSchema.omit({
  password: true,
}).extend({
  orcasId: z.string().nullable().default(null).openapi({ example: "ada8wf89w83b2" }),
  status: z.enum(Status),
}).required().openapi("UserDto");

export const UserDetailDtoSchema = UserDtoSchema.extend({
  employments: z.array(EmploymentDetailDtoSchema).default([]),
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailDto");

export const UserQueryDtoSchema = z.object({
  usernames: z.array(z.string()).openapi({ example: ["138550", "136163"] }),
  phones: z.array(z.string()).openapi({ example: ["17721462865"] }),
  wxIds: z.array(z.string()).openapi({ example: ["1592677631"] }),
  ancestorOrgCodes: z.array(z.string()).openapi({ example: ["SR", "SB"] }),
  ancestorOrgDepths: z.array(z.number()).openapi({ example: [1, 2] }),
  positionCodes: z.array(z.string()).openapi({ example: ["E033", "E034"] }),
  roleCodes: z.array(z.string()).openapi({ example: ["tender:default-user"] }),
}).partial().openapi("UserQueryDto");

export const UserPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "138550" }),
    }),
    exactConditions: z.object({
      userTypes: z.array(z.string()).optional().openapi({ example: ["正式员工"] }),
      usernames: z.array(z.string()).optional().openapi({ example: ["138550", "136163"] }),
      phones: z.array(z.string()).optional().openapi({ example: ["17721462865"] }),
      wxIds: z.array(z.string()).optional().openapi({ example: ["1592677631"] }),
      names: z.array(z.string()).optional().openapi({ example: ["蔡奕阳"] }),
    }),
  }),
).openapi("UserPaginationQueryDto");

export const UserQueryWithPrivilegeDelegationDtoSchema = UserQueryDtoSchema.extend({
  ancestorOrgCodes: z.array(z.string()).openapi({ example: ["SR", "SB"] }),
  privilegeCode: z.string().openapi({ example: "ui:button:tender:create-GYBG" }),
}).openapi("UserQueryWithPrivilegeDelegationDto");

export const UserCreateDtoSchema = UserSchema.partial().required({
  username: true,
  name: true,
  userType: true,
}).extend({
  password: z.string(),
}).openapi("UserCreateDto");
