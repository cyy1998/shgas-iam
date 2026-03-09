import { z } from '@hono/zod-openapi';
export const OrganizationRoleCreateManyResultSchema = z.object({
  count: z.number()
});