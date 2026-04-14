import * as z from 'zod';
// prettier-ignore
export const PosOrgCompositionInputSchema = z.object({
    posId: z.number().int(),
    orgId: z.number().int(),
    status: z.number().int(),
    description: z.string().optional().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    position: z.unknown(),
    organization: z.unknown(),
    employments: z.array(z.unknown()),
    roles: z.array(z.unknown())
}).strict();

export type PosOrgCompositionInputType = z.infer<typeof PosOrgCompositionInputSchema>;
