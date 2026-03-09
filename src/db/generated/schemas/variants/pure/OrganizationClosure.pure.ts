import { z } from '@hono/zod-openapi';
// prettier-ignore
export const OrganizationClosureModelSchema = z.object({
    id: z.number().int(),
    ancestorId: z.number().int(),
    descendantId: z.number().int(),
    depth: z.number().int(),
    ancestor: z.unknown(),
    descendant: z.unknown()
}).strict();

export type OrganizationClosurePureType = z.infer<typeof OrganizationClosureModelSchema>;
