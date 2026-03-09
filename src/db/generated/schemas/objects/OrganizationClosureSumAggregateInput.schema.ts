import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  ancestorId: z.literal(true).optional(),
  descendantId: z.literal(true).optional(),
  depth: z.literal(true).optional()
}).strict();
export const OrganizationClosureSumAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureSumAggregateInputType>;
export const OrganizationClosureSumAggregateInputObjectZodSchema = makeSchema();
