import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  clientCode: z.literal(true).optional(),
  clientName: z.literal(true).optional(),
  url: z.literal(true).optional(),
  status: z.literal(true).optional(),
  description: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional(),
  extAttributes: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const ClientCountAggregateInputObjectSchema: z.ZodType<Prisma.ClientCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.ClientCountAggregateInputType>;
export const ClientCountAggregateInputObjectZodSchema = makeSchema();
