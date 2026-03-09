import { z } from '@hono/zod-openapi';

export const OrganizationClosureSchema = z.object({
  id: z.number().int(),
  ancestorId: z.number().int(),
  descendantId: z.number().int(),
  depth: z.number().int(),
});

export type OrganizationClosureType = z.infer<typeof OrganizationClosureSchema>;
