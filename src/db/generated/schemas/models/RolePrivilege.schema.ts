import { z } from '@hono/zod-openapi';

export const RolePrivilegeSchema = z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int(),
});

export type RolePrivilegeType = z.infer<typeof RolePrivilegeSchema>;
