import * as z from 'zod';
// prettier-ignore
export const OrganizationModelSchema = z.object({
    id: z.number().int(),
    orgCode: z.string(),
    orgName: z.string(),
    parentId: z.number().int(),
    businessParentId: z.number().int(),
    path: z.string(),
    level: z.number().int(),
    orgType: z.string(),
    orderNum: z.number().int(),
    isVirtual: z.boolean(),
    isEntity: z.boolean(),
    status: z.number().int(),
    isDelete: z.boolean(),
    createTime: z.date(),
    updateTime: z.date(),
    deptEmployments: z.array(z.unknown()),
    compEmployments: z.array(z.unknown()),
    roles: z.array(z.unknown()),
    posOrgComposition: z.array(z.unknown()),
    parent: z.unknown().nullable(),
    children: z.array(z.unknown()),
    ancestorClosures: z.array(z.unknown()),
    descendantClosures: z.array(z.unknown()),
    privilegeDelegations: z.array(z.unknown())
}).strict();

export type OrganizationPureType = z.infer<typeof OrganizationModelSchema>;
