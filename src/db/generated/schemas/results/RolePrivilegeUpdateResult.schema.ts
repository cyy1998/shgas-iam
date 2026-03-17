import * as z from 'zod';
export const RolePrivilegeUpdateResultSchema = z.nullable(z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int(),
  role: z.unknown(),
  privilege: z.unknown()
}));