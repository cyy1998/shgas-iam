import { EmploymentDetailDtoSchema } from "@admin-api/services/employment/employment.schema";
import { UserDetailDtoSchema, UserDtoSchema } from "@admin-api/services/user/user.schema";
import { z } from "@hono/zod-openapi";
import { userStatusToString } from "@iam/contracts";

export const UserVoSchema = UserDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("UserVo");

export const UserVoConverterSchema = UserDtoSchema.transform((e) => {
  return {
    ...e,
    statusText: userStatusToString[e.status],
  };
}).pipe(UserVoSchema);

export const UserDetailVoSchema = UserVoSchema.extend({
  employments: z.array(EmploymentDetailDtoSchema.required()),
  privileges: z.array(z.string()).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailVo");

export const UserDetailVoConverterSchema = UserDetailDtoSchema.transform((e) => {
  return {
    ...e,
    statusText: userStatusToString[e.status],
  };
}).pipe(UserDetailVoSchema);
