import * as z from 'zod';
// prettier-ignore
export const DelegationDetailResultSchema = z.object({
    delegationId: z.number().int(),
    privilegeId: z.number().int(),
    delegation: z.unknown(),
    privilege: z.unknown()
}).strict();

export type DelegationDetailResultType = z.infer<typeof DelegationDetailResultSchema>;
