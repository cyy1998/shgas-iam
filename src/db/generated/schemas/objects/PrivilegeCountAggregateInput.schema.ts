import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  privilegeCode: z.literal(true).optional(),
  privilegeName: z.literal(true).optional(),
  fieldValues: z.literal(true).optional(),
  status: z.literal(true).optional(),
  description: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const PrivilegeCountAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCountAggregateInputType>;
export const PrivilegeCountAggregateInputObjectZodSchema = makeSchema();
