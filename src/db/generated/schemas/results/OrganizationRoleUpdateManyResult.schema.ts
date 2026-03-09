import { z } from '@hono/zod-openapi';
export const OrganizationRoleUpdateManyResultSchema = z.object({
  count: z.number()
});