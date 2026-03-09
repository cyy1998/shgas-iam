import { z } from '@hono/zod-openapi';
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
  updateTime: z.literal(true).optional()
}).strict();
export const ClientMinAggregateInputObjectSchema: z.ZodType<Prisma.ClientMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.ClientMinAggregateInputType>;
export const ClientMinAggregateInputObjectZodSchema = makeSchema();
