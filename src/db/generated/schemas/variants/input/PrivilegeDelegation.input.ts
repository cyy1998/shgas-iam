import { z } from '@hono/zod-openapi';
// prettier-ignore
export const PrivilegeDelegationInputSchema = z.object({
    id: z.number().int(),
    delegatorUserId: z.number().int(),
    delegateeUserId: z.number().int(),
    organizationScopeId: z.number().int(),
    startTime: z.date(),
    endTime: z.date(),
    status: z.number().int(),
    description: z.string().optional().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    delegatorUser: z.unknown(),
    delegateeUser: z.unknown(),
    organizationScope: z.unknown(),
    delegationDetails: z.array(z.unknown())
}).strict();

export type PrivilegeDelegationInputType = z.infer<typeof PrivilegeDelegationInputSchema>;
