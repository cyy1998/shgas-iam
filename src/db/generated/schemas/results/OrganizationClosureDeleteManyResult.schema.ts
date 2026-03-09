import { z } from '@hono/zod-openapi';
export const OrganizationClosureDeleteManyResultSchema = z.object({
  count: z.number()
});