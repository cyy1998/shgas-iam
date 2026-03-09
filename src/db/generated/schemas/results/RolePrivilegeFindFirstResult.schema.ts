import { z } from '@hono/zod-openapi';
export const RolePrivilegeFindFirstResultSchema = z.nullable(z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int(),
  role: z.unknown(),
  privilege: z.unknown()
}));