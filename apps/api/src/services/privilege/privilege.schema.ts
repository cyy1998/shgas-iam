import { z } from "@hono/zod-openapi";
import { selectPrivilegeSchema } from "@iam/db/schema";

export const PrivilegeDtoSchema = z.object(selectPrivilegeSchema.shape).required().openapi("PrivilegeDto");

export const PrivilegeQueryDtoSchema = z.object({
  privilegeCodes: z.array(z.string()).optional().openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roleCodes: z.array(z.string()).optional().openapi({ example: ["role:admin"] }),
}).openapi("PrivilegeQueryDto");
