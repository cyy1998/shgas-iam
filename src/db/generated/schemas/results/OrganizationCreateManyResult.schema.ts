import { z } from '@hono/zod-openapi';
export const OrganizationCreateManyResultSchema = z.object({
  count: z.number()
});