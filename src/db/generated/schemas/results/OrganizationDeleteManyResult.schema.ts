import { z } from '@hono/zod-openapi';
export const OrganizationDeleteManyResultSchema = z.object({
  count: z.number()
});