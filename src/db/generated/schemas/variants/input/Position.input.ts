import * as z from 'zod';
// prettier-ignore
export const PositionInputSchema = z.object({
    posCode: z.string(),
    posName: z.string(),
    status: z.number().int(),
    description: z.string().optional().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    employments: z.array(z.unknown()),
    roles: z.array(z.unknown()),
    posOrgComposition: z.array(z.unknown())
}).strict();

export type PositionInputType = z.infer<typeof PositionInputSchema>;
