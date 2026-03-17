import * as z from 'zod';
export const PositionFindUniqueResultSchema = z.nullable(z.object({
  id: z.number().int(),
  posCode: z.string(),
  posName: z.string(),
  status: z.number().int(),
  description: z.string().optional(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
  employments: z.array(z.unknown()),
  roles: z.array(z.unknown()),
  posOrgComposition: z.array(z.unknown())
}));