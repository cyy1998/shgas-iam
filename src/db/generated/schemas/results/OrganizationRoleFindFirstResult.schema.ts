import { z } from '@hono/zod-openapi';
export const OrganizationRoleFindFirstResultSchema = z.nullable(z.object({
  organizationId: z.number().int(),
  roleId: z.number().int(),
  isAllSub: z.boolean(),
  organization: z.unknown(),
  role: z.unknown()
}));