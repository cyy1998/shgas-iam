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

export const UserDetailDtoSchema = UserDtoSchema.extend({
  employments: z.array(EmploymentDetailDtoSchema).default([]),
  privileges: z.array(z.string()).default([]).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).default([]).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailDto");

export const UserCreateDtoSchema = UserSchema.partial().required({
  username: true,
  name: true,
  userType: true,
  password: true,
}).omit({
  id: true,
  subjectIdentifier: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
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
