import * as z from 'zod';

export const OrganizationSchema = z.object({
  id: z.number().int(),
  orgCode: z.string(),
  orgName: z.string(),
  parentId: z.number().int().default(-1),
  businessParentId: z.number().int().default(-1),
  path: z.string(),
  level: z.number().int(),
  orgType: z.string(),
  orderNum: z.number().int(),
  isVirtual: z.boolean(),
  isEntity: z.boolean(),
  status: z.number().int().default(1),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
});

export type OrganizationType = z.infer<typeof OrganizationSchema>;
