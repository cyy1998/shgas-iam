import { z } from '@hono/zod-openapi';
export const DelegationDetailUpdateManyResultSchema = z.object({
  count: z.number()
});