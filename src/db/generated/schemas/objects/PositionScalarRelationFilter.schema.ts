import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './PositionWhereInput.schema'

const makeSchema = () => z.object({
  is: z.lazy(() => PositionWhereInputObjectSchema).optional(),
  isNot: z.lazy(() => PositionWhereInputObjectSchema).optional()
}).strict();
export const PositionScalarRelationFilterObjectSchema: z.ZodType<Prisma.PositionScalarRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PositionScalarRelationFilter>;
export const PositionScalarRelationFilterObjectZodSchema = makeSchema();
