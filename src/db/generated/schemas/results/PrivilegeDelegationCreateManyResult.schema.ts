import { z } from '@hono/zod-openapi';
export const PrivilegeDelegationCreateManyResultSchema = z.object({
  count: z.number()
});