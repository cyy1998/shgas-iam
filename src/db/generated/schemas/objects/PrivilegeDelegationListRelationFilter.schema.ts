import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './PrivilegeDelegationWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional(),
  some: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional(),
  none: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationListRelationFilterObjectSchema: z.ZodType<Prisma.PrivilegeDelegationListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationListRelationFilter>;
export const PrivilegeDelegationListRelationFilterObjectZodSchema = makeSchema();
