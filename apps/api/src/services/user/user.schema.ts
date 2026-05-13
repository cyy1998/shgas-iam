import { UserStatus } from "@api/enums/user.status";
import { createPageQuerySchema } from "@api/lib/core/pagination/schema";
import { z } from "@hono/zod-openapi";
import { selectUserSchema } from "@iam/db/schema";
import { EmploymentDetailDtoSchema } from "../employment/employment.schema";

export const UserSchema = z.object(selectUserSchema.shape);

export const UserDtoSchema = UserSchema.omit({
  password: true,
}).extend({
  orcasId: z.string().nullable().default(null).openapi({ example: "ada8wf89w83b2" }),
  status: z.enum(UserStatus),
}).required().openapi("UserDto");

export const UserDetailDtoSchema = UserDtoSchema.extend({
  employments: z.array(EmploymentDetailDtoSchema).default([]),
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailDto");

export const UserQueryDtoSchema = z.object({
  usernames: z.array(z.string()).describe("用户名列表").openapi({ example: ["138550", "136163"] }),
  phones: z.array(z.string()).describe("手机号列表").openapi({ example: ["17721462865"] }),
  wxIds: z.array(z.string()).describe("微信ID列表").openapi({ example: ["1592677631"] }),
  ancestorOrgCodes: z.array(z.string()).describe("用户岗位父级组织编码列表").openapi({ example: ["SR", "SB"] }),
  ancestorOrgDepths: z.array(z.number()).describe("用户岗位父级组织深度查询（只查询组织直属用户填0，递归查询不要传此参数）").openapi({ example: [0, 1, 2] }),
  positionCodes: z.array(z.string()).describe("岗位编码列表").openapi({ example: ["E033", "E034"] }),
  roleCodes: z.array(z.string()).describe("角色编码列表").openapi({ example: ["tender:default-user"] }),
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
      statuses: z.array(z.enum(UserStatus)).optional().openapi({ example: [UserStatus.Enable, UserStatus.Pause] }),
    }),
  }),
).openapi("UserPaginationQueryDto");

export const UserQueryWithPrivilegeDelegationDtoSchema = UserQueryDtoSchema.required({
  ancestorOrgCodes: true,
}).extend({
  // ancestorOrgCodes: z.array(z.string()).openapi({ example: ["SR", "SB"] }),
  privilegeCode: z.string().describe("权限编码").openapi({ example: "ui:button:tender:create-GYBG" }),
}).openapi("UserQueryWithPrivilegeDelegationDto");

export const UserCreateDtoSchema = UserSchema.partial().required({
  username: true,
  name: true,
  userType: true,
  password: true,
}).omit({
  id: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
}).openapi("UserCreateDto");

export const UserAdminCreateDtoSchema = UserSchema.partial().required({
  username: true,
  name: true,
  userType: true,
}).omit({
  id: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
  password: true,
}).extend({
  password: z.string().min(8).optional().openapi({
    example: "P@ssw0rd1",
    description: "留空则后端生成随机 8 位密码（需由前端通过单独渠道展示给管理员）",
  }),
  status: z.enum(UserStatus).optional().openapi({ example: UserStatus.Enable }),
}).openapi("UserAdminCreateDto");

export const UserUpdateDtoSchema = UserSchema.partial().pick({
  name: true,
  mobile: true,
  wxId: true,
  userType: true,
  status: true,
  orderNum: true,
}).extend({
  status: z.enum(UserStatus).optional(),
}).openapi("UserUpdateDto");

export const UserStatusUpdateDtoSchema = z.object({
  status: z.enum(UserStatus),
}).openapi("UserStatusUpdateDto");
