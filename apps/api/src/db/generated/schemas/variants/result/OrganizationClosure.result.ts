import * as z from 'zod';
// prettier-ignore
export const OrganizationClosureResultSchema = z.object({
    id: z.number().int(),
    ancestorId: z.number().int(),
    descendantId: z.number().int(),
    depth: z.number().int(),
    ancestor: z.unknown(),
    descendant: z.unknown()
}).strict();

export type OrganizationClosureResultType = z.infer<typeof OrganizationClosureResultSchema>;
