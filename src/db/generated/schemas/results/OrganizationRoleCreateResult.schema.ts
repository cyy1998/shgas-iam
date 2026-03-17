import * as z from 'zod';
export const OrganizationRoleCreateResultSchema = z.object({
  organizationId: z.number().int(),
  roleId: z.number().int(),
  isAllSub: z.boolean(),
  organization: z.unknown(),
  role: z.unknown()
});