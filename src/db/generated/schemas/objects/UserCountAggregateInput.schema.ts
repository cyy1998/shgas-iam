import { z } from '@hono/zod-openapi';
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
  updateTime: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const UserCountAggregateInputObjectSchema: z.ZodType<Prisma.UserCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.UserCountAggregateInputType>;
export const UserCountAggregateInputObjectZodSchema = makeSchema();
