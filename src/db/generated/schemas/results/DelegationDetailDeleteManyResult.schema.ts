import { z } from '@hono/zod-openapi';
export const DelegationDetailDeleteManyResultSchema = z.object({
  count: z.number()
});