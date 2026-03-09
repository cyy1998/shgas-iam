import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './PrivilegeDelegationWhereInput.schema'

const makeSchema = () => z.object({
  is: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional(),
  isNot: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationScalarRelationFilterObjectSchema: z.ZodType<Prisma.PrivilegeDelegationScalarRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationScalarRelationFilter>;
export const PrivilegeDelegationScalarRelationFilterObjectZodSchema = makeSchema();
