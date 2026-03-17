import * as z from 'zod';
// prettier-ignore
export const UserResultSchema = z.object({
    id: z.number().int(),
    username: z.string(),
    wxId: z.string().nullable(),
    name: z.string(),
    password: z.string().nullable(),
    mobile: z.string().nullable(),
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

export type UserResultType = z.infer<typeof UserResultSchema>;
