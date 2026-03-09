import { z } from '@hono/zod-openapi';
export const OrganizationRoleDeleteManyResultSchema = z.object({
  count: z.number()
});