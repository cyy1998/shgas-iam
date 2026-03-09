import { z } from '@hono/zod-openapi';
export const PrivilegeDelegationDeleteManyResultSchema = z.object({
  count: z.number()
});