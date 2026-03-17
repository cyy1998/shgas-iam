import * as z from 'zod';
// prettier-ignore
export const PrivilegeInputSchema = z.object({
    id: z.number().int(),
    privilegeCode: z.string(),
    privilegeName: z.string(),
    fieldValues: z.unknown().optional().nullable(),
    status: z.number().int(),
    description: z.string().optional().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    roles: z.array(z.unknown()),
    delegations: z.array(z.unknown())
}).strict();

export type PrivilegeInputType = z.infer<typeof PrivilegeInputSchema>;
