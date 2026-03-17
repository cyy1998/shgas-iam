import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  ancestorId: z.literal(true).optional(),
  descendantId: z.literal(true).optional(),
  depth: z.literal(true).optional()
}).strict();
export const OrganizationClosureMaxAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureMaxAggregateInputType>;
export const OrganizationClosureMaxAggregateInputObjectZodSchema = makeSchema();
