import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  privilegeCode: z.literal(true).optional(),
  privilegeName: z.literal(true).optional(),
  status: z.literal(true).optional(),
  description: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional()
}).strict();
export const PrivilegeMaxAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeMaxAggregateInputType>;
export const PrivilegeMaxAggregateInputObjectZodSchema = makeSchema();
