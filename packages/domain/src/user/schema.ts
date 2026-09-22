import { z } from "@hono/zod-openapi";
import { selectUserSchema } from "@iam/db/schema";
import { EmploymentDetailDtoSchema } from "../employment";

const DbUserSchema = z.object(selectUserSchema.shape);

export const UserSchema = DbUserSchema;

export const UserDtoSchema = UserSchema.omit({
  password: true,
  subjectIdentifier: true,
}).openapi("UserDto");

export const UserProfileBaseSchema = UserSchema.pick({
  subjectIdentifier: true,
  username: true,
  name: true,
  mobile: true,
  wxId: true,
}).strict().openapi("UserProfileBase");

export const UsernameWriteSchema = z.string()
  .trim()
  .min(1, "用户名不能为空")
  .max(64, "用户名最多64个字符")
  .openapi({ description: "用户名" });

export const UserNameWriteSchema = z.string()
  .trim()
  .min(1, "姓名不能为空")
  .max(64, "姓名最多64个字符")
  .openapi({ description: "姓名" });

export const UserDetailDtoSchema = UserDtoSchema.extend({
  employments: z.array(EmploymentDetailDtoSchema).default([]),
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailDto");

export const UserCreateDtoSchema = UserSchema.pick({
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
  password: true,
}).extend({
  username: UsernameWriteSchema,
  name: UserNameWriteSchema,
}).openapi("UserCreateDto");

export const OidcAccountDtoSchema = DbUserSchema.pick({
  id: true,
  subjectIdentifier: true,
  username: true,
  name: true,
  mobile: true,
  status: true,
  isDelete: true,
}).openapi("OidcAccountDto");
