import { z } from '@hono/zod-openapi';
// prettier-ignore
export const DelegationDetailModelSchema = z.object({
    delegationId: z.number().int(),
    privilegeId: z.number().int(),
    delegation: z.unknown(),
    privilege: z.unknown()
}).strict();

export type DelegationDetailPureType = z.infer<typeof DelegationDetailModelSchema>;
