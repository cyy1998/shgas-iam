import { z } from '@hono/zod-openapi';
export const OrganizationClosureCreateManyResultSchema = z.object({
  count: z.number()
});