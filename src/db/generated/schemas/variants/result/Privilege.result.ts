import { z } from '@hono/zod-openapi';
// prettier-ignore
export const PrivilegeResultSchema = z.object({
    id: z.number().int(),
    privilegeCode: z.string(),
    privilegeName: z.string(),
    fieldValues: z.unknown().nullable(),
    status: z.number().int(),
    description: z.string().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    roles: z.array(z.unknown()),
    delegations: z.array(z.unknown())
}).strict();

export type PrivilegeResultType = z.infer<typeof PrivilegeResultSchema>;
