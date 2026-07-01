import { z } from "@hono/zod-openapi";
import { UserQueryDtoSchema } from "@iam/user-profile-read-model/query";

export {
  UserCreateDtoSchema,
  UserDetailDtoSchema,
  UserDtoSchema,
  UserSchema,
} from "@iam/domain/user";
export { UserQueryDtoSchema };

export const UserQueryWithPrivilegeDelegationDtoSchema = UserQueryDtoSchema.required({
  ancestorOrgCodes: true,
}).extend({
  // ancestorOrgCodes: z.array(z.string()).openapi({ example: ["SR", "SB"] }),
  privilegeCode: z.string().describe("权限编码").openapi({ example: "ui:button:tender:create-GYBG" }),
}).openapi("UserQueryWithPrivilegeDelegationDto");
