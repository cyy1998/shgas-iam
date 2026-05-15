import { z } from "@hono/zod-openapi";

export {
  UserCreateDtoSchema,
  UserDetailDtoSchema,
  UserDtoSchema,
  UserSchema,
} from "@iam/domain/user";

export const UserQueryDtoSchema = z.object({
  usernames: z.array(z.string()).describe("用户名列表").openapi({ example: ["138550", "136163"] }),
  phones: z.array(z.string()).describe("手机号列表").openapi({ example: ["17721462865"] }),
  wxIds: z.array(z.string()).describe("微信ID列表").openapi({ example: ["1592677631"] }),
  ancestorOrgCodes: z.array(z.string()).describe("用户岗位父级组织编码列表").openapi({ example: ["SR", "SB"] }),
  ancestorOrgDepths: z.array(z.number()).describe("用户岗位父级组织深度查询（只查询组织直属用户填0，递归查询不要传此参数）").openapi({ example: [0, 1, 2] }),
  positionCodes: z.array(z.string()).describe("岗位编码列表").openapi({ example: ["E033", "E034"] }),
  roleCodes: z.array(z.string()).describe("角色编码列表").openapi({ example: ["tender:default-user"] }),
}).partial().openapi("UserQueryDto");

export const UserQueryWithPrivilegeDelegationDtoSchema = UserQueryDtoSchema.required({
  ancestorOrgCodes: true,
}).extend({
  // ancestorOrgCodes: z.array(z.string()).openapi({ example: ["SR", "SB"] }),
  privilegeCode: z.string().describe("权限编码").openapi({ example: "ui:button:tender:create-GYBG" }),
}).openapi("UserQueryWithPrivilegeDelegationDto");
