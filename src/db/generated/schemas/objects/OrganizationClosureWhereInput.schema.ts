import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const organizationclosurewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => OrganizationClosureWhereInputObjectSchema), z.lazy(() => OrganizationClosureWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => OrganizationClosureWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => OrganizationClosureWhereInputObjectSchema), z.lazy(() => OrganizationClosureWhereInputObjectSchema).array()]).optional(),
  id: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  ancestorId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  descendantId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  depth: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const OrganizationClosureWhereInputObjectSchema: z.ZodType<Prisma.OrganizationClosureWhereInput> = organizationclosurewhereinputSchema as unknown as z.ZodType<Prisma.OrganizationClosureWhereInput>;
export const OrganizationClosureWhereInputObjectZodSchema = organizationclosurewhereinputSchema;
