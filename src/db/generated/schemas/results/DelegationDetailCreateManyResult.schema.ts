import { z } from '@hono/zod-openapi';
export const DelegationDetailCreateManyResultSchema = z.object({
  count: z.number()
});