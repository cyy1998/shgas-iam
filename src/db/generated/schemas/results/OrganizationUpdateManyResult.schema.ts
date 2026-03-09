import { z } from '@hono/zod-openapi';
export const OrganizationUpdateManyResultSchema = z.object({
  count: z.number()
});