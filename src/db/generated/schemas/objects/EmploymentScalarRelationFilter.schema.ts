import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './EmploymentWhereInput.schema'

const makeSchema = () => z.object({
  is: z.lazy(() => EmploymentWhereInputObjectSchema).optional(),
  isNot: z.lazy(() => EmploymentWhereInputObjectSchema).optional()
}).strict();
export const EmploymentScalarRelationFilterObjectSchema: z.ZodType<Prisma.EmploymentScalarRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentScalarRelationFilter>;
export const EmploymentScalarRelationFilterObjectZodSchema = makeSchema();
