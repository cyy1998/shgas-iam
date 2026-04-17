import * as z from 'zod';

export const RoleSchema = z.object({
  id: z.number().int(),
  roleCode: z.string(),
  roleName: z.string(),
  clientId: z.number().int(),
  status: z.number().int().default(1),
  description: z.string().nullish(),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
});

export type RoleType = z.infer<typeof RoleSchema>;
