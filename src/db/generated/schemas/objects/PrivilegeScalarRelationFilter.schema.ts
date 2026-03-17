import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './PrivilegeWhereInput.schema'

const makeSchema = () => z.object({
  is: z.lazy(() => PrivilegeWhereInputObjectSchema).optional(),
  isNot: z.lazy(() => PrivilegeWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeScalarRelationFilterObjectSchema: z.ZodType<Prisma.PrivilegeScalarRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeScalarRelationFilter>;
export const PrivilegeScalarRelationFilterObjectZodSchema = makeSchema();
