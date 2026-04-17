import * as z from 'zod';

export const PosOrgCompositionSchema = z.object({
  id: z.number().int(),
  posId: z.number().int(),
  orgId: z.number().int(),
  status: z.number().int().default(1),
  description: z.string().nullish(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
});

export type PosOrgCompositionType = z.infer<typeof PosOrgCompositionSchema>;
