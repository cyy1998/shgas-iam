import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const makeSchema = () => z.object({
  is: z.lazy(() => RoleWhereInputObjectSchema).optional(),
  isNot: z.lazy(() => RoleWhereInputObjectSchema).optional()
}).strict();
export const RoleScalarRelationFilterObjectSchema: z.ZodType<Prisma.RoleScalarRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.RoleScalarRelationFilter>;
export const RoleScalarRelationFilterObjectZodSchema = makeSchema();
