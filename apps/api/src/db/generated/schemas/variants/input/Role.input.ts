import * as z from 'zod';
// prettier-ignore
export const RoleInputSchema = z.object({
    roleCode: z.string(),
    roleName: z.string(),
    clientId: z.number().int(),
    status: z.number().int(),
    description: z.string().optional().nullable(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    client: z.unknown(),
    positions: z.array(z.unknown()),
    organizations: z.array(z.unknown()),
    positionOrganizations: z.array(z.unknown()),
    employments: z.array(z.unknown()),
    privileges: z.array(z.unknown())
}).strict();

export type RoleInputType = z.infer<typeof RoleInputSchema>;
