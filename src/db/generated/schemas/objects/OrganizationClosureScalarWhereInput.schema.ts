import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const organizationclosurescalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema), z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema), z.lazy(() => OrganizationClosureScalarWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  ancestorId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  descendantId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  depth: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const OrganizationClosureScalarWhereInputObjectSchema: z.ZodType<Prisma.OrganizationClosureScalarWhereInput> = organizationclosurescalarwhereinputSchema as unknown as z.ZodType<Prisma.OrganizationClosureScalarWhereInput>;
export const OrganizationClosureScalarWhereInputObjectZodSchema = organizationclosurescalarwhereinputSchema;
