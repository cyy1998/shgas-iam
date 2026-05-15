import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { UserStatus, UserType } from "@iam/contracts";
import { UserSchema as SharedUserSchema } from "@iam/domain/user";

export {
  UserCreateDtoSchema,
  UserDetailDtoSchema,
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

export const UserAdminCreateDtoSchema = SharedUserSchema.partial().required({
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

export const UserUpdateDtoSchema = SharedUserSchema.partial().pick({
  name: true,
  mobile: true,
  wxId: true,
  userType: true,
  status: true,
  orderNum: true,
}).openapi("UserUpdateDto");

export const UserStatusUpdateDtoSchema = z.object({
  status: z.enum(UserStatus),
}).openapi("UserStatusUpdateDto");
