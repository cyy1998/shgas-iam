import { PrivilegeSchema as PrismaPrivilegeSchema } from "@api/db/generated/schemas";
import { Status } from "@api/enums/status";
import { z } from "@hono/zod-openapi";

export const PrivilegeSchema = z.object(PrismaPrivilegeSchema.shape);

export const PrivilegeDtoSchema = PrivilegeSchema.extend({
  status: z.enum(Status),
}).required().openapi("PrivilegeDto");

export const PrivilegeQueryDtoSchema = z.object({
  privilegeCodes: z.array(z.string()).optional().openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roleCodes: z.array(z.string()).optional().openapi({ example: ["role:admin"] }),
}).openapi("PrivilegeQueryDto");
