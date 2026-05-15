import { EmploymentDetailDtoSchema } from "@admin-api/services/employment/employment.schema";
import { UserDetailDtoSchema, UserDtoSchema } from "@admin-api/services/user/user.schema";
import { z } from "@hono/zod-openapi";
import { userStatusToString } from "@iam/contracts";

export const UserVoSchema = UserDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("UserVo");

export function toUserVo(input: unknown) {
  const dto = UserDtoSchema.parse(input);
  return UserVoSchema.parse({
    ...dto,
    statusText: userStatusToString[dto.status],
  });
}

export const UserDetailVoSchema = UserVoSchema.extend({
  employments: z.array(EmploymentDetailDtoSchema),
  privileges: z.array(z.string()).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailVo");

export function toUserDetailVo(input: unknown) {
  const dto = UserDetailDtoSchema.parse(input);
  return UserDetailVoSchema.parse({
    ...dto,
    statusText: userStatusToString[dto.status],
  });
}
