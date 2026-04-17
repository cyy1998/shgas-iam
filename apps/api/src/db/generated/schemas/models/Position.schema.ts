import * as z from 'zod';

export const PositionSchema = z.object({
  id: z.number().int(),
  posCode: z.string(),
  posName: z.string(),
  status: z.number().int().default(1),
  description: z.string().nullish(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
});

export type PositionType = z.infer<typeof PositionSchema>;
