import { z } from '@hono/zod-openapi';
export const PosOrgCompositionDeleteManyResultSchema = z.object({
  count: z.number()
});