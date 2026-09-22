import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { UserStatus, UserType } from "@iam/contracts";
import {
  UserDetailDtoSchema as SharedUserDetailDtoSchema,
  UserSchema as SharedUserSchema,
  UserNameWriteSchema,
  UsernameWriteSchema,
} from "@iam/domain/user";
import { EmploymentDetailDtoSchema } from "../employment/employment.schema";

export const UserDetailDtoSchema = SharedUserDetailDtoSchema.pick({
  id: true,
  username: true,
  name: true,
  wxId: true,
  mobile: true,
  userType: true,
  orderNum: true,
  status: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
  roles: true,
  privileges: true,
}).extend({
  employments: z.array(EmploymentDetailDtoSchema).default([]),
  roleNames: z.record(z.string(), z.string()).default({}),
  privilegeNames: z.record(z.string(), z.string()).default({}),
});

export {
  UserCreateDtoSchema,
  UserDtoSchema,
  UserSchema,
} from "@iam/domain/user";

export const UserPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "138550" }),
    }),
    exactConditions: z.object({
      userTypes: z.array(z.enum(UserType)).optional().openapi({ example: [UserType.Formal] }),
      usernames: z.array(z.string()).optional().openapi({ example: ["138550", "136163"] }),
      phones: z.array(z.string()).optional().openapi({ example: ["17721462865"] }),
      wxIds: z.array(z.string()).optional().openapi({ example: ["1592677631"] }),
      names: z.array(z.string()).optional().openapi({ example: ["蔡奕阳"] }),
      statuses: z.array(z.enum(UserStatus)).optional().openapi({ example: [UserStatus.Enable, UserStatus.Pause] }),
    }),
  }),
).openapi("UserPaginationQueryDto");

export const UserAdminCreateDtoSchema = SharedUserSchema.pick({
  username: true,
  wxId: true,
  name: true,
  password: true,
  mobile: true,
  userType: true,
  orderNum: true,
  status: true,
}).partial().required({
  username: true,
  name: true,
  userType: true,
}).extend({
  username: UsernameWriteSchema,
  name: UserNameWriteSchema,
  password: z.string().min(8).optional().openapi({
    example: "P@ssw0rd1",
    description: "留空则后端生成随机 8 位密码（需由前端通过单独渠道展示给管理员）",
  }),
  status: z.enum(UserStatus).optional().openapi({ example: UserStatus.Enable }),
}).openapi("UserAdminCreateDto");

export const UserUpdateDtoSchema = SharedUserSchema.partial().pick({
  name: true,
  mobile: true,
  wxId: true,
  userType: true,
  status: true,
  orderNum: true,
}).extend({
  name: UserNameWriteSchema.optional(),
}).openapi("UserUpdateDto");

export const UserStatusUpdateDtoSchema = z.object({
  status: z.enum(UserStatus),
}).openapi("UserStatusUpdateDto");
