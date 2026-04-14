import * as z from 'zod';
// prettier-ignore
export const UserInputSchema = z.object({
    username: z.string(),
    wxId: z.string().optional().nullable(),
    name: z.string(),
    password: z.string().optional().nullable(),
    mobile: z.string().optional().nullable(),
    userType: z.string(),
    orderNum: z.number().int(),
    status: z.number().int(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    employments: z.array(z.unknown()),
    delegationTo: z.array(z.unknown()),
    delegationFrom: z.array(z.unknown())
}).strict();

export type UserInputType = z.infer<typeof UserInputSchema>;
