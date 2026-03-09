import { z } from '@hono/zod-openapi';
export const EmploymentUpdateManyResultSchema = z.object({
  count: z.number()
});