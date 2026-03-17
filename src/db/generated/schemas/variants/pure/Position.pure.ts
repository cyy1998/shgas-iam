import * as z from 'zod';
// prettier-ignore
export const PositionModelSchema = z.object({
    id: z.number().int(),
    posCode: z.string(),
    posName: z.string(),
    status: z.number().int(),
    description: z.string().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    employments: z.array(z.unknown()),
    roles: z.array(z.unknown()),
    posOrgComposition: z.array(z.unknown())
}).strict();

export type PositionPureType = z.infer<typeof PositionModelSchema>;
