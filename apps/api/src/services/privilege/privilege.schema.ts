import { selectPrivilegeSchema } from "@api/db/schema";
import { Status } from "@api/enums/status";
import { z } from "@hono/zod-openapi";

export const PrivilegeSchema = z.object(selectPrivilegeSchema.shape);

export const PrivilegeDtoSchema = PrivilegeSchema.extend({
  status: z.enum(Status),
}).required().openapi("PrivilegeDto");

export const PrivilegeQueryDtoSchema = z.object({
  privilegeCodes: z.array(z.string()).optional().openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roleCodes: z.array(z.string()).optional().openapi({ example: ["role:admin"] }),
}).openapi("PrivilegeQueryDto");
