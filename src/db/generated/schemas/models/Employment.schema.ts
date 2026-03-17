import * as z from 'zod';

export const EmploymentSchema = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  posId: z.number().int(),
  orgId: z.number().int(),
  compId: z.number().int(),
  isPrimary: z.boolean(),
  status: z.number().int().default(1),
  startTime: z.date(),
  endTime: z.date().nullish(),
  description: z.string().nullish(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
});

export type EmploymentType = z.infer<typeof EmploymentSchema>;
