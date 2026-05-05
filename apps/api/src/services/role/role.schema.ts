import { RoleSchema as PrismaRoleSchema } from "@api/db/generated/schemas";
import { z } from "@hono/zod-openapi";

export const RoleDtoSchema = z.object(PrismaRoleSchema.shape).openapi("RoleDto");

// export const RoleDtoSchema = z.object({
//   id: z.number().openapi({ example: 1 }),
//   roleCode: z.string().openapi({ example: "tender:default" }),
//   roleName: z.string().openapi({ example: "采招系统用户" }),
// }).openapi("RoleDto");

// export type RoleDto = z.infer<typeof RoleDtoSchema>;
