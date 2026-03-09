import { z } from '@hono/zod-openapi';
export const PosOrgRoleUpsertResultSchema = z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int(),
  posOrg: z.unknown(),
  role: z.unknown()
});