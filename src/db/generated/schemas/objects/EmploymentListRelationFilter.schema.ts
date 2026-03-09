import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './EmploymentWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => EmploymentWhereInputObjectSchema).optional(),
  some: z.lazy(() => EmploymentWhereInputObjectSchema).optional(),
  none: z.lazy(() => EmploymentWhereInputObjectSchema).optional()
}).strict();
export const EmploymentListRelationFilterObjectSchema: z.ZodType<Prisma.EmploymentListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentListRelationFilter>;
export const EmploymentListRelationFilterObjectZodSchema = makeSchema();
