import { z } from "@hono/zod-openapi";
import { PrivilegeDelegationSchema as PrismaPrivilegeDelegationSchema, PrivilegeSchema as PrismaPrivilegeSchema, UserSchema as PrismaUserSchema } from "@/db/generated/schemas";

export const PrivilegeDtoSchema = z.object(PrismaPrivilegeSchema.shape).openapi("PrivilegeDto");

export const PrivilegeSchema = z.object(PrismaPrivilegeDelegationSchema.shape);

export const PrivilegeDetailSchema = PrivilegeSchema.extend({
  delegatorUser: PrismaUserSchema,
  delegateeUser: PrismaUserSchema,
});

export const PrivilegeDelegationDtoSchema = PrivilegeSchema.extend({
  delegatorUsername: z.string().openapi({ example: "138550" }),
  delegatorName: z.string().openapi({ example: "蔡奕阳" }),
  delegateeUsername: z.string().openapi({ example: "138550" }),
  delegateeName: z.string().openapi({ example: "蔡奕阳" }),
}).required().openapi("PrivilegeDelegationDto");

export const PrivilegeDelegationDtoConverterSchema = PrivilegeDetailSchema.transform((e) => {
  const { delegatorUser, delegateeUser, ...d } = e;
  return {
    ...d,
    delegatorUsername: delegatorUser.username,
    delegatorName: delegatorUser.name,
    delegateeUsername: delegateeUser.username,
    delegateeName: delegateeUser.name,
  };
}).pipe(PrivilegeDelegationDtoSchema);
