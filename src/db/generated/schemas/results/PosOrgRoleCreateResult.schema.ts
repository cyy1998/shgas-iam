import * as z from 'zod';
export const PosOrgRoleCreateResultSchema = z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int(),
  posOrg: z.unknown(),
  role: z.unknown()
});