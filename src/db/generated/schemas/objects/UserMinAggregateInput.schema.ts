import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  username: z.literal(true).optional(),
  wxId: z.literal(true).optional(),
  name: z.literal(true).optional(),
  password: z.literal(true).optional(),
  mobile: z.literal(true).optional(),
  userType: z.literal(true).optional(),
  orderNum: z.literal(true).optional(),
  status: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional()
}).strict();
export const UserMinAggregateInputObjectSchema: z.ZodType<Prisma.UserMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.UserMinAggregateInputType>;
export const UserMinAggregateInputObjectZodSchema = makeSchema();
