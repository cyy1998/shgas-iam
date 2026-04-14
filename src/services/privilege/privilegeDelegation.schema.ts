import { z } from "@hono/zod-openapi";
import { PrivilegeDelegationSchema as PrismaPrivilegeDelegationSchema, UserSchema as PrismaUserSchema } from "@/db/generated/schemas";

export const PrivilegeDelegationSchema = z.object(PrismaPrivilegeDelegationSchema.shape);

export const PrivilegeDelegationDetailSchema = PrivilegeDelegationSchema.extend({
  delegatorUser: PrismaUserSchema,
  delegateeUser: PrismaUserSchema,
});

export const PrivilegeDelegationDtoSchema = PrivilegeDelegationSchema.extend({
  delegatorUsername: z.string().openapi({ example: "138550" }),
  delegatorName: z.string().openapi({ example: "蔡奕阳" }),
  delegateeUsername: z.string().openapi({ example: "138550" }),
  delegateeName: z.string().openapi({ example: "蔡奕阳" }),
}).required().openapi("PrivilegeDelegationDto");

export const PrivilegeDelegationDtoConverterSchema = PrivilegeDelegationDetailSchema.transform((e) => {
  const { delegatorUser, delegateeUser, ...d } = e;
  return {
    ...d,
    delegatorUsername: delegatorUser.username,
    delegatorName: delegatorUser.name,
    delegateeUsername: delegateeUser.username,
    delegateeName: delegateeUser.name,
  };
}).pipe(PrivilegeDelegationDtoSchema);
