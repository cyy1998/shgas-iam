import { z } from '@hono/zod-openapi';
export const RolePrivilegeCreateResultSchema = z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int(),
  role: z.unknown(),
  privilege: z.unknown()
});