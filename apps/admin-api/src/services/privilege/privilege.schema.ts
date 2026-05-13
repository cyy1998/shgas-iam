import { z } from "@hono/zod-openapi";
import { PrivilegeStatus } from "@iam/contracts";
import { selectPrivilegeSchema } from "@iam/db/schema";

export const PrivilegeSchema = z.object(selectPrivilegeSchema.shape);

export const PrivilegeDtoSchema = PrivilegeSchema.extend({
  status: z.enum(PrivilegeStatus),
}).required().openapi("PrivilegeDto");

export const PrivilegeQueryDtoSchema = z.object({
  privilegeCodes: z.array(z.string()).optional().openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roleCodes: z.array(z.string()).optional().openapi({ example: ["role:admin"] }),
}).openapi("PrivilegeQueryDto");
