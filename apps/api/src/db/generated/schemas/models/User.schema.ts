import * as z from 'zod';

export const UserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  wxId: z.string().nullish(),
  name: z.string(),
  password: z.string().nullish(),
  mobile: z.string().nullish(),
  userType: z.string().default("正式员工"),
  orderNum: z.number().int().default(999999),
  status: z.number().int().default(1),
  isDelete: z.boolean(),
  createTime: z.date(),
  updateTime: z.date(),
});

export type UserType = z.infer<typeof UserSchema>;
