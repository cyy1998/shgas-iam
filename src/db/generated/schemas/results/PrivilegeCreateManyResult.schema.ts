import { z } from '@hono/zod-openapi';
export const PrivilegeCreateManyResultSchema = z.object({
  count: z.number()
});