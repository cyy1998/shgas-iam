import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './ClientWhereInput.schema'

const makeSchema = () => z.object({
  is: z.lazy(() => ClientWhereInputObjectSchema).optional(),
  isNot: z.lazy(() => ClientWhereInputObjectSchema).optional()
}).strict();
export const ClientScalarRelationFilterObjectSchema: z.ZodType<Prisma.ClientScalarRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.ClientScalarRelationFilter>;
export const ClientScalarRelationFilterObjectZodSchema = makeSchema();
